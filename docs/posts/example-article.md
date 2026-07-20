---
title: 一次线程池生命周期管理导致的跑批事故
date: 2026-07-16
type: post
tags: [Java, 线程池, 并发编程, 故障排查, 生产事故]
description: 记录一次因静态内部类单例线程池与业务任务生命周期不匹配导致的生产事故，深入分析线程池生命周期管理的正确姿势。
---

# 一次线程池生命周期管理导致的跑批事故

## 事故背景

系统中存在一个每天需要手动执行的跑批任务。该任务需要并发处理大量业务数据，因此使用线程池提升执行效率。

### 初始设计方案

每天手动执行任务时的整体流程如下：

```text
手动触发跑批
    ↓
创建线程池
    ↓
提交业务任务
    ↓
任务执行完成
    ↓
shutdown 关闭线程池
    ↓
等待下一次手动执行
```

从资源管理角度看，这个设计看起来比较合理。因为线程池内部维护了线程资源，如果任务执行完成后不关闭线程池，可能会造成线程泄漏。

因此最初的实现认为：

> 一个批次任务对应一个线程池，任务结束后主动关闭线程池。

但是实际运行过程中出现了问题。

### 事故问题表现

**第一次跑批**：正常执行。

**第二天再次执行**：任务一直没有完成。观察发现，虽然任务已经手动触发，数据查询也正常，任务提交过程没有明显异常，但线程没有真正执行业务逻辑，整个任务一直处于等待状态。表面现象像是第二次跑批任务卡死。

由于没有明显异常日志，排查过程比较困难。

---

## 问题排查过程

### 第一步：定位任务阻塞位置

首先确认任务是否正常触发。通过任务执行日志发现，第二次跑批任务已经正常进入执行方法，数据查询流程正常，主流程没有异常退出。这说明手动触发和业务入口都是正常的，因此问题应该发生在任务执行阶段。

---

### 第二步：发现 Future.get() 长时间阻塞

该跑批任务采用线程池异步处理业务数据。

整体执行流程：

```text
主线程
  |
  | submit 提交任务
  ↓
线程池执行任务
  |
  ↓
Future 保存执行结果
  |
  ↓
future.get() 等待结果
```

代码逻辑类似：

```java
List<Future<Result>> futures = new ArrayList<>();

for (Data data : dataList) {
    Future<Result> future = executor.submit(() -> {
        return process(data);
    });
    futures.add(future);
}

for (Future<Result> future : futures) {
    Result result = future.get();
}
```

运行过程中发现 `future.get()` 长时间没有返回，同时没有出现业务异常日志、线程池异常日志或 `RejectedExecutionException`。任务表现为主线程一直等待，跑批流程无法结束，系统没有明显报错。

因此初步判断：Future 本身没有异常，等待的是一个没有完成的异步任务。

### 第三步：检查线程池状态

由于 `Future.get()` 等待的是异步任务结果，因此首先怀疑：提交到线程池的任务是否真正执行了？

检查发现，第一次跑批正常，第二次跑批使用的是同一个线程池实例，提交任务代码没有异常。但进一步查看线程池状态时发现了关键问题：**线程池状态为 `TERMINATED`**。

继续追溯发现，第一次跑批结束后调用了 `executor.shutdown()`，而线程池是通过静态内部类实现的单例，生命周期跟随 JVM。这意味着第二次跑批获取到的是已经关闭的线程池实例。

---

### 第四步：分析为什么没有异常

正常情况下，线程池关闭后提交任务应该抛出 `RejectedExecutionException`，但实际运行中没有看到异常日志。

检查线程池配置后发现使用了 `CallerRunsPolicy` 拒绝策略。这个策略的特点是不会抛出异常，而是由提交任务的线程直接执行任务，导致主线程被阻塞在任务执行中，表现为 `future.get()` 一直等待。这就解释了为什么没有明显的异常日志，而是表现为任务卡住。

---

### 第五步：根本原因确认

