# 原子数组

原子整数和原子引用只能保护单个变量。当需要保护数组中的元素时，Java 提供了原子数组类。

## 为什么需要原子数组

普通数组即使声明为 `volatile`，也只能保证数组引用的可见性，无法保证数组元素的原子性：

```java
private volatile int[] arr = new int[10];

// 多线程执行以下操作不是线程安全的
arr[0]++;  // 读取-修改-写入，非原子操作
```

**原子数组类**：
- `AtomicIntegerArray`：原子整型数组
- `AtomicLongArray`：原子长整型数组
- `AtomicReferenceArray`：原子引用数组

## AtomicIntegerArray

### 基本使用

```java
import java.util.concurrent.atomic.AtomicIntegerArray;

public class AtomicArrayExample {
    public static void main(String[] args) throws InterruptedException {
        AtomicIntegerArray arr = new AtomicIntegerArray(10);

        // 10 个线程并发修改数组的第 0 个元素
        for (int i = 0; i < 10; i++) {
            new Thread(() -> {
                arr.getAndIncrement(0);  // 线程安全地自增
            }).start();
        }

        Thread.sleep(1000);
        System.out.println(arr.get(0));  // 10
    }
}
```

### 常用方法

```java
AtomicIntegerArray arr = new AtomicIntegerArray(10);

// 获取指定位置的值
int value = arr.get(0);

// 设置指定位置的值
arr.set(0, 100);

// 获取并自增（i++）
arr.getAndIncrement(0);

// 自增并获取（++i）
arr.incrementAndGet(0);

// 获取并加值
arr.getAndAdd(0, 5);

// CAS 操作
arr.compareAndSet(0, 100, 200);  // 期望值为 100 时更新为 200

// 获取并更新
arr.getAndUpdate(0, x -> x * 2);

// 更新并获取
arr.updateAndGet(0, x -> x + 10);

// 获取并计算
arr.getAndAccumulate(0, 10, (x, y) -> x + y);
```

**方法规律**：
- 所有方法的第一个参数都是**索引**
- 其他参数和返回值与 `AtomicInteger` 类似

### 应用场景

**场景：统计多线程访问次数**

```java
public class AccessCounter {
    // 10 个资源的访问计数器
    private AtomicIntegerArray counters = new AtomicIntegerArray(10);

    // 记录对资源 i 的访问
    public void recordAccess(int resourceId) {
        counters.incrementAndGet(resourceId);
    }

    // 获取资源 i 的访问次数
    public int getAccessCount(int resourceId) {
        return counters.get(resourceId);
    }

    // 获取总访问次数
    public int getTotalAccess() {
        int total = 0;
        for (int i = 0; i < counters.length(); i++) {
            total += counters.get(i);
        }
        return total;
    }
}
```

## 与普通数组对比

### 不安全示例

```java
// 普通数组 + 10 个线程并发修改
int[] arr = new int[10];

for (int i = 0; i < 10; i++) {
    new Thread(() -> {
        for (int j = 0; j < 1000; j++) {
            arr[0]++;  // 非线程安全
        }
    }).start();
}

Thread.sleep(1000);
System.out.println(arr[0]);  // 结果小于 10000（数据丢失）
```

### 安全示例

```java
// 原子数组 + 10 个线程并发修改
AtomicIntegerArray arr = new AtomicIntegerArray(10);

for (int i = 0; i < 10; i++) {
    new Thread(() -> {
        for (int j = 0; j < 1000; j++) {
            arr.incrementAndGet(0);  // 线程安全
        }
    }).start();
}

Thread.sleep(1000);
System.out.println(arr.get(0));  // 10000（数据正确）
```

::: warning 注意
原子数组只能保护数组元素的原子性，如果需要保护整个数组的操作（如扩容、整体赋值），仍需要额外的同步机制。
:::

## AtomicReferenceArray

`AtomicReferenceArray` 用于原子地更新引用类型数组的元素。

### 使用示例

```java
import java.util.concurrent.atomic.AtomicReferenceArray;

class Task {
    String name;
    int status;

    Task(String name, int status) {
        this.name = name;
        this.status = status;
    }

    @Override
    public String toString() {
        return name + "(" + status + ")";
    }
}

public class AtomicReferenceArrayExample {
    public static void main(String[] args) {
        // 创建原子引用数组
        AtomicReferenceArray<Task> tasks = new AtomicReferenceArray<>(10);

        // 初始化任务
        tasks.set(0, new Task("Task-A", 0));

        // 线程安全地更新任务
        Task oldTask = tasks.get(0);
        Task newTask = new Task("Task-B", 1);

        boolean success = tasks.compareAndSet(0, oldTask, newTask);
        System.out.println("更新成功: " + success);
        System.out.println("当前任务: " + tasks.get(0));
    }
}
```

