# AQS

AbstractQueuedSynchronizer（抽象队列同步器）是 JDK 提供的同步器框架，是构建锁和其他同步组件的基础。`ReentrantLock`、`Semaphore`、`CountDownLatch` 等并发工具都是基于 AQS 实现的。

## 概述

AQS 提供了一个基于 FIFO 队列的框架，用于构建阻塞式锁和同步器。它的核心思想是：**资源状态管理 + 等待队列**。

### 核心结构

```text
                    [AQS 核心组成]

        state（同步状态）      +      CLH 队列（等待线程）
              ↓                           ↓
     int volatile state          head → Node → Node → tail
              ↓                           ↓
        使用 CAS 修改               线程获取失败后入队等待
```

**核心要素**：

1. **state 变量**：表示共享资源的状态，使用 `volatile` + CAS 保证原子性
2. **CLH 等待队列**：类似 Monitor 的 EntryList，存储等待获取资源的线程
3. **Condition 队列**：类似 Monitor 的 WaitSet，支持多个条件变量
4. **获取与释放**：子类实现具体的资源获取和释放逻辑

### 同步状态（state）

AQS 使用一个 `int` 类型的 `volatile` 变量表示同步状态。

```java
private volatile int state;

// 获取状态
protected final int getState()

// 设置状态
protected final void setState(int newState)

// CAS 修改状态
protected final boolean compareAndSetState(int expect, int update)
```

**不同实现中 state 的含义**：

| 同步器 | state 的含义 |
|--------|-------------|
| `ReentrantLock` | 0 表示未锁定，n 表示重入次数 |
| `Semaphore` | 表示可用许可数量 |
| `CountDownLatch` | 表示计数器的值 |
| `ReentrantReadWriteLock` | 高 16 位表示读锁，低 16 位表示写锁 |

### CLH 等待队列

AQS 内部维护了一个基于 CLH 锁的变体的 FIFO 双向队列，类似 Monitor 的 EntryList。

```text
head                                           tail
  ↓                                             ↓
[Node] ⇄ [Node] ⇄ [Node] ⇄ [Node] ⇄ [Node]
  ↓        ↓        ↓        ↓        ↓
Thread   Thread   Thread   Thread   Thread
(已获取)  (等待)   (等待)   (等待)   (等待)
```

**Node 节点结构**：

```java
static final class Node {
    volatile Node prev;          // 前驱节点
    volatile Node next;          // 后继节点
    volatile Thread thread;      // 等待的线程
    volatile int waitStatus;     // 等待状态
    Node nextWaiter;            // Condition 队列的下一个节点
}
```

**等待状态（waitStatus）**：

| 状态 | 值 | 说明 |
|------|---|------|
| `CANCELLED` | 1 | 线程等待超时或被中断，需要从队列中移除 |
| `SIGNAL` | -1 | 后继节点需要被唤醒 |
| `CONDITION` | -2 | 线程在 Condition 队列中等待 |
| `PROPAGATE` | -3 | 共享模式下，释放操作需要传播到其他节点 |
| `INITIAL` | 0 | 初始状态 |

### Condition 条件变量

AQS 通过内部类 `ConditionObject` 支持条件变量，类似 Monitor 的 WaitSet，但功能更强大。

**核心特性**：

- 支持多个条件变量，每个 `Condition` 对应一个独立的等待队列
- 必须在持有锁的情况下使用条件变量
- 支持可中断、超时等待

**队列对比**：

```text
Monitor 机制
┌─────────────────────────┐
│ Owner: Thread-1         │ ← 持有锁的线程
├─────────────────────────┤
│ EntryList               │ ← 等待锁的线程队列
│  Thread-2, Thread-3     │
├─────────────────────────┤
│ WaitSet                 │ ← wait() 后的线程队列
│  Thread-4, Thread-5     │
└─────────────────────────┘

AQS 机制
┌─────────────────────────┐
│ state = 1               │ ← 同步状态
├─────────────────────────┤
│ CLH 同步队列            │ ← 等待锁的线程队列
│  head → Node → tail     │   (类似 EntryList)
├─────────────────────────┤
│ Condition 队列 1        │ ← await() 后的线程队列
│  firstWaiter → Node     │   (类似 WaitSet)
├─────────────────────────┤
│ Condition 队列 2        │ ← 支持多个条件变量
│  firstWaiter → Node     │   (Monitor 只有一个)
└─────────────────────────┘
```