综合以上排查，确认问题根源：线程池通过静态内部类实现，生命周期是 JVM 级别，但业务代码按照"每次任务创建临时线程池"的思路调用 `shutdown()`。第一次任务结束关闭了全局唯一的线程池实例，第二次任务使用已关闭的线程池触发拒绝策略，而 `CallerRunsPolicy` 导致主线程阻塞，表现为任务卡住。

**结论**：资源生命周期管理错误。

---

## 根本原因分析

### 静态内部类导致线程池生命周期过长

问题代码结构类似：

```java
public class TaskExecutor {
    private static class Holder {
        private static final ExecutorService EXECUTOR =
                Executors.newFixedThreadPool(10);
    }

    public static ExecutorService getExecutor() {
        return Holder.EXECUTOR;
    }
}
```

这里使用了**静态内部类**实现线程池单例。这种写法本身没有问题，因为静态内部类具有延迟初始化、JVM 保证线程安全、生命周期跟随 ClassLoader 等特点。

因此执行流程为：

```text
第一次调用 getExecutor()
        ↓
加载 Holder 类
        ↓
创建线程池实例
        ↓
后续所有调用复用同一个线程池
```

**核心矛盾**在于：线程池实际上是一个 JVM 生命周期级别的对象，但业务代码却认为它是每次任务执行创建的临时资源。实际情况是，它是整个 JVM 生命周期共享的单例资源。这种业务代码理解与实际实现的不一致，最终导致了资源管理错误。

### shutdown 导致线程池永久关闭

第一次跑批执行完成后调用：

```java
executor.shutdown();
```

线程池进入关闭流程。`ExecutorService` 生命周期状态转换：

```text
RUNNING
   |
   | shutdown()
   ↓
SHUTDOWN
   |
   | 所有任务完成
   ↓
TERMINATED
```

进入 `TERMINATED` 后，线程池**不能再次接受任务**。如果继续提交任务：

```java
executor.submit(task);
```

任务不会进入正常执行流程。

### 为什么没有直接报错？

这里还有另一个隐藏问题：线程池使用了 `CallerRunsPolicy` 作为拒绝策略。

#### 线程池拒绝策略

拒绝策略主要用于以下场景：
- 线程池关闭
- 工作队列满
- 无法接受新任务

常见策略对比：

| 策略 | 行为 |
|------|------|
| `AbortPolicy` | 直接抛 `RejectedExecutionException` |
| `CallerRunsPolicy` | 提交任务线程自己执行 |
| `DiscardPolicy` | 直接丢弃任务 |
| `DiscardOldestPolicy` | 丢弃最老任务 |

**问题所在**：

原本希望线程池异常时能够明显暴露问题。但 `CallerRunsPolicy` 的设计目标是**降低任务丢失概率**，通过提交线程执行任务进行削峰。它**并不会主动提醒开发者线程池已经无法正常工作**。

因此，线程池关闭以后，异常没有被及时暴露，最终造成：

```text
线程池 TERMINATED
        ↓
提交任务
        ↓
拒绝策略接管
        ↓
没有明显异常
        ↓
业务等待
        ↓
表现为跑批卡住
```

### 问题本质

这次事故**本质上不是线程池 API 使用错误**，而是：

::: danger 核心问题
资源生命周期设计错误
:::

设计线程池时，需要考虑：**创建者、使用者、销毁者是否属于同一个生命周期**。

本案例中的生命周期冲突：

**线程池生命周期**：
```text
JVM 启动
    |
    |
JVM 关闭
```

**业务任务生命周期**：
```text
每天一次任务
    |
    |
任务结束
```

二者生命周期不一致。错误设计相当于：

```text
JVM 生命周期线程池
        ↓
每天任务结束 shutdown
        ↓
提前销毁全局资源
```

---

## 解决方案

### 方案一：线程池生命周期跟随 JVM

**核心方案**：不再主动关闭线程池。

线程池作为 JVM 级共享资源的生命周期：

```text
JVM 启动
   ↓
创建线程池
   ↓
每天任务复用
   ↓
JVM 关闭
   ↓
线程池释放
```

#### 代码调整

**删除以下代码**：

```java
executor.shutdown();
```

