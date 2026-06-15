# volatile 原理

`volatile` 的底层实现原理是**内存屏障**（Memory Barrier），也称为内存栅栏（Memory Fence）。

**内存屏障的作用**：
- 对 `volatile` 变量的**写指令后**会加入写屏障
- 对 `volatile` 变量的**读指令前**会加入读屏障

## 保证可见性

### 写屏障

**写屏障**（sfence）保证在该屏障之前的，对共享变量的改动，都同步到主存当中。

```java
public void actor2(I_Result r) {
    num = 2;
    ready = true;  // ready 是 volatile 赋值带写屏障
    // 写屏障
}
```

执行流程：
1. 执行 `num = 2`
2. 执行 `ready = true`（volatile 写）
3. **写屏障**：将 `num` 和 `ready` 的最新值同步到主存

这确保了在 `ready` 变为 `true` 之前，`num = 2` 的修改一定已经同步到主存。

### 读屏障

**读屏障**（lfence）保证在该屏障之后的，对共享变量的读取，加载的是主存中最新数据。

```java
public void actor1(I_Result r) {
    // 读屏障
    if (ready) {  // ready 是 volatile 读取带读屏障
        r.r1 = num + num;
    } else {
        r.r1 = 1;
    }
}
```

执行流程：
1. **读屏障**：清空工作内存中的缓存
2. 从主存读取 `ready` 的最新值
3. 从主存读取 `num` 的最新值

这确保了读取 `ready` 为 `true` 后，后续读取的 `num` 一定是最新值 2。

## 保证有序性

### 写屏障与重排序

**写屏障**会确保指令重排序时，不会将写屏障之前的代码排在写屏障之后。

```java
public void actor2(I_Result r) {
    num = 2;           // 不会被重排到写屏障之后
    ready = true;      // volatile 写
    // 写屏障
}
```

这保证了 `num = 2` 一定在 `ready = true` 之前执行。

### 读屏障与重排序

**读屏障**会确保指令重排序时，不会将读屏障之后的代码排在读屏障之前。

```java
public void actor1(I_Result r) {
    // 读屏障
    if (ready) {       // volatile 读
        r.r1 = num + num;  // 不会被重排到读屏障之前
    }
}
```

这保证了对 `num` 的读取一定在读取 `ready` 之后执行。

## volatile 不保证原子性

虽然 `volatile` 保证了可见性和有序性，但**不能保证原子性**（指令交错）。

### 问题示例

```java
volatile int count = 0;

// 多个线程执行
count++;  // 不是原子操作
```

尽管 `count` 被 `volatile` 修饰，多线程执行 `count++` 仍然会出现线程安全问题。

### 原因分析

`count++` 看似一条语句，但实际对应三条 JVM 字节码指令：

```
getstatic    count  // 读取 count 的值
iconst_1           // 准备常量 1
iadd               // 加法
putstatic    count  // 写回 count
```

**多线程交错执行示例**：

| 时刻 | 线程 A | 线程 B | count 值 |
|------|--------|--------|---------|
| t0 | | | 0 |
| t1 | getstatic (读到 0) | | 0 |
| t2 | | getstatic (读到 0) | 0 |
| t3 | iadd (计算得 1) | | 0 |
| t4 | | iadd (计算得 1) | 0 |
| t5 | putstatic (写入 1) | | 1 |
| t6 | | putstatic (写入 1) | 1 |

两个线程都执行了 `count++`，期望结果是 2，实际结果是 1。

### volatile 为什么不能解决

1. **写屏障的局限**：写屏障仅保证写操作之后的读能够读到最新结果，但不能保证读操作（另一个线程）不会在写操作之前执行
2. **有序性的范围**：有序性保证仅限于本线程内相关代码不被重排序，无法防止多线程间的指令交错
3. **可见性不等于原子性**：即使线程 A 的写入立即对线程 B 可见，但线程 B 可能已经读取了旧值并正在计算

::: tip 保证原子性
- **方案一**：多个操作需要保证整体原子性时使用 `synchronized`
- **方案二**：简单的计数操作优先使用 `AtomicInteger` 等原子类（性能更好）
:::

## double-checked locking

双重检查锁定（DCL，Double-Checked Locking）是一种常见的单例模式实现方式，但如果不使用 `volatile`，在多线程环境下会出现问题。

### 问题

以著名的懒汉式单例模式为例：

```java
public final class Singleton {
    private static Singleton instance;

    private Singleton() {}

    public static Singleton getInstance() {
        if (instance == null) {  // 第一次检查
        
            // 首次访问会同步加锁，而之后的使用没有 synchronized
            synchronized (Singleton.class) {
                if (instance == null) {  // 第二次检查
                    instance = new Singleton();
                }
            }
        }

        return instance;
    }
}
```

