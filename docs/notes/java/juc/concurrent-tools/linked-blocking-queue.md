# LinkedBlockingQueue

## 入队出队原理

LinkedBlockingQueue 是一个基于**链表**实现的**有界阻塞队列**，采用**双锁机制**（putLock 和 takeLock）实现入队和出队的并发操作。

### 基本结构

LinkedBlockingQueue 的核心组件：

```java
public class LinkedBlockingQueue<E> extends AbstractQueue<E>
        implements BlockingQueue<E> {

    // 队列容量，默认为 Integer.MAX_VALUE
    private final int capacity;

    // 当前队列中的元素个数（使用 AtomicInteger 保证原子性）
    private final AtomicInteger count = new AtomicInteger();

    // 头节点（哨兵节点，不存储数据）
    transient Node<E> head;

    // 尾节点
    private transient Node<E> last;

    // 出队锁（take、poll 等操作使用）
    private final ReentrantLock takeLock = new ReentrantLock();

    // 非空条件：队列不为空时，等待的 take 线程被唤醒
    private final Condition notEmpty = takeLock.newCondition();

    // 入队锁（put、offer 等操作使用）
    private final ReentrantLock putLock = new ReentrantLock();

    // 非满条件：队列未满时，等待的 put 线程被唤醒
    private final Condition notFull = putLock.newCondition();

    // 链表节点
    static class Node<E> {
        E item;           // 节点存储的元素
        Node<E> next;     // 指向下一个节点

        Node(E x) { item = x; }
    }
}
```

**关键特点：**
- **双锁分离**：putLock 控制入队，takeLock 控制出队，允许入队和出队并发进行
- **有界队列**：可以指定容量上限，防止内存溢出
- **FIFO 顺序**：先进先出，保证元素的顺序性
- **阻塞操作**：队列满时入队阻塞，队列空时出队阻塞

### 入队操作

入队操作使用 **putLock** 保证线程安全，当队列满时会阻塞等待。

```java
public void put(E e) throws InterruptedException {
    // 不允许 null 元素
    if (e == null) throw new NullPointerException();
    int c = -1;
    // 创建新节点
    Node<E> node = new Node<E>(e);
    final ReentrantLock putLock = this.putLock;
    final AtomicInteger count = this.count;

    // 获取入队锁（可中断）
    putLock.lockInterruptibly();
    try {
        // 队列已满，等待 notFull 条件（释放锁，进入等待状态）
        while (count.get() == capacity) {
            notFull.await();
        }

        // 入队：将新节点添加到链表尾部
        enqueue(node);

        // 元素个数加 1，返回加之前的值
        c = count.getAndIncrement();

        // 如果入队后队列仍未满，唤醒一个等待的 put 线程
        if (c + 1 < capacity)
            notFull.signal();
    } finally {
        // 释放入队锁
        putLock.unlock();
    }

    // 如果入队前队列为空（c == 0），唤醒等待的 take 线程
    if (c == 0)
        signalNotEmpty();
}

// 入队核心方法：将节点添加到链表尾部
private void enqueue(Node<E> node) {
    // last.next = node; last = node;
    last = last.next = node;
}

// 唤醒等待的 take 线程
private void signalNotEmpty() {
    final ReentrantLock takeLock = this.takeLock;
    takeLock.lock();  // 需要获取 takeLock 才能操作 notEmpty 条件
    try {
        notEmpty.signal();  // 唤醒一个等待 notEmpty 条件的线程
    } finally {
        takeLock.unlock();
    }
}
```

**入队流程：**
1. 获取 putLock 锁
2. 检查队列是否已满，满则等待 notFull 条件
3. 将新节点添加到链表尾部
4. 更新 count 计数
5. 如果队列未满，唤醒其他等待入队的线程
6. 如果入队前队列为空，唤醒等待出队的线程

### 出队操作

出队操作使用 **takeLock** 保证线程安全，当队列为空时会阻塞等待。

