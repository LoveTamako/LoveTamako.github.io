# Semaphore

`Semaphore`（信号量）是一种基于**计数**的同步工具，用来限制能同时访问共享资源的线程上限。信号量概念由计算机科学家 **Dijkstra 在 1965 年**提出，Java 在 **JDK 1.5** 中引入到 `java.util.concurrent` 包。与 `synchronized`、`ReentrantLock` 等互斥锁只允许一个线程访问不同，Semaphore 允许**多个线程（N个）同时访问**，常用于限流控制、资源池管理等场景。

## 使用

### 基本概念

Semaphore 基于**许可（permit）**机制工作：
- 创建时指定许可数量
- 线程通过 `acquire()` 获取许可，如果没有可用许可则阻塞
- 线程通过 `release()` 释放许可，供其他线程使用
- 支持一次获取或释放多个许可

### 常用 API

```java
// 构造方法
Semaphore(int permits)              // 创建非公平信号量
Semaphore(int permits, boolean fair) // 创建公平/非公平信号量

// 获取许可
void acquire()                      // 获取1个许可，阻塞直到可用
void acquire(int permits)           // 获取n个许可
boolean tryAcquire()                // 尝试获取1个许可，立即返回
boolean tryAcquire(long timeout, TimeUnit unit) // 带超时的获取

// 释放许可
void release()                      // 释放1个许可
void release(int permits)           // 释放n个许可

// 查询方法
int availablePermits()              // 返回当前可用许可数
```

### 基本使用示例

```java
public class SemaphoreExample {
    // 创建3个许可的信号量
    private static final Semaphore semaphore = new Semaphore(3);

    public static void main(String[] args) {
        // 启动10个线程，但最多只有3个线程能同时执行
        for (int i = 0; i < 10; i++) {
            new Thread(() -> {
                try {
                    semaphore.acquire();  // 获取许可
                    System.out.println(Thread.currentThread().getName() + " 获得许可，开始执行");
                    Thread.sleep(2000);   // 模拟业务处理
                    System.out.println(Thread.currentThread().getName() + " 执行完成，释放许可");
                } catch (InterruptedException e) {
                    e.printStackTrace();
                } finally {
                    semaphore.release();  // 释放许可
                }
            }, "线程-" + i).start();
        }
    }
}
```

## 应用

### 应用 1：限流

可以用来限流，在访问高峰期时，让请求线程阻塞，高峰期过去再释放许可。

:::warning 注意
这种方式只适合**单机限流**，并且限制的是**线程数**而不是**资源数**（例如连接数）。对比 Tomcat 的 LimitLatch 实现，它限制的是连接数。

**限制线程数的缺点**：

1. **资源与许可分离**：Semaphore 只保证最多N个线程进入临界区，但无法保证这N个线程真正占用了N个资源

2. **资源泄漏风险**：线程获取许可后，如果获取资源失败或异常，许可已被占用但资源未被使用

3. **一线程多资源问题**：一个线程可能需要使用多个资源，但只占用一个许可，导致实际资源使用超限

4. **资源状态不可知**：Semaphore 无法感知资源的真实状态（可用、损坏、过期等）

**示例对比**：

```java
// Semaphore 方式 - 限制线程数
Semaphore semaphore = new Semaphore(10);  // 最多10个线程
semaphore.acquire();  // 获取许可
try {
    Connection conn = pool.getConnection();  // 可能失败，但许可已占用
    // 如果这里获取连接失败，资源数≠许可数
} finally {
    semaphore.release();
}

// Tomcat LimitLatch 方式 - 限制资源数
// 直接在 accept() 连接时控制
latch.countUpOrAwait();  // 计数+1，超限则阻塞
Socket socket = serverSocket.accept();  // 实际接受连接
// 确保每个计数对应一个真实连接
```

因此，对于需要精确控制资源数量的场景（如连接池、文件句柄），应该将资源管理和限流控制结合起来，而不是单独使用 Semaphore。
:::

