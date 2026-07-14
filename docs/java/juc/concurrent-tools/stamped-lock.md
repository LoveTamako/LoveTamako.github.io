# StampedLock

`StampedLock` 是 Java 8 引入的一种改进的读写锁,提供了比 `ReentrantReadWriteLock` 更好的性能,特别是在读多写少的场景下。它的核心特性是**乐观读(Optimistic Read)**,允许读操作不阻塞写操作,从而显著提升并发性能。

## 为什么需要 StampedLock

`ReentrantReadWriteLock` 虽然允许多个读线程并发访问,但仍然存在一些限制:

1. **读锁会阻塞写线程**:即使是短时间的读操作,也会阻止写线程获取锁
2. **写锁饥饿问题**:在非公平模式下,连续的读操作可能让写线程长时间等待
3. **锁开销**:即使是读操作,也需要进行 CAS 操作来获取和释放锁

`StampedLock` 通过引入**乐观读**机制解决了这些问题:
- 读操作不需要加锁,只需验证数据是否被修改
- 写操作不会被读操作阻塞(乐观读模式下)
- 大幅减少了锁竞争,提升了性能

## 核心概念

### 戳记 (Stamp)

`StampedLock` 的所有锁操作都会返回一个 `long` 类型的**戳记(stamp)**,这个戳记代表了锁的状态:

```java
StampedLock lock = new StampedLock();

long stamp = lock.writeLock();  // 获取写锁,返回戳记
// ... 执行写操作
lock.unlockWrite(stamp);        // 使用戳记释放写锁
```

**戳记的作用**:
- 标识锁的状态和版本
- 释放锁时必须提供正确的戳记
- 用于验证数据是否被修改(乐观读)
- 支持锁的转换(如从悲观读转为写锁)

### 三种锁模式

`StampedLock` 支持三种锁模式:

| 模式 | 特点 | 使用场景 |
|------|------|----------|
| **写锁(Write Lock)** | 独占锁,排斥所有其他锁 | 修改共享数据 |
| **悲观读锁(Pessimistic Read)** | 共享锁,允许多个读线程,阻塞写线程 | 需要确保读取期间数据不变 |
| **乐观读(Optimistic Read)** | 不加锁,读取后验证数据是否被修改 | 读多写少,读操作非常快 |

**锁的兼容性**:

|  | 写锁 | 悲观读锁 | 乐观读 |
|---|-----|---------|-------|
| **写锁** | ❌ 互斥 | ❌ 互斥 | ❌ 互斥 |
| **悲观读锁** | ❌ 互斥 | ✅ 兼容 | ❌ 互斥 |
| **乐观读** | ❌ 互斥 | ❌ 互斥 | ✅ 兼容 |

:::warning 重要特性
- **不可重入**:StampedLock 不支持重入,同一线程重复获取锁会导致死锁
- **无条件变量**:不支持 Condition,无法使用 await/signal 机制
- **不支持中断**:某些方法(如 `writeLock()`)不响应中断,需要使用可中断版本(如 `writeLockInterruptibly()`)
:::

## 基本使用示例

### 写锁示例

写锁是独占锁,用于修改共享数据:

```java
public class Point {
    private double x, y;
    private final StampedLock lock = new StampedLock();

    public void move(double deltaX, double deltaY) {
        long stamp = lock.writeLock();  // 获取写锁
        try {
            x += deltaX;
            y += deltaY;
        } finally {
            lock.unlockWrite(stamp);     // 释放写锁
        }
    }
}
```

### 悲观读锁示例

悲观读锁是共享锁,用于读取数据时确保数据不被修改:

```java
public double distanceFromOrigin() {
    long stamp = lock.readLock();  // 获取悲观读锁
    try {
        return Math.sqrt(x * x + y * y);
    } finally {
        lock.unlockRead(stamp);     // 释放读锁
    }
}
```

### 乐观读示例

乐观读是 StampedLock 的核心特性,读取时不加锁,读取后验证数据是否被修改:

