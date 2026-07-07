# ReentrantReadWriteLock

`ReentrantReadWriteLock` 是 `java.util.concurrent.locks` 包下的读写锁实现，基于 AQS 构建。它将锁分为**读锁**和**写锁**两种，允许多个读线程同时访问，但写线程访问时会排斥所有其他线程，适用于读多写少的场景。

## 读写锁的设计思想

### 为什么需要读写锁

在传统的互斥锁（如 `ReentrantLock`、`synchronized`）中，无论是读操作还是写操作都需要独占锁，即使多个线程只是读取数据（不修改数据）也必须串行执行。这在读多写少的场景下会导致不必要的性能损失。

**读写锁的核心思想**：
- **读读共享**：多个读线程可以同时持有读锁，互不阻塞
- **读写互斥**：读线程和写线程互斥，不能同时持有锁
- **写写互斥**：写线程之间互斥，同一时刻只能有一个写线程持有锁

### 锁兼容性矩阵

|  | 读锁 | 写锁 |
|---|-----|-----|
| **读锁** | ✅ 兼容 | ❌ 互斥 |
| **写锁** | ❌ 互斥 | ❌ 互斥 |

### 适用场景

**适合使用读写锁的场景**：
- 读操作远多于写操作（读多写少）
- 读操作耗时较长
- 数据一致性要求不允许脏读

**不适合使用读写锁的场景**：
- 读写操作差不多或写多于读
- 读操作非常快（锁竞争开销可能大于收益）

### 基本使用示例

```java
public class CachedData {
    private Object data;
    private volatile boolean cacheValid;
    private final ReentrantReadWriteLock rwl = new ReentrantReadWriteLock();
    private final Lock readLock = rwl.readLock();
    private final Lock writeLock = rwl.writeLock();

    // 读操作
    public Object getData() {
        readLock.lock();
        try {
            if (cacheValid) {
                return data;
            }
        } finally {
            readLock.unlock();
        }

        // 缓存失效，获取写锁更新数据
        writeLock.lock();
        try {
            if (!cacheValid) {  // 双重检查
                data = loadDataFromDB();
                cacheValid = true;
            }
            return data;
        } finally {
            writeLock.unlock();
        }
    }

    // 写操作
    public void updateData(Object newData) {
        writeLock.lock();
        try {
            data = newData;
            cacheValid = true;
        } finally {
            writeLock.unlock();
        }
    }

    private Object loadDataFromDB() {
        // 模拟从数据库加载数据
        return new Object();
    }
}
```

## 状态表示

ReentrantReadWriteLock 使用 AQS 的 state 字段（32 位 int）同时记录读锁和写锁的状态。

### 状态拆分

AQS 的 state 被拆分为**高 16 位**和**低 16 位**：

```text
state (32 位)
┌─────────────────┬─────────────────┐
│   高 16 位      │   低 16 位      │
│   读锁计数      │   写锁计数      │
└─────────────────┴─────────────────┘
```

**核心常量**：

```java
// ReentrantReadWriteLock.Sync
static final int SHARED_SHIFT   = 16;
static final int SHARED_UNIT    = (1 << SHARED_SHIFT);  // 65536
static final int MAX_COUNT      = (1 << SHARED_SHIFT) - 1;  // 65535
static final int EXCLUSIVE_MASK = (1 << SHARED_SHIFT) - 1;  // 65535

// 获取读锁持有次数（高 16 位）
static int sharedCount(int c)    { return c >>> SHARED_SHIFT; }

// 获取写锁持有次数（低 16 位）
static int exclusiveCount(int c) { return c & EXCLUSIVE_MASK; }
```

**示例**：

```java
// 假设 state = 0x00030001 (十六进制)
// 二进制: 0000 0000 0000 0011 | 0000 0000 0000 0001

int state = 0x00030001;
int readCount = sharedCount(state);    // 高 16 位: 3
int writeCount = exclusiveCount(state); // 低 16 位: 1

// 表示：写锁被持有 1 次，读锁被持有 3 次（总共）
```

## 写锁实现原理

