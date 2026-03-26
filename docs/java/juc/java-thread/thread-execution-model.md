# 线程运行原理

## 栈与栈帧

JVM 会为每个启动的线程分配一块独立的栈内存空间，用于存储该线程的方法调用信息。

### 核心概念

- **栈（Stack）**：每个线程拥有独立的栈内存，线程之间互不干扰
- **栈帧（Stack Frame）**：每个栈由多个栈帧组成，每次方法调用都会创建一个新的栈帧
- **活动栈帧**：每个线程只能有一个活动栈帧，对应着当前正在执行的方法

### 栈帧的组成

每个栈帧包含以下信息：

- 局部变量表（Local Variables）
- 操作数栈（Operand Stack）
- 动态链接（Dynamic Linking）
- 方法返回地址（Return Address）

### 方法调用过程

```java
public class StackFrameDemo {
    public static void main(String[] args) {
        method1();
    }

    private static void method1() {
        method2(1, 2);
    }

    private static void method2(int a, int b) {
        int c = a + b;
        System.out.println(c);
    }
}
```

执行流程：

1. `main` 方法被调用，创建栈帧并压入栈
2. `method1` 被调用，创建新栈帧压入栈（此时 `method1` 是活动栈帧）
3. `method2` 被调用，创建新栈帧压入栈（此时 `method2` 是活动栈帧）
4. `method2` 执行完毕，栈帧出栈，`method1` 重新成为活动栈帧
5. `method1` 执行完毕，栈帧出栈，`main` 重新成为活动栈帧
6. `main` 执行完毕，线程结束

::: tip 视频讲解
推荐观看以下视频深入理解：
- [线程运行原理-栈帧图解](https://www.bilibili.com/video/BV16J411h7Rd?p=21)
- [线程运行原理-多线程](https://www.bilibili.com/video/BV16J411h7Rd?p=22)
:::

## 线程上下文切换（Thread Context Switch）

### 什么是上下文切换

当 CPU 不再执行当前线程，转而执行另一个线程的代码时，就发生了**线程上下文切换**。

### 触发上下文切换的场景

线程上下文切换通常由以下情况触发：

1. **时间片用完**：线程分配的 CPU 时间片耗尽
2. **垃圾回收**：JVM 执行垃圾回收时会暂停用户线程
3. **优先级抢占**：有更高优先级的线程需要运行
4. **主动让出 CPU**：线程调用以下方法时会主动让出 CPU：
   - `Thread.sleep()`：休眠指定时间
   - `Thread.yield()`：让出当前时间片
   - `Object.wait()`：等待通知
   - `Thread.join()`：等待其他线程结束
   - `LockSupport.park()`：阻塞当前线程
   - `synchronized`、`Lock`：获取锁失败时阻塞

### 上下文切换的过程

上下文切换包含两个关键步骤：

1. **保存当前线程状态**：将当前线程的执行状态保存起来
2. **恢复目标线程状态**：加载目标线程之前保存的状态

需要保存和恢复的状态信息包括：

- **程序计数器（PC）**：记录下一条要执行的指令地址
- **虚拟机栈信息**：包括栈帧中的局部变量、操作数栈、返回地址等
- **寄存器状态**：CPU 寄存器中的数据

### 性能影响

::: warning 性能开销
上下文切换频繁发生会带来显著的性能开销：

- 保存和恢复线程状态需要时间
- CPU 缓存失效，需要重新加载数据
- 可能导致系统吞吐量下降

因此，在设计多线程程序时，应尽量减少不必要的上下文切换。
:::