```java
public double distanceFromOriginOptimistic() {
    long stamp = lock.tryOptimisticRead();  // 尝试乐观读
    double currentX = x;
    double currentY = y;

    if (!lock.validate(stamp)) {  // 验证数据是否被修改
        // 数据被修改,升级为悲观读锁
        stamp = lock.readLock();
        try {
            currentX = x;
            currentY = y;
        } finally {
            lock.unlockRead(stamp);
        }
    }

    return Math.sqrt(currentX * currentX + currentY * currentY);
}
```

**乐观读的执行流程**:
1. 调用 `tryOptimisticRead()` 获取戳记(不加锁)
2. 读取共享变量到本地变量
3. 调用 `validate(stamp)` 验证数据是否被修改
4. 如果验证失败,升级为悲观读锁重新读取

## 乐观读模式详解

### 乐观读的工作原理

乐观读是 StampedLock 最重要的特性,它基于**版本验证**机制:

```java
// 内部实现简化版
public long tryOptimisticRead() {
    long s = state;
    // 如果没有写锁,返回当前状态(版本号)
    return (s & WBIT) == 0L ? s : 0L;
}

public boolean validate(long stamp) {
    // 验证版本号是否与当前状态一致
    return (stamp & SBITS) == (state & SBITS);
}
```

**核心机制**:
- `tryOptimisticRead()` 返回当前锁的状态版本
- 读取数据期间不持有任何锁
- `validate()` 检查版本号是否改变
- 如果版本号未变,说明期间没有写操作,读取的数据是有效的

### 乐观读的性能优势

**与悲观读锁的对比**:

```java
// 场景:10个读线程并发读取

// 悲观读锁
public void pessimisticRead() {
    long stamp = lock.readLock();  // CAS 操作获取读锁
    try {
        // 读取数据
    } finally {
        lock.unlockRead(stamp);     // CAS 操作释放读锁
    }
}
// 性能:每次读取需要2次CAS操作(加锁+解锁)

// 乐观读
public void optimisticRead() {
    long stamp = lock.tryOptimisticRead();  // 仅读取state
    // 读取数据
    if (!lock.validate(stamp)) {            // 仅读取state比较
        // 升级为悲观读(罕见情况)
    }
}
// 性能:常见情况下只需要2次内存读取,无CAS竞争
```

**性能提升原因**:
1. **无锁开销**:不需要 CAS 操作,避免了缓存行竞争
2. **无阻塞**:读线程之间完全不阻塞
3. **写操作不被阻塞**:写线程不需要等待乐观读完成

### 何时使用乐观读

**适用场景**:
- ✅ 读操作远多于写操作(比例 > 100:1)
- ✅ 读操作非常快速(微秒级)
- ✅ 共享变量数量少(1-3个)
- ✅ 可以接受偶尔重试

**不适用场景**:
- ❌ 读操作耗时长(如涉及 I/O 操作)
- ❌ 写操作频繁(导致频繁验证失败)
- ❌ 需要读取大量变量(复制成本高)
- ❌ 必须保证强一致性(无法接受重试)

### 乐观读的常见陷阱

**陷阱1:忘记验证**

```java
// ❌ 错误:忘记验证
public double getX() {
    long stamp = lock.tryOptimisticRead();
    return x;  // 可能读到不一致的数据
}

// ✅ 正确:必须验证
public double getX() {
    long stamp = lock.tryOptimisticRead();
    double currentX = x;
    if (!lock.validate(stamp)) {
        stamp = lock.readLock();
        try {
            currentX = x;
        } finally {
            lock.unlockRead(stamp);
        }
    }
    return currentX;
}
```

**陷阱2:在验证前执行耗时操作**

```java
// ❌ 错误:复制后执行耗时计算再验证
public Result compute() {
    long stamp = lock.tryOptimisticRead();
    Data data = copyData();
    Result result = expensiveComputation(data);  // 耗时操作
    if (!lock.validate(stamp)) {  // 此时验证已无意义
        // ...
    }
    return result;
}

// ✅ 正确:先验证,再执行耗时操作
public Result compute() {
    long stamp = lock.tryOptimisticRead();
    Data data = copyData();
    if (!lock.validate(stamp)) {  // 立即验证
        stamp = lock.readLock();
        try {
            data = copyData();
        } finally {
            lock.unlockRead(stamp);
        }
    }
    return expensiveComputation(data);  // 验证通过后再计算
}
```

