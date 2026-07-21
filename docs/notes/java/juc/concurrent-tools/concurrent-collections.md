# 线程安全集合类概述

## 遗留的线程安全集合

- **Hashtable**：早期的线程安全 Map 实现，使用 synchronized 方法保证线程安全
- **Vector**：早期的线程安全 List 实现，所有方法都加了 synchronized

**不推荐使用的原因**：
- 性能低下：所有操作都加锁，并发度极低
- 锁粒度粗：整个对象只有一把锁，多线程竞争激烈
- 已被 JUC 集合取代，提供了更好的性能和功能

## 使用Collections装饰的线程安全集合

Collections 提供了一系列 `synchronizedXxx` 方法，可以将非线程安全的集合包装成线程安全的：

```java
List<String> list = Collections.synchronizedList(new ArrayList<>());
Set<String> set = Collections.synchronizedSet(new HashSet<>());
Map<String, String> map = Collections.synchronizedMap(new HashMap<>());
```

**实现原理**：装饰器模式，内部使用 synchronized 包装每个方法。

**局限性**：
- 性能未提升：与 Hashtable、Vector 类似，锁粒度粗
- 复合操作不安全：如遍历、if-then-act 等操作仍需手动加锁
- 迭代器是 fail-fast 的，并发修改会抛出 `ConcurrentModificationException`

## JUC安全集合

`java.util.concurrent` 包提供了性能更优、功能更强的线程安全集合，可以根据不同场景选择合适的实现。

**相比传统方案的优势**：
- 更细粒度的锁机制，提高并发性能
- 使用 CAS 等无锁技术，减少线程阻塞
- 提供了更丰富的并发语义（如阻塞、弱一致性等）

**根据实现机制分为三大类**：

### Blocking

大部分实现基于锁，并提供用来阻塞的方法。例如阻塞队列：
- 当队列为空时，获取元素的线程会阻塞等待
- 当队列已满时，添加元素的线程会阻塞等待

这种阻塞特性使其非常适合**生产者-消费者**模式。

**典型实现**：

- **BlockingQueue**（阻塞队列）：
  - `ArrayBlockingQueue`：基于数组的有界阻塞队列
  - `LinkedBlockingQueue`：基于链表的阻塞队列，可选有界或无界
  - `PriorityBlockingQueue`：支持优先级排序的无界阻塞队列
  - `DelayQueue`：延迟队列，元素到期后才能被取出
  - `SynchronousQueue`：不存储元素的阻塞队列，直接传递
  - `LinkedTransferQueue`：基于链表的传输队列

- **BlockingDeque**（阻塞双端队列）：
  - `LinkedBlockingDeque`：基于链表的双端阻塞队列

**核心特性**：
- 队列满时，插入操作阻塞
- 队列空时，获取操作阻塞
- 适用于生产者-消费者模式

### CopyOnWrite

采用写时复制机制：
- **读操作**：无需加锁，直接读取当前数组，性能高
- **写操作**：复制整个底层数组，在副本上修改，然后替换原数组

适合**读多写少**场景，因为每次写操作都需要复制整个数组，开销较大。

**典型实现**：

- **CopyOnWriteArrayList**：线程安全的 ArrayList 替代品
- **CopyOnWriteArraySet**：线程安全的 Set，基于 CopyOnWriteArrayList 实现

**工作原理**：
- 读操作无锁，直接读取
- 写操作时复制整个底层数组，在副本上修改，然后替换原数组
- 迭代器使用快照，不会抛出 `ConcurrentModificationException`

**适用场景**：
- 读操作远多于写操作
- 集合元素数量不大（避免复制开销过大）
- 可以容忍短暂的数据不一致（弱一致性）

### Concurrent

内部很多操作使用 CAS（Compare-And-Swap）无锁算法，相比基于锁的实现：
- 减少了线程阻塞和上下文切换
- 多个线程可以同时进行读写操作
- 在高并发场景下能提供更高的吞吐量

**典型实现**：

- **ConcurrentHashMap**：线程安全的 HashMap，性能优于 Hashtable 和 SynchronizedMap
- **ConcurrentSkipListMap**：线程安全的有序 Map，基于跳表实现
- **ConcurrentSkipListSet**：线程安全的有序 Set
- **ConcurrentLinkedQueue**：无界非阻塞队列
- **ConcurrentLinkedDeque**：无界非阻塞双端队列

**核心特性**：
- 使用 CAS 等无锁或细粒度锁技术，并发性能高
- 支持高并发读写操作
- 适用于高吞吐量场景

**弱一致性**：

为了提高性能，Concurrent 集合采用弱一致性策略，在某些操作上不保证实时的强一致性：

- **遍历弱一致性（fail-safe）**：遍历时使用的是某个时刻的快照，遍历过程中的修改不一定能被感知，不会抛出异常
- **求大小弱一致性**：`size()` 方法返回的是近似值，可能不准确
- **读取弱一致性**：读操作可能读到稍旧的数据

**对比 fail-fast**：

对于非线程安全容器（如 ArrayList、HashMap），遍历时如果发生修改，使用 **fail-fast** 机制让遍历立刻失败，抛出 `ConcurrentModificationException`。