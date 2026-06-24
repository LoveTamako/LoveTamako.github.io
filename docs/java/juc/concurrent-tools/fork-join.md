# ForkJoinPool

ForkJoinPool 是 JDK 1.7 引入的专用线程池，基于分治（Divide and Conquer）思想设计，特别适合处理可递归拆分的 CPU 密集型任务。它采用工作窃取（Work-Stealing）算法，实现了高效的任务调度和负载均衡。

## 设计思想

### 分治算法

分治算法将大任务拆分成多个小任务并行执行，最后合并结果。

**经典分治过程**：

```text
                 [原始任务]
                     ↓
          ┌──────────┴──────────┐
      [子任务1]              [子任务2]
          ↓                      ↓
     ┌────┴────┐            ┌────┴────┐
  [子任务1.1][子任务1.2]  [子任务2.1][子任务2.2]
     ↓      ↓               ↓      ↓
   [结果] [结果]          [结果] [结果]
     └────┬────┘            └────┬────┘
        [合并]                [合并]
          └──────────┬──────────┘
                  [最终结果]
```

**特点**：

- **Fork（拆分）**：将大任务递归拆分成足够小的子任务
- **Compute（计算）**：在子任务足够小时直接计算
- **Join（合并）**：等待子任务完成并合并结果

**适用场景**：

- 任务可以递归拆分成独立的子任务
- 子任务之间没有数据依赖
- CPU 密集型计算（如数组求和、归并排序、快速排序）

### 工作窃取算法

ForkJoinPool 使用工作窃取（Work-Stealing）算法优化任务调度。

**核心机制**：

```text
线程1: [任务1][任务2][任务3][任务4]  ← 队列尾部添加
        ↑ 从头部取任务               ↓ 线程1执行任务

线程2: [任务5][任务6]  ← 队列为空
        ↑ 从其他线程队列尾部窃取
        └──────────┐
                   ↓
线程1: [任务1][任务2][任务3]     ← 线程2窃取了任务4
```

**优势**：

1. **减少竞争**：每个线程有自己的双端队列（Deque）
2. **负载均衡**：空闲线程主动窃取其他线程的任务
3. **提高吞吐量**：充分利用 CPU 资源，减少线程空闲时间

**实现细节**：

- 工作线程从队列**头部**取任务（LIFO，利用缓存局部性）
- 窃取线程从队列**尾部**取任务（FIFO，减少竞争）
- 使用无锁算法（CAS）减少线程同步开销

## 核心 API

### ForkJoinTask

`ForkJoinTask` 是 ForkJoinPool 执行的任务基类，提供了 fork 和 join 方法。

**类层次结构**：

```text
ForkJoinTask (抽象类)
    ├── RecursiveTask<V>      // 有返回值的任务
    └── RecursiveAction       // 无返回值的任务
```

**核心方法**：

```java
// 拆分任务并异步执行
public final ForkJoinTask<V> fork();

// 等待任务完成并获取结果
public final V join();

// 直接在当前线程同步执行
public final V invoke();
```

### RecursiveTask

有返回值的递归任务，需要实现 `compute()` 方法。

**使用模板**：

```java
class MyTask extends RecursiveTask<Integer> {
    private int threshold; // 阈值，任务拆分的临界点

    @Override
    protected Integer compute() {
        if (任务足够小) {
            // 直接计算
            return 计算结果;
        } else {
            // 拆分任务
            MyTask task1 = new MyTask();
            MyTask task2 = new MyTask();

            // Fork：异步执行子任务
            task1.fork();
            task2.fork();

            // Join：等待结果并合并
            return task1.join() + task2.join();
        }
    }
}
```

### RecursiveAction

无返回值的递归任务，适合执行操作型任务（如数据处理、日志记录）。

```java
class MyAction extends RecursiveAction {
    @Override
    protected void compute() {
        if (任务足够小) {
            // 执行操作
            执行任务();
        } else {
            // 拆分任务
            MyAction action1 = new MyAction();
            MyAction action2 = new MyAction();

            invokeAll(action1, action2);  // 批量执行
        }
    }
}
```