**特点**：
- 懒惰实例化：只有首次调用 `getInstance()` 时才创建实例
- 首次使用 `getInstance()` 才使用 `synchronized` 加锁，后续使用无需加锁
- 但有隐患：第一个 `if` 使用了 `instance` 变量，是在同步块之外

::: warning 问题根源
`instance = new Singleton()` 并不是一个原子操作，它包含三个步骤：分配内存、初始化对象、赋值引用。这三个步骤可能发生指令重排序。
:::

### 分析

在多线程环境下，上面代码是有问题的。

#### 字节码分析

分析 `getInstance` 方法对应的字节码：

```
0: getstatic     #2                  // 获取 instance
3: ifnonnull     37                  // 如果不为 null，跳转到 37
6: ldc           #3                  // 获取 Class 对象
8: dup
9: astore_0
10: monitorenter                      // 进入同步块
11: getstatic     #2                  // 再次获取 instance
14: ifnonnull     27                  // 如果不为 null，跳转到 27
17: new           #3                  // 创建对象 - 分配内存
20: dup
21: invokespecial #4                  // 调用构造方法
24: putstatic     #2                  // 赋值给 instance
27: aload_0
28: monitorexit                       // 退出同步块
29: goto          37
32: astore_1
33: aload_0
34: monitorexit
35: aload_1
36: athrow
37: getstatic     #2                  // 返回 instance
40: areturn
```

关键在于第 17-24 行，`instance = new Singleton()` 对应的字节码：

```
17: new           #3                  // 1. 分配内存空间，返回对象引用（此时对象未初始化）
20: dup                               // 2. 复制栈顶引用（一份用于构造，一份用于赋值）
21: invokespecial #4                  // 3. 调用构造方法初始化对象（消耗一个引用）
24: putstatic     #2                  // 4. 将剩余引用赋值给 instance 变量
```

#### 指令重排序问题

JVM 和 CPU 可能会将第 21 行和第 24 行重排序：

```
17: new           #3                  // 分配内存
20: dup                               // 复制引用
24: putstatic     #2                  // 先赋值给 instance（对象未初始化！）
21: invokespecial #4                  // 后调用构造方法
```

重排序后，对象创建的实际执行顺序变为：
1. **分配内存空间**（new）
2. **将未初始化的引用赋值给 instance**（putstatic）← 此时 instance != null 但对象未初始化
3. **调用构造方法初始化对象**（invokespecial）

这种重排序在单线程下是安全的（对象最终都会被正确初始化），因此 JVM 认为这是合法的优化。但在**多线程环境**下会导致严重问题：

| 时刻 | 线程 A（持有锁） | 线程 B（在锁外） |
|------|--------|--------|
| t1 | 执行到 `instance = new Singleton()` | |
| t2 | 执行 new：分配内存 | |
| t3 | 执行 putstatic：instance 指向未初始化对象 | |
| t4 | | 执行第一个 `if (instance == null)` |
| t5 | | 发现 `instance != null`，直接返回 |
| t6 | | **使用未初始化的对象，出错！**|
| t7 | 执行 invokespecial：完成对象初始化 | |
| t8 | 退出同步块 | |

**问题根源**：
- 线程 A 在同步块内，重排序后先将引用赋值给 `instance`，再初始化对象
- 线程 B 在同步块外读取 `instance`，发现不为 null 就直接返回
- 线程 B 拿到的是一个未初始化完成的对象，可能导致空指针异常或读取到错误的字段值

::: details 思考题：synchronized 已经保证了有序性，为什么 DCL 还会出现问题？（点击展开）

**synchronized 的有序性机制**：

synchronized 通过 **happens-before 规则**保证有序性，而不是禁止重排序：
- **规则**：一个线程的 `monitorexit` happens-before 另一个线程对同一锁的 `monitorenter`
- **含义**：线程 A 在 synchronized 块内的所有操作，对后续获取同一锁的线程 B 都是可见且有序的
- **关键**：synchronized **不禁止同步块内部的指令重排序**，只要这种重排序不被其他持有锁的线程观察到即可

---

**对比：全部保护 vs 部分保护**

**全部被 synchronized 保护**（安全）：

```java
private static Singleton instance;

public static Singleton getInstance() {
    synchronized (Singleton.class) {  // 所有访问都在锁内
        if (instance == null) {
            instance = new Singleton();
        }
        return instance;
    }
}
```

**为什么安全**：
- 所有线程都必须先获取锁才能读/写 `instance`
- 都能享受 happens-before 保证
- 即使块内部发生重排序（先赋值后初始化），其他线程也看不到中间状态，因为它们必须等待锁释放

---

**部分被 synchronized 保护**（不安全 - DCL）：