**陷阱3:未处理 stamp == 0 的情况**

```java
// ❌ 可能有问题:未检查 stamp 是否为 0
public double getDistance() {
    long stamp = lock.tryOptimisticRead();  // 如果有写锁,返回0
    double dx = x;
    double dy = y;
    if (!lock.validate(stamp)) {  // stamp为0时,validate也会返回false
        // 升级为悲观读
    }
    return Math.sqrt(dx * dx + dy * dy);
}

// ✅ 更清晰的写法
public double getDistance() {
    long stamp = lock.tryOptimisticRead();
    if (stamp == 0) {  // 明确检查
        stamp = lock.readLock();
        try {
            return Math.sqrt(x * x + y * y);
        } finally {
            lock.unlockRead(stamp);
        }
    }
    // 乐观读逻辑
    // ...
}
```

## 锁转换机制

StampedLock 支持在不释放锁的情况下进行**锁模式转换**,这是一个非常实用的特性。

### 三种转换方法

StampedLock 提供了三个转换方法:

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `tryConvertToWriteLock(long stamp)` | 尝试将读锁或乐观读转换为写锁 | 成功返回新stamp,失败返回0 |
| `tryConvertToReadLock(long stamp)` | 尝试将写锁转换为读锁(锁降级) | 成功返回新stamp,失败返回0 |
| `tryConvertToOptimisticRead(long stamp)` | 尝试将读锁或写锁转换为乐观读 | 成功返回新stamp,失败返回0 |

### 转换示例

**示例1:读锁升级为写锁**

```java
public void moveIfAtOrigin(double newX, double newY) {
    long stamp = lock.readLock();  // 先获取读锁
    try {
        // 检查条件
        while (x == 0.0 && y == 0.0) {
            // 尝试将读锁转换为写锁
            long writeStamp = lock.tryConvertToWriteLock(stamp);
            if (writeStamp != 0L) {
                // 转换成功
                stamp = writeStamp;
                x = newX;
                y = newY;
                break;
            } else {
                // 转换失败,释放读锁,重新获取写锁
                lock.unlockRead(stamp);
                stamp = lock.writeLock();
            }
        }
    } finally {
        lock.unlock(stamp);  // 统一释放
    }
}
```

**示例2:写锁降级为读锁**

```java
public Data processData() {
    long stamp = lock.writeLock();
    try {
        // 修改数据
        updateInternalState();

        // 降级为读锁
        stamp = lock.tryConvertToReadLock(stamp);

        // 此时其他线程可以并发读取
        return computeResult();
    } finally {
        lock.unlock(stamp);
    }
}
```

**示例3:悲观读转换为乐观读**

```java
public String getData() {
    long stamp = lock.readLock();
    try {
        // 读取数据
        String data = this.data;

        // 转换为乐观读,释放读锁
        stamp = lock.tryConvertToOptimisticRead(stamp);

        // 此时不持有锁,可以进行耗时操作
        return processData(data);
    } finally {
        if (StampedLock.isReadLockStamp(stamp) ||
            StampedLock.isWriteLockStamp(stamp)) {
            lock.unlock(stamp);
        }
    }
}
```

### 转换的优势

**避免死锁**:
- 传统方式:先释放读锁,再获取写锁 → 可能导致死锁
- 转换方式:原子性地完成转换 → 避免死锁

**性能更好**:
- 转换成功时,无需释放和重新获取锁
- 减少了锁竞争和上下文切换

**使用建议**:
- ✅ 当需要根据读取结果决定是否写入时,使用读→写转换
- ✅ 当写入后需要读取结果时,使用写→读转换(锁降级)
- ✅ 当持有读锁但需要执行耗时操作时,使用读→乐观读转换
- ⚠️ 转换可能失败(返回0),必须处理失败情况

## 实现原理

### 状态表示

StampedLock 使用一个 `long` 类型的 `state` 字段来表示锁的状态:

