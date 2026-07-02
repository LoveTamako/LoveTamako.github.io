# ReentrantLock

`ReentrantLock` 是 `java.util.concurrent.locks` 包下的显式锁实现，基于 AQS（AbstractQueuedSynchronizer）构建，提供了比 `synchronized` 更灵活的锁控制能力。

![](./image.png)

## 非公平锁实现原理

ReentrantLock 默认使用非公平锁实现。

```java
// 默认构造器：非公平锁
public ReentrantLock() {
    sync = new NonfairSync();
}

// 指定公平性
public ReentrantLock(boolean fair) {
    sync = fair ? new FairSync() : new NonfairSync();
}
```

`NonfairSync` 继承自 AQS，通过 CAS 修改 state 实现加锁。

### 加锁成功流程

当线程调用 `lock()` 方法尝试获取锁时，如果锁未被占用，会直接通过 CAS 操作成功获取锁。

**核心源码**：

```java
// ReentrantLock.NonfairSync
final void lock() {
    // 1. 直接尝试 CAS 将 state 从 0 改为 1
    if (compareAndSetState(0, 1))
        // 2. CAS 成功，设置当前线程为锁的持有者
        setExclusiveOwnerThread(Thread.currentThread());
    else
        // 3. CAS 失败，进入 AQS 的 acquire 流程
        acquire(1);
}
```

**流程分析**：

1. **CAS 抢锁**：线程首先通过 `compareAndSetState(0, 1)` 尝试将 state 从 0 修改为 1
   - state = 0 表示锁未被占用
   - CAS 成功表示当前线程成功获取到锁

2. **设置持有者**：`setExclusiveOwnerThread(Thread.currentThread())` 将当前线程设置为锁的独占持有者
   - 这个字段用于判断重入场景（同一线程再次加锁）

3. **返回**：加锁成功，`lock()` 方法返回，线程继续执行临界区代码

### 加锁失败流程

当 CAS 操作失败时（state ≠ 0），说明锁已被占用，线程进入 AQS 的 `acquire(1)` 流程。

#### 1. acquire 入口

```java
// AbstractQueuedSynchronizer
public final void acquire(int arg) {
    // 1. 尝试获取锁
    if (!tryAcquire(arg) &&
        // 2. 获取失败，将线程加入等待队列并阻塞
        acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
        // 3. 处理中断
        selfInterrupt();
}
```

**selfInterrupt 恢复中断状态**：

```java
static void selfInterrupt() {
    Thread.currentThread().interrupt();
}
```

**不可中断锁的中断处理机制**：

`lock()` 方法是**不可中断**的，但这不意味着忽略中断信号：

1. **等待期间的中断**：
   - 线程在 `LockSupport.park()` 中被中断会唤醒
   - `parkAndCheckInterrupt()` 检测到中断并清除标记
   - 线程继续尝试获取锁，不抛出异常

2. **获取锁后的处理**：
   - `acquireQueued()` 返回 `true` 表示等待期间发生过中断
   - `selfInterrupt()` 重新设置中断标记
   - 上层代码可以检查 `Thread.interrupted()` 并决定如何响应

**与可中断锁对比**：

| 锁类型 | 中断响应 | 使用场景 |
|--------|---------|---------|
| `lock()` | 不抛异常，恢复中断状态 | 必须获取锁的场景 |
| `lockInterruptibly()` | 立即抛出 `InterruptedException` | 允许取消等待的场景 |

#### 2. tryAcquire 尝试获取锁

`tryAcquire()` 是 AQS 的模板方法，由 `NonfairSync` 实现。

```java
// ReentrantLock.NonfairSync
protected final boolean tryAcquire(int acquires) {
    return nonfairTryAcquire(acquires);
}

// ReentrantLock.Sync
final boolean nonfairTryAcquire(int acquires) {
    final Thread current = Thread.currentThread();
    int c = getState();

    // 情况1: 锁未被占用，再次尝试 CAS 获取
    if (c == 0) {
        if (compareAndSetState(0, acquires)) {
            setExclusiveOwnerThread(current);
            return true;  // 获取成功
        }
    }
    // 情况2: 当前线程已持有锁（重入）
    else if (current == getExclusiveOwnerThread()) {
        int nextc = c + acquires;  // state + 1
        if (nextc < 0) // overflow
            throw new Error("Maximum lock count exceeded");
        setState(nextc);  // 不需要 CAS，因为只有持有锁的线程会执行到这里
        return true;  // 重入成功
    }
    // 情况3: 锁被其他线程占用
    return false;  // 获取失败
}
```