```java
public class RateLimiter {
    // 限制最多3个线程同时处理请求
    private final Semaphore semaphore = new Semaphore(3);

    public void handleRequest(String request) {
        try {
            if (semaphore.tryAcquire()) {  // 尝试获取许可
                try {
                    System.out.println(Thread.currentThread().getName() + " 处理请求: " + request);
                    Thread.sleep(1000);  // 模拟请求处理
                } finally {
                    semaphore.release();  // 必须在 finally 中释放
                }
            } else {
                System.out.println(Thread.currentThread().getName() + " 请求被限流，拒绝处理: " + request);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    public static void main(String[] args) {
        RateLimiter limiter = new RateLimiter();

        // 模拟10个并发请求
        for (int i = 0; i < 10; i++) {
            int finalI = i;
            new Thread(() -> limiter.handleRequest("请求-" + finalI)).start();
        }
    }
}
```

### 应用 2：实现简单数据库连接池

可以实现简单数据库连接池，因为线程数和数据库连接数是相等的。

:::tip 对比
这里使用 Semaphore 实现连接池，相比享元模式下的实现（wait-notify），代码更简洁。
:::

```java
public class SimpleConnectionPool {
    private final Semaphore semaphore;
    private final List<Connection> connections;

    public SimpleConnectionPool(int poolSize) {
        this.semaphore = new Semaphore(poolSize);
        this.connections = new ArrayList<>(poolSize);

        // 初始化连接池
        for (int i = 0; i < poolSize; i++) {
            connections.add(new MockConnection("连接-" + i));
        }
    }

    // 获取连接
    public Connection getConnection() throws InterruptedException {
        semaphore.acquire();  // 获取许可
        return getAvailableConnection();
    }

    // 归还连接
    public void returnConnection(Connection connection) {
        if (connection != null) {
            synchronized (connections) {
                connections.add(connection);
            }
            semaphore.release();  // 释放许可
        }
    }

    private Connection getAvailableConnection() {
        synchronized (connections) {
            return connections.remove(0);
        }
    }

    // 模拟数据库连接
    static class MockConnection {
        private final String name;

        public MockConnection(String name) {
            this.name = name;
        }

        @Override
        public String toString() {
            return name;
        }
    }

    // 测试代码
    public static void main(String[] args) {
        SimpleConnectionPool pool = new SimpleConnectionPool(3);

        // 启动5个线程获取连接
        for (int i = 0; i < 5; i++) {
            new Thread(() -> {
                try {
                    Connection conn = pool.getConnection();
                    System.out.println(Thread.currentThread().getName() + " 获取到连接: " + conn);
                    Thread.sleep(2000);  // 模拟使用连接
                    pool.returnConnection(conn);
                    System.out.println(Thread.currentThread().getName() + " 归还连接: " + conn);
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }, "线程-" + i).start();
        }
    }
}
```

## 原理

Semaphore 基于 **AQS（AbstractQueuedSynchronizer）** 实现，内部使用 `state` 字段表示可用许可数。

### acquire()

`acquire()` 方法用于获取许可，其执行流程如下：

#### 1. 非公平模式（默认）

```java
// Semaphore.NonfairSync
protected int tryAcquireShared(int acquires) {
    return nonfairTryAcquireShared(acquires);
}

final int nonfairTryAcquireShared(int acquires) {
    for (;;) {
        int available = getState();  // 获取当前可用许可数
        int remaining = available - acquires;  // 计算剩余许可数

        // 如果剩余许可 < 0 或 CAS 更新成功，返回结果
        if (remaining < 0 || compareAndSetState(available, remaining))
            return remaining;
    }
}
```

**执行流程**：
1. 获取当前可用许可数（state）
2. 计算获取后的剩余许可数：`remaining = state - acquires`
3. 如果 `remaining < 0`，返回负数，线程进入等待队列
4. 如果 `remaining >= 0`，CAS 更新 state，获取成功
5. CAS 失败则自旋重试

#### 2. 公平模式

```java
// Semaphore.FairSync
protected int tryAcquireShared(int acquires) {
    for (;;) {
        // 关键区别：先检查是否有前驱节点在等待
        if (hasQueuedPredecessors())
            return -1;  // 有线程在排队，直接失败

        int available = getState();
        int remaining = available - acquires;

        if (remaining < 0 || compareAndSetState(available, remaining))
            return remaining;
    }
}
```

**公平模式的关键**：
- 在尝试获取许可前，先检查等待队列中是否有其他线程
- 如果有线程在等待（`hasQueuedPredecessors()` 返回 true），直接返回 -1
- 这确保了先到先得的公平性

#### 3. 获取失败后的处理

当 `tryAcquireShared()` 返回负数时，AQS 会将线程加入等待队列：