```java
public E take() throws InterruptedException {
    E x;
    int c = -1;
    final AtomicInteger count = this.count;
    final ReentrantLock takeLock = this.takeLock;

    // 获取出队锁（可中断）
    takeLock.lockInterruptibly();
    try {
        // 队列为空，等待 notEmpty 条件（释放锁，进入等待状态）
        while (count.get() == 0) {
            notEmpty.await();
        }

        // 出队：从链表头部移除节点
        x = dequeue();

        // 元素个数减 1，返回减之前的值
        c = count.getAndDecrement();

        // 如果出队后队列仍不为空，唤醒一个等待的 take 线程
        if (c > 1)
            notEmpty.signal();
    } finally {
        // 释放出队锁
        takeLock.unlock();
    }

    // 如果出队前队列已满（c == capacity），唤醒等待的 put 线程
    if (c == capacity)
        signalNotFull();

    return x;
}

// 出队核心方法：从链表头部移除节点
private E dequeue() {
    // head 是哨兵节点，实际数据从 head.next 开始
    Node<E> h = head;
    Node<E> first = h.next;
    h.next = h;  // 帮助 GC
    head = first;  // 新的头节点
    E x = first.item;
    first.item = null;  // 清空新头节点的数据（变成哨兵节点）
    return x;
}

// 唤醒等待的 put 线程
private void signalNotFull() {
    final ReentrantLock putLock = this.putLock;
    putLock.lock();  // 需要获取 putLock 才能操作 notFull 条件
    try {
        notFull.signal();  // 唤醒一个等待 notFull 条件的线程
    } finally {
        putLock.unlock();
    }
}
```

**出队流程：**
1. 获取 takeLock 锁
2. 检查队列是否为空，空则等待 notEmpty 条件
3. 从链表头部移除节点（head.next）
4. 更新 count 计数
5. 如果队列不为空，唤醒其他等待出队的线程
6. 如果出队前队列已满，唤醒等待入队的线程

### 核心设计特点

LinkedBlockingQueue 采用**双锁机制**（putLock 和 takeLock）实现入队和出队的并发操作：

- **入队和出队可以并发执行**：两把锁相互独立，生产者和消费者可以同时操作队列
- **使用 AtomicInteger 维护 count**：保证在双锁机制下计数的准确性
- **哨兵节点设计**：head 是不存储数据的哨兵节点，简化边界条件处理

关于双锁机制的详细设计原理和优势,请参见下方的"加锁分析"章节。

## 加锁分析

### 为什么使用两把锁？

**单锁的问题：**

如果只使用一把锁，入队和出队操作会互斥，导致并发性能低下：

```java
// 单锁实现（伪代码）
ReentrantLock lock = new ReentrantLock();

void put(E e) {
    lock.lock();
    try {
        // 入队操作
        last.next = new Node(e);
        last = last.next;
    } finally {
        lock.unlock();
    }
}

E take() {
    lock.lock();
    try {
        // 出队操作
        Node first = head.next;
        head = first;
        return first.item;
    } finally {
        lock.unlock();
    }
}
```

**单锁的缺陷：** 即使入队和出队操作的是队列的不同部分（尾部和头部），也必须互斥执行。

**双锁的优势：**

LinkedBlockingQueue 使用 **putLock** 和 **takeLock** 分离入队和出队的锁：

```
入队线程 1 ──→ [putLock] ──→ 操作 last (尾部)
入队线程 2 ──→ [putLock] ──→ 等待
                                    ↓ 可以并发
出队线程 1 ──→ [takeLock] ──→ 操作 head (头部)
出队线程 2 ──→ [takeLock] ──→ 等待
```

**关键点：**
- 入队操作只修改 `last` 指针（尾部）
- 出队操作只修改 `head` 指针（头部）
- 两个操作不会冲突，可以并发执行

### 哨兵节点（Dummy Node）的作用

LinkedBlockingQueue 使用 **哨兵节点**（dummy node）作为 head，简化了边界条件的处理。

**初始状态：**

```
构造器中创建一个空节点作为哨兵：
head ──→ [dummy] ──→ null
  ↓
last
```

**入队第一个元素：**

```java
// 入队：e1
enqueue(new Node(e1));

// 结果：
head ──→ [dummy] ──→ [e1] ──→ null
                       ↓
                     last
```

