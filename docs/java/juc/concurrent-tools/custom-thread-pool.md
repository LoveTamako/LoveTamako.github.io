# 自定义线程池

通过手动实现一个简化版的线程池，深入理解 ThreadPoolExecutor 的工作原理，包括任务队列、工作线程、拒绝策略等核心机制。

## 设计思路

一个线程池的核心组成部分：

1. **任务队列**：存储待执行的任务
2. **工作线程集合**：执行任务的线程
3. **核心参数**：核心线程数、超时时间等
4. **拒绝策略**：队列满时的处理策略

**执行流程**：

```
提交任务
  ↓
线程数 < coreSize?
  ├─ 是 → 创建新线程执行
  │
  └─ 否 → 尝试加入任务队列
           ↓
         队列是否已满?
           ├─ 否 → 任务进入队列等待
           │
           └─ 是 → 执行拒绝策略
```

## 阻塞队列实现

首先实现一个阻塞队列用于存储任务，支持阻塞获取和添加操作。

### 基础实现

```java
class BlockingQueue<T> {
    // 任务队列
    private Deque<T> queue = new ArrayDeque<>();

    // 锁
    private ReentrantLock lock = new ReentrantLock();

    // 生产者条件变量（队列满时等待）
    private Condition fullWaitSet = lock.newCondition();

    // 消费者条件变量（队列空时等待）
    private Condition emptyWaitSet = lock.newCondition();

    // 容量
    private int capacity;

    public BlockingQueue(int capacity) {
        this.capacity = capacity;
    }

    // 阻塞获取
    public T take() {
        lock.lock();
        try {
            while (queue.isEmpty()) {
                try {
                    emptyWaitSet.await();
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
            T t = queue.removeFirst();
            fullWaitSet.signal();
            return t;
        } finally {
            lock.unlock();
        }
    }

    // 阻塞添加
    public void put(T element) {
        lock.lock();
        try {
            while (queue.size() == capacity) {
                try {
                    fullWaitSet.await();
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
            queue.addLast(element);
            emptyWaitSet.signal();
        } finally {
            lock.unlock();
        }
    }

    // 获取大小
    public int size() {
        lock.lock();
        try {
            return queue.size();
        } finally {
            lock.unlock();
        }
    }
}
```

**关键设计**：

- 使用 `ReentrantLock` + `Condition` 实现阻塞
- `fullWaitSet`：队列满时生产者等待
- `emptyWaitSet`：队列空时消费者等待
- `while` 循环防止虚假唤醒

### 带超时的获取

为了支持线程池中工作线程的超时回收，需要实现带超时的 `poll` 方法。

```java
// 带超时的阻塞获取
public T poll(long timeout, TimeUnit unit) {
    lock.lock();
    try {
        long nanos = unit.toNanos(timeout);
        while (queue.isEmpty()) {
            try {
                if (nanos <= 0) {
                    return null;
                }
                nanos = emptyWaitSet.awaitNanos(nanos);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }
        T t = queue.removeFirst();
        fullWaitSet.signal();
        return t;
    } finally {
        lock.unlock();
    }
}
```

**关键点**：
- 使用 `awaitNanos` 方法实现超时等待
- 返回值是剩余的等待时间，需要持续累减
- 超时返回 `null`

### 带超时的添加

为了避免任务提交时无限阻塞，实现带超时的 `offer` 方法。

```java
// 带超时的阻塞添加
public boolean offer(T task, long timeout, TimeUnit unit) {
    lock.lock();
    try {
        long nanos = unit.toNanos(timeout);
        while (queue.size() == capacity) {
            try {
                if (nanos <= 0) {
                    return false;
                }
                nanos = fullWaitSet.awaitNanos(nanos);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }
        queue.addLast(task);
        emptyWaitSet.signal();
        return true;
    } finally {
        lock.unlock();
    }
}
```

### 支持拒绝策略

使用策略模式，让调用者决定队列满时如何处理任务。

```java
// 支持拒绝策略的添加方法
public void tryPut(RejectPolicy<T> rejectPolicy, T task) {
    lock.lock();
    try {
        // 队列未满，直接加入
        if (queue.size() < capacity) {
            queue.addLast(task);
            emptyWaitSet.signal();
        } else {
            // 队列已满，执行拒绝策略
            rejectPolicy.reject(this, task);
        }
    } finally {
        lock.unlock();
    }
}
```

## 线程池实现

### 核心结构

