# ReentrantLock

`ReentrantLock` 是 `java.util.concurrent.locks` 包下的显式锁实现，相比 `synchronized` 提供了更灵活的锁控制能力。

## ReentrantLock vs synchronized

| 特性 | ReentrantLock | synchronized |
|------|---------------|--------------|
| 可中断 | ✅ 支持 `lockInterruptibly()` | ❌ 不支持 |
| 超时获取锁 | ✅ 支持 `tryLock(timeout)` | ❌ 不支持 |
| 公平锁 | ✅ 可选公平/非公平 | ❌ 非公平 |
| 条件变量 | ✅ 支持多个 `Condition` | ⚠️ 只有一个 `WaitSet` |
| 可重入 | ✅ 支持 | ✅ 支持 |
| 锁释放 | 手动 `unlock()`（必须在 finally 中） | 自动释放 |
| 性能 | 高并发下略优 | JDK 6 后优化，差距不大 |
| 使用复杂度 | 较高，需要手动管理 | 简单，自动管理 |

::: tip 选择建议
- **优先使用 synchronized**：简单场景、无特殊需求时
- **考虑 ReentrantLock**：需要可中断、超时、公平锁或多个条件变量时
:::

## 基本语法

**标准用法：必须在 finally 中释放锁**

```java
private final ReentrantLock lock = new ReentrantLock();

public void method() {
    lock.lock();  // 获取锁
    try {
        // 临界区代码
        // 业务逻辑
    } finally {
        lock.unlock();  // 必须在 finally 中释放锁
    }
}
```

::: warning 重要
- **必须在 finally 中调用 `unlock()`**，否则发生异常时锁无法释放，导致死锁
- 每次 `lock()` 必须对应一次 `unlock()`
- 不要在 `lock()` 之前就进入 try 块，否则可能释放未持有的锁
:::

## 可重入

**可重入**是指同一个线程如果首次获得了这把锁，那么因为它是这把锁的拥有者，因此有权利再次获取这把锁。如果是不可重入锁，那么第二次获取锁时，线程会被自己阻塞。

### 可重入示例

```java
public class ReentrantDemo {
    private static final ReentrantLock lock = new ReentrantLock();

    public static void main(String[] args) {
        lock.lock();
        try {
            System.out.println("外层获取锁");
            method1();
        } finally {
            lock.unlock();
        }
    }

    public static void method1() {
        lock.lock();  // 同一线程再次获取锁，成功
        try {
            System.out.println("内层获取锁");
            method2();
        } finally {
            lock.unlock();
        }
    }

    public static void method2() {
        lock.lock();  // 同一线程第三次获取锁，依然成功
        try {
            System.out.println("最内层获取锁");
        } finally {
            lock.unlock();
        }
    }
}
```

输出：
```
外层获取锁
内层获取锁
最内层获取锁
```

### 实现原理

`ReentrantLock` 内部维护了一个**重入计数器**：
- 首次获取锁时，计数器从 0 变为 1
- 同一线程再次获取锁时，计数器递增
- 每次 `unlock()` 计数器递减
- 计数器为 0 时，锁才真正释放

::: tip synchronized 也是可重入的
`synchronized` 同样支持可重入，否则递归方法或同一对象的同步方法相互调用时会死锁。
:::

## 可中断

`synchronized` 在等待锁时无法被中断，而 `ReentrantLock` 提供了 `lockInterruptibly()` 方法，支持在等待锁的过程中响应中断。

### 不可中断示例（synchronized）

```java
public class UninterruptibleDemo {
    private static final Object lock = new Object();

    public static void main(String[] args) throws InterruptedException {
        Thread t1 = new Thread(() -> {
            synchronized (lock) {
                System.out.println("t1 获得锁");
                try {
                    Thread.sleep(Long.MAX_VALUE);  // 长时间持有锁
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        }, "t1");

        Thread t2 = new Thread(() -> {
            System.out.println("t2 尝试获取锁");
            synchronized (lock) {  // 阻塞在这里，无法被中断
                System.out.println("t2 获得锁");
            }
        }, "t2");

        t1.start();
        Thread.sleep(100);
        t2.start();
        Thread.sleep(100);

        t2.interrupt();  // 尝试中断 t2，但无效
        System.out.println("t2 的中断标记：" + t2.isInterrupted());  // true
        // t2 依然阻塞在 synchronized，无法退出
    }
}
```

### 可中断示例（ReentrantLock）

