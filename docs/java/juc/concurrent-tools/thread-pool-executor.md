# ThreadPoolExecutor

JDK 提供的标准线程池实现，是 Java 并发编程中最重要的工具之一。通过深入理解其核心参数、工作原理和使用场景，可以有效管理线程资源，提升系统性能。

![alt text](image.png)

## 线程池状态

ThreadPoolExecutor使用int的高3位表示线程池状态，低 29 位表示线程池中的线程数量


| 状态 | 高3位 | 接受新任务 | 处理队列任务 | 说明 |
|------|----------------|-----------|-------------|------|
| **RUNNING** | `111`（负数） | ✅ | ✅ | 线程池正常运行，可以接收新任务并执行任务 |
| **SHUTDOWN** | `000` | ❌ | ✅ | 调用 `shutdown()` 后进入该状态，不再接收新任务，但会继续处理队列中的任务和正在执行的任务 |
| **STOP** | `001` | ❌ | ❌ | 调用 `shutdownNow()` 后进入该状态，不再处理队列任务，并尝试中断正在执行的线程 |
| **TIDYING** | `010` | ❌ | ❌ | 所有任务已经执行完成，所有 Worker 已退出，线程池即将执行 `terminated()` |
| **TERMINATED** | `011` | ❌ | ❌ | `terminated()` 执行完成，线程池生命周期彻底结束 |

从数字上比较，RUNNING < SHUTDOWN < STOP < TIDYING < TERMINATED

ThreadPoolExecutor 使用一个 `AtomicInteger` 类型的 `ctl` 变量同时维护两个信息，将线程池状态与线程数量合二为一，可以用一次 CAS 原子操作同时更新两个信息，避免使用两个变量带来的并发问题。

```java
// 一次 CAS 操作同时更新状态和线程数
ctl.compareAndSet(c, ctlOf(targetState, workerCountOf(c)))

private static int ctlOf(int rs, int wc) { return rs | wc; }
```

### 状态转换

```
RUNNING
 ├─► SHUTDOWN ─► TIDYING ─► TERMINATED
 └─► STOP     ─► TIDYING ─► TERMINATED
```

| 状态转换 | 触发条件 |
|----------|----------|
| → RUNNING | 创建线程池 |
| RUNNING → SHUTDOWN | 调用 `shutdown()` |
| RUNNING → STOP | 调用 `shutdownNow()` |
| SHUTDOWN → TIDYING | 队列为空且所有 Worker 已退出 |
| STOP → TIDYING | 所有 Worker 已退出 |
| TIDYING → TERMINATED | 执行完 `terminated()` 钩子方法 |

## 构造方法

ThreadPoolExecutor 提供了完整的构造方法，包含 7 个核心参数。

### 核心参数

```java
public ThreadPoolExecutor(
    int corePoolSize,                   // 核心线程数
    int maximumPoolSize,                // 最大线程数
    long keepAliveTime,                 // 救急线程存活时间
    TimeUnit unit,                      // 时间单位
    BlockingQueue<Runnable> workQueue,  // 任务队列
    ThreadFactory threadFactory,        // 线程工厂
    RejectedExecutionHandler handler    // 拒绝策略
)
```

**参数说明**：

| 参数 | 说明 |
|------|------|
| `corePoolSize` | 核心线程数，线程池维持的最小线程数量 |
| `maximumPoolSize` | 最大线程数，包含核心线程和救急线程的总数 |
| `keepAliveTime` | 救急线程的空闲存活时间，核心线程默认不受影响 |
| `unit` | 存活时间的单位 |
| `workQueue` | 阻塞队列，用于存放等待执行的任务 |
| `threadFactory` | 线程工厂，用于创建线程，可以取名 |
| `handler` | 拒绝策略，队列满且线程数达到上限时的处理策略 |

### 工作流程

```text
提交任务
  ↓
线程数 < corePoolSize?
  ├─ 是 → 创建核心线程执行任务
  │
  └─ 否 → 尝试加入任务队列
           ↓
         队列是否已满?
           ├─ 否 → 任务进入队列等待
           │
           └─ 是 → 线程数 < maximumPoolSize?
                    ├─ 是 → 创建救急线程执行任务
                    │
                    └─ 否 → 执行拒绝策略
```

1. **线程池启动时没有线程**，当任务提交后才创建线程执行任务

2. **线程数 < corePoolSize**：直接创建核心线程执行任务，即使有空闲线程也会创建新线程

3. **线程数 = corePoolSize**：新任务加入 `workQueue` 队列排队，等待空闲线程