**重入逻辑**：
- 如果 `current == exclusiveOwnerThread`，说明当前线程已持有锁
- 将 state 值加 1，表示重入次数增加
- 后续解锁时需要调用相同次数的 `unlock()`

#### 3. addWaiter 加入等待队列

当 `tryAcquire()` 返回 `false` 时，线程需要加入 CLH 等待队列。

```java
// AbstractQueuedSynchronizer
private Node addWaiter(Node mode) {
    // 1. 创建新节点，包装当前线程
    Node node = new Node(Thread.currentThread(), mode);
    Node pred = tail;

    // 2. 快速尝试：如果队列已存在，直接 CAS 插入到队尾
    if (pred != null) {
        node.prev = pred;
        if (compareAndSetTail(pred, node)) {
            pred.next = node;
            return node;
        }
    }

    // 3. 快速插入失败或队列为空，进入完整入队流程
    enq(node);
    return node;
}

private Node enq(final Node node) {
    for (;;) {
        Node t = tail;
        // 队列为空，需要初始化（创建哨兵头节点）
        if (t == null) {
            if (compareAndSetHead(new Node()))
                tail = head;
        } else {
            // CAS 将节点插入队尾
            node.prev = t;
            if (compareAndSetTail(t, node)) {
                t.next = node;
                return t;
            }
        }
    }
}
```

**队列结构**：

```text
初始状态（队列为空）：
head = null, tail = null

    ↓ Thread-2 加入队列（创建哨兵节点）

head                    tail
  ↓                      ↓
[哨兵] ← → [Thread-2]

    ↓ Thread-3 加入队列

head                              tail
  ↓                                ↓
[哨兵] ← → [Thread-2] ← → [Thread-3]
```

**哨兵节点（Dummy Node）**：

AQS 使用哨兵节点作为队列的头节点，这是一种经典的链表设计技巧。

**为什么需要哨兵节点**：

1. **简化边界条件处理**：
   - 无需特殊处理空队列的情况
   - 所有等待线程节点都有前驱节点，代码逻辑统一

2. **head 节点的语义**：
   - head 节点不代表等待线程，而是代表**当前持有锁的线程**或**空占位节点**
   - head.next 才是第一个真正等待的线程

3. **出队操作更简单**：
   - 线程获取锁时，只需将自己设置为新的 head
   - 原 head 会被 GC 回收，无需复杂的删除操作

#### 4. acquireQueued 阻塞等待

线程加入队列后，进入 `acquireQueued()` 方法，在循环中尝试获取锁或阻塞等待。

```java
// AbstractQueuedSynchronizer
final boolean acquireQueued(final Node node, int arg) {
    boolean failed = true;
    try {
        boolean interrupted = false;
        for (;;) {
            final Node p = node.predecessor();  // 获取前驱节点

            // 1. 只有当前驱节点是 head 时，当前线程才会尝试获取锁。
            if (p == head && tryAcquire(arg)) {
                setHead(node);  // 获取成功，当前节点成为新的 head
                p.next = null;  // 帮助 GC
                failed = false;
                return interrupted;
            }

            // 2. 判断是否需要阻塞，并执行阻塞
            if (shouldParkAfterFailedAcquire(p, node) &&
                parkAndCheckInterrupt())
                interrupted = true;
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}
```

**shouldParkAfterFailedAcquire 判断是否阻塞**：

```java
private static boolean shouldParkAfterFailedAcquire(Node pred, Node node) {
    int ws = pred.waitStatus;

    // 前驱节点状态为 SIGNAL，表示会唤醒当前节点，可以安全阻塞
    if (ws == Node.SIGNAL)
        return true;

    // 前驱节点被取消（waitStatus > 0），跳过这些节点
    if (ws > 0) {
        do {
            node.prev = pred = pred.prev;
        } while (pred.waitStatus > 0);
        pred.next = node;
    } else {
        // 将前驱节点状态设置为 SIGNAL，下次循环再阻塞
        compareAndSetWaitStatus(pred, ws, Node.SIGNAL);
    }
    return false;
}
```
**阻塞前的准备工作**：
- 第一次循环：设置前驱节点 waitStatus = SIGNAL
- 第二次循环：确认前驱状态为 SIGNAL，执行阻塞

**为什么不立即阻塞**：
- 持有锁的线程可能很快就释放锁
- 给当前线程一次"自旋"机会，避免不必要的上下文切换
- SIGNAL 状态确保前驱释放锁时会唤醒当前线程
  
**parkAndCheckInterrupt 阻塞线程**：

```java
private final boolean parkAndCheckInterrupt() {
    LockSupport.park(this);  // 阻塞当前线程
    return Thread.interrupted();  // 返回并清除中断标记
}
```


