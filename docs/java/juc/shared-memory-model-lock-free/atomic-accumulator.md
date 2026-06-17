# 原子累加器

在高并发累加场景下，`AtomicLong` 的性能可能成为瓶颈。Java 8 引入了性能更高的累加器：

- `LongAdder`：长整型累加器
- `LongAccumulator`：长整型累加器（支持自定义运算）
- `DoubleAdder`：双精度浮点累加器
- `DoubleAccumulator`：双精度浮点累加器（支持自定义运算）

## 累加器性能比较

### 性能测试

```java
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.LongAdder;

public class PerformanceTest {
    public static void main(String[] args) throws InterruptedException {
        // 测试 AtomicLong
        AtomicLong atomicLong = new AtomicLong(0);
        long start1 = System.currentTimeMillis();

        for (int i = 0; i < 10; i++) {
            new Thread(() -> {
                for (int j = 0; j < 1000000; j++) {
                    atomicLong.incrementAndGet();
                }
            }).start();
        }

        Thread.sleep(2000);
        long end1 = System.currentTimeMillis();
        System.out.println("AtomicLong 耗时: " + (end1 - start1) + "ms");

        // 测试 LongAdder
        LongAdder longAdder = new LongAdder();
        long start2 = System.currentTimeMillis();

        for (int i = 0; i < 10; i++) {
            new Thread(() -> {
                for (int j = 0; j < 1000000; j++) {
                    longAdder.increment();
                }
            }).start();
        }

        Thread.sleep(2000);
        long end2 = System.currentTimeMillis();
        System.out.println("LongAdder 耗时: " + (end2 - start2) + "ms");
    }
}
```

**性能对比**：
- **低竞争场景**：两者性能接近
- **高竞争场景**：`LongAdder` 性能显著优于 `AtomicLong`（约 3-5 倍）

**AtomicLong 的性能瓶颈**：

```java
// AtomicLong 的 incrementAndGet 实现
public final long incrementAndGet() {
    return unsafe.getAndAddLong(this, valueOffset, 1L) + 1L;
}

// CAS 自旋
public final long getAndAddLong(Object o, long offset, long delta) {
    long v;
    do {
        v = getLongVolatile(o, offset);
    } while (!compareAndSwapLong(o, offset, v, v + delta));
    return v;
}
```

高竞争下的问题：
1. 多线程竞争同一个 `value` 变量
2. CAS 失败后不断自旋重试
3. 大量线程自旋消耗 CPU

## 原理分析

`LongAdder` 的核心思想是**分段累加**，将单个热点分散到多个 `Cell` 中。

**内部结构**：

```java
// LongAdder 继承自 Striped64
abstract class Striped64 {
    transient volatile Cell[] cells;        // 分散热点的数组

    transient volatile long base;           // 基础值

    transient volatile int cellsBusy;       // 自旋锁标记
}
```

- `cells`：`Cell` 数组，用于分散竞争
- `base`：基础值，低竞争时直接累加到 `base`
- `cellsBusy`：自旋锁，用于保护 `cells` 数组的初始化和扩容

### cas锁

`cellsBusy` 是一个自旋锁，用于保护 `cells` 数组的创建、扩容和初始化操作。

**CAS 实现 cellsBusy 锁**：

```java
// 加锁：尝试将 cellsBusy 从 0 改为 1
final boolean casCellsBusy() {
    return UNSAFE.compareAndSwapInt(this, CELLSBUSY, 0, 1);
}

// 使用示例
if (cellsBusy == 0 && casCellsBusy()) {
    try {
        // 临界区：初始化或扩容 cells 数组
        if (cells == null) {
            Cell[] rs = new Cell[2];
            rs[0] = new Cell(x);
            cells = rs;
        }
    } finally {
        cellsBusy = 0;  // 释放锁
    }
}
```

**锁的特点**：
- 0 表示未加锁，1 表示已加锁
- 使用 CAS 操作保证只有一个线程获得锁
- 释放锁时直接赋值为 0（无需 CAS）

### 缓存行伪共享

**CPU 缓存行机制**：

- CPU 缓存以缓存行（Cache Line）为单位，通常为 64 字节
- 多个变量可能位于同一缓存行
- 一个线程修改变量会导致其他线程的缓存行失效（MESI 协议）