**出队第一个元素：**

```java
// 出队核心逻辑
private E dequeue() {
    Node<E> h = head;          // h = dummy
    Node<E> first = h.next;    // first = e1 节点
    h.next = h;                // 帮助 GC，断开 dummy 的 next 引用
    head = first;              // e1 节点成为新的哨兵
    E x = first.item;          // 取出数据
    first.item = null;         // 清空新哨兵的数据
    return x;
}

// 结果：
旧 dummy ──→ 自己 (帮助GC)
head ──→ [null] ──→ null  (e1节点变成新哨兵)
  ↓
last
```

**哨兵节点的优势：**

1. **简化空队列判断**
   - 不需要特殊处理 `head == null` 的情况
   - 队列为空时：`head.next == null`
   - 队列非空时：`head.next != null`

2. **简化入队操作**
   - 不需要判断是否是第一个元素
   - 始终执行：`last.next = newNode; last = newNode;`

3. **简化出队操作**
   - 不需要判断是否是最后一个元素
   - 始终将 `head.next` 提升为新的 head

4. **避免 head 和 last 同时指向同一节点**
   - 减少了双锁机制下的并发冲突

### 双锁机制的并发挑战

虽然双锁提升了并发性，但也带来了新的挑战：

#### 1. count 的原子性问题

**问题：** put 和 take 都需要修改 count，但它们使用不同的锁。

**解决方案：** 使用 `AtomicInteger` 保证 count 的原子性操作。

```java
private final AtomicInteger count = new AtomicInteger();

// put 中：
c = count.getAndIncrement();  // 原子递增

// take 中：
c = count.getAndDecrement();  // 原子递减
```

#### 2. 跨锁唤醒问题

**问题：** put 操作需要唤醒等待 notEmpty 条件的 take 线程，但 notEmpty 条件变量绑定的是 takeLock。

**解决方案：** 跨锁获取对方的锁来唤醒等待线程（具体实现见上一节的 `signalNotEmpty()` 和 `signalNotFull()` 方法）。

**为什么需要跨锁？**
- Condition 必须与对应的 Lock 配对使用
- notEmpty 是 `takeLock.newCondition()` 创建的，只能在持有 takeLock 时操作
- notFull 是 `putLock.newCondition()` 创建的，只能在持有 putLock 时操作

#### 3. 何时唤醒对方？

**优化策略：** 不是每次操作都跨锁唤醒，而是在关键时刻：

```java
// put 操作
if (c == 0)  // 入队前队列为空，肯定有 take 线程在等待
    signalNotEmpty();

// take 操作
if (c == capacity)  // 出队前队列已满，肯定有 put 线程在等待
    signalNotFull();
```

这样减少了不必要的跨锁操作，提升性能。

## put 方法详解

`put()` 方法用于向队列添加元素，如果队列已满则阻塞等待，直到有空间可用。

### 源码分析

```java
public void put(E e) throws InterruptedException {
    // 1. 不允许 null 元素
    if (e == null) throw new NullPointerException();

    int c = -1;
    // 2. 创建新节点
    Node<E> node = new Node<E>(e);
    final ReentrantLock putLock = this.putLock;
    final AtomicInteger count = this.count;

    // 3. 获取入队锁（可中断）
    putLock.lockInterruptibly();
    try {
        // 4. 队列已满，等待 notFull 条件
        while (count.get() == capacity) {
            notFull.await();  // 释放 putLock，进入等待状态
        }

        // 5. 入队：将新节点添加到链表尾部
        enqueue(node);

        // 6. 元素个数加 1，返回加之前的值
        c = count.getAndIncrement();

        // 7. 如果入队后队列仍未满，唤醒一个等待的 put 线程
        if (c + 1 < capacity)
            notFull.signal();
    } finally {
        // 8. 释放入队锁
        putLock.unlock();
    }

    // 9. 如果入队前队列为空，唤醒等待的 take 线程
    if (c == 0)
        signalNotEmpty();
}
```

### 关键点分析

#### 1. 为什么使用 lockInterruptibly()？