4. **队列已满且线程数 < maximumPoolSize**：创建救急线程执行任务（前提是使用**有界队列**）

5. **线程数 = maximumPoolSize 且队列已满**：执行拒绝策略

6. **高峰过后**：救急线程空闲超过 `keepAliveTime` 后被回收，核心线程保持存活

::: tip 核心线程超时
默认情况下，核心线程不会超时回收。调用 `allowCoreThreadTimeOut(true)` 可以让核心线程也应用 `keepAliveTime` 策略。
:::

### 拒绝策略

JDK 提供了 4 种内置拒绝策略：

#### 1. AbortPolicy（默认）

抛出 `RejectedExecutionException` 异常，让调用者感知任务被拒绝。

```java
public static class AbortPolicy implements RejectedExecutionHandler {
    public void rejectedExecution(Runnable r, ThreadPoolExecutor e) {
        throw new RejectedExecutionException("任务被拒绝");
    }
}
```

**适用场景**：需要明确感知任务失败的情况

#### 2. CallerRunsPolicy

让提交任务的线程自己执行任务，既不抛弃任务，又能降低任务提交速度。

```java
public static class CallerRunsPolicy implements RejectedExecutionHandler {
    public void rejectedExecution(Runnable r, ThreadPoolExecutor e) {
        if (!e.isShutdown()) {
            r.run();  // 调用者自己执行
        }
    }
}
```

**适用场景**：任务不能丢失，但可以接受降低吞吐量

#### 3. DiscardPolicy

默默丢弃任务，不做任何处理。

```java
public static class DiscardPolicy implements RejectedExecutionHandler {
    public void rejectedExecution(Runnable r, ThreadPoolExecutor e) {
        // 什么都不做
    }
}
```

**适用场景**：任务可以丢失，不需要感知

#### 4. DiscardOldestPolicy

丢弃队列中最早的任务，让新任务有机会加入队列。

```java
public static class DiscardOldestPolicy implements RejectedExecutionHandler {
    public void rejectedExecution(Runnable r, ThreadPoolExecutor e) {
        if (!e.isShutdown()) {
            e.getQueue().poll();  // 移除队首任务
            e.execute(r);         // 重新提交
        }
    }
}
```

**适用场景**：优先执行新任务，旧任务可以丢弃

::: tip 常见框架的自定义拒绝策略

- **Dubbo**：抛异常前记录日志并 Dump 线程栈信息，方便排查问题
- **Netty**：创建临时线程执行任务
- **ActiveMQ**：等待一段时间后再次尝试入队
- **PinPoint**：采用责任链模式，依次尝试多个拒绝策略

:::


## Executors

Executors 工具类提供了多个工厂方法快速创建线程池，这些方法内部都是基于 `ThreadPoolExecutor` 实现。

::: warning 阿里巴巴开发规范
不允许使用 Executors 创建线程池，而应通过 `ThreadPoolExecutor` 构造方法显式创建。

**原因**：Executors 返回的线程池对象弊端如下：
- `FixedThreadPool` 和 `SingleThreadExecutor`：使用无界队列 `LinkedBlockingQueue`，可能堆积大量请求导致 OOM
- `CachedThreadPool`：最大线程数为 `Integer.MAX_VALUE`，可能创建大量线程导致 OOM
:::

### newFixedThreadPool

创建固定线程数的线程池。

```java
public static ExecutorService newFixedThreadPool(int nThreads) {
    return new ThreadPoolExecutor(
        nThreads, nThreads,                      // 核心线程数 = 最大线程数
        0L, TimeUnit.MILLISECONDS,               // 无需超时时间
        new LinkedBlockingQueue<Runnable>()      // 无界队列
    );
}
```

**特点**：
- 核心线程数 = 最大线程数，没有救急线程
- 使用无界队列 `LinkedBlockingQueue`，可以放任意数量的任务
- 线程数固定，不会因空闲而回收

**适用场景**：任务量已知，相对耗时的任务

**风险**：队列无界，可能导致内存溢出

### newCachedThreadPool

创建可缓存的线程池，线程数根据任务量动态调整。

```java
public static ExecutorService newCachedThreadPool() {
    return new ThreadPoolExecutor(
        0, Integer.MAX_VALUE,                    // 无核心线程，最大线程数无限制
        60L, TimeUnit.SECONDS,                   // 线程空闲 60 秒后回收
        new SynchronousQueue<Runnable>()         // 同步队列（不存储元素）
    );
}
```