```java
// StampedLock 核心字段
private transient volatile long state;

// 关键常量
private static final int LG_READERS = 7;
private static final long RUNIT = 1L;              // 读锁计数单位
private static final long WBIT  = 1L << LG_READERS; // 写锁标志位(第8位)
private static final long RBITS = WBIT - 1L;        // 读锁位掩码(低7位)
private static final long RFULL = RBITS - 1L;       // 最大读锁数(126)
private static final long ABITS = RBITS | WBIT;     // 所有锁位掩码
private static final long SBITS = ~RBITS;           // 戳记位掩码(高57位)
```

**状态结构**（64位）:

```text
|--- 56位:序列号(版本号) ---|1位:写锁|--- 7位:读锁计数 ---|
|        高位部分            |  第8位 |      低7位        |
```

**示例**:

```text
无锁状态:
0000...0000 | 0 | 0000000
            写锁  读锁计数=0

持有写锁:
0000...0001 | 1 | 0000000
序列号+1     写锁  读锁计数=0

持有3个读锁:
0000...0000 | 0 | 0000011
            无写锁 读锁计数=3
```

### 戳记的组成

戳记(stamp)由**序列号**和**锁状态**组成:

```java
// 获取写锁时返回的戳记
long stamp = state;  // 包含序列号 + 写锁位 + 读锁计数

// 验证戳记
public boolean validate(long stamp) {
    // 只比较序列号部分,忽略低8位的锁状态
    return (stamp & SBITS) == (state & SBITS);
}
```

**为什么需要序列号**:
- 序列号在每次写锁释放时递增
- 用于检测是否发生过写操作
- 乐观读通过比较序列号判断数据是否被修改

### 核心操作简化实现

**写锁获取**:

```java
public long writeLock() {
    long s, next;
    // 如果无锁(state & ABITS == 0),CAS设置写锁位
    return ((((s = state) & ABITS) == 0L &&
             U.compareAndSwapLong(this, STATE, s, next = s + WBIT)) ?
            next : acquireWrite(false, 0L));
}
```

**写锁释放**:

```java
public void unlockWrite(long stamp) {
    if (state != stamp || (stamp & WBIT) == 0L)
        throw new IllegalMonitorStateException();
    // 释放写锁:序列号+1,清除写锁位
    state = (stamp += WBIT) == 0L ? ORIGIN : stamp;
}
```

**乐观读**:

```java
public long tryOptimisticRead() {
    long s;
    // 如果无写锁,返回当前state(包含序列号)
    return (((s = state) & WBIT) == 0L) ? (s & SBITS) : 0L;
}

public boolean validate(long stamp) {
    U.loadFence();  // 内存屏障,确保可见性
    // 比较序列号部分是否相同
    return (stamp & SBITS) == (state & SBITS);
}
```

### 关键设计

**1. 读锁计数限制**:
- 只使用7位存储读锁计数,最多126个读锁
- 超过126个读锁时会溢出到一个额外的计数器 `readerOverflow`

**2. 序列号递增**:
- 写锁释放时,序列号自动+1（`state += WBIT`）
- 确保乐观读可以检测到写操作

**3. 内存可见性**:
- `state` 是 `volatile` 变量
- `validate()` 使用内存屏障确保读取最新值

## StampedLock vs ReentrantReadWriteLock

### 功能对比

| 特性 | StampedLock | ReentrantReadWriteLock |
|------|-------------|------------------------|
| **乐观读** | ✅ 支持,核心特性 | ❌ 不支持 |
| **读写锁** | ✅ 支持 | ✅ 支持 |
| **可重入** | ❌ 不支持 | ✅ 支持 |
| **条件变量** | ❌ 不支持 | ✅ 支持(写锁) |
| **公平性** | ❌ 只支持非公平 | ✅ 支持公平/非公平 |
| **锁转换** | ✅ 支持 | ✅ 支持(仅锁降级) |
| **中断响应** | 部分方法支持 | ✅ 完全支持 |
| **基于** | CLH 队列 | AQS |
| **引入版本** | Java 8 | Java 5 |

### 性能对比

**读多写少场景**（读写比 100:1）:

| 操作类型 | ReentrantReadWriteLock | StampedLock(悲观读) | StampedLock(乐观读) |
|---------|----------------------|-------------------|-------------------|
| **读操作** | 需要 CAS 获取/释放锁 | 需要 CAS 获取/释放锁 | 无锁,仅内存读取 |
| **写操作** | CAS + 可能阻塞 | CAS + 可能阻塞 | CAS + 可能阻塞 |
| **相对性能** | 基准 1x | 类似 1x | **2-3x** ⚡ |