## 使用示例

### 案例：数组求和

使用 ForkJoinPool 实现大数组的并行求和。

```java
public class SumTask extends RecursiveTask<Long> {
    private final long[] array;
    private final int start;
    private final int end;
    private static final int THRESHOLD = 10000;  // 阈值：1万个元素

    public SumTask(long[] array, int start, int end) {
        this.array = array;
        this.start = start;
        this.end = end;
    }

    @Override
    protected Long compute() {
        int length = end - start;

        // 任务足够小时，直接计算
        if (length <= THRESHOLD) {
            long sum = 0;
            for (int i = start; i < end; i++) {
                sum += array[i];
            }
            return sum;
        }

        // 拆分任务
        int middle = start + length / 2;
        SumTask leftTask = new SumTask(array, start, middle);
        SumTask rightTask = new SumTask(array, middle, end);

        // Fork：异步执行左右子任务
        leftTask.fork();
        rightTask.fork();

        // Join：等待结果并合并
        return leftTask.join() + rightTask.join();
    }

    public static void main(String[] args) {
        // 创建 1 亿个元素的数组
        long[] array = new long[100_000_000];
        for (int i = 0; i < array.length; i++) {
            array[i] = i + 1;
        }

        // 创建 ForkJoinPool
        ForkJoinPool pool = new ForkJoinPool();

        // 提交任务
        SumTask task = new SumTask(array, 0, array.length);
        long startTime = System.currentTimeMillis();
        Long result = pool.invoke(task);
        long endTime = System.currentTimeMillis();

        System.out.println("结果: " + result);
        System.out.println("耗时: " + (endTime - startTime) + "ms");
    }
}
```

**性能对比**：

```java
// 串行求和
long sum = 0;
for (long num : array) {
    sum += num;
}
// 耗时：约 80ms

// ForkJoinPool 并行求和（8核CPU）
ForkJoinPool pool = new ForkJoinPool();
Long result = pool.invoke(new SumTask(array, 0, array.length));
// 耗时：约 15ms

// 性能提升：约 5 倍
```

### 优化：invokeAll 批量执行

使用 `invokeAll()` 简化子任务的 fork 和 join 操作。

```java
@Override
protected Long compute() {
    int length = end - start;

    if (length <= THRESHOLD) {
        long sum = 0;
        for (int i = start; i < end; i++) {
            sum += array[i];
        }
        return sum;
    }

    int middle = start + length / 2;
    SumTask leftTask = new SumTask(array, start, middle);
    SumTask rightTask = new SumTask(array, middle, end);

    // 使用 invokeAll 替代 fork + join
    invokeAll(leftTask, rightTask);

    return leftTask.join() + rightTask.join();
}
```

**invokeAll 的优势**：

- 自动处理任务的 fork 和 join
- 代码更简洁清晰
- 适合批量执行多个子任务

### 案例：归并排序

使用 ForkJoinPool 实现并行归并排序。

```java
public class MergeSortTask extends RecursiveAction {
    private final int[] array;
    private final int start;
    private final int end;
    private static final int THRESHOLD = 1000;

    public MergeSortTask(int[] array, int start, int end) {
        this.array = array;
        this.start = start;
        this.end = end;
    }

    @Override
    protected void compute() {
        int length = end - start;

        // 任务足够小时，使用普通排序
        if (length <= THRESHOLD) {
            Arrays.sort(array, start, end);
            return;
        }

        // 拆分任务
        int middle = start + length / 2;
        MergeSortTask leftTask = new MergeSortTask(array, start, middle);
        MergeSortTask rightTask = new MergeSortTask(array, middle, end);

        // 并行执行排序
        invokeAll(leftTask, rightTask);

        // 合并结果
        merge(array, start, middle, end);
    }

    private void merge(int[] array, int start, int middle, int end) {
        int[] temp = new int[end - start];
        int i = start, j = middle, k = 0;

        while (i < middle && j < end) {
            temp[k++] = array[i] <= array[j] ? array[i++] : array[j++];
        }

        while (i < middle) temp[k++] = array[i++];
        while (j < end) temp[k++] = array[j++];

        System.arraycopy(temp, 0, array, start, temp.length);
    }
}
```