```java
// AQS 中的处理
public final void acquireSharedInterruptibly(int arg) throws InterruptedException {
    if (Thread.interrupted())
        throw new InterruptedException();

    if (tryAcquireShared(arg) < 0)  // 尝试获取失败
        doAcquireSharedInterruptibly(arg);  // 加入等待队列并阻塞
}
```

**阻塞过程**：
1. 将当前线程封装为共享模式节点，加入等待队列尾部
2. 自旋检查前驱节点是否是 head，是则再次尝试获取
3. 如果仍然失败，调用 `LockSupport.park()` 阻塞当前线程
4. 被唤醒后继续自旋尝试获取许可

### release()

`release()` 方法用于释放许可，增加可用许可数并唤醒等待线程。

#### 1. 释放许可的实现

```java
// Semaphore.Sync
protected final boolean tryReleaseShared(int releases) {
    for (;;) {
        int current = getState();  // 获取当前许可数
        int next = current + releases;  // 计算释放后的许可数

        // 检查溢出（许可数不能超过 Integer.MAX_VALUE）
        if (next < current)
            throw new Error("Maximum permit count exceeded");

        // CAS 更新 state
        if (compareAndSetState(current, next))
            return true;
    }
}
```

**执行流程**：
1. 获取当前可用许可数（state）
2. 计算释放后的许可数：`next = state + releases`
3. 检查是否溢出（next < current 说明溢出）
4. CAS 更新 state，成功则返回 true
5. CAS 失败则自旋重试

#### 2. 唤醒等待线程

当 `tryReleaseShared()` 返回 true 时，AQS 会唤醒等待队列中的线程：

```java
// AQS 中的处理
public final boolean releaseShared(int arg) {
    if (tryReleaseShared(arg)) {  // 尝试释放许可
        doReleaseShared();  // 唤醒等待线程
        return true;
    }
    return false;
}

private void doReleaseShared() {
    for (;;) {
        Node h = head;
        if (h != null && h != tail) {
            int ws = h.waitStatus;
            if (ws == Node.SIGNAL) {
                // 唤醒后继节点
                if (!compareAndSetWaitStatus(h, Node.SIGNAL, 0))
                    continue;
                unparkSuccessor(h);  // 唤醒线程
            }
            // ...
        }
        if (h == head)  // 检查 head 是否改变
            break;
    }
}
```

**唤醒过程**：
1. 检查队列头节点的状态
2. 如果状态是 SIGNAL（表示后继节点需要被唤醒）
3. CAS 将状态改为 0，并调用 `unparkSuccessor()` 唤醒后继线程
4. 被唤醒的线程会重新尝试获取许可
5. 如果成功，该线程会继续唤醒后面的线程（共享模式的传播机制）

#### 3. 共享模式的传播

与独占锁不同，Semaphore 使用共享模式，一次 release() 可能唤醒多个线程：

```java
// 被唤醒的线程获取许可成功后
private void setHeadAndPropagate(Node node, int propagate) {
    setHead(node);
    // 如果还有剩余许可（propagate > 0），继续唤醒后继节点
    if (propagate > 0 || h == null || h.waitStatus < 0) {
        Node s = node.next;
        if (s == null || s.isShared())
            doReleaseShared();  // 传播唤醒
    }
}
```

**传播机制的意义**：
- 当释放多个许可时（如 `release(3)`），可以同时唤醒多个等待线程
- 每个被唤醒的线程获取成功后，会检查是否还有剩余许可
- 如果有，继续唤醒后面的线程，形成唤醒链

#### 4. 总结

**acquire() 和 release() 的配合**：

```text
线程A: acquire()
  ↓
检查 state >= 1?
  ↓ 是
CAS: state = state - 1  ✅ 获取成功
  ↓ 否
进入等待队列，park() 阻塞
  ↓
等待被唤醒...

线程B: release()
  ↓
CAS: state = state + 1  ✅ 释放成功
  ↓
doReleaseShared() 唤醒队列中的线程
  ↓
unpark(线程A)
  ↓
线程A 被唤醒，重新尝试 acquire()
  ↓
CAS: state = state - 1  ✅ 获取成功
```

**关键点**：
- state 表示可用许可数，通过 CAS 操作保证线程安全
- acquire() 失败的线程会加入等待队列并阻塞
- release() 增加许可数并唤醒等待线程
- 共享模式支持多个线程同时获取许可（只要 state 足够）
