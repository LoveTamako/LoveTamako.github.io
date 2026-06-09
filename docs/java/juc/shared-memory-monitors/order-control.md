# 同步模式之顺序控制

多线程环境中，有时需要控制线程的执行顺序。比如：

- **固定顺序**：线程 B 必须等待线程 A 完成某个操作后才能继续
- **交替执行**：多个线程按照特定顺序循环执行

本文介绍如何使用 `wait/notify`、`park/unpark` 和 `ReentrantLock` 实现这两种常见的顺序控制模式。

## 固定运行顺序

### 问题描述

有两个线程，要求线程 1 必须在线程 2 之后执行，即输出顺序为：先 2 后 1。

```java
Thread t1 = new Thread(() -> {
    System.out.println("1");
});

Thread t2 = new Thread(() -> {
    System.out.println("2");
});

t1.start();
t2.start();
```

如果直接启动，输出顺序不确定，可能是 2 1，也可能是 1 2。

### wait/notify 版本

使用共享对象的 `wait/notify` 机制实现顺序控制：

```java
public class FixedOrderWaitNotify {
    private static final Object lock = new Object();
    private static boolean t2Finished = false;

    public static void main(String[] args) {
        Thread t1 = new Thread(() -> {
            synchronized (lock) {
                while (!t2Finished) {  // 使用 while 防止虚假唤醒
                    try {
                        lock.wait();
                    } catch (InterruptedException e) {
                        e.printStackTrace();
                    }
                }
                System.out.println("1");
            }
        }, "t1");

        Thread t2 = new Thread(() -> {
            synchronized (lock) {
                System.out.println("2");
                t2Finished = true;
                lock.notify();  // 唤醒等待的线程
            }
        }, "t2");

        t1.start();
        t2.start();
    }
}
```

**输出：**
```
2
1
```

**关键点：**
- 使用共享变量 `t2Finished` 标记线程 2 是否完成
- 线程 1 在执行前先检查条件，不满足则 `wait()` 等待
- 线程 2 完成后设置标志并 `notify()` 唤醒线程 1
- 必须在 `synchronized` 块中使用 `wait/notify`

### park/unpark 版本

使用 `LockSupport` 的 `park/unpark` 机制实现：

```java
public class FixedOrderParkUnpark {
    public static void main(String[] args) {
        Thread t1 = new Thread(() -> {
            LockSupport.park();  // 阻塞，等待许可
            System.out.println("1");
        }, "t1");

        Thread t2 = new Thread(() -> {
            System.out.println("2");
            LockSupport.unpark(t1);  // 给 t1 发放许可
        }, "t2");

        t1.start();
        t2.start();
    }
}
```

**输出：**
```
2
1
```

**关键点：**
- 不需要共享锁对象，更简洁
- `park()` 阻塞当前线程，等待许可
- `unpark(thread)` 精确唤醒指定线程
- 即使 `unpark()` 先于 `park()` 执行，许可也会被保留

::: tip 对比
`park/unpark` 相比 `wait/notify`：
- 不需要获取锁，使用更简单
- 可以精确指定唤醒哪个线程
- 支持先 unpark 再 park 的场景
:::

## 交替输出

### 问题描述

有三个线程，分别输出 a、b、c，要求输出 `abcabcabcabcabc`，即按照固定顺序循环输出 5 轮。

### wait/notify 版本

```java
public class AlternateWaitNotify {
    public static void main(String[] args) {
        WaitNotify wn = new WaitNotify(1, 5);

        new Thread(() -> wn.print("a", 1, 2), "t1").start();
        new Thread(() -> wn.print("b", 2, 3), "t2").start();
        new Thread(() -> wn.print("c", 3, 1), "t3").start();
    }
}

class WaitNotify {
    private int flag;           // 当前执行标志位
    private final int loopCount;      // 循环次数

    public WaitNotify(int flag, int loopCount) {
        this.flag = flag;
        this.loopCount = loopCount;
    }

    /**
     * @param content 输出内容
     * @param waitFlag 等待的标志位
     * @param nextFlag 下一个标志位
     */
    public void print(String content, int waitFlag, int nextFlag) {
        for (int i = 0; i < loopCount; i++) {
            synchronized (this) {
                while (flag != waitFlag) {
                    try {
                        this.wait();
                    } catch (InterruptedException e) {
                        e.printStackTrace();
                    }
                }
                System.out.print(content);
                flag = nextFlag;
                this.notifyAll();
            }
        }
    }
}
```

**输出：**
```
abcabcabcabcabc
```

**实现要点：**
- 使用 `flag` 标志位控制当前应该哪个线程执行
- 每个线程等待自己的标志位，执行完后修改为下一个标志位
- 使用 `notifyAll()` 唤醒所有等待线程，由它们自己判断是否满足条件
- 循环执行指定次数

### ReentrantLock + Condition 版本