```java
class ThreadPool {
    // 任务队列
    private BlockingQueue<Runnable> taskQueue;

    // 线程集合
    private HashSet<Worker> workers = new HashSet<>();

    // 核心线程数
    private int coreSize;

    // 获取任务的超时时间
    private long timeout;

    private TimeUnit timeUnit;

    // 拒绝策略
    private RejectPolicy<Runnable> rejectPolicy;

    public ThreadPool(int coreSize, long timeout, TimeUnit timeUnit,
                     int queueCapacity, RejectPolicy<Runnable> rejectPolicy) {
        this.coreSize = coreSize;
        this.timeout = timeout;
        this.timeUnit = timeUnit;
        this.taskQueue = new BlockingQueue<>(queueCapacity);
        this.rejectPolicy = rejectPolicy;
    }
}
```

### 任务提交

```java
// 执行任务
public void execute(Runnable task) {
    synchronized (workers) {
        // 当前线程数 < 核心线程数，直接创建新线程执行
        if (workers.size() < coreSize) {
            Worker worker = new Worker(task);
            workers.add(worker);
            worker.start();
        } else {
            // 否则加入任务队列（使用拒绝策略处理满队列情况）
            taskQueue.tryPut(rejectPolicy, task);
        }
    }
}
```

**执行逻辑**：
1. 线程数 < coreSize：创建新 Worker 线程执行任务
2. 线程数 ≥ coreSize：任务加入队列等待执行
3. 队列满：执行拒绝策略

### Worker 工作线程

```java
class Worker extends Thread {
    private Runnable task;

    public Worker(Runnable task) {
        this.task = task;
    }

    @Override
    public void run() {
        // 执行任务
        // 1. 执行初始任务（如果有）
        // 2. 循环从队列获取任务执行
        while (task != null || (task = taskQueue.poll(timeout, timeUnit)) != null) {
            try {
                System.out.println("正在执行..." + task);
                task.run();
            } catch (Exception e) {
                e.printStackTrace();
            } finally {
                task = null;
            }
        }

        // 超时未获取到任务，线程退出并从集合中移除
        synchronized (workers) {
            System.out.println("工作线程被移除：" + this);
            workers.remove(this);
        }
    }
}
```

**工作流程**：
1. 先执行构造时传入的初始任务
2. 循环从队列中获取任务执行（带超时）
3. 超时未获取到任务，线程退出

**为什么使用 `poll` 而非 `take`？**
- `take()` 会一直阻塞，线程永不退出
- `poll(timeout)` 超时返回 null，允许线程优雅退出
- 类似 ThreadPoolExecutor 的 `keepAliveTime` 机制

## 拒绝策略

定义策略接口，让调用者自定义拒绝行为。

### 策略接口

```java
@FunctionalInterface
interface RejectPolicy<T> {
    void reject(BlockingQueue<T> queue, T task);
}
```

### 常见策略实现

```java
public class RejectPolicies {
    // 1. 死等策略：阻塞等待队列有空位
    public static <T> RejectPolicy<T> blockingWait() {
        return (queue, task) -> queue.put(task);
    }

    // 2. 超时等待：等待指定时间，超时放弃
    public static <T> RejectPolicy<T> timeoutWait(long timeout, TimeUnit unit) {
        return (queue, task) -> {
            if (!queue.offer(task, timeout, unit)) {
                System.out.println("任务等待超时，放弃执行：" + task);
            }
        };
    }

    // 3. 调用者自己执行
    public static <T> RejectPolicy<T> callerRuns() {
        return (queue, task) -> {
            if (task instanceof Runnable) {
                System.out.println("队列满，调用者自己执行：" + task);
                ((Runnable) task).run();
            }
        };
    }

    // 4. 直接抛弃
    public static <T> RejectPolicy<T> discard() {
        return (queue, task) -> {
            System.out.println("队列满，任务被抛弃：" + task);
        };
    }

    // 5. 抛出异常
    public static <T> RejectPolicy<T> abortPolicy() {
        return (queue, task) -> {
            throw new RuntimeException("队列已满，拒绝任务：" + task);
        };
    }
}
```

**策略对比**：

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| 死等 | 阻塞直到加入成功 | 任务必须执行 |
| 超时等待 | 等待一段时间后放弃 | 任务可以丢弃 |
| 调用者执行 | 提交任务的线程自己执行 | 防止任务丢失，但会降低吞吐 |
| 直接抛弃 | 丢弃任务 | 任务不重要 |
| 抛出异常 | 抛异常通知调用者 | 需要感知拒绝事件 |

## 完整实现代码

以下是可以直接运行的完整代码，包含详细注释。

### BlockingQueue 完整实现