## ForkJoinPool 配置

### 创建线程池

**默认线程池**：

```java
// 使用公共线程池（推荐）
ForkJoinPool.commonPool();

// 线程数：Runtime.getRuntime().availableProcessors() - 1
```

**自定义线程池**：

```java
// 指定线程数
ForkJoinPool pool = new ForkJoinPool(8);

// 完整构造方法
ForkJoinPool pool = new ForkJoinPool(
    8,                                          // 并行度（线程数）
    ForkJoinPool.defaultForkJoinWorkerThreadFactory,  // 线程工厂
    null,                                       // 异常处理器
    false                                       // 是否异步模式
);
```

**参数说明**：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `parallelism` | 并行度，工作线程数量 | CPU 核心数 - 1 |
| `factory` | 线程工厂 | 默认工厂 |
| `handler` | 未捕获异常处理器 | null |
| `asyncMode` | 异步模式（FIFO vs LIFO） | false（LIFO） |

### 提交任务

ForkJoinPool 提供了多种任务提交方式：

```java
ForkJoinPool pool = new ForkJoinPool();

// 1. invoke：同步执行，等待结果
Integer result = pool.invoke(task);

// 2. submit：异步执行，返回 Future
Future<Integer> future = pool.submit(task);
Integer result = future.get();

// 3. execute：异步执行，无返回值
pool.execute(task);
```

**方法对比**：

| 方法 | 阻塞 | 返回值 | 适用场景 |
|------|------|--------|---------|
| `invoke()` | 是 | 直接返回结果 | 需要立即获取结果 |
| `submit()` | 否 | 返回 `Future` | 异步执行后获取结果 |
| `execute()` | 否 | 无 | 不关心结果的任务 |

## 最佳实践

### 1. 合理设置阈值

阈值过小会导致任务拆分过度，增加调度开销。

```java
// ❌ 阈值过小：过度拆分
private static final int THRESHOLD = 10;
// 1000个元素拆分成100个任务，调度开销大于并行收益

// ✅ 合理阈值：平衡拆分粒度
private static final int THRESHOLD = 10000;
// 1000万元素拆分成1000个任务，充分利用并行优势
```

**推荐经验值**：

- 数组操作：1000 - 10000 个元素
- 复杂计算：根据任务耗时动态调整
- 原则：任务执行时间 > 任务调度开销

### 2. 避免阻塞操作

ForkJoinPool 设计用于 CPU 密集型任务，避免在 compute() 中执行阻塞操作。

```java
// ❌ 错误：在 compute 中执行 I/O
@Override
protected Integer compute() {
    // 阻塞操作会占用工作线程，导致性能下降
    String data = readFromFile();
    return process(data);
}

// ✅ 正确：在外部完成 I/O，只在 compute 中计算
String data = readFromFile();
Integer result = pool.invoke(new ComputeTask(data));
```

**原因**：

- ForkJoinPool 线程数等于 CPU 核心数
- 阻塞操作会导致线程空闲，CPU 利用率下降
- 使用标准线程池处理 I/O 密集型任务

### 3. 使用公共线程池

JDK 8+ 推荐使用 `ForkJoinPool.commonPool()`。

```java
// ✅ 推荐：使用公共线程池
ForkJoinPool.commonPool().invoke(task);

// ❌ 不推荐：频繁创建线程池
for (int i = 0; i < 100; i++) {
    ForkJoinPool pool = new ForkJoinPool();  // 资源浪费
    pool.invoke(task);
    pool.shutdown();
}
```

**优势**：

- 避免创建多个线程池的开销
- 自动管理线程生命周期
- JVM 级别的资源共享

### 4. 优先使用 invokeAll