写锁是**独占锁**，与 ReentrantLock 类似，但需要额外检查是否有读锁存在。

### 写锁加锁流程

#### lock() 方法

```java
// ReentrantReadWriteLock.WriteLock
public void lock() {
    sync.acquire(1);
}

// AbstractQueuedSynchronizer
public final void acquire(int arg) {
    if (!tryAcquire(arg) &&
        acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
        selfInterrupt();
}
```

#### tryAcquire 尝试获取写锁

```java
// ReentrantReadWriteLock.Sync
protected final boolean tryAcquire(int acquires) {
    Thread current = Thread.currentThread();
    int c = getState();
    int w = exclusiveCount(c);  // 获取写锁计数

    if (c != 0) {
        // 情况1: 有读锁或有其他线程持有写锁
        if (w == 0 || current != getExclusiveOwnerThread())
            return false;

        // 情况2: 当前线程重入写锁
        if (w + exclusiveCount(acquires) > MAX_COUNT)
            throw new Error("Maximum lock count exceeded");
        setState(c + acquires);
        return true;
    }

    // 情况3: 锁空闲，尝试获取写锁
    if (writerShouldBlock() ||
        !compareAndSetState(c, c + acquires))
        return false;
    setExclusiveOwnerThread(current);
    return true;
}
```

**流程分析**：

1. **情况1：锁已被占用**
   ```java
   if (c != 0) {
       if (w == 0 || current != getExclusiveOwnerThread())
           return false;
   }
   ```
   - `c != 0`：state 不为 0，说明有线程持有锁
   - `w == 0`：写锁计数为 0，说明有读锁存在 → **读写互斥，获取失败**
   - `current != getExclusiveOwnerThread()`：其他线程持有写锁 → **写写互斥，获取失败**

2. **情况2：当前线程重入写锁**
   ```java
   if (w + exclusiveCount(acquires) > MAX_COUNT)
       throw new Error("Maximum lock count exceeded");
   setState(c + acquires);
   return true;
   ```
   - 当前线程已持有写锁，支持重入
   - 检查是否超过最大重入次数（65535）
   - 直接增加写锁计数（低 16 位加 1）

3. **情况3：锁空闲，尝试获取**
   ```java
   if (writerShouldBlock() ||
       !compareAndSetState(c, c + acquires))
       return false;
   setExclusiveOwnerThread(current);
   return true;
   ```
   - `writerShouldBlock()`：公平性检查（公平锁需检查队列）
   - CAS 修改 state，将低 16 位从 0 改为 1
   - 设置当前线程为锁的持有者

### 写锁解锁流程

#### unlock() 方法

```java
// ReentrantReadWriteLock.WriteLock
public void unlock() {
    sync.release(1);
}

// AbstractQueuedSynchronizer
public final boolean release(int arg) {
    if (tryRelease(arg)) {
        Node h = head;
        if (h != null && h.waitStatus != 0)
            unparkSuccessor(h);
        return true;
    }
    return false;
}
```

#### tryRelease 释放写锁

```java
// ReentrantReadWriteLock.Sync
protected final boolean tryRelease(int releases) {
    if (!isHeldExclusively())
        throw new IllegalMonitorStateException();

    int nextc = getState() - releases;
    boolean free = exclusiveCount(nextc) == 0;
    if (free)
        setExclusiveOwnerThread(null);
    setState(nextc);
    return free;
}
```

**流程分析**：

1. **检查持有者**：验证当前线程是否持有写锁
2. **减少计数**：将 state 的低 16 位减 1
3. **判断释放**：如果写锁计数归 0，清除持有者并返回 `true`
4. **唤醒等待**：如果完全释放，唤醒同步队列中的下一个线程

## 读锁实现原理

读锁是**共享锁**，允许多个线程同时持有。实现比写锁更复杂，因为需要跟踪多个线程的读锁持有情况。

### 读计数器设计

由于多个线程可以同时持有读锁，需要记录每个线程的重入次数。ReentrantReadWriteLock 使用两种方式记录：

1. **ThreadLocal 计数器**：记录当前线程的读锁重入次数
2. **全局计数器**：state 的高 16 位记录所有线程的读锁总数

