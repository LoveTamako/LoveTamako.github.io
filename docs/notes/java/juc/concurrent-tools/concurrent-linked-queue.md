# ConcurrentLinkedQueue

## 基本介绍

ConcurrentLinkedQueue 是一个基于**链表**实现的**无界非阻塞队列**，使用 **CAS（Compare-And-Swap）** 操作实现线程安全。

**与 LinkedBlockingQueue 的关键区别：**
- LinkedBlockingQueue 使用**锁**实现，操作会**阻塞等待**
- ConcurrentLinkedQueue 使用 **CAS 无锁**实现，操作**不会阻塞**

**核心特点：**
- **非阻塞**：所有操作都不会阻塞线程，队列为空时 poll() 立即返回 null
- **无锁实现**：使用 CAS 替代锁，避免线程阻塞和上下文切换
- **无界队列**：理论上可以无限添加元素（受限于内存）
- **FIFO 顺序**：先进先出
- **弱一致性**：size() 等方法不保证实时准确

## 使用场景

### 典型应用：Tomcat NIO Connector

**Tomcat 使用 ConcurrentLinkedQueue 处理 HTTP 请求：**

在 Tomcat 的 NIO Connector 中，使用 ConcurrentLinkedQueue 作为事件队列：
- **Poller 线程**将就绪的 Socket 事件放入队列
- **Worker 线程池**从队列中取出事件进行处理
- 非阻塞特性保证 Poller 线程不会因为队列操作而等待
- 高并发场景下，无锁实现提供更好的吞吐量

### 适用场景

**1. 高并发无阻塞需求**
- 生产者和消费者都不能阻塞等待
- 需要快速响应，不能因为锁等待而延迟
- 示例：消息分发、事件通知系统

**2. 对吞吐量要求高**
- 无锁实现，避免了线程阻塞和上下文切换
- 适合竞争不太激烈的场景（CAS 成功率高）

**3. 不需要阻塞特性**
- 队列为空时不需要等待（poll 返回 null）
- 队列满的情况不存在（无界队列）

**4. 可以容忍弱一致性**
- size() 方法需要遍历整个队列，开销大且不保证精确
- 迭代器不保证反映最新状态

### 不适用场景

**1. 需要阻塞等待**
- 队列为空时需要阻塞等待新元素 → 使用 LinkedBlockingQueue
- 需要超时等待功能 → 使用 BlockingQueue 系列

**2. 需要有界队列**
- 需要限制队列容量防止内存溢出 → 使用 ArrayBlockingQueue 或 LinkedBlockingQueue(指定容量)

**3. 竞争非常激烈**
- CAS 失败率高时，自旋重试会消耗大量 CPU
- 此时使用锁的性能可能更好

**4. 需要精确的 size()**
- size() 方法开销大（O(n)），且不保证实时准确
- 如需精确计数，使用 BlockingQueue（内部维护 count）

## 与 BlockingQueue 的对比

| 特性 | ConcurrentLinkedQueue | LinkedBlockingQueue |
|------|----------------------|---------------------|
| **阻塞性** | 非阻塞（poll 返回 null）| 阻塞（take 会等待）|
| **实现方式** | CAS 无锁 | ReentrantLock 双锁 |
| **容量** | 无界 | 可指定容量 |
| **性能** | 低竞争时更高 | 高竞争时更稳定 |
| **size()** | O(n)，不精确 | O(1)，精确 |
| **适用场景** | 高并发非阻塞场景 | 生产者-消费者阻塞场景 |

**选择建议：**
- 不需要阻塞，追求极致性能 → ConcurrentLinkedQueue
- 需要阻塞等待或容量控制 → LinkedBlockingQueue/ArrayBlockingQueue