```java
public class InterruptibleDemo {
    private static final ReentrantLock lock = new ReentrantLock();

    public static void main(String[] args) throws InterruptedException {
        Thread t1 = new Thread(() -> {
            lock.lock();
            try {
                System.out.println("t1 获得锁");
                Thread.sleep(Long.MAX_VALUE);
            } catch (InterruptedException e) {
                e.printStackTrace();
            } finally {
                lock.unlock();
            }
        }, "t1");

        Thread t2 = new Thread(() -> {
            System.out.println("t2 尝试获取锁");
            try {
                lock.lockInterruptibly();  // 可中断的获取锁
                try {
                    System.out.println("t2 获得锁");
                } finally {
                    lock.unlock();
                }
            } catch (InterruptedException e) {
                System.out.println("t2 等待锁的过程中被中断");
            }
        }, "t2");

        t1.start();
        Thread.sleep(100);
        t2.start();
        Thread.sleep(100);

        t2.interrupt();  // 中断 t2
        // t2 会抛出 InterruptedException 并退出等待
    }
}
```

输出：
```
t1 获得锁
t2 尝试获取锁
t2 等待锁的过程中被中断
```

::: tip 应用场景
可中断锁适用于需要及时响应用户取消操作或系统关闭信号的场景，避免线程长时间阻塞无法退出。
:::

## 锁超时

`ReentrantLock` 提供了 `tryLock()` 和 `tryLock(timeout)` 方法，支持非阻塞或限时获取锁，主动避免死锁。

### tryLock() - 立即返回

```java
public class TryLockDemo {
    private static final ReentrantLock lock = new ReentrantLock();

    public static void main(String[] args) {
        Thread t1 = new Thread(() -> {
            if (lock.tryLock()) {  // 尝试获取锁，立即返回
                try {
                    System.out.println("t1 获得锁");
                    Thread.sleep(2000);
                } catch (InterruptedException e) {
                    e.printStackTrace();
                } finally {
                    lock.unlock();
                }
            } else {
                System.out.println("t1 获取锁失败");
            }
        }, "t1");

        lock.lock();  // 主线程先获取锁
        try {
            t1.start();
            Thread.sleep(100);
        } catch (InterruptedException e) {
            e.printStackTrace();
        } finally {
            lock.unlock();
        }
    }
}
```

### tryLock(timeout) - 超时等待

```java
public class TryLockTimeoutDemo {
    private static final ReentrantLock lock = new ReentrantLock();

    public static void main(String[] args) throws InterruptedException {
        Thread t1 = new Thread(() -> {
            try {
                // 尝试获取锁，最多等待 1 秒
                if (lock.tryLock(1, TimeUnit.SECONDS)) {
                    try {
                        System.out.println("t1 获得锁");
                    } finally {
                        lock.unlock();
                    }
                } else {
                    System.out.println("t1 获取锁超时");
                }
            } catch (InterruptedException e) {
                System.out.println("t1 等待过程中被中断");
            }
        }, "t1");

        lock.lock();
        try {
            t1.start();
            Thread.sleep(2000);  // 主线程持有锁 2 秒
        } finally {
            lock.unlock();
        }
    }
}
```

输出：
```
t1 获取锁超时
```

### 解决哲学家就餐问题

使用 `tryLock()` 可以避免死锁：哲学家尝试获取筷子，如果失败则放弃已获得的资源，避免循环等待。

```java
public class PhilosopherDining {
    public static void main(String[] args) {
        Chopstick c1 = new Chopstick("1");
        Chopstick c2 = new Chopstick("2");
        Chopstick c3 = new Chopstick("3");
        Chopstick c4 = new Chopstick("4");
        Chopstick c5 = new Chopstick("5");

        new Philosopher("苏格拉底", c1, c2).start();
        new Philosopher("柏拉图", c2, c3).start();
        new Philosopher("亚里士多德", c3, c4).start();
        new Philosopher("赫拉克利特", c4, c5).start();
        new Philosopher("阿基米德", c5, c1).start();
    }
}

class Chopstick extends ReentrantLock {
    private final String name;

    public Chopstick(String name) {
        this.name = name;
    }

    @Override
    public String toString() {
        return "筷子" + name;
    }
}

class Philosopher extends Thread {
    private final Chopstick left;
    private final Chopstick right;

    public Philosopher(String name, Chopstick left, Chopstick right) {
        super(name);
        this.left = left;
        this.right = right;
    }

    @Override
    public void run() {
        while (true) {
            // 尝试获取左手筷子
            if (left.tryLock()) {
                try {
                    // 尝试获取右手筷子
                    if (right.tryLock()) {
                        try {
                            System.out.println(getName() + " 吃饭");
                            Thread.sleep(100);
                        } catch (InterruptedException e) {
                            e.printStackTrace();
                        } finally {
                            right.unlock();
                        }
                    }
                } finally {
                    left.unlock();  // 即使获取右手筷子失败，也要释放左手筷子
                }
            }
        }
    }
}
```