**特点**：
- 核心线程数为 0，全部是救急线程
- 最大线程数为 `Integer.MAX_VALUE`，理论上无限制
- 使用 `SynchronousQueue`，不缓存任务，必须有线程立即处理
- 线程空闲 60 秒后自动回收

**SynchronousQueue 特性**：
- 不存储元素的阻塞队列
- 每个 `put` 操作必须等待一个 `take` 操作
- 适合传递性场景，任务直接交给线程执行

```java
SynchronousQueue<Integer> queue = new SynchronousQueue<>();

// 生产者线程
new Thread(() -> {
    try {
        System.out.println("准备放入元素");
        queue.put(1);  // 阻塞，直到有消费者取走
        System.out.println("元素已被取走");
    } catch (InterruptedException e) {
        e.printStackTrace();
    }
}).start();

Thread.sleep(1000);

// 消费者线程
new Thread(() -> {
    try {
        Integer value = queue.take();  // 取走元素
        System.out.println("取到元素: " + value);
    } catch (InterruptedException e) {
        e.printStackTrace();
    }
}).start();
```

**适用场景**：任务密集但执行时间短的情况

**风险**：可能创建大量线程，导致内存溢出

### newSingleThreadExecutor

创建单线程的线程池，保证任务按顺序执行。

```java
public static ExecutorService newSingleThreadExecutor() {
    return new FinalizableDelegatedExecutorService(
        new ThreadPoolExecutor(
            1, 1,                                    // 核心线程数 = 最大线程数 = 1
            0L, TimeUnit.MILLISECONDS,               // 无需超时时间
            new LinkedBlockingQueue<Runnable>()      // 无界队列
        )
    );
}
```

**特点**：
- 只有 1 个线程执行任务
- 任务按提交顺序串行执行
- 线程异常终止后会自动创建新线程，保证线程池正常工作
- 使用 `FinalizableDelegatedExecutorService` 包装，防止调用者修改线程池配置

**适用场景**：希望多个任务排队执行，且线程数固定为 1

**与自己创建单线程的区别**：
| 对比项    | `new Thread()` | `newSingleThreadExecutor()` |
| ------ | -------------- | --------------------------- |
| 线程异常退出 | 线程结束           | 自动创建新线程                     |
| 后续任务执行 | 无法继续           | 继续处理队列中的任务                  |
| 任务管理   | 手动维护           | 线程池统一管理                     |
| 任务提交   | 需自行处理          | 支持 `submit()`、`execute()`   |


**与 `newFixedThreadPool(1)` 的区别**：
| 对比项      | `newSingleThreadExecutor()` | `newFixedThreadPool(1)` |
| -------- | --------------------------- | ----------------------- |
| 线程数量     | 固定为 1                       | 默认 1                    |
| 是否允许修改配置 | 否                           | 可以                      |
| 返回类型     | 装饰后的 `ExecutorService`      | 底层 `ThreadPoolExecutor` |
| 线程池规模    | 始终保持单线程                     | 可通过强转后修改                |


**风险**：队列无界，可能导致内存溢出

## 提交任务 API

ThreadPoolExecutor 提供了多种任务提交方式，支持单任务执行和批量任务处理。

### execute

执行无返回值的任务，不会阻塞调用线程。

```java
void execute(Runnable command);
```

**特点**：
- 提交 `Runnable` 任务，无返回值
- 异步执行，不阻塞调用线程
- 任务异常不会传播到调用者，需要在任务内部捕获处理

**使用示例**：

```java
ExecutorService pool = new ThreadPoolExecutor(2, 5,
    0L, TimeUnit.MILLISECONDS,
    new LinkedBlockingQueue<>());

pool.execute(() -> {
    System.out.println("执行任务");
});
```

### submit

提交任务并返回 `Future` 对象，可以获取任务执行结果或取消任务。

```java
<T> Future<T> submit(Callable<T> task);
Future<?> submit(Runnable task);
<T> Future<T> submit(Runnable task, T result);
```

**特点**：
- 支持 `Callable` 和 `Runnable` 任务
- 返回 `Future` 对象，可以获取结果、取消任务或检查状态
- 任务异常会被封装在 `Future` 中，调用 `get()` 时抛出

**使用示例**：

```java
Future<String> future = pool.submit(() -> {
    Thread.sleep(1000);
    return "任务结果";
});

// 获取结果（阻塞）
String result = future.get();
```

### invokeAll

批量提交任务，等待所有任务完成后返回 `Future` 列表。