**伪共享问题**：

```java
class Counter {
    volatile long x;  // 8 字节
    volatile long y;  // 8 字节 - 可能与 x 在同一缓存行
}
```

当线程 1 修改 `x` 时，即使线程 2 只读取 `y`，其缓存行也会失效，导致性能下降。

**LongAdder 的解决方案**：

```java
@sun.misc.Contended  // 防止伪共享
static final class Cell {
    volatile long value;

    Cell(long x) { value = x; }

    final boolean cas(long cmp, long val) {
        return UNSAFE.compareAndSwapLong(this, valueOffset, cmp, val);
    }
}
```

**@Contended 注解**：
- 在 `Cell` 对象前后填充缓存行（128 字节）
- 确保每个 `Cell` 独占缓存行
- 避免多个 `Cell` 之间的伪共享

### 源码分析

#### add

`add` 方法是累加的核心入口，采用**分层策略**：

```java
public void add(long x) {
    Cell[] as; long b, v; int m; Cell a;

    // 条件 1: cells != null（已初始化）
    // 条件 2: casBase 失败（竞争出现）
    if ((as = cells) != null || !casBase(b = base, b + x)) {
        boolean uncontended = true;

        // 条件 3: cells 为 null 或长度为 0
        // 条件 4: 当前线程的 Cell 为 null
        // 条件 5: CAS 更新 Cell 失败
        if (as == null || (m = as.length - 1) < 0 ||
            (a = as[getProbe() & m]) == null ||
            !(uncontended = a.cas(v = a.value, v + x)))
            longAccumulate(x, null, uncontended);
    }
}
```

**执行流程**：

```
add(x)
  │
  ├─ cells != null? ──否─→ CAS更新base
  │                        │
  │                        ├─ 成功 ──→ 返回
  │                        └─ 失败 ──→ 进入分散累加
  │
  └─ 是 ──→ 进入分散累加
            │
            ├─ cells为null或长度为0? ──是─→ longAccumulate
            │
            ├─ 当前线程的Cell为null? ──是─→ longAccumulate
            │
            └─ CAS更新Cell
                 │
                 ├─ 成功 ──→ 返回
                 └─ 失败 ──→ longAccumulate
```

**getProbe() 方法**：

```java
// 获取线程的哈希值
static final int getProbe() {
    return UNSAFE.getInt(Thread.currentThread(), PROBE);
}
```

通过线程哈希值和数组长度取模，将线程映射到不同的 `Cell`。

#### longAccumulate

`longAccumulate` 处理高竞争场景，包括初始化、扩容和重试逻辑：

```java
final void longAccumulate(long x, LongBinaryOperator fn, boolean wasUncontended) {
    int h;
    if ((h = getProbe()) == 0) {
        ThreadLocalRandom.current();  // 强制初始化
        h = getProbe();
        wasUncontended = true;
    }

    boolean collide = false;  // 是否发生冲突

    for (;;) {
        Cell[] as; Cell a; int n; long v;

        // 情况 1: cells 已初始化
        if ((as = cells) != null && (n = as.length) > 0) {
            // 分支 1.1: 当前 Cell 为 null，需要创建
            if ((a = as[(n - 1) & h]) == null) {
                if (cellsBusy == 0) {
                    Cell r = new Cell(x);
                    if (cellsBusy == 0 && casCellsBusy()) {
                        try {
                            Cell[] rs; int m, j;
                            if ((rs = cells) != null &&
                                (m = rs.length) > 0 &&
                                rs[j = (m - 1) & h] == null) {
                                rs[j] = r;
                                break;
                            }
                        } finally {
                            cellsBusy = 0;
                        }
                        continue;
                    }
                }
                collide = false;
            }
            // 分支 1.2: CAS 已知失败，重新计算哈希
            else if (!wasUncontended)
                wasUncontended = true;
            // 分支 1.3: 尝试 CAS 更新 Cell
            else if (a.cas(v = a.value, (fn == null) ? v + x : fn.applyAsLong(v, x)))
                break;
            // 分支 1.4: 数组已扩容或达到 CPU 核心数
            else if (n >= NCPU || cells != as)
                collide = false;
            // 分支 1.5: 设置冲突标记
            else if (!collide)
                collide = true;
            // 分支 1.6: 扩容数组
            else if (cellsBusy == 0 && casCellsBusy()) {
                try {
                    if (cells == as) {
                        Cell[] rs = new Cell[n << 1];  // 扩容为 2 倍
                        for (int i = 0; i < n; ++i)
                            rs[i] = as[i];
                        cells = rs;
                    }
                } finally {
                    cellsBusy = 0;
                }
                collide = false;
                continue;
            }
            h = advanceProbe(h);  // 重新计算哈希
        }
        // 情况 2: cells 未初始化，尝试加锁初始化
        else if (cellsBusy == 0 && cells == as && casCellsBusy()) {
            try {
                if (cells == as) {
                    Cell[] rs = new Cell[2];
                    rs[h & 1] = new Cell(x);
                    cells = rs;
                    break;
                }
            } finally {
                cellsBusy = 0;
            }
        }
        // 情况 3: 加锁失败，回退到 base
        else if (casBase(v = base, (fn == null) ? v + x : fn.applyAsLong(v, x)))
            break;
    }
}
```