**核心方法**：

```java
// 创建条件变量
public Condition newCondition() {
    return new ConditionObject();
}

// Condition 接口方法
void await() throws InterruptedException;           // 等待
void awaitUninterruptibly();                        // 不可中断等待
long awaitNanos(long nanosTimeout);                 // 超时等待（纳秒）
boolean await(long time, TimeUnit unit);            // 超时等待
boolean awaitUntil(Date deadline);                  // 等待到指定时间

void signal();                                      // 唤醒一个等待线程
void signalAll();                                   // 唤醒所有等待线程
```

### 独占模式 vs 共享模式

AQS 支持两种资源共享模式：

**独占模式（Exclusive）**：
- 只有一个线程能获取资源
- 典型实现：`ReentrantLock`、`ReentrantReadWriteLock` 的写锁

**共享模式（Shared）**：
- 多个线程可以同时获取资源
- 典型实现：`Semaphore`、`CountDownLatch`、`ReentrantReadWriteLock` 的读锁

### 模板方法模式

AQS 使用模板方法模式，子类只需实现少量钩子方法。

**需要子类实现的方法**：

```java
// 独占模式：尝试获取资源
protected boolean tryAcquire(int arg)

// 独占模式：尝试释放资源
protected boolean tryRelease(int arg)

// 共享模式：尝试获取资源
protected int tryAcquireShared(int arg)

// 共享模式：尝试释放资源
protected boolean tryReleaseShared(int arg)

// 判断当前线程是否独占资源
protected boolean isHeldExclusively()
```

**AQS 提供的模板方法**：

```java
// 独占模式
public final void acquire(int arg)                              // 获取
public final void acquireInterruptibly(int arg)                 // 可中断获取
public final boolean tryAcquireNanos(int arg, long nanosTimeout) // 超时获取
public final boolean release(int arg)                           // 释放

// 共享模式
public final void acquireShared(int arg)                        // 获取
public final void acquireSharedInterruptibly(int arg)           // 可中断获取
public final boolean releaseShared(int arg)                     // 释放
```

### 工作流程

**独占模式获取资源**：

```text
acquire(arg)
    ↓
tryAcquire(arg) 成功？
    ├─ 是 → 直接返回，获取成功
    └─ 否 → addWaiter() 加入 CLH 队列
              ↓
         acquireQueued() 在队列中自旋等待
              ↓
         前驱是 head 且 tryAcquire 成功？
              ├─ 是 → 设置自己为 head，返回
              └─ 否 → park() 阻塞当前线程
```

**独占模式释放资源**：

```text
release(arg)
    ↓
tryRelease(arg) 成功？
    └─ 是 → unparkSuccessor(head) 唤醒后继节点
              ↓
         后继节点被唤醒，从 park() 返回
              ↓
         继续 acquireQueued() 的循环，尝试获取
```



## 自定义锁

基于 AQS 可以方便地实现自定义同步器。下面通过几个示例展示如何使用 AQS。

### 不可重入锁

实现一个简单的独占锁，演示 AQS 的基本用法。

```java
public class NonReentrantLock implements Lock {
    // 自定义同步器
    private static class Sync extends AbstractQueuedSynchronizer {
        // 尝试获取锁
        @Override
        protected boolean tryAcquire(int arg) {
            // 使用 CAS 将 state 从 0 改为 1
            if (compareAndSetState(0, 1)) {
                // 设置当前线程为独占线程
                setExclusiveOwnerThread(Thread.currentThread());
                return true;
            }
            return false;
        }

        // 尝试释放锁
        @Override
        protected boolean tryRelease(int arg) {
            // 检查是否是当前线程持有锁
            if (getState() == 0) {
                throw new IllegalMonitorStateException();
            }
            // 清空独占线程
            setExclusiveOwnerThread(null);
            // 释放锁（state = 0）
            setState(0);
            return true;
        }

        // 是否独占
        @Override
        protected boolean isHeldExclusively() {
            return getState() == 1;
        }

        // 创建条件变量
        Condition newCondition() {
            return new ConditionObject();
        }
    }

    private final Sync sync = new Sync();

    @Override
    public void lock() {
        sync.acquire(1);
    }

    @Override
    public void lockInterruptibly() throws InterruptedException {
        sync.acquireInterruptibly(1);
    }

    @Override
    public boolean tryLock() {
        return sync.tryAcquire(1);
    }

    @Override
    public boolean tryLock(long time, TimeUnit unit) throws InterruptedException {
        return sync.tryAcquireNanos(1, unit.toNanos(time));
    }

    @Override
    public void unlock() {
        sync.release(1);
    }

    @Override
    public Condition newCondition() {
        return sync.newCondition();
    }
}
```

