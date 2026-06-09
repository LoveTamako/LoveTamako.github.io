# 终止模式之两阶段终止

在[2.4 常见方法](/java/juc/java-thread/thread-methods#two-phase-termination)章节已经介绍过使用 `interrupt()` 实现两阶段终止，本章将使用 `volatile` 改进实现。

## 利用 volatile 实现两阶段终止

### 实现方式

使用 `volatile` 布尔变量作为停止标志，替代 `interrupt()` 方法：

```java
public class TwoPhaseTermination {
    private Thread monitor;
    // 使用 volatile 保证可见性
    private volatile boolean stop = false;

    // 启动监控线程
    public void start() {
        monitor = new Thread(() -> {
            while (true) {
                if (stop) {
                    // 检测到停止信号，执行清理工作并退出
                    System.out.println("执行清理工作...");
                    break;
                }

                try {
                    Thread.sleep(1000);  // 模拟监控任务间隔
                    // 执行监控任务
                    System.out.println("执行监控任务");
                } catch (InterruptedException e) {
                    // sleep 被中断，可能是其他原因，继续循环
                    e.printStackTrace();
                }
            }
        }, "monitor");

        monitor.start();
    }

    // 停止监控线程
    public void stop() {
        stop = true;  // 设置停止标志
        monitor.interrupt();  // 打断 sleep，加快响应速度
    }
}
```

### 关键点说明

**volatile 的作用**：
- 保证 `stop` 变量的可见性，主线程修改后，监控线程能立即看到
- 避免监控线程从工作缓存读取旧值，导致无法停止

**为什么还要调用 interrupt()**：
- 如果线程正在 `sleep` 中，修改 `stop` 标志无法立即生效
- 调用 `interrupt()` 可以打断 `sleep`，使线程立即检查 `stop` 标志
- 这样可以更快地响应停止请求

## 同步模式之 Balking

### 定义

**Balking（犹豫）模式**：当发现对象不处于预期状态时，就直接放弃执行操作并返回。

这是一种同步模式，典型应用场景是：当一个线程发现另一个线程或本线程已经做了某件相同的事，那么本线程就无需再做，直接返回。

### 应用场景

在两阶段终止模式中，可以使用 Balking 模式避免重复启动监控线程：

```java
public class TwoPhaseTermination {
    private Thread monitor;
    private volatile boolean stop = false;
    private volatile boolean starting = false;  // 标记是否正在运行

    // 启动监控线程
    public void start() {
        synchronized (this) {
            if (starting) {
                // Balking：如果已经启动，直接返回
                return;
            }
            starting = true;
        }

        monitor = new Thread(() -> {
            while (true) {
                if (stop) {
                    System.out.println("执行清理工作...");
                    break;
                }

                try {
                    Thread.sleep(1000);
                    System.out.println("执行监控任务");
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
            // 线程结束时重置状态
            starting = false;
        }, "monitor");

        monitor.start();
    }

    // 停止监控线程
    public void stop() {
        stop = true;
        monitor.interrupt();
    }
}
```

### 模式特点

**核心思想**：
- 在执行操作前先检查状态
- 状态不符合预期时立即返回，不执行任何操作
- 避免不必要的资源占用和重复操作

**优点**：
- 提高系统响应性能
- 防止资源被重复占用
- 代码简洁，易于理解

**其他典型应用场景**：
- 单例模式的懒加载
- 避免重复初始化配置
- 防止重复提交表单
- 配置文件只加载一次

**单例模式中的 Balking 示例**：实现线程安全的单例

```java
public class Singleton {
    private static volatile Singleton instance;

    private Singleton() {}

    public static Singleton getInstance() {
        if (instance != null) {
            // Balking：实例已存在，直接返回
            return instance;
        }

        synchronized (Singleton.class) {
            // 双重检查：防止多个线程同时创建实例
            if (instance == null) {
                instance = new Singleton();
            }
            return instance;
        }
    }
}
```

这里体现了两个层次的 Balking：
- **外层检查**：大多数情况下实例已存在，直接返回，避免进入同步块
- **内层检查**：防止多个线程同时通过外层检查后重复创建实例

::: tip Balking vs 双重检查锁定
Balking 模式关注的是"状态检查后放弃执行"，而双重检查锁定（DCL）关注的是"延迟初始化的线程安全"。两者都会检查状态，但目的不同。
:::

::: details 思考题：为什么 JavaScript 中实现 Balking 模式不需要同步？

在 Java 中，Balking 模式的状态检查通常需要 `synchronized` 或 CAS 来保证线程安全。但在 JavaScript 中，仅使用一个普通变量就能实现。为什么？

**原因**：

JavaScript 是**单线程执行模型**（基于事件循环）：
- 同一时刻只有一个任务在执行
- 不存在多线程并发访问共享变量的问题
- 状态检查和修改是原子性的，不会被打断

**Java 是多线程模型**：
- 多个线程可以同时访问和修改共享变量
- 状态检查和修改之间可能发生线程切换
- 必须使用同步机制保证操作的原子性

**示例对比**：

```javascript
// JavaScript - 不需要同步
let starting = false;

function start() {
    if (starting) return;  // Balking
    starting = true;
    // 执行启动逻辑...
}
```

```java
// Java - 需要同步
private volatile boolean starting = false;

public void start() {
    synchronized (this) {  // 必须同步
        if (starting) return;  // Balking
        starting = true;
    }
    // 执行启动逻辑...
}
```

这个例子体现了不同并发模型对编程范式的影响。
:::

## interrupt vs volatile 对比

| 特性 | interrupt 方式 | volatile 方式 |
|------|---------------|--------------|
| 停止信号 | 中断标志 | 自定义 boolean 标志 |
| 可见性保证 | JVM 保证 | volatile 保证 |
| 打断阻塞 | 自动打断 sleep/wait/join | 需要额外调用 interrupt |
| 异常处理 | 需要捕获 InterruptedException | 不涉及中断异常 |
| 语义清晰度 | 专门用于中断 | 更灵活，语义自定义 |
| 适用场景 | 标准的线程中断 | 需要自定义停止逻辑 |

::: warning 选择建议
- **优先使用 interrupt 方式**：这是 Java 标准的线程中断机制，语义明确
- **使用 volatile 方式的场景**：
  - 需要多个停止条件
  - 需要区分不同的停止原因
  - 不希望抛出 InterruptedException
:::

## 总结

**两阶段终止模式**：
- **目的**：优雅地停止线程，确保清理工作完成
- **两个阶段**：发出停止信号 → 检测信号并执行清理

**实现方式**：
1. **interrupt 方式**：使用 Java 标准中断机制，语义清晰
2. **volatile 方式**：使用自定义标志，更灵活但需要手动处理

**Balking 模式**：
- 检查对象状态，不符合预期时直接返回
- 用于避免重复操作，提高性能