```java
putLock.lockInterruptibly();  // 而不是 lock()
```

**原因：** 支持线程中断，避免线程永久阻塞。

- 如果使用 `lock()`，线程在等待锁时不响应中断
- 使用 `lockInterruptibly()` 后，其他线程可以通过 `interrupt()` 中断正在等待的线程
- 这在需要取消任务或优雅关闭时非常重要

#### 2. 为什么在锁外创建节点？

```java
Node<E> node = new Node<E>(e);  // 在获取锁之前
putLock.lockInterruptibly();
```

**原因：** 减少锁持有时间，提升并发性能。

- 创建节点是一个纯内存操作，不涉及共享状态
- 在锁外完成可以减少临界区的长度
- 其他线程可以更快地获取锁

#### 3. 为什么使用 while 而不是 if？

```java
while (count.get() == capacity) {  // 而不是 if
    notFull.await();
}
```

**原因：** 防止**虚假唤醒**（spurious wakeup）。

- Condition.await() 可能会在没有 signal 的情况下被唤醒
- 使用 while 循环可以重新检查条件，确保条件真正满足
- 这是使用条件变量的标准模式

**示例场景：**

```
1. 线程 A：队列满（capacity=10, count=10），await() 等待
2. 线程 B：队列满（capacity=10, count=10），await() 等待
3. 线程 C：take() 出队一个元素，count=9，signal() 唤醒线程 A
4. 线程 A：被唤醒，入队成功，count=10
5. 线程 B：也被唤醒（虚假唤醒或其他原因）
6. 如果用 if：线程 B 直接入队，导致 count=11，超出容量！
7. 如果用 while：线程 B 重新检查 count==capacity，继续等待 ✓
```

#### 4. c 变量的作用

```java
c = count.getAndIncrement();  // 返回加之前的值

if (c + 1 < capacity)  // 使用 c+1（加之后的值）
    notFull.signal();

if (c == 0)  // 使用 c（加之前的值）
    signalNotEmpty();
```

**关键点：**

- `c` 保存的是 **count 加 1 之前的值**
- `c + 1` 表示加 1 之后的值（当前队列大小）
- `c == 0` 表示入队前队列为空

#### 5. 唤醒机制的优化

**在锁内唤醒 put 线程：**

```java
if (c + 1 < capacity)
    notFull.signal();  // 在 putLock 保护下直接唤醒
```

- 条件：入队后队列仍未满（`c+1 < capacity`）
- 目的：唤醒其他等待入队的线程
- 优化：在持有 putLock 时直接 signal，无需跨锁

**跨锁唤醒 take 线程：**

```java
if (c == 0)
    signalNotEmpty();  // 需要获取 takeLock
```

- 条件：入队前队列为空（`c == 0`）
- 目的：唤醒等待出队的线程
- 代价：需要额外获取 takeLock（跨锁操作）

**为什么是 c == 0 而不是 c + 1 == 1？**

两者等价，但 `c == 0` 语义更清晰：
- `c == 0` 表示"入队前为空"，说明肯定有 take 线程在等待
- 只在这种情况下才需要跨锁唤醒，减少不必要的开销

### 执行流程图

```
线程调用 put(e)
    ↓
检查 e != null
    ↓
创建 Node(e)  ← 在锁外完成
    ↓
获取 putLock.lockInterruptibly()
    ↓
┌─→ 检查 count == capacity?
│       ↓ 是
│   notFull.await()  ← 释放锁，等待
│       ↓ 被唤醒
└───────┘
    ↓ 否
enqueue(node)  ← 添加到链表尾部
    ↓
c = count.getAndIncrement()  ← 原子递增
    ↓
c+1 < capacity?
    ↓ 是
notFull.signal()  ← 唤醒其他 put 线程
    ↓
释放 putLock
    ↓
c == 0?  ← 入队前为空？
    ↓ 是
signalNotEmpty()  ← 跨锁唤醒 take 线程
    ↓
返回
```

### 重要场景分析

#### 场景 1：队列从空到非空

