# CyclicBarrier

## 概述

CyclicBarrier 直译为"循环栅栏"，是一种用于多线程协作的同步工具类。它的核心作用是让一组线程在屏障点相互等待，当所有线程都到达后，屏障打开，所有线程同时通过并继续执行。

**关键特性**：
- **可重复使用**：屏障可以被重置并多次使用（Cyclic），这是与 CountDownLatch 的最大区别
- **多线程互相等待**：所有参与线程必须都到达屏障点才能继续，强调线程间的协作同步

**与 CountDownLatch 的对比**：
- **CountDownLatch**：一个或少数线程等待多个线程完成任务，是**一次性**的（1等N）
- **CyclicBarrier**：多个线程互相等待，在同一阶段完成后一起进入下一阶段，可以**重复使用**（N等N）

**典型应用场景**：多线程分阶段计算任务，每个阶段都需要等待所有线程完成后才能进入下一阶段，如并行迭代算法、回合制模拟等。

## 基本使用

**构造方法**：

```java
public CyclicBarrier(int parties)  // parties 为参与线程数量
public CyclicBarrier(int parties, Runnable barrierAction)  // 可选的屏障动作
```

**核心方法**：

```java
public int await() throws InterruptedException, BrokenBarrierException
```

### 多轮循环示例

以下示例演示了 3 个线程执行多轮任务，每轮任务结束后在屏障处等待，突出 CyclicBarrier 可重复使用的特点：

```java
public class CyclicBarrierExample {
    public static void main(String[] args) {
        int threadCount = 3;
        int rounds = 3;  // 执行3轮

        // 可选的屏障动作，在每轮所有线程到达后执行
        CyclicBarrier barrier = new CyclicBarrier(threadCount, () -> {
            System.out.println("========== 所有线程完成本轮任务 ==========\n");
        });

        for (int i = 0; i < threadCount; i++) {
            int threadId = i;
            new Thread(() -> {
                try {
                    for (int round = 1; round <= rounds; round++) {
                        System.out.println("线程 " + threadId + " 正在执行第 " + round + " 轮任务");
                        Thread.sleep((long) (Math.random() * 1000));  // 模拟任务执行
                        System.out.println("线程 " + threadId + " 完成第 " + round + " 轮，等待其他线程");

                        barrier.await();  // 等待其他线程，屏障会自动重置
                    }
                    System.out.println("线程 " + threadId + " 全部任务完成！");
                } catch (InterruptedException | BrokenBarrierException e) {
                    e.printStackTrace();
                }
            }, "Thread-" + threadId).start();
        }
    }
}
```

**输出示例**：
```
线程 0 正在执行第 1 轮任务
线程 1 正在执行第 1 轮任务
线程 2 正在执行第 1 轮任务
线程 1 完成第 1 轮，等待其他线程
线程 0 完成第 1 轮，等待其他线程
线程 2 完成第 1 轮，等待其他线程
========== 所有线程完成本轮任务 ==========

线程 2 正在执行第 2 轮任务
线程 0 正在执行第 2 轮任务
线程 1 正在执行第 2 轮任务
线程 0 完成第 2 轮，等待其他线程
线程 1 完成第 2 轮，等待其他线程
线程 2 完成第 2 轮，等待其他线程
========== 所有线程完成本轮任务 ==========

线程 2 正在执行第 3 轮任务
线程 1 正在执行第 3 轮任务
线程 0 正在执行第 3 轮任务
线程 1 完成第 3 轮，等待其他线程
线程 2 完成第 3 轮，等待其他线程
线程 0 完成第 3 轮，等待其他线程
========== 所有线程完成本轮任务 ==========

线程 2 全部任务完成！
线程 0 全部任务完成！
线程 1 全部任务完成！
```

:::warning 注意
**线程数必须与 parties 参数一致**，否则会导致死锁。如果实际调用 `await()` 的线程数少于 parties，所有线程都会永久阻塞。
:::