线程池不再跟随单次任务结束销毁。

#### 设计原则

线程池本身就是**长期基础设施资源**，类似于：

- 数据库连接池
- Redis 连接池
- HTTP 连接池

::: tip 最佳实践
基础设施资源不应该每次业务调用结束后销毁。
:::

### 方案二：更换拒绝策略

将 `CallerRunsPolicy` 修改为 `AbortPolicy`。

#### 修改原因

对于核心业务任务，更重要的是：**快速失败，让问题暴露**。

#### 示例代码

```java
new ThreadPoolExecutor(
    corePoolSize,
    maximumPoolSize,
    keepAliveTime,
    TimeUnit.SECONDS,
    queue,
    threadFactory,
    new ThreadPoolExecutor.AbortPolicy()  // 使用 AbortPolicy
);
```

当线程池不可用时，直接抛出 `RejectedExecutionException`，让监控系统和日志能够发现问题。

### 方案三：获取线程池时主动检查状态

在获取线程池时增加状态检查，如果发现线程池异常立即抛出异常并记录日志。

#### 核心思路

不要等到任务提交失败才发现问题，而是在获取线程池时就主动检查状态：

```java
public class TaskExecutor {
    private static class Holder {
        private static final ExecutorService EXECUTOR =
                Executors.newFixedThreadPool(10);
    }

    public static ExecutorService getExecutor() {
        ExecutorService executor = Holder.EXECUTOR;

        // 主动检查线程池状态
        if (executor.isShutdown() || executor.isTerminated()) {
            String errorMsg = String.format(
                "线程池状态异常！shutdown=%s, terminated=%s",
                executor.isShutdown(),
                executor.isTerminated()
            );

            // 记录错误日志
            log.error(errorMsg);

            // 抛出异常，快速失败
            throw new IllegalStateException(errorMsg);
        }

        return executor;
    }
}
```

#### 优势

1. **快速失败** - 问题在获取阶段就被发现，而不是等到任务提交
2. **明确异常** - 直接抛出 `IllegalStateException`，异常栈清晰
3. **便于排查** - 日志中明确记录线程池的状态信息
4. **防御性编程** - 主动检查而非被动等待问题暴露

#### 适用场景

这个方案特别适合：
- 线程池由静态变量或单例管理的场景
- 多个地方会获取和使用同一个线程池的场景
- 需要快速发现资源管理问题的场景

---

## 最终架构

### 优化后的设计

完整的生命周期管理流程：

```text
JVM 启动
    ↓
初始化线程池
    ↓
每天手动执行任务
    ↓
提交任务执行
    ↓
任务完成
    ↓
线程池继续存在
    ↓
JVM 关闭
    ↓
释放线程资源
```

### 生命周期设计原则

**线程池生命周期**：
```text
线程池生命周期 = JVM 生命周期
```

**任务生命周期**：
```text
任务生命周期 = 单次业务执行周期
```

::: tip 核心原则
二者职责分离，互不干涉。
:::

---

## 总结

### 核心教训

这次事故暴露了线程池使用中的一个重要原则：

::: warning 重要原则
不要根据业务任务生命周期管理基础设施资源。
:::

线程池、连接池等资源通常属于**系统级组件**，它们的生命周期应该由**应用生命周期管理**，而不是由一次业务调用管理。

### 问题产生的根本原因

1. 静态内部类创建单例线程池，生命周期跟随 JVM
2. 业务代码错误地认为线程池属于单次任务资源
3. 每次任务结束调用 `shutdown`，导致线程池永久关闭
4. `CallerRunsPolicy` 隐藏了拒绝异常，使问题没有及时暴露

### 最终解决方案

1. ✅ 移除任务结束后的 `shutdown`
2. ✅ 让线程池生命周期跟随 JVM
3. ✅ 使用 `AbortPolicy` 明确暴露异常
4. ✅ 获取线程池时主动检查状态并抛出异常

### 关键启示

线程池不是简单的线程集合，而是一种**需要严格管理生命周期的系统资源**。

**正确理解线程池生命周期，是避免生产事故的重要前提。**