```java
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

/**
 * 阻塞队列 - 用于存储任务
 * @param <T> 元素类型
 */
class BlockingQueue<T> {
    // 1. 任务队列
    private Deque<T> queue = new ArrayDeque<>();

    // 2. 锁
    private ReentrantLock lock = new ReentrantLock();

    // 3. 生产者条件变量（队列满时等待）
    private Condition fullWaitSet = lock.newCondition();

    // 4. 消费者条件变量（队列空时等待）
    private Condition emptyWaitSet = lock.newCondition();

    // 5. 容量
    private int capacity;

    /**
     * 构造函数
     * @param capacity 队列容量
     */
    public BlockingQueue(int capacity) {
        this.capacity = capacity;
    }

    /**
     * 阻塞获取 - 队列空时一直等待
     * @return 队列中的元素
     */
    public T take() {
        lock.lock();
        try {
            // 队列为空，等待
            while (queue.isEmpty()) {
                try {
                    emptyWaitSet.await();
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
            // 从队头取出元素
            T t = queue.removeFirst();
            // 唤醒等待添加元素的线程
            fullWaitSet.signal();
            return t;
        } finally {
            lock.unlock();
        }
    }

    /**
     * 带超时的阻塞获取
     * @param timeout 超时时间
     * @param unit 时间单位
     * @return 队列中的元素，超时返回 null
     */
    public T poll(long timeout, TimeUnit unit) {
        lock.lock();
        try {
            // 将超时时间转换为纳秒
            long nanos = unit.toNanos(timeout);
            // 队列为空，等待
            while (queue.isEmpty()) {
                try {
                    // 超时，返回 null
                    if (nanos <= 0) {
                        return null;
                    }
                    // 等待指定时间，返回剩余等待时间
                    nanos = emptyWaitSet.awaitNanos(nanos);
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
            // 从队头取出元素
            T t = queue.removeFirst();
            // 唤醒等待添加元素的线程
            fullWaitSet.signal();
            return t;
        } finally {
            lock.unlock();
        }
    }

    /**
     * 阻塞添加 - 队列满时一直等待
     * @param element 要添加的元素
     */
    public void put(T element) {
        lock.lock();
        try {
            // 队列已满，等待
            while (queue.size() == capacity) {
                try {
                    fullWaitSet.await();
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
            // 添加到队尾
            queue.addLast(element);
            // 唤醒等待获取元素的线程
            emptyWaitSet.signal();
        } finally {
            lock.unlock();
        }
    }

    /**
     * 带超时的阻塞添加
     * @param task 要添加的元素
     * @param timeout 超时时间
     * @param unit 时间单位
     * @return 是否添加成功
     */
    public boolean offer(T task, long timeout, TimeUnit unit) {
        lock.lock();
        try {
            // 将超时时间转换为纳秒
            long nanos = unit.toNanos(timeout);
            // 队列已满，等待
            while (queue.size() == capacity) {
                try {
                    // 超时，返回 false
                    if (nanos <= 0) {
                        return false;
                    }
                    // 等待指定时间，返回剩余等待时间
                    nanos = fullWaitSet.awaitNanos(nanos);
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
            // 添加到队尾
            queue.addLast(task);
            // 唤醒等待获取元素的线程
            emptyWaitSet.signal();
            return true;
        } finally {
            lock.unlock();
        }
    }

    /**
     * 支持拒绝策略的添加方法
     * @param rejectPolicy 拒绝策略
     * @param task 要添加的元素
     */
    public void tryPut(RejectPolicy<T> rejectPolicy, T task) {
        lock.lock();
        try {
            // 队列未满，直接加入
            if (queue.size() < capacity) {
                queue.addLast(task);
                emptyWaitSet.signal();
            } else {
                // 队列已满，执行拒绝策略
                rejectPolicy.reject(this, task);
            }
        } finally {
            lock.unlock();
        }
    }

    /**
     * 获取队列大小
     * @return 队列中元素个数
     */
    public int size() {
        lock.lock();
        try {
            return queue.size();
        } finally {
            lock.unlock();
        }
    }
}
```

### RejectPolicy 完整实现

