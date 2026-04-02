# synchronized
为避免临界区的竞态条件发生，有多种方案可以解决
* 阻塞式方案：synchronized、lock
* 非阻塞式方案：原子变量

本次采用synchronized即俗称对象锁来解决问题

::: tip 互斥 vs 同步
Java 中互斥和同步都可以用 synchronized 来解决
* 互斥（Mutual Exclusion）：保证临界区的竞态条件不发生，同一时刻只能有一个线程执行临界区代码
* 同步（Synchronization）：由于线程执行的先后顺序不同，需要一个线程等待其他线程运行到某个点
:::

## 语法
**1. 同步代码块**
```java
synchronized(对象) {
    // 临界区
}
```

**2. 同步实例方法**
```java
public synchronized void method() {
    // 临界区，锁是 this
}
```

**3. 同步静态方法**
```java
public static synchronized void method() {
    // 临界区，锁是类对象
}
```

## 解决上一章的临界区问题

```java
static int counter = 0;

public static void main(String[] args) throws InterruptedException {
    Thread t1 = new Thread(() -> {
        for (int i = 0; i < 5000; i++) {
            synchronized (SharedMemoryProblems.class) {
                counter++;
            }
        }
    });

    Thread t2 = new Thread(() -> {
        for (int i = 0; i < 5000; i++) {
            synchronized (SharedMemoryProblems.class) {
                counter--;
            }
        }
    });

    t1.start();
    t2.start();
    t1.join();
    t2.join();

    System.out.println("counter = " + counter);  // 结果始终为 0
}
```

通过 `synchronized` 保护临界区（保证了临界区代码的**原子性**），保证同一时刻只有一个线程执行 counter++ 或 counter--，消除了竞态条件。

::: tip 视频讲解
推荐观看以下视频深入理解：
- [上下文切换-synchronized-理解](https://www.bilibili.com/video/BV16J411h7Rd?p=55)
- [上下文切换-synchronized-理解](https://www.bilibili.com/video/BV16J411h7Rd?p=56)
:::

### 面向对象写法改进

```java
public class SharedMemoryProblems {

    public static void main(String[] args) throws InterruptedException {
        Counter counter = new Counter();

        Thread t1 = new Thread(() -> {
            for (int i = 0; i < 5000; i++) {
                counter.increment();
            }
        });

        Thread t2 = new Thread(() -> {
            for (int i = 0; i < 5000; i++) {
                counter.decrement();
            }
        });

        t1.start();
        t2.start();
        t1.join();
        t2.join();

        System.out.println("counter = " + counter.getValue());
    }
}

class Counter {
    private int value = 0;

    public synchronized void increment() {
        value++;
    }

    public synchronized void decrement() {
        value--;
    }

    public synchronized int getValue() {
        return value;
    }
}
```

## 习题

synchronized线程八锁习题视频讲解：
- [synchronized-加在方法上-习题1~2](https://www.bilibili.com/video/BV16J411h7Rd?p=61)
- [synchronized-加在方法上-习题3~4](https://www.bilibili.com/video/BV16J411h7Rd?p=62)
- [synchronized-加在方法上-习题5~8](https://www.bilibili.com/video/BV16J411h7Rd?p=63)