### 应用场景

**场景：任务队列状态管理**

```java
public class TaskQueue {
    static class Task {
        String id;
        volatile String status;  // PENDING, RUNNING, COMPLETED

        Task(String id) {
            this.id = id;
            this.status = "PENDING";
        }
    }

    private AtomicReferenceArray<Task> queue;

    public TaskQueue(int size) {
        this.queue = new AtomicReferenceArray<>(size);
    }

    // 提交任务
    public boolean submitTask(int index, Task task) {
        return queue.compareAndSet(index, null, task);
    }

    // 启动任务（从 PENDING 改为 RUNNING）
    public boolean startTask(int index) {
        Task task = queue.get(index);
        if (task == null || !task.status.equals("PENDING")) {
            return false;
        }

        Task runningTask = new Task(task.id);
        runningTask.status = "RUNNING";

        return queue.compareAndSet(index, task, runningTask);
    }

    // 完成任务
    public boolean completeTask(int index) {
        Task task = queue.get(index);
        if (task == null || !task.status.equals("RUNNING")) {
            return false;
        }

        Task completedTask = new Task(task.id);
        completedTask.status = "COMPLETED";

        return queue.compareAndSet(index, task, completedTask);
    }
}
```

## 底层原理

原子数组通过**计算元素偏移量**来定位元素，然后使用 Unsafe 类进行 CAS 操作。

**核心实现**：

```java
// AtomicIntegerArray 内部实现（简化）
public class AtomicIntegerArray {
    private final int[] array;
    private static final Unsafe unsafe = Unsafe.getUnsafe();
    private static final int base = unsafe.arrayBaseOffset(int[].class);
    private static final int shift;

    static {
        int scale = unsafe.arrayIndexScale(int[].class);
        shift = 31 - Integer.numberOfLeadingZeros(scale);
    }

    // 计算元素的内存偏移量
    private long checkedByteOffset(int i) {
        if (i < 0 || i >= array.length)
            throw new IndexOutOfBoundsException("index " + i);
        return byteOffset(i);
    }

    private static long byteOffset(int i) {
        return ((long) i << shift) + base;
    }

    // CAS 操作
    public final boolean compareAndSet(int i, int expect, int update) {
        return unsafe.compareAndSwapInt(array, checkedByteOffset(i), expect, update);
    }
}
```

**关键步骤**：
1. **获取数组基地址**：`arrayBaseOffset()` 返回数组第一个元素的内存地址偏移
2. **计算元素偏移**：`index * 元素大小 + 基地址`
3. **CAS 操作**：使用 Unsafe 的 `compareAndSwapInt()` 直接操作内存

## 性能考虑

**与加锁对比**：

```java
// 方案 1：使用 synchronized
int[] arr = new int[10];
synchronized (this) {
    arr[0]++;
}

// 方案 2：使用原子数组
AtomicIntegerArray arr = new AtomicIntegerArray(10);
arr.incrementAndGet(0);
```

**性能特点**：
- **低竞争场景**：原子数组性能优于加锁（无阻塞）
- **高竞争场景**：原子数组会频繁自旋，消耗 CPU
- **批量操作**：如果需要原子地修改多个元素，加锁可能更合适

::: tip 使用建议
- 单个元素的高频更新 → `AtomicIntegerArray`
- 多个元素的原子操作 → 使用锁
- 读多写少的场景 → 原子数组有明显优势
:::

## 对比总结

| 类型 | 保护内容 | 线程安全 | 适用场景 |
|------|----------|----------|----------|
| 普通数组 | 无 | ❌ | 单线程或不可变数据 |
| `volatile` 数组 | 数组引用 | ❌（元素不安全） | 数组引用的可见性 |
| 加锁数组 | 数组元素 | ✅ | 批量操作、高竞争 |
| 原子数组 | 数组元素 | ✅ | 单元素操作、低竞争 |

**选择建议**：
- 保护单个元素的原子操作 → 原子数组
- 需要原子地操作多个元素 → 加锁
- 需要保护数组引用本身 → `AtomicReference<int[]>`