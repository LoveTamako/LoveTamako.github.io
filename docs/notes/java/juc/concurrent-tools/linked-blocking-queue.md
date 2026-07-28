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

### 双锁机制的优势

LinkedBlockingQueue 的双锁设计相比单锁实现有显著的性能优势：

**并发性提升：**
- **入队和出队可以并发**：putLock 和 takeLock 相互独立，生产者和消费者可以同时操作队列
- **减少锁竞争**：多个生产者只竞争 putLock，多个消费者只竞争 takeLock

**关键设计点：**

1. **AtomicInteger count**
   - 使用原子类而不是普通变量，因为 put 和 take 都需要修改 count
   - 保证在双锁机制下计数的准确性

2. **跨锁唤醒**
   - `signalNotEmpty()` 和 `signalNotFull()` 需要获取对方的锁才能唤醒等待线程
   - 确保条件变量的正确使用（条件变量必须与持有的锁配对）

3. **哨兵节点（head）**
   - head 节点不存储数据，简化了边界条件的处理
   - 出队时将 head.next 提升为新的 head，并清空其数据

**性能对比：**
- **单锁队列**（如 ArrayBlockingQueue）：入队和出队互斥，吞吐量受限
- **双锁队列**（LinkedBlockingQueue）：入队和出队并发，吞吐量更高

适用于**生产者-消费者**模式，尤其是生产和消费速率接近的场景。

## 加锁分析

高明之处在于使用了两把锁和dummy节点

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