```java
// 提交 tasks 中所有任务
<T> List<Future<T>> invokeAll(
    Collection<? extends Callable<T>> tasks
) throws InterruptedException;

// 提交 tasks 中所有任务，带超时时间
<T> List<Future<T>> invokeAll(
    Collection<? extends Callable<T>> tasks,
    long timeout,
    TimeUnit unit
) throws InterruptedException;
```

**特点**：
- 批量提交 `Callable` 任务
- 阻塞等待所有任务完成或超时
- 返回的 `Future` 列表顺序与提交顺序一致
- 超时后未完成的任务会被取消

**使用示例**：

```java
List<Callable<String>> tasks = Arrays.asList(
    () -> "任务1",
    () -> "任务2",
    () -> "任务3"
);

List<Future<String>> futures = pool.invokeAll(tasks);

for (Future<String> future : futures) {
    System.out.println(future.get());
}
```

### invokeAny

批量提交任务，返回最先完成的任务结果，其他任务会被取消。

```java
<T> T invokeAny(
    Collection<? extends Callable<T>> tasks
) throws InterruptedException, ExecutionException;

// 带超时
<T> T invokeAny(
    Collection<? extends Callable<T>> tasks,
    long timeout,
    TimeUnit unit
) throws InterruptedException, ExecutionException, TimeoutException;
```

**特点**：
- 批量提交 `Callable` 任务
- 阻塞等待任意一个任务成功完成
- 返回最快完成任务的结果
- 其他未完成的任务会被取消
- 如果所有任务都失败，抛出 `ExecutionException`

**使用示例**：

```java
List<Callable<String>> tasks = Arrays.asList(
    () -> { Thread.sleep(100); return "任务1"; },
    () -> { Thread.sleep(200); return "任务2"; },
    () -> { Thread.sleep(300); return "任务3"; }
);

// 返回 "任务1"（最快完成）
String result = pool.invokeAny(tasks);
```

### 方法对比

| 方法 | 返回值 | 阻塞 | 适用场景 |
|------|--------|------|---------|
| `execute` | 无 | 否 | 执行无返回值的任务，不关心结果 |
| `submit` | `Future` | 否 | 需要获取任务结果或控制任务执行 |
| `invokeAll` | `List<Future>` | 是 | 批量执行任务，需要所有结果 |
| `invokeAny` | 结果值 | 是 | 批量执行任务，只需要最快的结果 |

## 关闭线程池

线程池提供了多种关闭方式，用于优雅停止或立即中断任务执行。

### shutdown

平滑关闭线程池，不再接收新任务，但会继续执行队列中的任务和正在执行的任务。

```java
public void shutdown() {
    final ReentrantLock mainLock = this.mainLock;
    mainLock.lock();
    try {
        checkShutdownAccess();
        advanceRunState(SHUTDOWN);           // 将状态设置为 SHUTDOWN
        interruptIdleWorkers();              // 中断空闲线程
        onShutdown();                        // 钩子方法，供 ScheduledThreadPoolExecutor 使用
    } finally {
        mainLock.unlock();
    }
    // 尝试终止线程池
    tryTerminate();
}
```

**核心逻辑**：

1. **修改状态**：将线程池状态从 `RUNNING` 改为 `SHUTDOWN`
2. **中断空闲线程**：对空闲的 Worker 线程发送中断信号
3. **不中断正在执行的线程**：正在执行任务的线程不受影响
4. **继续处理队列任务**：队列中的任务会继续执行完毕

**特点**：
- 调用后立即返回，不会阻塞调用线程，也不会等待任务执行完成
- 不接收新任务，提交新任务会执行拒绝策略
- 已提交的任务会继续执行完成
- 多次调用 `shutdown()` 不会报错

**使用示例**：

```java
ExecutorService pool = new ThreadPoolExecutor(2, 5,
    0L, TimeUnit.MILLISECONDS,
    new LinkedBlockingQueue<>());

pool.execute(() -> System.out.println("任务1"));
pool.execute(() -> System.out.println("任务2"));

pool.shutdown();  // 平滑关闭

// 等待任务完成
pool.awaitTermination(1, TimeUnit.MINUTES);
```

### shutdownNow

立即关闭线程池，使用中断（interrupt）机制尝试中断所有线程，并返回未执行的任务列表。

```java
public List<Runnable> shutdownNow() {
    List<Runnable> tasks;
    final ReentrantLock mainLock = this.mainLock;
    mainLock.lock();
    try {
        checkShutdownAccess();
        advanceRunState(STOP);               // 将状态设置为 STOP
        interruptWorkers();                  // 中断所有线程（包括正在执行的）
        tasks = drainQueue();                // 清空队列，返回未执行的任务
    } finally {
        mainLock.unlock();
    }
    tryTerminate();
    return tasks;
}
```

