# CountDownLatch

## 概述

CountDownLatch 直译为"倒计时门闩"，是一种用于线程同步协作的工具类。它允许一个或多个线程等待其他线程完成一组操作后再继续执行。

**核心思想**：通过一个计数器来实现线程间的协调。计数器的初始值通常设置为需要等待的操作数量，每完成一个操作就将计数器减一，当计数器归零时，所有等待的线程被唤醒继续执行。

## 核心 API

CountDownLatch 提供了三个核心方法：

### 构造方法

```java
public CountDownLatch(int count)
```

- **参数 count**：初始化等待计数值，必须大于 0
- **作用**：创建一个 CountDownLatch 实例，指定需要等待的操作数量

### await() 方法

```java
public void await() throws InterruptedException
public boolean await(long timeout, TimeUnit unit) throws InterruptedException
```

- **作用**：使当前线程等待，直到计数器归零或线程被中断
- **带超时的重载**：等待指定时间后，如果计数器仍未归零则返回 false

### countDown() 方法

```java
public void countDown()
```

- **作用**：将计数器减一
- **注意**：当计数器已经为 0 时，继续调用 countDown() 不会产生任何效果

## 源码分析

CountDownLatch 的实现相对简单，内部基于 AQS（AbstractQueuedSynchronizer）实现。

### 核心实现

```java
public class CountDownLatch {
    private static final class Sync extends AbstractQueuedSynchronizer {
        Sync(int count) {
            setState(count);  // 设置初始计数值
        }

        int getCount() {
            return getState();
        }

        protected int tryAcquireShared(int acquires) {
            return (getState() == 0) ? 1 : -1;  // 计数为0时才能获取
        }

        protected boolean tryReleaseShared(int releases) {
            for (;;) {
                int c = getState();
                if (c == 0)
                    return false;
                int nextc = c - 1;
                if (compareAndSetState(c, nextc))
                    return nextc == 0;  // 减到0时返回true，唤醒等待线程
            }
        }
    }

    private final Sync sync;

    public CountDownLatch(int count) {
        if (count < 0) throw new IllegalArgumentException("count < 0");
        this.sync = new Sync(count);
    }

    public void await() throws InterruptedException {
        sync.acquireSharedInterruptibly(1);
    }

    public void countDown() {
        sync.releaseShared(1);
    }
}
```

### 实现原理

- **计数器存储**：使用 AQS 的 state 变量存储计数值
- **await() 原理**：调用 AQS 的 acquireSharedInterruptibly()，当 state 不为 0 时线程进入等待队列阻塞
- **countDown() 原理**：调用 AQS 的 releaseShared()，使用 CAS 操作将 state 减一，当 state 变为 0 时唤醒所有等待线程
- **一次性特性**：CountDownLatch 计数器不能重置，一旦归零就无法再次使用

## 基本用法

### 简单示例

以下示例演示了主线程等待多个工作线程完成任务：

```java
public class CountDownLatchExample {
    public static void main(String[] args) throws InterruptedException {
        int workerCount = 3;
        CountDownLatch latch = new CountDownLatch(workerCount);

        // 启动工作线程
        for (int i = 0; i < workerCount; i++) {
            int taskId = i;
            new Thread(() -> {
                try {
                    System.out.println("任务 " + taskId + " 开始执行");
                    Thread.sleep(1000 + taskId * 500);  // 模拟任务执行
                    System.out.println("任务 " + taskId + " 执行完成");
                } catch (InterruptedException e) {
                    e.printStackTrace();
                } finally {
                    latch.countDown();  // 完成后计数减一
                }
            }).start();
        }

        System.out.println("主线程等待所有任务完成...");
        latch.await();  // 等待计数归零
        System.out.println("所有任务完成，主线程继续执行");
    }
}
```

### 配合线程池使用

相比直接创建线程，使用线程池是更推荐的做法：