::: tip 核心思想
如果无法同时获取所有资源，则释放已获得的资源并重试，打破"持有并等待"条件，避免死锁。
:::

## 公平锁

`ReentrantLock` 支持**公平锁**和**非公平锁**两种模式，通过构造函数参数指定。

```java
// 非公平锁（默认）
ReentrantLock lock = new ReentrantLock();
// 等价于
ReentrantLock lock = new ReentrantLock(false);

// 公平锁
ReentrantLock lock = new ReentrantLock(true);
```

### 公平锁 vs 非公平锁

| 特性 | 公平锁 | 非公平锁 |
|------|--------|----------|
| 获取顺序 | 按照请求锁的顺序获取 | 不保证顺序，允许插队 |
| 等待队列 | 严格按 FIFO 顺序唤醒 | 新线程可以抢占刚释放的锁 |
| 吞吐量 | 较低 | 较高 |
| 响应时间 | 更均衡，避免饥饿 | 可能导致某些线程长时间等待 |
| 适用场景 | 需要严格公平性的业务 | 一般场景，追求性能 |

### 非公平锁示例

```java
public class UnfairLockDemo {
    public static void main(String[] args) throws InterruptedException {
        ReentrantLock lock = new ReentrantLock(false);  // 非公平锁

        for (int i = 0; i < 3; i++) {
            int threadNum = i;
            new Thread(() -> {
                for (int j = 0; j < 2; j++) {
                    lock.lock();
                    try {
                        System.out.println("线程" + threadNum + " 获得锁");
                    } finally {
                        lock.unlock();
                    }
                }
            }).start();
        }
    }
}
```

可能的输出（顺序不固定）：
```
线程0 获得锁
线程0 获得锁
线程1 获得锁
线程2 获得锁
线程1 获得锁
线程2 获得锁
```

### 公平锁示例

```java
public class FairLockDemo {
    public static void main(String[] args) throws InterruptedException {
        ReentrantLock lock = new ReentrantLock(true);  // 公平锁

        for (int i = 0; i < 3; i++) {
            int threadNum = i;
            new Thread(() -> {
                for (int j = 0; j < 2; j++) {
                    lock.lock();
                    try {
                        System.out.println("线程" + threadNum + " 获得锁");
                    } finally {
                        lock.unlock();
                    }
                }
            }).start();
        }
    }
}
```

输出（严格按顺序）：
```
线程0 获得锁
线程1 获得锁
线程2 获得锁
线程0 获得锁
线程1 获得锁
线程2 获得锁
```

::: warning 性能影响
公平锁会降低并发度，因为必须维护严格的 FIFO 队列，增加了线程切换开销。一般没有必要使用公平锁。
:::

## 条件变量

`synchronized` 中的条件变量是 `WaitSet`，只有一个等待集合。`ReentrantLock` 支持多个条件变量（`Condition`），可以实现更精细的线程协作。

### Condition vs Object 的 wait/notify

| 特性 | Condition | Object wait/notify |
|------|-----------|-------------------|
| 所属类 | `java.util.concurrent.locks.Condition` | `java.lang.Object` |
| 数量 | 一个锁可以创建多个 `Condition` | 一个对象只有一个 `WaitSet` |
| 使用前提 | 必须先获取 `ReentrantLock` | 必须在 `synchronized` 块中 |
| 等待方法 | `await()` | `wait()` |
| 唤醒方法 | `signal()` / `signalAll()` | `notify()` / `notifyAll()` |
| 精确唤醒 | 支持，不同条件使用不同 `Condition` | 不支持，只能唤醒 `WaitSet` 中的线程 |

### 基本用法

```java
private final ReentrantLock lock = new ReentrantLock();
private final Condition condition = lock.newCondition();

// 等待
public void await() throws InterruptedException {
    lock.lock();
    try {
        while (!conditionMet) {
            condition.await();  // 释放锁并等待
        }
        // 条件满足，继续执行
    } finally {
        lock.unlock();
    }
}

// 唤醒
public void signal() {
    lock.lock();
    try {
        conditionMet = true;
        condition.signal();  // 唤醒一个等待线程
        // 或者 condition.signalAll(); 唤醒所有等待线程
    } finally {
        lock.unlock();
    }
}
```

### 多条件变量示例：生产者-消费者