```java
private static Singleton instance;

public static Singleton getInstance() {
    if (instance == null) {              // 读取在锁外！
        synchronized (Singleton.class) {  // 写入在锁内
            if (instance == null) {
                instance = new Singleton();
            }
        }
    }
    return instance;                     // 读取在锁外！
}
```

**为什么不安全**：
- 第一次读取 `instance` 绕过了锁，无法享受 happens-before 保证
- 线程 A 在锁内执行赋值时发生重排序（先赋值后初始化）
- 线程 B 在锁外直接读取 `instance`，可能读到未初始化的对象

---

**核心要点**：

synchronized 保证的是"持有同一锁的线程之间"的有序性。DCL 的致命问题在于：第一次检查 `if (instance == null)` 在锁外执行，绕过了 synchronized 的保护，无法享受 happens-before 规则的保证。

:::

### 解决

**Java 5 以后的解决方案**：使用 `volatile` 修饰 `instance`，禁止指令重排序。

```java
public final class Singleton {
    private static volatile Singleton instance;  // 使用 volatile

    private Singleton() {}

    public static Singleton getInstance() {
        if (instance == null) {
            synchronized (Singleton.class) {
                if (instance == null) {
                    instance = new Singleton();
                }
            }
        }
        
        return instance;
    }
}
```

**volatile 的作用**：
- 写屏障确保：对象的构造方法执行完成后，才会将引用赋值给 `instance`
- 读屏障确保：读取 `instance` 时，能看到完全初始化的对象

这样就避免了指令重排序导致的问题。

::: tip 其他方案
除了 DCL，还有其他线程安全的单例实现方式：
1. **饿汉式**：类加载时就创建实例（简单但不支持懒加载）
2. **静态内部类**：利用类加载机制保证线程安全（推荐）
3. **枚举单例**：最简洁且天然线程安全（推荐）
:::

## happens-before

happens-before 是 Java 内存模型中的核心概念，用于描述操作之间的可见性保证。

### 定义

如果操作 A happens-before 操作 B，那么：
- **操作 A 的结果对操作 B 可见**
- **操作 A 在时间上先于操作 B 发生**（逻辑上的先后关系，不是物理时钟）

::: tip 注意
happens-before 不是指时间上的先后顺序，而是指一种**可见性保证**：如果 A happens-before B，那么 A 的执行结果必须对 B 可见。
:::

### volatile 的 happens-before 规则

**规则**：对一个 volatile 变量的写操作 happens-before 后续对这个 volatile 变量的读操作。

```java
volatile boolean ready = false;
int num = 0;

// 线程 A
num = 42;        // 1
ready = true;    // 2: volatile 写

// 线程 B
if (ready) {     // 3: volatile 读
    int result = num;  // 4: 一定能看到 num = 42
}
```

**happens-before 链**：
1. 操作 1 happens-before 操作 2（程序顺序规则）
2. 操作 2 happens-before 操作 3（volatile 规则）
3. 操作 3 happens-before 操作 4（程序顺序规则）
4. 根据传递性：操作 1 happens-before 操作 4

**结论**：线程 A 中 volatile 写之前的所有操作，对线程 B 在 volatile 读之后的所有操作都可见。

### 常见的 happens-before 规则

1. **程序顺序规则**：
   - 单线程内，按照代码顺序，前面的操作 happens-before 后续的操作

2. **锁规则**：
   - 对一个锁的解锁 happens-before 后续对这个锁的加锁
   ```java
   synchronized (lock) {  // 线程 A
       x = 1;
   }  // 解锁

   synchronized (lock) {  // 线程 B 后续加锁
       int y = x;  // 能看到 x = 1
   }
   ```

3. **volatile 规则**：
   - 对 volatile 变量的写 happens-before 后续对这个变量的读

4. **传递性**：
   - 如果 A happens-before B，B happens-before C，则 A happens-before C

5. **线程启动规则**：
   - `Thread.start()` happens-before 线程中的任何操作
   ```java
   int x = 0;
   x = 42;
   thread.start();  // start() 之前的操作对线程可见
   ```

6. **线程终止规则**：
   - 线程中的所有操作 happens-before 其他线程从 `Thread.join()` 返回
   ```java
   thread.start();
   // 线程中: x = 42;
   thread.join();
   int y = x;  // 能看到 x = 42
   ```

7. **线程中断规则**：
   - 对线程 `interrupt()` 的调用 happens-before 被中断线程检测到中断事件

8. **对象终结规则**：
   - 对象的构造函数结束 happens-before 该对象的 `finalize()` 方法开始

### 总结

happens-before 规则是 Java 内存模型提供的**可见性保证机制**：
- volatile 通过 happens-before 规则保证可见性和有序性
- synchronized 通过 happens-before 规则保证可见性、有序性和原子性
- 理解 happens-before 是理解 Java 并发编程的关键