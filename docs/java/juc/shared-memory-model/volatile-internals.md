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

### volatile 不保证原子性

虽然 `volatile` 保证了可见性和有序性，但**不能保证原子性**（指令交错）。

```java
volatile int count = 0;

// 多个线程执行
count++;  // 不是原子操作
```

**原因**：
- 写屏障仅保证之后的读能够读到最新结果，但不能保证读跑到它前面去
- 有序性的保证也只是保证了本线程内相关代码不会被重排序
- `count++` 分为三步：读取、加 1、写回，多线程下会发生指令交错

::: warning 注意
对于需要原子性的操作（如 `i++`），应使用 `synchronized` 或 `AtomicInteger`。
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
            synchronized (Singleton.class) {
                // 首次访问会同步，而之后的使用没有 synchronized
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

### 分析

在多线程环境下，上面代码是有问题的。

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

**关键问题**：第 17 行和第 21 行的指令可能发生重排序。

`instance = new Singleton()` 实际分为三步：
1. **分配内存空间**
2. **调用构造方法**，初始化对象
3. **将 instance 引用指向内存空间**

由于指令重排序，可能变为：
1. **分配内存空间**
2. **将 instance 引用指向内存空间**（此时对象还未初始化）
3. **调用构造方法**，初始化对象

**并发问题**：

| 时刻 | 线程 A | 线程 B |
|------|--------|--------|
| t1 | 执行到 `instance = new Singleton()` | |
| t2 | 分配内存，instance 指向内存（但对象未初始化） | |
| t3 | | 执行 `if (instance == null)` |
| t4 | | 发现 `instance != null`，直接返回 |
| t5 | | 使用未初始化完成的对象，出错！|
| t6 | 调用构造方法，完成初始化 | |

线程 B 拿到的是一个未初始化完成的对象，可能导致空指针异常或其他错误。

### 解决

使用 `volatile` 修饰 `instance`，禁止指令重排序：

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