**使用示例**：

```java
public class NonReentrantLockDemo {
    public static void main(String[] args) {
        NonReentrantLock lock = new NonReentrantLock();

        Runnable task = () -> {
            lock.lock();
            try {
                System.out.println(Thread.currentThread().getName() + " 获得锁");
                Thread.sleep(1000);
            } catch (InterruptedException e) {
                e.printStackTrace();
            } finally {
                lock.unlock();
                System.out.println(Thread.currentThread().getName() + " 释放锁");
            }
        };

        new Thread(task, "Thread-1").start();
        new Thread(task, "Thread-2").start();
    }
}
```

输出：
```
Thread-1 获得锁
Thread-1 释放锁
Thread-2 获得锁
Thread-2 释放锁
```

### JDK 中基于 AQS 的实现

JDK 中多个并发工具都是基于 AQS 实现的。

#### ReentrantLock

独占锁，支持可重入。

**核心实现**：

```java
// state = 0：未锁定
// state = n：锁定且重入 n 次

protected final boolean tryAcquire(int acquires) {
    final Thread current = Thread.currentThread();
    int c = getState();

    // 未锁定
    if (c == 0) {
        if (compareAndSetState(0, acquires)) {
            setExclusiveOwnerThread(current);
            return true;
        }
    }
    // 当前线程已持有锁，重入
    else if (current == getExclusiveOwnerThread()) {
        int nextc = c + acquires;
        setState(nextc);
        return true;
    }
    return false;
}
```

#### Semaphore

信号量，控制并发访问数量。

**核心实现**：

```java
// state = 可用许可数

protected int tryAcquireShared(int acquires) {
    for (;;) {
        int available = getState();
        int remaining = available - acquires;

        if (remaining < 0 || compareAndSetState(available, remaining)) {
            return remaining;
        }
    }
}
```

#### CountDownLatch

倒计数门闩，等待计数归零。

**核心实现**：

```java
// state = 计数器的值

protected int tryAcquireShared(int acquires) {
    return (getState() == 0) ? 1 : -1;  // 计数为 0 时获取成功
}

protected boolean tryReleaseShared(int releases) {
    for (;;) {
        int c = getState();
        if (c == 0) return false;  // 已经是 0，无法再减

        int nextc = c - 1;
        if (compareAndSetState(c, nextc)) {
            return nextc == 0;  // 减到 0 时返回 true，触发唤醒
        }
    }
}
```

### 最佳实践

**1. 优先使用 JDK 提供的同步工具**

除非有特殊需求，否则优先使用 `ReentrantLock`、`Semaphore` 等现成工具。

**2. 正确实现 tryAcquire/tryRelease**

```java
// ✅ 正确：使用 CAS 保证原子性
protected boolean tryAcquire(int arg) {
    return compareAndSetState(0, 1);
}

// ❌ 错误：未使用 CAS，存在竞态条件
protected boolean tryAcquire(int arg) {
    if (getState() == 0) {
        setState(1);  // 线程不安全
        return true;
    }
    return false;
}
```

**3. 避免在 tryAcquire 中阻塞**

`tryAcquire()` 应该是非阻塞的，快速返回。

```java
// ✅ 正确：快速返回
protected boolean tryAcquire(int arg) {
    return compareAndSetState(0, 1);
}

// ❌ 错误：在 tryAcquire 中阻塞
protected boolean tryAcquire(int arg) {
    LockSupport.park();  // 不要这样做！
    return true;
}
```

::: tip 理解 AQS 的重要性
AQS 是理解 JUC 并发工具的关键。掌握 AQS 的工作原理，有助于：
- 深入理解 ReentrantLock、Semaphore 等工具的实现
- 根据业务需求自定义同步器
- 排查并发问题和性能瓶颈
:::