使用两个 `Condition` 分别管理"队列满"和"队列空"两种等待条件。

```java
public class MessageQueue {
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition notFull = lock.newCondition();   // 队列不满条件
    private final Condition notEmpty = lock.newCondition();  // 队列不空条件

    private final LinkedList<String> queue = new LinkedList<>();
    private final int capacity;

    public MessageQueue(int capacity) {
        this.capacity = capacity;
    }

    // 生产者：放入消息
    public void put(String message) throws InterruptedException {
        lock.lock();
        try {
            // 队列满时，在 notFull 条件上等待
            while (queue.size() == capacity) {
                System.out.println("队列已满，生产者等待");
                notFull.await();
            }

            queue.addLast(message);
            System.out.println("生产：" + message + "，当前大小：" + queue.size());

            // 唤醒在 notEmpty 条件上等待的消费者
            notEmpty.signal();
        } finally {
            lock.unlock();
        }
    }

    // 消费者：取出消息
    public String take() throws InterruptedException {
        lock.lock();
        try {
            // 队列空时，在 notEmpty 条件上等待
            while (queue.isEmpty()) {
                System.out.println("队列为空，消费者等待");
                notEmpty.await();
            }

            String message = queue.removeFirst();
            System.out.println("消费：" + message + "，当前大小：" + queue.size());

            // 唤醒在 notFull 条件上等待的生产者
            notFull.signal();

            return message;
        } finally {
            lock.unlock();
        }
    }
}
```

### 使用示例

```java
public class ConditionDemo {
    public static void main(String[] args) {
        MessageQueue queue = new MessageQueue(3);

        // 生产者
        new Thread(() -> {
            for (int i = 0; i < 5; i++) {
                try {
                    queue.put("消息-" + i);
                    Thread.sleep(100);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }, "生产者").start();

        // 消费者
        new Thread(() -> {
            for (int i = 0; i < 5; i++) {
                try {
                    queue.take();
                    Thread.sleep(200);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }, "消费者").start();
    }
}
```

### 多条件变量的优势

使用 `synchronized` + `wait/notify` 时，所有等待线程都在同一个 `WaitSet` 中：

```java
// synchronized 版本：只有一个 WaitSet
synchronized (lock) {
    while (queue.size() == capacity) {
        lock.wait();  // 生产者和消费者都在这个 WaitSet 中
    }
    // ...
    lock.notifyAll();  // 必须唤醒所有线程，包括不应该被唤醒的
}
```

使用 `ReentrantLock` + `Condition` 时，可以精确唤醒：

```java
// ReentrantLock 版本：两个独立的 Condition
lock.lock();
try {
    while (queue.size() == capacity) {
        notFull.await();  // 只有生产者在 notFull 上等待
    }
    // ...
    notEmpty.signal();  // 只唤醒消费者
} finally {
    lock.unlock();
}
```

::: tip 精确唤醒的好处
- **减少无效唤醒**：只唤醒真正需要被唤醒的线程
- **减少锁竞争**：避免大量线程同时竞争锁
- **提升性能**：减少上下文切换和无效的条件检查
:::

## 总结

### 核心特性

**ReentrantLock 相比 synchronized 的优势：**

1. **可中断**：`lockInterruptibly()` 支持在等待锁时响应中断
2. **锁超时**：`tryLock(timeout)` 支持超时获取锁，主动避免死锁
3. **公平锁**：可选择公平或非公平模式
4. **多条件变量**：支持多个 `Condition`，实现精确唤醒
5. **可重入**：与 synchronized 一样支持重入

### 使用规范

**必须遵循的规则：**

```java
lock.lock();
try {
    // 临界区代码
} finally {
    lock.unlock();  // 必须在 finally 中释放锁
}
```

- **必须在 finally 中调用 `unlock()`**
- 每次 `lock()` 必须对应一次 `unlock()`
- `await()` 前必须先获取锁，类似 `wait()` 必须在 synchronized 中

### 选择建议

| 场景 | 推荐方案 |
|------|----------|
| 简单的互斥访问 | synchronized |
| 需要可中断 | ReentrantLock.lockInterruptibly() |
| 需要超时控制 | ReentrantLock.tryLock(timeout) |
| 需要公平性保证 | ReentrantLock(true) |
| 需要多个等待条件 | ReentrantLock + 多个 Condition |

::: tip 工程实践
- **优先使用 synchronized**：简单、安全、JVM 优化好
- **必要时使用 ReentrantLock**：需要其特有功能时
- **注意锁释放**：使用 ReentrantLock 时务必在 finally 中释放锁，否则容易导致死锁
:::