**写操作频繁场景**（读写比 10:1）:

| 操作类型 | ReentrantReadWriteLock | StampedLock(乐观读) |
|---------|----------------------|-------------------|
| **读操作** | 稳定的锁保护 | 频繁验证失败,性能下降 |
| **推荐** | ✅ 更稳定 | ⚠️ 性能可能更差 |

### 使用场景选择

**选择 StampedLock**:
- ✅ 读操作占绝对优势（> 90%）
- ✅ 读操作非常快速（微秒级）
- ✅ 不需要可重入特性
- ✅ 不需要条件变量
- ✅ 追求极致性能

**选择 ReentrantReadWriteLock**:
- ✅ 需要可重入特性
- ✅ 需要条件变量（await/signal）
- ✅ 需要公平性保证
- ✅ 写操作较频繁（> 10%）
- ✅ 代码复杂度要求低
- ✅ 需要完整的中断支持

**示例对比**:

```java
// ReentrantReadWriteLock - 适合需要可重入的场景
public class Cache {
    private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();

    public void recursiveRead() {
        lock.readLock().lock();
        try {
            // 可以再次获取读锁(可重入)
            anotherRead();
        } finally {
            lock.readLock().unlock();
        }
    }

    public void anotherRead() {
        lock.readLock().lock();  // ✅ 可重入
        try {
            // ...
        } finally {
            lock.readLock().unlock();
        }
    }
}

// StampedLock - 适合高性能读多写少场景
public class Point {
    private final StampedLock lock = new StampedLock();
    private double x, y;

    public double distanceFromOrigin() {
        long stamp = lock.tryOptimisticRead();  // ⚡ 乐观读,极高性能
        double currentX = x;
        double currentY = y;
        if (!lock.validate(stamp)) {
            stamp = lock.readLock();
            try {
                currentX = x;
                currentY = y;
            } finally {
                lock.unlockRead(stamp);
            }
        }
        return Math.sqrt(currentX * currentX + currentY * currentY);
    }
}
```

## 使用建议与最佳实践

### 正确使用模式

**1. 始终在 finally 块中释放锁**

```java
// ✅ 正确
public void write() {
    long stamp = lock.writeLock();
    try {
        // 写操作
    } finally {
        lock.unlockWrite(stamp);
    }
}

// ❌ 错误:未使用 finally
public void write() {
    long stamp = lock.writeLock();
    // 如果这里抛出异常,锁永远不会释放
    lock.unlockWrite(stamp);
}
```

**2. 使用统一的 unlock() 方法**

```java
// ✅ 推荐:使用统一的 unlock()
public void operation(boolean write) {
    long stamp = write ? lock.writeLock() : lock.readLock();
    try {
        // 操作
    } finally {
        lock.unlock(stamp);  // 自动识别锁类型
    }
}

// ⚠️ 也可以:使用特定的 unlock 方法
public void operation(boolean write) {
    long stamp = write ? lock.writeLock() : lock.readLock();
    try {
        // 操作
    } finally {
        if (write) {
            lock.unlockWrite(stamp);
        } else {
            lock.unlockRead(stamp);
        }
    }
}
```

**3. 检查转换结果**

```java
// ✅ 正确:检查转换是否成功
long ws = lock.tryConvertToWriteLock(stamp);
if (ws != 0L) {
    stamp = ws;
    // 使用写锁
} else {
    // 转换失败,处理降级路径
    lock.unlock(stamp);
    stamp = lock.writeLock();
}

// ❌ 错误:未检查转换结果
stamp = lock.tryConvertToWriteLock(stamp);  // 可能返回0
// 直接使用 stamp 可能导致问题
```

### 常见错误

**错误1:在乐观读中修改数据**

```java
// ❌ 严重错误:乐观读期间修改数据
public void badOptimisticRead() {
    long stamp = lock.tryOptimisticRead();
    x = 10;  // 错误!乐观读不持有锁,不能修改数据
    if (!lock.validate(stamp)) {
        // ...
    }
}
```