```java
/**
 * 拒绝策略接口
 * @param <T> 元素类型
 */
@FunctionalInterface
interface RejectPolicy<T> {
    /**
     * 拒绝处理方法
     * @param queue 阻塞队列
     * @param task 被拒绝的任务
     */
    void reject(BlockingQueue<T> queue, T task);
}

/**
 * 拒绝策略实现类
 */
class RejectPolicies {
    /**
     * 1. 死等策略 - 阻塞等待队列有空位
     */
    public static <T> RejectPolicy<T> blockingWait() {
        return (queue, task) -> {
            System.out.println("队列满，阻塞等待...");
            queue.put(task);
        };
    }

    /**
     * 2. 超时等待策略 - 等待指定时间，超时放弃
     */
    public static <T> RejectPolicy<T> timeoutWait(long timeout, TimeUnit unit) {
        return (queue, task) -> {
            if (!queue.offer(task, timeout, unit)) {
                System.out.println("任务等待超时，放弃执行：" + task);
            }
        };
    }

    /**
     * 3. 调用者执行策略 - 让提交任务的线程自己执行
     */
    public static <T> RejectPolicy<T> callerRuns() {
        return (queue, task) -> {
            if (task instanceof Runnable) {
                System.out.println("队列满，调用者自己执行：" + task);
                ((Runnable) task).run();
            }
        };
    }

    /**
     * 4. 抛弃策略 - 直接丢弃任务
     */
    public static <T> RejectPolicy<T> discard() {
        return (queue, task) -> {
            System.out.println("队列满，任务被抛弃：" + task);
        };
    }

    /**
     * 5. 抛出异常策略 - 抛异常通知调用者
     */
    public static <T> RejectPolicy<T> abortPolicy() {
        return (queue, task) -> {
            throw new RuntimeException("队列已满，拒绝任务：" + task);
        };
    }
}
```

### ThreadPool 完整实现

```java
import java.util.HashSet;
import java.util.concurrent.TimeUnit;

/**
 * 自定义线程池
 */
class ThreadPool {
    // 任务队列
    private BlockingQueue<Runnable> taskQueue;

    // 线程集合
    private HashSet<Worker> workers = new HashSet<>();

    // 核心线程数
    private int coreSize;

    // 获取任务的超时时间
    private long timeout;

    private TimeUnit timeUnit;

    // 拒绝策略
    private RejectPolicy<Runnable> rejectPolicy;

    /**
     * 构造函数
     * @param coreSize 核心线程数
     * @param timeout 超时时间
     * @param timeUnit 时间单位
     * @param queueCapacity 队列容量
     * @param rejectPolicy 拒绝策略
     */
    public ThreadPool(int coreSize, long timeout, TimeUnit timeUnit,
                      int queueCapacity, RejectPolicy<Runnable> rejectPolicy) {
        this.coreSize = coreSize;
        this.timeout = timeout;
        this.timeUnit = timeUnit;
        this.taskQueue = new BlockingQueue<>(queueCapacity);
        this.rejectPolicy = rejectPolicy;
    }

    /**
     * 执行任务
     * @param task 要执行的任务
     */
    public void execute(Runnable task) {
        synchronized (workers) {
            // 当前线程数 < 核心线程数，直接创建新线程执行
            if (workers.size() < coreSize) {
                Worker worker = new Worker(task);
                System.out.println("新增 worker：" + worker + "，当前线程数：" + (workers.size() + 1));
                workers.add(worker);
                worker.start();
            } else {
                // 否则加入任务队列（使用拒绝策略处理满队列情况）
                System.out.println("加入任务队列：" + task);
                taskQueue.tryPut(rejectPolicy, task);
            }
        }
    }

    /**
     * Worker 工作线程
     */
    class Worker extends Thread {
        private Runnable task;

        /**
         * 构造函数
         * @param task 初始任务
         */
        public Worker(Runnable task) {
            this.task = task;
        }

        @Override
        public void run() {
            // 执行任务
            // 1. 执行初始任务（如果有）
            // 2. 循环从队列获取任务执行（带超时）
            while (task != null || (task = taskQueue.poll(timeout, timeUnit)) != null) {
                try {
                    System.out.println("正在执行..." + task);
                    task.run();
                } catch (Exception e) {
                    e.printStackTrace();
                } finally {
                    // 执行完成，清空 task
                    task = null;
                }
            }

            // 超时未获取到任务，线程退出并从集合中移除
            synchronized (workers) {
                System.out.println("工作线程被移除：" + this);
                workers.remove(this);
            }
        }
    }
}
```

### 完整测试代码

