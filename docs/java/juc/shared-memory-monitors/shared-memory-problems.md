# 共享带来的问题

## java代码示例

对一个初始值为0的静态变量，一个线程做自增，一个线程做自减，同时各做5000次，结果如何？

```java
static int counter = 0;

public static void main(String[] args) throws InterruptedException {
    Thread t1 = new Thread(() -> {
        for (int i = 0; i < 5000; i++) {
            counter++;
        }
    });

    Thread t2 = new Thread(() -> {
        for (int i = 0; i < 5000; i++) {
            counter--;
        }
    });

    t1.start();
    t2.start();
    t1.join();
    t2.join();

    System.out.println("counter = " + counter);
}
```

**预期结果**：0
**实际结果**：不确定（可能是任意值）

## 问题分析

### 字节码角度分析

**i++ 操作**的字节码指令：
```
getstatic     // 读取静态变量 counter
iconst_1      // 将常数 1 压入栈
iadd          // 执行加法
putstatic     // 写回静态变量 counter
```

**i-- 操作**的字节码指令：
```
getstatic     // 读取静态变量 counter
iconst_1      // 将常数 1 压入栈
isub          // 执行减法
putstatic     // 写回静态变量 counter
```

这三个步骤（读-改-写）不是原子操作，多个线程可以在任意时刻交错执行。

### 竞态条件示例

假设初始 counter = 0，两个线程交错执行：

| 时刻 | 线程1 | 线程2 | counter值 |
|------|-------|-------|----------|
| 1 | 读取counter(0) | | 0 |
| 2 | | 读取counter(0) | 0 |
| 3 | counter加1得1 | | 0 |
| 4 | | counter减1得-1 | 0 |
| 5 | 写回1 | | 1 |
| 6 | | 写回-1 | -1 |

最终结果为 -1，而不是预期的 0。这就是**竞态条件**导致的问题。

## 临界区 Critical Section

一段代码块存在对共享资源的多线程读写操作。在上面的例子中，`counter++` 和 `counter--` 这两行代码就是临界区。

临界区的特点：
- 包含对共享变量的访问
- 多个线程可能同时进入
- 执行结果依赖于线程的执行顺序

## 竞态条件 Race Condition

多个线程在临界区内执行，由于线程执行的**时序不确定**，导致程序的执行结果不可预测。

竞态条件的三个必要条件：
1. 存在共享资源
2. 多个线程访问共享资源
3. 至少有一个线程对共享资源进行写操作