```java
public class AlternateAwaitSignal {
    public static void main(String[] args) {
        AwaitSignal as = new AwaitSignal(5);
        Condition condA = as.newCondition();
        Condition condB = as.newCondition();
        Condition condC = as.newCondition();

        new Thread(() -> as.print("a", condA, condB), "t1").start();
        new Thread(() -> as.print("b", condB, condC), "t2").start();
        new Thread(() -> as.print("c", condC, condA), "t3").start();

        // 主线程启动第一个线程
        as.lock();
        try {
            condA.signal();
        } finally {
            as.unlock();
        }
    }
}

class AwaitSignal extends ReentrantLock {
    private final int loopCount;

    public AwaitSignal(int loopCount) {
        this.loopCount = loopCount;
    }

    /**
     * @param content 输出内容
     * @param current 当前条件变量
     * @param next 下一个条件变量
     */
    public void print(String content, Condition current, Condition next) {
        for (int i = 0; i < loopCount; i++) {
            lock();
            try {
                current.await();
                System.out.print(content);
                next.signal();
            } catch (InterruptedException e) {
                e.printStackTrace();
            } finally {
                unlock();
            }
        }
    }
}
```

**输出：**
```
abcabcabcabcabc
```

**实现要点：**
- 为每个线程创建专属的 `Condition` 条件变量
- 每个线程在自己的 `Condition` 上等待，执行完后唤醒下一个线程的 `Condition`
- 相比 `wait/notify`，可以精确唤醒指定线程，避免无效唤醒
- 主线程需要先 `signal()` 启动第一个线程

::: tip ReentrantLock 的优势
相比 `wait/notify` 只有一个 `WaitSet`，`ReentrantLock` 可以创建多个 `Condition`，实现更精确的线程唤醒控制，减少不必要的竞争。
:::

### park/unpark 版本

```java
public class AlternateParkUnpark {
    static Thread t1, t2, t3;

    public static void main(String[] args) {
        ParkUnpark pu = new ParkUnpark(5);

        t1 = new Thread(() -> pu.print("a", t2), "t1");
        t2 = new Thread(() -> pu.print("b", t3), "t2");
        t3 = new Thread(() -> pu.print("c", t1), "t3");

        t1.start();
        t2.start();
        t3.start();

        // 启动第一个线程
        LockSupport.unpark(t1);
    }
}

class ParkUnpark {
    private final int loopCount;

    public ParkUnpark(int loopCount) {
        this.loopCount = loopCount;
    }

    /**
     * @param content 输出内容
     * @param next 下一个线程
     */
    public void print(String content, Thread next) {
        for (int i = 0; i < loopCount; i++) {
            LockSupport.park();
            System.out.print(content);
            LockSupport.unpark(next);
        }
    }
}
```

**输出：**
```
abcabcabcabcabc
```

**实现要点：**
- 每个线程先 `park()` 等待，被唤醒后执行并 `unpark()` 下一个线程
- 主线程通过 `unpark(t1)` 启动第一个线程
- 不需要锁和条件变量，实现最简洁
- 精确控制唤醒顺序，性能最优

## 三种方案对比

| 对比项 | wait/notify | ReentrantLock + Condition | park/unpark |
|--------|-------------|---------------------------|-------------|
| 是否需要锁 | 需要 synchronized | 需要 ReentrantLock | 不需要 |
| 唤醒精确度 | 低，notifyAll 唤醒所有 | 高，可指定 Condition | 高，可指定线程 |
| 实现复杂度 | 中等，需要标志位 | 较高，需要管理多个 Condition | 低，直接控制线程 |
| 性能 | 一般，有无效唤醒 | 较好，减少无效唤醒 | 最好，无锁竞争 |
| 适用场景 | 简单的顺序控制 | 需要多个等待条件 | 精确的线程调度 |

::: tip 选择建议
- **wait/notify**：适合简单场景，代码易懂
- **ReentrantLock + Condition**：需要多个等待条件时使用
- **park/unpark**：性能要求高或需要精确控制线程时使用
:::

## 总结

**固定运行顺序**
- 一个线程等待另一个线程完成后再执行
- `wait/notify` 需要共享标志位和同步块
- `park/unpark` 更简洁，直接阻塞和唤醒线程

**交替输出**
- 多个线程按照固定顺序循环执行
- `wait/notify` 使用标志位 + notifyAll，有无效唤醒
- `ReentrantLock + Condition` 使用多个条件变量，精确唤醒
- `park/unpark` 直接控制线程，实现最简洁高效

**工程实践**
- 简单场景优先使用 `wait/notify`，代码直观
- 需要精确控制或高性能时使用 `park/unpark`
- 复杂等待条件使用 `ReentrantLock + Condition`
- 实际项目中可使用更高层的工具如 `CountDownLatch`、`CyclicBarrier` 等