**关键逻辑**：

```
longAccumulate(x)
  │
  ├─ cells已初始化?
  │   │
  │   ├─ 是 ──→ 当前Cell为null?
  │   │         │
  │   │         ├─ 是 ──→ 获取cellsBusy锁 ──→ 创建新Cell ──→ 返回
  │   │         │
  │   │         └─ 否 ──→ wasUncontended?
  │   │                   │
  │   │                   ├─ 否 ──→ 重新计算哈希 ──→ 重试
  │   │                   │
  │   │                   └─ 是 ──→ CAS更新Cell
  │   │                             │
  │   │                             ├─ 成功 ──→ 返回
  │   │                             │
  │   │                             └─ 失败 ──→ 数组已达CPU核心数?
  │   │                                         │
  │   │                                         ├─ 是 ──→ 重新计算哈希 ──→ 重试
  │   │                                         │
  │   │                                         └─ 否 ──→ 已标记冲突?
  │   │                                                   │
  │   │                                                   ├─ 否 ──→ 标记冲突 ──→ 重试
  │   │                                                   │
  │   │                                                   └─ 是 ──→ 获取锁 ──→ 扩容2倍 ──→ 重试
  │   │
  │   └─ 否 ──→ 获取cellsBusy锁成功?
  │             │
  │             ├─ 是 ──→ 初始化长度为2的cells数组 ──→ 返回
  │             │
  │             └─ 否 ──→ CAS更新base
  │                       │
  │                       ├─ 成功 ──→ 返回
  │                       └─ 失败 ──→ 重试
```

**流程说明**：

1. **Cell 为 null**：创建新 `Cell` 并放入数组
2. **CAS 失败**：重新计算哈希值，映射到其他 `Cell`
3. **冲突严重**：扩容 `cells` 数组（最大为 CPU 核心数）
4. **初始化**：首次创建长度为 2 的 `cells` 数组
5. **回退**：加锁失败时，回退到 `base` 累加

**sum() 实现**：

```java
public long sum() {
    Cell[] as = cells; Cell a;
    long sum = base;
    if (as != null) {
        for (int i = 0; i < as.length; ++i) {
            if ((a = as[i]) != null)
                sum += a.value;
        }
    }
    return sum;
}
```

累加所有 `Cell` 和 `base` 的值，但不保证原子性。

::: warning 注意
`sum()` 方法不是原子操作，在累加过程中其他线程可能修改值，导致结果不精确。`LongAdder` 适合统计场景，不适合需要精确实时值的场景。
:::

## 对比总结

| 特性 | AtomicLong | LongAdder |
|------|------------|-----------|
| 原理 | 单变量 CAS | 分段 CAS |
| 性能（低竞争） | 高 | 高 |
| 性能（高竞争） | 低（自旋） | 高（分散热点） |
| 内存占用 | 少 | 多（Cell 数组） |
| 获取值 | `get()` 精确 | `sum()` 非原子 |
| 适用场景 | ID 生成、计数器 | 高并发统计 |

**选择建议**：
- 需要精确实时值 → `AtomicLong`
- 高并发累加统计 → `LongAdder`
- 自定义累加运算 → `LongAccumulator`