# synchronized
为避免临界区的竞态条件发生，有多种方案可以解决
* 阻塞式方案：synchronized、lock
* 非阻塞式方案：原子变量
本次采用synchronized即俗称对象锁来解决问题

### 互斥和同步的区别

**互斥（Mutual Exclusion）**
- 保证同一时刻只有一个线程进入临界区
- 防止竞态条件
- 例如：synchronized 保证只有一个线程执行 counter++

**同步（Synchronization）**
- 线程之间的协调和通信
- 控制线程的执行顺序
- 例如：wait/notify 实现生产者-消费者模式

synchronized 主要解决的是**互斥**问题。

## 语法
```java
synchronized(对象){  
    临界区
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

通过 `synchronized` 保护临界区，保证同一时刻只有一个线程执行 counter++ 或 counter--，消除了竞态条件。

## 原理

### 对象锁机制

Java 中每个对象都有一个**监视器锁（Monitor Lock）**，也称为对象锁。

- 当线程进入 `synchronized` 块时，会尝试获取对象的锁
- 如果锁被其他线程持有，当前线程会被阻塞
- 只有获得锁的线程才能执行临界区代码
- 执行完毕后，线程释放锁，其他等待的线程才能获得锁

### 字节码指令

synchronized 在字节码层面使用以下指令实现：

```
monitorenter    // 进入监视器，获取对象锁
// ... 临界区代码 ...
monitorexit     // 退出监视器，释放对象锁
```

### 三种使用方式

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

### 可见性保证

synchronized 不仅提供互斥，还提供**可见性**保证：
- 线程释放锁前，对共享变量的修改对其他线程可见
- 线程获得锁后，能看到其他线程释放锁前的修改