**核心逻辑**：

1. **修改状态**：将线程池状态改为 `STOP`
2. **中断所有线程**：对所有 Worker 线程（包括正在执行任务的）发送中断信号
3. **清空队列**：将队列中未执行的任务移除并返回
4. **返回未执行任务**：调用者可以根据返回的任务列表进行后续处理

**特点**：
- 调用后立即返回，不会阻塞调用线程
- 不再处理队列中等待的任务
- 返回未执行的任务列表
- 不保证正在执行的任务一定会停止（取决于任务是否响应中断）

**使用示例**：

```java
ExecutorService pool = new ThreadPoolExecutor(2, 5,
    0L, TimeUnit.MILLISECONDS,
    new LinkedBlockingQueue<>());

pool.execute(() -> {
    try {
        Thread.sleep(5000);
        System.out.println("任务完成");
    } catch (InterruptedException e) {
        System.out.println("任务被中断");
    }
});

// 立即关闭，返回未执行的任务
List<Runnable> notExecuted = pool.shutdownNow();
System.out.println("未执行任务数: " + notExecuted.size());
```

### 辅助方法

线程池提供了三个方法用于判断状态和等待终止。

#### isShutdown

判断线程池是否已关闭（调用了 `shutdown()` 或 `shutdownNow()`）。

```java
public boolean isShutdown() {
    return runStateAtLeast(ctl.get(), SHUTDOWN);
}
```

**返回值**：
- `true`：线程池不处于 `RUNNING` 状态（即状态 >= `SHUTDOWN`）
- `false`：线程池仍处于 `RUNNING` 状态

#### isTerminated

判断线程池是否已完全终止（所有任务执行完成且所有线程已退出）。

```java
public boolean isTerminated() {
    return runStateAtLeast(ctl.get(), TERMINATED);
}
```

**返回值**：
- `true`：线程池已完全终止，状态为 `TERMINATED`
- `false`：线程池还有任务在执行或等待执行

#### awaitTermination

阻塞等待线程池终止或超时返回，通常配合 shutdown() 或 shutdownNow() 使用，以确保线程池中的任务处理完毕后再继续执行后续逻辑。

```java
public boolean awaitTermination(long timeout, TimeUnit unit)
    throws InterruptedException {
    long nanos = unit.toNanos(timeout);
    final ReentrantLock mainLock = this.mainLock;
    mainLock.lock();
    try {
        while (runStateLessThan(ctl.get(), TERMINATED)) {
            if (nanos <= 0L)
                return false;
            nanos = termination.awaitNanos(nanos);
        }
        return true;
    } finally {
        mainLock.unlock();
    }
}
```

**参数**：
- `timeout`：等待时长
- `unit`：时间单位

**返回值**：
- `true`：线程池在超时前终止
- `false`：超时后线程池仍未终止

**使用示例**：

```java
pool.shutdown();

// 等待 1 分钟
if (pool.awaitTermination(1, TimeUnit.MINUTES)) {
    System.out.println("线程池已终止");
} else {
    System.out.println("超时，强制关闭");
    pool.shutdownNow();
}
```

### 最佳实践

优雅关闭线程池的标准模式（来自 [Oracle 官方文档 - ExecutorService](https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/ExecutorService.html) 和《Java 并发编程实战》）：

```java
// 优雅关闭线程池的标准模式
pool.shutdown();  // 不再接收新任务

try {
    // 等待 60 秒
    if (!pool.awaitTermination(60, TimeUnit.SECONDS)) {
        // 超时后强制关闭
        pool.shutdownNow();

        // 再等待一段时间
        if (!pool.awaitTermination(60, TimeUnit.SECONDS)) {
            System.err.println("线程池未能正常终止");
        }
    }
} catch (InterruptedException e) {
    pool.shutdownNow();
    Thread.currentThread().interrupt();
}
```

**执行流程**：

1. **`shutdown()`** - 平滑关闭，已提交任务继续执行
2. **`awaitTermination(60s)`** - 等待任务完成，超时则进入下一步
3. **`shutdownNow()`** - 强制关闭，中断所有线程
4. **再次 `awaitTermination(60s)`** - 等待线程响应中断
5. **捕获 `InterruptedException`** - 立即强制关闭并恢复中断状态

**设计理念**：

- 先优雅后强制，给任务正常完成的机会
- 超时保护，避免无限期等待
- 中断传播，遵循 Java 中断处理规范


