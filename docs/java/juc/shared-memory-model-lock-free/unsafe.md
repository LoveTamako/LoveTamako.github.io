# Unsafe

`Unsafe` 是 Java 底层 API，提供了直接操作内存、线程和 CAS 的能力。名称中的 "unsafe" 并非指线程不安全，而是指绕过 JVM 安全检查，直接操作底层资源。

## 基本介绍

### 获取 Unsafe 实例

`Unsafe` 类的构造方法是私有的，只能通过反射获取：

```java
import sun.misc.Unsafe;
import java.lang.reflect.Field;

public class UnsafeAccessor {
    private static Unsafe unsafe;

    static {
        try {
            // 获取 Unsafe 类的 theUnsafe 静态字段
            Field theUnsafe = Unsafe.class.getDeclaredField("theUnsafe");
            // 绕过访问控制检查
            theUnsafe.setAccessible(true);
            // 获取静态字段的值（null 表示静态字段）
            unsafe = (Unsafe) theUnsafe.get(null);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public static Unsafe getUnsafe() {
        return unsafe;
    }
}
```

::: warning 注意
`Unsafe` 属于 JDK 内部 API（`sun.misc` 包），不推荐在生产环境直接使用。Java 9+ 中需要添加 `--add-opens` 参数才能访问。
:::

### 主要功能

`Unsafe` 提供了以下核心能力：

- **CAS 操作**：`compareAndSwapInt`、`compareAndSwapLong`、`compareAndSwapObject`
- **内存操作**：直接分配、读写堆外内存
- **对象操作**：绕过构造方法创建对象
- **字段操作**：直接读写对象字段（绕过访问控制）
- **线程调度**：`park`、`unpark` 实现线程阻塞与唤醒

## CAS 操作

`Unsafe` 提供了底层的 CAS 方法，这是 Java 原子类的基础。

### 核心方法

```java
public final native boolean compareAndSwapInt(
    Object o,        // 对象
    long offset,     // 字段内存偏移量
    int expected,    // 期望值
    int newValue     // 新值
);

public final native boolean compareAndSwapLong(
    Object o, long offset, long expected, long newValue
);

public final native boolean compareAndSwapObject(
    Object o, long offset, Object expected, Object newValue
);
```

**参数说明**：
- `o`：要修改的对象
- `offset`：字段在对象内存中的偏移量
- `expected`：期望的旧值
- `newValue`：要设置的新值

### 获取字段偏移量

使用 `objectFieldOffset` 获取字段的内存地址偏移：

```java
class Data {
    volatile int value;
}

// 获取 value 字段在对象内存中的偏移量
Field field = Data.class.getDeclaredField("value");
long offset = unsafe.objectFieldOffset(field);
```

### 使用示例

```java
import sun.misc.Unsafe;
import java.lang.reflect.Field;

public class UnsafeCASExample {
    private static Unsafe unsafe;
    // volatile 保证多线程可见性
    private volatile int count = 0;
    // count 字段在对象内存中的偏移量
    private static long countOffset;

    static {
        try {
            // 获取 Unsafe 实例
            Field theUnsafe = Unsafe.class.getDeclaredField("theUnsafe");
            theUnsafe.setAccessible(true);
            unsafe = (Unsafe) theUnsafe.get(null);

            // 计算 count 字段的内存偏移量
            countOffset = unsafe.objectFieldOffset(
                UnsafeCASExample.class.getDeclaredField("count")
            );
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public void increment() {
        int current;
        do {
            // 读取当前值
            current = count;
            // CAS 更新：如果 count 仍为 current，则更新为 current + 1
            // 失败则自旋重试
        } while (!unsafe.compareAndSwapInt(this, countOffset, current, current + 1));
    }

    public int getCount() {
        return count;
    }

    public static void main(String[] args) throws InterruptedException {
        UnsafeCASExample example = new UnsafeCASExample();

        // 10 个线程各自增 1000 次
        Thread[] threads = new Thread[10];
        for (int i = 0; i < 10; i++) {
            threads[i] = new Thread(() -> {
                for (int j = 0; j < 1000; j++) {
                    example.increment();
                }
            });
            threads[i].start();
        }

        // 等待所有线程完成
        for (Thread thread : threads) {
            thread.join();
        }

        System.out.println("最终结果: " + example.getCount());  // 10000
    }
}
```

**执行流程**：
1. 读取 `count` 当前值
2. 调用 `compareAndSwapInt` 尝试更新
3. 失败则重试（自旋），直到成功

## 模拟实现原子整数

使用 `Unsafe` 手动实现一个类似 `AtomicInteger` 的原子整数类。

### 实现代码