```java
public class CountDownLatchWithThreadPool {
    public static void main(String[] args) throws InterruptedException {
        int taskCount = 5;
        CountDownLatch latch = new CountDownLatch(taskCount);
        ExecutorService executor = Executors.newFixedThreadPool(3);

        try {
            for (int i = 0; i < taskCount; i++) {
                int taskId = i;
                executor.submit(() -> {
                    try {
                        System.out.println("任务 " + taskId + " 执行中...");
                        Thread.sleep(1000);
                        System.out.println("任务 " + taskId + " 完成");
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        latch.countDown();
                    }
                });
            }

            latch.await();
            System.out.println("所有任务执行完毕");
        } finally {
            executor.shutdown();
        }
    }
}
```

**为什么使用 CountDownLatch 而不是 join()**：

- `Thread.join()` 只能等待线程结束，无法与线程池配合使用
- CountDownLatch 更加灵活，可以在任务的任意位置调用 `countDown()`
- 可以实现更复杂的同步场景，如多个线程等待同一个事件

::: tip 与其他同步工具的对比
虽然可以使用 `wait()/notify()` 等底层 API 实现类似功能，但 CountDownLatch 提供了更简洁、更不易出错的方式。类似地，ReentrantLock、ReadWriteLock、Semaphore 等高级同步工具都可以配合线程池使用，它们都比底层 API 更加安全和易用。
:::

## 应用场景

### 场景一：等待多线程准备完毕

模拟游戏场景，等待所有玩家加载完成后再开始游戏：

```java
public class GameLoadingExample {
    public static void main(String[] args) throws InterruptedException {
        int playerCount = 10;
        CountDownLatch latch = new CountDownLatch(playerCount);
        ExecutorService executor = Executors.newFixedThreadPool(playerCount);

        System.out.println("游戏准备开始，等待玩家加载...");

        for (int i = 1; i <= playerCount; i++) {
            int playerId = i;
            executor.submit(() -> {
                try {
                    // 模拟玩家加载游戏资源
                    int loadTime = 1000 + (int) (Math.random() * 2000);
                    System.out.println("玩家 " + playerId + " 正在加载...");
                    Thread.sleep(loadTime);
                    System.out.println("玩家 " + playerId + " 加载完成！");
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    latch.countDown();
                }
            });
        }

        // 等待所有玩家加载完成
        latch.await();
        System.out.println("\n所有玩家准备就绪，游戏开始！");

        executor.shutdown();
    }
}
```

**输出示例**：
```
游戏准备开始，等待玩家加载...
玩家 1 正在加载...
玩家 2 正在加载...
...
玩家 5 加载完成！
玩家 3 加载完成！
...
玩家 10 加载完成！

所有玩家准备就绪，游戏开始！
```

### 场景二：等待多个远程调用结束

模拟并行调用多个远程服务，等待所有结果返回后汇总处理：

```java
public class RemoteCallExample {
    public static void main(String[] args) throws InterruptedException {
        int serviceCount = 5;
        CountDownLatch latch = new CountDownLatch(serviceCount);
        ExecutorService executor = Executors.newFixedThreadPool(serviceCount);

        List<String> results = new CopyOnWriteArrayList<>();

        System.out.println("开始并行调用远程服务...");
        long startTime = System.currentTimeMillis();

        for (int i = 1; i <= serviceCount; i++) {
            int serviceId = i;
            executor.submit(() -> {
                try {
                    // 模拟远程服务调用
                    String result = callRemoteService(serviceId);
                    results.add(result);
                    System.out.println("服务 " + serviceId + " 调用完成");
                } catch (Exception e) {
                    System.err.println("服务 " + serviceId + " 调用失败: " + e.getMessage());
                } finally {
                    latch.countDown();
                }
            });
        }

        // 等待所有远程调用完成
        latch.await();
        long endTime = System.currentTimeMillis();

        // 汇总处理结果
        System.out.println("\n所有服务调用完成！");
        System.out.println("总耗时: " + (endTime - startTime) + "ms");
        System.out.println("返回结果: " + results);

        executor.shutdown();
    }

    private static String callRemoteService(int serviceId) throws InterruptedException {
        // 模拟网络延迟
        Thread.sleep(500 + (int)(Math.random() * 1000));
        return "Service-" + serviceId + "-Data";
    }
}
```