```java
// ReentrantReadWriteLock.Sync
static final class HoldCounter {
    int count = 0;  // 重入次数
    final long tid = Thread.currentThread().getId();  // 线程 ID
}

static final class ThreadLocalHoldCounter
    extends ThreadLocal<HoldCounter> {
    public HoldCounter initialValue() {
        return new HoldCounter();
    }
}

private transient ThreadLocalHoldCounter readHolds;
private transient HoldCounter cachedHoldCounter;  // 缓存最后一个获取读锁的线程
```

### 读锁加锁流程

#### lock() 方法

```java
// ReentrantReadWriteLock.ReadLock
public void lock() {
    sync.acquireShared(1);
}

// AbstractQueuedSynchronizer
public final void acquireShared(int arg) {
    if (tryAcquireShared(arg) < 0)
        doAcquireShared(arg);  // 进入等待队列
}
```

#### tryAcquireShared 尝试获取读锁

```java
// ReentrantReadWriteLock.Sync
protected final int tryAcquireShared(int unused) {
    Thread current = Thread.currentThread();
    int c = getState();

    // 情况1: 如果有写锁且不是当前线程持有，获取失败
    if (exclusiveCount(c) != 0 &&
        getExclusiveOwnerThread() != current)
        return -1;

    // 情况2: 尝试获取读锁
    int r = sharedCount(c);
    if (!readerShouldBlock() &&
        r < MAX_COUNT &&
        compareAndSetState(c, c + SHARED_UNIT)) {
        // CAS 成功，更新线程持有计数
        if (r == 0) {
            firstReader = current;
            firstReaderHoldCount = 1;
        } else if (firstReader == current) {
            firstReaderHoldCount++;
        } else {
            HoldCounter rh = cachedHoldCounter;
            if (rh == null || rh.tid != current.getId())
                cachedHoldCounter = rh = readHolds.get();
            else if (rh.count == 0)
                readHolds.set(rh);
            rh.count++;
        }
        return 1;
    }

    // 情况3: CAS 失败或需要阻塞，进入完整获取流程
    return fullTryAcquireShared(current);
}
```

**流程分析**：

1. **检查写锁**：
   - 如果有其他线程持有写锁，读锁获取失败（读写互斥）
   - 如果当前线程持有写锁，允许获取读锁（**锁降级**）

2. **快速获取路径**：
   - 检查 `readerShouldBlock()`：公平性判断
   - 读锁计数未超限：`r < MAX_COUNT`
   - CAS 成功：将高 16 位加 1

3. **更新持有计数**：
   - 第一个读线程：使用 `firstReader` 和 `firstReaderHoldCount`（避免 ThreadLocal 开销）
   - 其他线程：使用 `cachedHoldCounter` 缓存或 ThreadLocal

### 读锁解锁流程

#### unlock() 方法

```java
// ReentrantReadWriteLock.ReadLock
public void unlock() {
    sync.releaseShared(1);
}

// AbstractQueuedSynchronizer
public final boolean releaseShared(int arg) {
    if (tryReleaseShared(arg)) {
        doReleaseShared();  // 唤醒等待的线程
        return true;
    }
    return false;
}
```

#### tryReleaseShared 释放读锁

```java
// ReentrantReadWriteLock.Sync
protected final boolean tryReleaseShared(int unused) {
    Thread current = Thread.currentThread();

    // 1. 更新当前线程的读锁持有计数
    if (firstReader == current) {
        if (firstReaderHoldCount == 1)
            firstReader = null;
        else
            firstReaderHoldCount--;
    } else {
        HoldCounter rh = cachedHoldCounter;
        if (rh == null || rh.tid != current.getId())
            rh = readHolds.get();
        int count = rh.count;
        if (count <= 1) {
            readHolds.remove();
            if (count <= 0)
                throw unmatchedUnlockException();
        }
        --rh.count;
    }

    // 2. CAS 更新 state 的高 16 位
    for (;;) {
        int c = getState();
        int nextc = c - SHARED_UNIT;
        if (compareAndSetState(c, nextc))
            return nextc == 0;  // 返回锁是否完全释放
    }
}
```