批量执行任务时，使用 `invokeAll()` 简化代码。

```java
// ❌ 繁琐写法
leftTask.fork();
rightTask.fork();
long leftResult = leftTask.join();
long rightResult = rightTask.join();

// ✅ 简洁写法
invokeAll(leftTask, rightTask);
long leftResult = leftTask.join();
long rightResult = rightTask.join();
```

### 5. 异常处理

ForkJoinTask 的异常处理机制：

```java
try {
    Integer result = pool.invoke(task);
} catch (Exception e) {
    // compute() 中的异常会传播到这里
    System.err.println("任务执行失败: " + e.getMessage());
}

// 或在 compute 中处理
@Override
protected Integer compute() {
    try {
        return 计算结果();
    } catch (Exception e) {
        // 记录日志
        logger.error("计算失败", e);
        return 默认值;
    }
}
```

## 与 ThreadPoolExecutor 对比

| 特性 | ForkJoinPool | ThreadPoolExecutor |
|------|-------------|-------------------|
| **设计目标** | CPU 密集型、可拆分任务 | 通用任务执行 |
| **任务类型** | `ForkJoinTask` | `Runnable`/`Callable` |
| **调度算法** | 工作窃取（Work-Stealing） | 队列调度 |
| **队列结构** | 每个线程有独立双端队列 | 全局共享队列 |
| **负载均衡** | 自动窃取任务 | 依赖任务分配 |
| **适用场景** | 递归分治、数组操作、排序 | I/O 操作、网络请求、数据库查询 |
| **线程数** | CPU 核心数 | 可配置 |

**选择建议**：

- **使用 ForkJoinPool**：任务可递归拆分、CPU 密集型计算
- **使用 ThreadPoolExecutor**：I/O 密集型、任务独立、无需拆分

## Stream 并行流

JDK 8 的并行流（Parallel Stream）底层使用 ForkJoinPool.commonPool()。

```java
// 并行流示例
long sum = LongStream.rangeClosed(1, 100_000_000)
    .parallel()                    // 启用并行流
    .sum();

// 等价于 ForkJoinPool
ForkJoinPool.commonPool().invoke(new SumTask(...));
```

**性能对比**：

```java
// 串行流
long sum = IntStream.range(0, 100_000_000)
    .sum();
// 耗时：约 80ms

// 并行流
long sum = IntStream.range(0, 100_000_000)
    .parallel()
    .sum();
// 耗时：约 15ms（8核CPU）
```

::: tip 并行流的优势
- 语法简洁，无需手动拆分任务
- 自动使用 ForkJoinPool 优化
- 适合简单的数组操作和聚合计算

但复杂场景下，手动使用 ForkJoinTask 可以更精细地控制任务拆分策略。
:::

::: warning 注意事项
1. **并行流不一定更快**：数据量小或任务简单时，并行开销可能大于收益
2. **有状态操作的风险**：`sorted()`、`distinct()` 等操作会降低并行效率
3. **线程安全问题**：确保 lambda 中的操作是线程安全的
:::

## 应用场景

### 适用场景

1. **大数组操作**：求和、查找、统计
2. **排序算法**：归并排序、快速排序
3. **矩阵运算**：矩阵乘法、转置
4. **递归算法**：斐波那契数列、树的遍历
5. **图像处理**：像素处理、滤镜应用

### 不适用场景

1. **I/O 密集型任务**：文件读写、网络请求
2. **任务不可拆分**：单一、不可分割的计算
3. **任务间有依赖**：需要顺序执行的任务
4. **阻塞操作**：数据库查询、锁等待

::: tip 性能优化建议
1. **选择合适的阈值**：平衡任务拆分粒度和调度开销
2. **避免过度拆分**：任务过小会导致调度开销大于并行收益
3. **使用 invokeAll**：批量执行任务，简化代码
4. **监控线程池状态**：使用 `getPoolSize()`、`getActiveThreadCount()` 等方法
5. **CPU 密集型优先**：确保任务是计算密集型而非 I/O 密集型
:::