**错误2:尝试重入**

```java
// ❌ 错误:StampedLock 不支持重入
public void outer() {
    long stamp = lock.readLock();
    try {
        inner();  // 死锁!
    } finally {
        lock.unlockRead(stamp);
    }
}

public void inner() {
    long stamp = lock.readLock();  // 尝试再次获取锁,死锁
    try {
        // ...
    } finally {
        lock.unlockRead(stamp);
    }
}
```

**错误3:长时间持有锁**

```java
// ❌ 错误:在持有写锁期间执行 I/O
public void badWrite() {
    long stamp = lock.writeLock();
    try {
        updateData();
        saveToDatabase();  // I/O 操作,持有锁时间过长
    } finally {
        lock.unlockWrite(stamp);
    }
}

// ✅ 正确:缩小锁的范围
public void goodWrite() {
    Data data = prepareData();

    long stamp = lock.writeLock();
    try {
        updateData(data);  // 仅在锁内更新内存数据
    } finally {
        lock.unlockWrite(stamp);
    }

    saveToDatabase(data);  // I/O 操作在锁外执行
}
```

### 性能优化建议

**1. 优先使用乐观读**

```java
// 对于读多写少场景,优先使用乐观读
public Data read() {
    long stamp = lock.tryOptimisticRead();
    Data data = copyData();
    if (!lock.validate(stamp)) {
        stamp = lock.readLock();
        try {
            data = copyData();
        } finally {
            lock.unlockRead(stamp);
        }
    }
    return data;
}
```

**2. 避免在锁内执行耗时操作**

```java
// ✅ 好的做法:在锁外进行计算
public Result compute() {
    long stamp = lock.tryOptimisticRead();
    Data data = copyData();
    if (!lock.validate(stamp)) {
        stamp = lock.readLock();
        try {
            data = copyData();
        } finally {
            lock.unlockRead(stamp);
        }
    }
    return expensiveComputation(data);  // 锁外计算
}
```

**3. 使用锁降级减少写锁持有时间**

```java
public Data update() {
    long stamp = lock.writeLock();
    try {
        updateState();  // 写操作

        // 降级为读锁
        stamp = lock.tryConvertToReadLock(stamp);

        return computeResult();  // 读操作,允许并发
    } finally {
        lock.unlock(stamp);
    }
}
```

## 总结

### 核心特性

1. **乐观读**:StampedLock 的最大特性,通过版本验证实现无锁读取
2. **三种模式**:写锁(独占)、悲观读锁(共享)、乐观读(无锁)
3. **锁转换**:支持在不同锁模式之间转换,避免死锁
4. **高性能**:在读多写少场景下性能优于 ReentrantReadWriteLock

### 关键限制

1. **不可重入**:同一线程不能重复获取锁
2. **无条件变量**:不支持 Condition 的 await/signal
3. **非公平**:不支持公平锁模式
4. **使用复杂**:相比 ReentrantReadWriteLock 代码更复杂

### 适用场景

**最适合**:
- 读操作占比 > 90%
- 读操作非常快速(微秒级)
- 共享数据结构简单(少量字段)
- 追求极致性能

**不适合**:
- 需要可重入
- 需要条件变量
- 写操作频繁(> 10%)
- 对代码复杂度敏感

### 与 ReentrantReadWriteLock 的选择

| 场景 | 推荐 |
|------|------|
| 读多写少(>100:1),追求性能 | StampedLock |
| 需要可重入 | ReentrantReadWriteLock |
| 需要条件变量 | ReentrantReadWriteLock |
| 写操作较多(>10%) | ReentrantReadWriteLock |
| 代码简洁性优先 | ReentrantReadWriteLock |
| 需要公平性 | ReentrantReadWriteLock |

:::tip 使用建议
StampedLock 是一个强大但复杂的工具。在决定使用前,应该:
1. 通过性能测试验证是否真的需要它
2. 确保团队成员理解其使用方式和限制
3. 优先在性能瓶颈处使用,而不是盲目替换所有锁
4. 考虑使用更高层的并发工具(如 ConcurrentHashMap)是否能满足需求
:::