```java
import java.util.concurrent.TimeUnit;

/**
 * 测试自定义线程池
 */
public class TestThreadPool {
    public static void main(String[] args) {
        // 创建线程池
        // - 核心线程数：2
        // - 超时时间：1 秒（线程空闲 1 秒后退出）
        // - 队列容量：3
        // - 拒绝策略：超时等待 500ms
        ThreadPool pool = new ThreadPool(
            2,                                                      // coreSize
            1, TimeUnit.SECONDS,                                    // timeout
            3,                                                      // queueCapacity
            RejectPolicies.timeoutWait(500, TimeUnit.MILLISECONDS) // rejectPolicy
        );

        // 提交 5 个任务
        for (int i = 1; i <= 5; i++) {
            int taskId = i;
            pool.execute(() -> {
                try {
                    System.out.println("任务" + taskId + " 开始执行");
                    Thread.sleep(1000);
                    System.out.println("任务" + taskId + " 执行完成");
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            });
        }

        // 等待一段时间
        try {
            Thread.sleep(100);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }

        // 继续提交 3 个任务，测试拒绝策略
        for (int i = 6; i <= 8; i++) {
            int taskId = i;
            pool.execute(() -> {
                System.out.println("任务" + taskId + " 开始执行");
            });
        }

        // 等待所有任务完成
        try {
            Thread.sleep(5000);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }

        System.out.println("所有任务执行完成");
    }
}
```

**运行说明**：

1. 将所有代码复制到同一个 Java 文件中（或分别创建类文件）
2. 运行 `TestThreadPool` 的 `main` 方法
3. 观察输出，理解线程池的执行流程

**预期输出示例**：

```
新增 worker：Thread[Thread-0,5,main]，当前线程数：1
新增 worker：Thread[Thread-1,5,main]，当前线程数：2
正在执行...TestThreadPool$$Lambda$1/...
任务1 开始执行
正在执行...TestThreadPool$$Lambda$2/...
任务2 开始执行
加入任务队列：TestThreadPool$$Lambda$3/...
加入任务队列：TestThreadPool$$Lambda$4/...
加入任务队列：TestThreadPool$$Lambda$5/...
加入任务队列：TestThreadPool$$Lambda$6/...
任务等待超时，放弃执行：TestThreadPool$$Lambda$7/...
任务等待超时，放弃执行：TestThreadPool$$Lambda$8/...
任务1 执行完成
正在执行...TestThreadPool$$Lambda$3/...
任务3 开始执行
任务2 执行完成
正在执行...TestThreadPool$$Lambda$4/...
任务4 开始执行
任务3 执行完成
正在执行...TestThreadPool$$Lambda$5/...
任务5 开始执行
任务4 执行完成
正在执行...TestThreadPool$$Lambda$6/...
任务6 开始执行
任务5 执行完成
任务6 开始执行
工作线程被移除：Thread[Thread-0,5,main]
工作线程被移除：Thread[Thread-1,5,main]
所有任务执行完成
```

## 总结

通过自定义线程池的实现，我们深入理解了：

1. **阻塞队列**：使用 Lock + Condition 实现生产者-消费者模式
2. **工作线程**：循环从队列获取任务，超时退出实现线程回收
3. **拒绝策略**：策略模式让调用者自定义队列满时的处理逻辑
4. **并发控制**：通过 synchronized 保护线程集合的并发访问

### 与 JDK ThreadPoolExecutor 对比

| 特性 | 自定义线程池 | ThreadPoolExecutor |
|------|-------------|-------------------|
| 核心线程数 | ✅ coreSize | ✅ corePoolSize |
| 最大线程数 | ❌ 无 | ✅ maximumPoolSize |
| 任务队列 | ✅ 自定义阻塞队列 | ✅ BlockingQueue |
| 拒绝策略 | ✅ 策略模式 | ✅ RejectedExecutionHandler |
| 线程工厂 | ❌ 无 | ✅ ThreadFactory |
| 线程超时 | ✅ poll(timeout) | ✅ keepAliveTime |
| 任务包装 | ❌ 直接执行 Runnable | ✅ 包装成 FutureTask |
| 线程池状态 | ❌ 无 | ✅ RUNNING/SHUTDOWN/STOP 等 |

**我们的简化之处**：
- **不区分核心线程和非核心线程**
  - 自定义线程池：所有工作线程都使用 `poll(timeout)`，空闲超时后都会被销毁
  - JDK ThreadPoolExecutor：核心线程默认使用 `take()` 永不超时，非核心线程使用 `poll(keepAliveTime)` 会超时退出（除非调用 `allowCoreThreadTimeOut(true)`）
- 没有实现线程池状态管理（shutdown、shutdownNow 等）
- 没有提供 Future 机制获取任务结果

::: tip 实践建议
自定义线程池仅用于**学习原理**，生产环境请使用 JDK 的 **ThreadPoolExecutor**，它经过充分测试，功能完善，性能优化更好。
:::