**流程分析**：

1. **更新线程计数**：
   - 如果是第一个读线程，直接操作 `firstReaderHoldCount`
   - 否则从 `cachedHoldCounter` 或 ThreadLocal 获取计数器
   - 重入次数减 1，如果归 0 则移除 ThreadLocal

2. **更新全局计数**：
   - CAS 循环将 state 的高 16 位减 1
   - 如果 state 变为 0，说明所有锁都已释放，返回 `true`

3. **唤醒等待线程**：
   - 如果锁完全释放，调用 `doReleaseShared()` 唤醒等待的写线程

## 锁降级

**锁降级**是指持有写锁的线程在不释放写锁的情况下获取读锁，然后释放写锁，最终只持有读锁的过程。

### 为什么需要锁降级

锁降级的主要目的是**保证数据可见性**。如果在释放写锁之后再获取读锁，中间可能有其他线程获取写锁并修改数据，导致当前线程读取到的数据不一致。

### 锁降级示例

```java
public class CachedData {
    private Object data;
    private volatile boolean cacheValid;
    private final ReentrantReadWriteLock rwl = new ReentrantReadWriteLock();

    public void processData() {
        rwl.readLock().lock();
        if (!cacheValid) {
            // 必须先释放读锁
            rwl.readLock().unlock();
            // 获取写锁
            rwl.writeLock().lock();
            try {
                // 双重检查
                if (!cacheValid) {
                    data = loadData();
                    cacheValid = true;
                }
                // 锁降级：在持有写锁时获取读锁
                rwl.readLock().lock();
            } finally {
                rwl.writeLock().unlock();  // 释放写锁
            }
        }

        try {
            // 使用数据（此时只持有读锁）
            use(data);
        } finally {
            rwl.readLock().unlock();
        }
    }

    private Object loadData() {
        return new Object();
    }

    private void use(Object data) {
        // 使用数据
    }
}
```

### 锁降级流程

```text
1. 持有写锁
   state: 0x00000001 (写锁计数 = 1)
   Thread-1 持有写锁

2. 在持有写锁的同时获取读锁（锁降级）
   state: 0x00010001 (写锁计数 = 1, 读锁计数 = 1)
   Thread-1 同时持有写锁和读锁

3. 释放写锁
   state: 0x00010000 (写锁计数 = 0, 读锁计数 = 1)
   Thread-1 只持有读锁

4. 其他线程可以获取读锁，但不能获取写锁
   state: 0x00020000 (读锁计数 = 2)
   Thread-1 和 Thread-2 都持有读锁
```

### 为什么不支持锁升级

ReentrantReadWriteLock **不支持锁升级**（从读锁升级到写锁），原因如下：

1. **死锁风险**：
   ```text
   场景：Thread-1 和 Thread-2 都持有读锁，都想升级到写锁

   Thread-1: 持有读锁 → 尝试获取写锁 → 等待 Thread-2 释放读锁
   Thread-2: 持有读锁 → 尝试获取写锁 → 等待 Thread-1 释放读锁

   结果：死锁
   ```

2. **设计原则**：
   - 读锁是共享的，可能有多个线程持有
   - 写锁是独占的，需要等待所有读锁释放
   - 如果允许升级，会导致复杂的等待关系和潜在的死锁

**正确做法**：释放读锁，然后获取写锁

```java
rwl.readLock().unlock();  // 先释放读锁
rwl.writeLock().lock();   // 再获取写锁
try {
    // 修改数据
} finally {
    rwl.writeLock().unlock();
}
```

## 公平性实现

ReentrantReadWriteLock 支持公平锁和非公平锁两种模式。

### 公平锁与非公平锁

```java
// 默认构造器：非公平锁
public ReentrantReadWriteLock() {
    this(false);
}

// 指定公平性
public ReentrantReadWriteLock(boolean fair) {
    sync = fair ? new FairSync() : new NonfairSync();
    readerLock = new ReadLock(this);
    writerLock = new WriteLock(this);
}
```