```java
import sun.misc.Unsafe;
import java.lang.reflect.Field;

public class MyAtomicInteger {
    private static final Unsafe unsafe;
    // value 字段在对象内存中的偏移量
    private static final long valueOffset;

    // volatile 保证多线程可见性
    private volatile int value;

    static {
        try {
            // 获取 Unsafe 实例
            Field theUnsafe = Unsafe.class.getDeclaredField("theUnsafe");
            theUnsafe.setAccessible(true);
            unsafe = (Unsafe) theUnsafe.get(null);

            // 获取 value 字段的内存偏移量（只计算一次，提高性能）
            valueOffset = unsafe.objectFieldOffset(
                MyAtomicInteger.class.getDeclaredField("value")
            );
        } catch (Exception e) {
            throw new Error(e);
        }
    }

    public MyAtomicInteger(int initialValue) {
        this.value = initialValue;
    }

    public final int get() {
        return value;
    }

    public final void set(int newValue) {
        value = newValue;
    }

    // CAS 操作：比较并交换
    public final boolean compareAndSet(int expect, int update) {
        return unsafe.compareAndSwapInt(this, valueOffset, expect, update);
    }

    // 先返回旧值，再自增（类似 i++）
    public final int getAndIncrement() {
        int current;
        do {
            current = value;
            // CAS 失败则自旋重试
        } while (!compareAndSet(current, current + 1));
        return current;
    }

    // 先自增，再返回新值（类似 ++i）
    public final int incrementAndGet() {
        int current, next;
        do {
            current = value;
            next = current + 1;
        } while (!compareAndSet(current, next));
        return next;
    }

    // 先返回旧值，再加上 delta
    public final int getAndAdd(int delta) {
        int current;
        do {
            current = value;
        } while (!compareAndSet(current, current + delta));
        return current;
    }

    // 先加上 delta，再返回新值
    public final int addAndGet(int delta) {
        int current, next;
        do {
            current = value;
            next = current + delta;
        } while (!compareAndSet(current, next));
        return next;
    }
}
```

### 测试代码

```java
public class MyAtomicIntegerTest {
    public static void main(String[] args) throws InterruptedException {
        MyAtomicInteger counter = new MyAtomicInteger(0);

        // 5 个线程各自增 2000 次，验证线程安全性
        Thread[] threads = new Thread[5];
        for (int i = 0; i < 5; i++) {
            threads[i] = new Thread(() -> {
                for (int j = 0; j < 2000; j++) {
                    counter.incrementAndGet();
                }
            });
            threads[i].start();
        }

        // 等待所有线程完成
        for (Thread thread : threads) {
            thread.join();
        }

        System.out.println("最终计数: " + counter.get());  // 10000
    }
}
```

### 关键点

**1. volatile 保证可见性**：

```java
private volatile int value;
```

确保线程读取到的是最新值，配合 CAS 实现线程安全。

**2. 自旋重试**：

```java
do {
    current = value;
} while (!compareAndSet(current, current + 1));
```

CAS 失败时不阻塞，而是重新读取并重试。

**3. 偏移量计算**：

```java
valueOffset = unsafe.objectFieldOffset(
    MyAtomicInteger.class.getDeclaredField("value")
);
```

在静态块中初始化，只计算一次，提高性能。

## 原理对比

### AtomicInteger 实现

`AtomicInteger` 的底层实现与上述代码类似：

```java
public class AtomicInteger {
    private static final Unsafe unsafe = Unsafe.getUnsafe();
    private static final long valueOffset;

    static {
        try {
            // 计算 value 字段的内存偏移量
            valueOffset = unsafe.objectFieldOffset(
                AtomicInteger.class.getDeclaredField("value")
            );
        } catch (Exception ex) { throw new Error(ex); }
    }

    private volatile int value;

    public final int incrementAndGet() {
        // JDK 8+ 封装了自旋重试逻辑
        return unsafe.getAndAddInt(this, valueOffset, 1) + 1;
    }
}
```

**`getAndAddInt` 方法**（JDK 8+）：

```java
public final int getAndAddInt(Object o, long offset, int delta) {
    int v;
    do {
        // 以 volatile 方式读取当前值，保证可见性
        v = getIntVolatile(o, offset);
        // CAS 更新，失败则自旋重试
    } while (!compareAndSwapInt(o, offset, v, v + delta));
    return v;
}
```

与我们的实现逻辑一致：读取 → CAS 更新 → 失败重试。

### 对比总结

| 特性 | 手动实现 | AtomicInteger |
|------|----------|---------------|
| 核心方法 | `compareAndSwapInt` | `getAndAddInt` |
| 自旋重试 | 手动实现 | 封装在 `getAndAddInt` 中 |
| 字段修饰 | `volatile` | `volatile` |
| 偏移量 | 手动计算 | 静态初始化 |

::: tip 学习价值
通过手动实现原子类，可以深入理解：
- CAS 的底层原理
- volatile 与 CAS 的配合
- 自旋重试的实现方式
- 原子类的设计思想
:::

## Unsafe 的其他应用

### 1. 直接内存操作

```java
// 分配 1024 字节的堆外内存
long address = unsafe.allocateMemory(1024);

// 向指定地址写入整数
unsafe.putInt(address, 42);

// 从指定地址读取整数
int value = unsafe.getInt(address);

// 释放内存（避免内存泄漏）
unsafe.freeMemory(address);
```

### 2. 线程调度

```java
// 阻塞当前线程
LockSupport.park();   // 底层调用 unsafe.park()

// 唤醒指定线程
LockSupport.unpark(thread);  // 底层调用 unsafe.unpark()
```

### 3. 数组操作

```java
// 获取 int 数组首元素的内存偏移量
int baseOffset = unsafe.arrayBaseOffset(int[].class);

// 获取 int 数组元素之间的间隔（通常为 4 字节）
int scale = unsafe.arrayIndexScale(int[].class);

// 计算指定索引元素的内存偏移量
long offset = baseOffset + index * scale;
```

::: warning 使用建议
- `Unsafe` 是 JDK 内部 API，不建议在生产代码中直接使用
- 优先使用 `java.util.concurrent.atomic` 包中的原子类
- 如需直接内存操作，考虑使用 `java.nio.ByteBuffer.allocateDirect()`
- 线程调度使用 `LockSupport` 而非直接调用 `unsafe.park()`
:::