```
初始状态：capacity=3, count=0, 队列为空
有 2 个 take 线程在 notEmpty.await() 等待

线程 P1 执行 put(e1)：
1. 获取 putLock
2. count=0 < capacity=3，无需等待
3. enqueue(e1)
4. c = count.getAndIncrement() → c=0, count=1
5. c+1=1 < capacity=3 → notFull.signal()（实际没有等待的 put 线程）
6. 释放 putLock
7. c==0 → signalNotEmpty()  ← 关键：唤醒一个 take 线程
```

**关键点：** `c==0` 触发跨锁唤醒，通知等待的消费者队列已有数据。

#### 场景 2：队列从满到非满（由 take 触发）

```
初始状态：capacity=3, count=3, 队列已满
有 2 个 put 线程在 notFull.await() 等待

线程 T1 执行 take()：
1. 获取 takeLock
2. count=3 > 0，无需等待
3. dequeue()
4. c = count.getAndDecrement() → c=3, count=2
5. c=3 > 1 → notEmpty.signal()（唤醒其他 take 线程）
6. 释放 takeLock
7. c==capacity → signalNotFull()  ← 关键：唤醒一个 put 线程
```

**关键点：** take 操作在 `c==capacity` 时会唤醒等待的生产者。

#### 场景 3：多个 put 线程级联唤醒

```
初始状态：capacity=3, count=2
有 3 个 put 线程 P1、P2、P3 在 notFull.await() 等待

线程 T1 执行 take()：
1. c = count.getAndDecrement() → c=3, count=2
2. c==capacity → signalNotFull() 唤醒 P1

线程 P1 被唤醒：
1. 入队成功，c = count.getAndIncrement() → c=2, count=3
2. c+1=3 < capacity=3? → 否，不唤醒其他 put 线程

此时 P2、P3 继续等待，直到下一次 take 操作
```

**关键点：** 只有在入队后队列仍未满时才会级联唤醒，避免无效唤醒。

### 注意事项

1. **null 元素不允许**
   - put(null) 会立即抛出 NullPointerException
   - 这是为了避免 null 作为特殊标记值导致的歧义

2. **阻塞可中断**
   - put() 声明抛出 InterruptedException
   - 线程在等待锁或等待条件时都可以被中断
   - 适合需要取消或超时控制的场景

3. **性能考虑**
   - 跨锁唤醒（signalNotEmpty）有额外开销
   - 但只在 c==0 时触发，频率较低
   - 对于生产消费速率接近的场景，性能优秀

## LinkedBlockingQueue VS ArrayBlockingQueue

### 核心差异对比

| 特性 | LinkedBlockingQueue | ArrayBlockingQueue |
|------|-------------------|-------------------|
| **底层结构** | 单向链表 | 数组 |
| **容量** | 默认 Integer.MAX_VALUE（近似无界）| 必须指定固定容量 |
| **锁机制** | 双锁（putLock + takeLock）| 单锁 |
| **入队出队** | 可并发执行 | 互斥执行 |
| **内存分配** | 动态分配节点 | 预分配数组 |
| **GC 压力** | 较高（频繁创建销毁节点）| 较低（复用数组空间）|
| **吞吐量** | 高（双锁并发）| 相对较低（单锁互斥）|
| **缓存局部性** | 差（链表节点分散）| 好（数组连续内存）|

### 关键区别

**锁机制：**
- LinkedBlockingQueue 使用 putLock 和 takeLock 双锁，允许生产者和消费者并发操作
- ArrayBlockingQueue 使用单锁，入队和出队必须互斥执行

**内存特征：**
- LinkedBlockingQueue 按需创建节点，每个元素额外 20-32 字节开销，GC 压力较大
- ArrayBlockingQueue 预分配数组，内存连续，缓存友好，GC 压力小

### 选择建议

**选择 LinkedBlockingQueue：**
- 高并发场景，多个生产者和消费者并发操作
- 容量难以预估或需要近似无界队列
- 吞吐量优先，可接受额外内存开销

**选择 ArrayBlockingQueue：**
- 低并发场景或容量可预估
- 内存敏感，需要减少 GC 压力
- 小容量队列（如 < 1000 个元素）