### 公平性判断方法

**非公平锁**：

```java
// ReentrantReadWriteLock.NonfairSync
static final class NonfairSync extends Sync {
    final boolean writerShouldBlock() {
        return false;  // 写线程总是尝试抢锁
    }

    final boolean readerShouldBlock() {
        // 如果队列头是写线程，读线程需要阻塞（避免写线程饥饿）
        return apparentlyFirstQueuedIsExclusive();
    }
}
```

**公平锁**：

```java
// ReentrantReadWriteLock.FairSync
static final class FairSync extends Sync {
    final boolean writerShouldBlock() {
        return hasQueuedPredecessors();  // 检查队列中是否有等待线程
    }

    final boolean readerShouldBlock() {
        return hasQueuedPredecessors();  // 检查队列中是否有等待线程
    }
}
```

### 非公平锁的特殊设计

非公平锁中，`readerShouldBlock()` 调用 `apparentlyFirstQueuedIsExclusive()`，这是为了**防止写线程饥饿**：

```java
// AbstractQueuedSynchronizer
final boolean apparentlyFirstQueuedIsExclusive() {
    Node h, s;
    return (h = head) != null &&
           (s = h.next) != null &&
           !s.isShared() &&           // 下一个节点是独占模式（写线程）
           s.thread != null;
}
```

**设计原因**：
- 如果队列头部有写线程在等待，新来的读线程应该排队
- 否则连续到来的读线程会一直获取锁，写线程永远无法获取
- 这是在性能（非公平）和公平性（防止写线程饥饿）之间的折衷

### 公平性对比

| 特性 | 非公平锁 | 公平锁 |
|------|---------|--------|
| 写线程插队 | 允许直接竞争 | 必须排队 |
| 读线程插队 | 当队列头不是写线程时允许 | 必须排队 |
| 吞吐量 | 高 | 低 |
| 写线程饥饿风险 | 低（有防护机制） | 无 |
| 延迟 | 低 | 高 |
| 默认选择 | 是 | 需显式指定 |

## 总结

### 核心特性

1. **读写分离**：读锁共享，写锁独占
2. **状态拆分**：使用 state 的高 16 位和低 16 位分别记录读写锁计数
3. **可重入**：读锁和写锁都支持重入
4. **锁降级**：支持从写锁降级到读锁，但不支持从读锁升级到写锁
5. **公平性可选**：支持公平锁和非公平锁两种模式

### ReentrantReadWriteLock vs ReentrantLock

| 维度 | ReentrantReadWriteLock | ReentrantLock |
|------|----------------------|---------------|
| **锁类型** | 读写锁（读共享、写独占） | 互斥锁（独占） |
| **并发度** | 读操作可并发 | 所有操作串行 |
| **state 使用** | 高 16 位：读锁，低 16 位：写锁 | 整个 32 位：重入次数 |
| **实现复杂度** | 高（需管理读写分离） | 低 |
| **性能** | 读多写少场景性能更好 | 读写差不多或写多场景更好 |
| **锁降级** | 支持（写→读） | 不适用 |
| **锁升级** | 不支持（读→写） | 不适用 |
| **适用场景** | 读多写少、读操作耗时长 | 读写混合、操作简单快速 |

### 使用建议

**选择 ReentrantReadWriteLock 的场景**：
- ✅ 读操作远多于写操作（至少 10:1）
- ✅ 读操作耗时较长（ms 级别以上）
- ✅ 需要高并发读能力
- ✅ 数据一致性要求严格

**选择 ReentrantLock 的场景**：
- ✅ 读写操作比例接近或写操作较多
- ✅ 操作非常快（微秒级别）
- ✅ 需要更简单的实现和维护
- ✅ 需要与 Condition 配合使用（ReentrantReadWriteLock 只有写锁支持 Condition）

**性能考虑**：
- 读写锁的开销比互斥锁更大（需要维护两种锁状态、线程计数器等）
- 只有当读操作耗时足够长且读写比例足够高时，读写锁的优势才能体现
- 不要盲目使用读写锁，应根据实际场景进行性能测试