**优点**：所有服务并行调用，总耗时约等于最慢的那个服务，而不是累加。

#### 使用 Future 改进

对于需要获取返回结果的场景，使用 `Future` 可以更简洁：

```java
public class RemoteCallWithFuture {
    public static void main(String[] args) throws InterruptedException, ExecutionException {
        int serviceCount = 5;
        ExecutorService executor = Executors.newFixedThreadPool(serviceCount);

        List<Future<String>> futures = new ArrayList<>();

        System.out.println("开始并行调用远程服务...");
        long startTime = System.currentTimeMillis();

        // 提交任务并收集 Future
        for (int i = 1; i <= serviceCount; i++) {
            int serviceId = i;
            Future<String> future = executor.submit(() -> {
                String result = callRemoteService(serviceId);
                System.out.println("服务 " + serviceId + " 调用完成");
                return result;
            });
            futures.add(future);
        }

        // 等待并收集所有结果
        List<String> results = new ArrayList<>();
        for (Future<String> future : futures) {
            results.add(future.get());  // 阻塞等待结果
        }

        long endTime = System.currentTimeMillis();
        System.out.println("\n所有服务调用完成！");
        System.out.println("总耗时: " + (endTime - startTime) + "ms");
        System.out.println("返回结果: " + results);

        executor.shutdown();
    }

    private static String callRemoteService(int serviceId) throws InterruptedException {
        Thread.sleep(500 + (int)(Math.random() * 1000));
        return "Service-" + serviceId + "-Data";
    }
}
```

**Future vs CountDownLatch**：
- **Future**：适合需要获取任务返回结果的场景，通过 `get()` 方法自动等待并获取结果
- **CountDownLatch**：更适合只关心任务完成时机而不需要返回值的场景，或需要更复杂的等待逻辑

## 最佳实践与注意事项

### 1. 务必在 finally 块中调用 countDown()

```java
executor.submit(() -> {
    try {
        // 执行任务
        doWork();
    } catch (Exception e) {
        // 处理异常
        handleError(e);
    } finally {
        latch.countDown();  // 确保一定会被调用
    }
});
```

**原因**：如果任务执行过程中抛出异常，而 `countDown()` 没有在 finally 块中，会导致计数器永远无法归零，主线程将永远阻塞在 `await()` 处。

### 2. 使用带超时的 await()

```java
boolean success = latch.await(10, TimeUnit.SECONDS);
if (!success) {
    System.err.println("超时：部分任务未在规定时间内完成");
    // 执行超时处理逻辑
}
```

**原因**：避免因某个任务永久阻塞导致程序hang住，设置合理的超时时间可以让程序及时失败并采取补救措施。

### 3. CountDownLatch 是一次性的

CountDownLatch 的计数器**不能重置**，一旦归零就无法再次使用。如果需要重复使用，考虑：
- **CyclicBarrier**：可以重复使用的同步屏障
- **Phaser**：更灵活的多阶段同步工具

### 4. 合理设置线程池大小

线程池大小应该根据任务特性设置：
- **CPU 密集型任务**：线程数 ≈ CPU 核心数 + 1
- **IO 密集型任务**：线程数可以设置得更大，如 CPU 核心数 × 2

### 5. 注意线程安全

如果多个线程需要共享数据（如收集结果），使用线程安全的集合类：
```java
List<String> results = new CopyOnWriteArrayList<>();  // 线程安全
// 或
List<String> results = Collections.synchronizedList(new ArrayList<>());
```

## 总结

CountDownLatch 是一个简单而强大的同步工具，适用于以下场景：
- 主线程等待多个工作线程完成后再继续
- 多个线程等待某个初始化操作完成后同时开始
- 并行执行多个任务并等待全部完成

**核心要点**：
- 基于 AQS 实现，通过共享锁机制协调线程
- 计数器是一次性的，不可重置
- 必须在 finally 块中调用 countDown() 保证计数器能够归零
- 建议使用带超时的 await() 避免永久阻塞
- 与线程池配合使用是最佳实践