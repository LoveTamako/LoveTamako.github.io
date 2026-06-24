# 任务调度线程池

Java 提供了两种任务调度机制：Timer 和 ScheduledThreadPoolExecutor。前者是传统的单线程调度工具，后者是基于线程池的现代化实现，已经取代了 Timer。

## Timer

Timer 是 JDK 1.3 引入的任务调度工具，使用单线程执行所有定时任务。

::: warning 不推荐使用
在现代 Java 开发中，Timer 已被 ScheduledThreadPoolExecutor 取代，不推荐在新项目中使用。
:::

**基本用法**：

```java
Timer timer = new Timer();

// 延迟 1 秒后执行
timer.schedule(new TimerTask() {
    @Override
    public void run() {
        System.out.println("延时任务执行");
    }
}, 1000);

// 延迟 1 秒，每隔 2 秒执行一次
timer.schedule(new TimerTask() {
    @Override
    public void run() {
        System.out.println("定时任务执行");
    }
}, 1000, 2000);
```

**主要缺陷**：

### 1. 单线程串行执行

所有任务共享一个线程，任务之间相互影响。

```java
Timer timer = new Timer();

// 任务1：耗时 3 秒
timer.schedule(new TimerTask() {
    @Override
    public void run() {
        System.out.println("任务1 开始：" + LocalTime.now());
        try {
            Thread.sleep(3000);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
        System.out.println("任务1 结束：" + LocalTime.now());
    }
}, 0);

// 任务2：本应 1 秒后执行，实际被阻塞
timer.schedule(new TimerTask() {
    @Override
    public void run() {
        System.out.println("任务2 执行：" + LocalTime.now());
    }
}, 1000);

// 输出：
// 任务1 开始：10:00:00
// 任务1 结束：10:00:03
// 任务2 执行：10:00:03  （被延迟了 2 秒）
```

### 2. 异常导致线程终止

任何一个任务抛出异常，整个 Timer 线程终止，后续任务都无法执行。

```java
Timer timer = new Timer();

// 任务1：抛出异常
timer.schedule(new TimerTask() {
    @Override
    public void run() {
        System.out.println("任务1 执行");
        throw new RuntimeException("任务1 异常");
    }
}, 1000);

// 任务2：永远不会执行
timer.schedule(new TimerTask() {
    @Override
    public void run() {
        System.out.println("任务2 执行");
    }
}, 2000);

// 输出：
// 任务1 执行
// Exception in thread "Timer-0" java.lang.RuntimeException: 任务1 异常
// （任务2 不会执行）
```

### 3. 基于绝对时间

Timer 使用 `Date` 作为调度依据，如果系统时间被修改，会影响任务执行。

```java
// 使用绝对时间调度
timer.schedule(task, new Date(System.currentTimeMillis() + 10000));

// 如果系统时间被调整，任务执行时间会受影响
```

## ScheduledThreadPoolExecutor

ScheduledThreadPoolExecutor 继承自 ThreadPoolExecutor，专门用于定时任务和周期性任务的执行。

**特点**：
- 使用 `DelayedWorkQueue` 优先级队列，按延迟时间排序
- 基于相对时间（纳秒），不受系统时间影响
- 多线程并发执行，任务互不影响
- 单个任务异常不影响其他任务

### 创建调度线程池

**构造方法**：

```java
public ScheduledThreadPoolExecutor(int corePoolSize) {
    super(corePoolSize, Integer.MAX_VALUE,
          0, NANOSECONDS,
          new DelayedWorkQueue());
}

public ScheduledThreadPoolExecutor(
    int corePoolSize,
    ThreadFactory threadFactory
) { ... }

public ScheduledThreadPoolExecutor(
    int corePoolSize,
    RejectedExecutionHandler handler
) { ... }
```

**使用 Executors 工厂方法**：

```java
// 创建固定线程数的调度线程池
ScheduledExecutorService scheduler =
    Executors.newScheduledThreadPool(5);

// 创建单线程的调度线程池
ScheduledExecutorService scheduler =
    Executors.newSingleThreadScheduledExecutor();
```

**推荐配置**：

```java
// 自定义线程工厂和拒绝策略
ThreadFactory factory = new ThreadFactoryBuilder()
    .setNameFormat("scheduled-%d")
    .setUncaughtExceptionHandler((t, e) ->
        logger.error("定时任务异常", e))
    .build();

ScheduledExecutorService scheduler = new ScheduledThreadPoolExecutor(
    5,  // 核心线程数
    factory,
    new ThreadPoolExecutor.CallerRunsPolicy()
);
```

### 延时执行

使用 `schedule()` 方法提交一次性延时任务。

```java
ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);

// 延迟 1 秒后执行（无返回值）
scheduler.schedule(() -> {
    System.out.println("延时任务执行：" + LocalTime.now());
}, 1, TimeUnit.SECONDS);

// 延迟 2 秒后执行（有返回值）
ScheduledFuture<String> future = scheduler.schedule(() -> {
    System.out.println("延时任务执行：" + LocalTime.now());
    return "任务结果";
}, 2, TimeUnit.SECONDS);

// 获取结果
String result = future.get();
```

**方法签名**：

```java
// 提交 Runnable 任务
ScheduledFuture<?> schedule(
    Runnable command,
    long delay,
    TimeUnit unit
);

// 提交 Callable 任务
<V> ScheduledFuture<V> schedule(
    Callable<V> callable,
    long delay,
    TimeUnit unit
);
```

### 定时执行

ScheduledThreadPoolExecutor 提供了两种周期性任务执行方式。

#### scheduleAtFixedRate（固定频率）

按固定的频率执行任务，不考虑任务执行时间。

```java
ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);

// 初始延迟 1 秒，之后每隔 2 秒执行一次
scheduler.scheduleAtFixedRate(() -> {
    System.out.println("任务执行：" + LocalTime.now());
    try {
        Thread.sleep(500);  // 任务耗时 0.5 秒
    } catch (InterruptedException e) {
        e.printStackTrace();
    }
}, 1, 2, TimeUnit.SECONDS);

// 输出：
// 任务执行：10:00:01
// 任务执行：10:00:03  （间隔 2 秒）
// 任务执行：10:00:05  （间隔 2 秒）
```

**执行规律**：

```
任务开始时间：
T0 + initialDelay
T0 + initialDelay + period
T0 + initialDelay + 2 * period
...
```

**任务耗时超过周期**：

```java
scheduler.scheduleAtFixedRate(() -> {
    System.out.println("任务开始：" + LocalTime.now());
    Thread.sleep(3000);  // 任务耗时 3 秒
    System.out.println("任务结束：" + LocalTime.now());
}, 0, 2, TimeUnit.SECONDS);  // 周期 2 秒

// 输出：
// 任务开始：10:00:00
// 任务结束：10:00:03
// 任务开始：10:00:03  （立即开始，无间隔）
// 任务结束：10:00:06
```

任务执行时间超过周期时，下次任务会在当前任务结束后立即执行。

#### scheduleWithFixedDelay（固定延迟）

任务执行完成后，等待固定时间再执行下一次。

```java
ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);

// 初始延迟 1 秒，每次执行完成后等待 2 秒
scheduler.scheduleWithFixedDelay(() -> {
    System.out.println("任务执行：" + LocalTime.now());
    try {
        Thread.sleep(500);  // 任务耗时 0.5 秒
    } catch (InterruptedException e) {
        e.printStackTrace();
    }
}, 1, 2, TimeUnit.SECONDS);

// 输出：
// 任务执行：10:00:01
// 任务执行：10:00:03.5  （0.5秒任务 + 2秒延迟）
// 任务执行：10:00:06    （0.5秒任务 + 2秒延迟）
```

**执行规律**：

```
任务开始时间：
T0 + initialDelay
T0 + initialDelay + 任务耗时 + delay
T0 + initialDelay + 2 * 任务耗时 + 2 * delay
...
```

#### 两种方式对比

| 特性 | `scheduleAtFixedRate` | `scheduleWithFixedDelay` |
|------|---------------------|------------------------|
| **调度基准** | 任务开始时间 | 任务结束时间 |
| **间隔计算** | 固定周期 | 任务耗时 + 固定延迟 |
| **任务超时** | 立即执行下次任务 | 等待固定延迟后执行 |
| **适用场景** | 需要精确控制执行频率 | 需要确保任务间有间隔 |

**方法签名**：

```java
// 固定频率
ScheduledFuture<?> scheduleAtFixedRate(
    Runnable command,
    long initialDelay,    // 初始延迟
    long period,          // 执行周期
    TimeUnit unit
);

// 固定延迟
ScheduledFuture<?> scheduleWithFixedDelay(
    Runnable command,
    long initialDelay,    // 初始延迟
    long delay,           // 执行间隔
    TimeUnit unit
);
```

### 异常处理

周期性任务中的异常会导致后续任务不再执行。

```java
ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);

scheduler.scheduleAtFixedRate(() -> {
    System.out.println("任务执行：" + LocalTime.now());
    if (LocalTime.now().getSecond() % 10 == 0) {
        throw new RuntimeException("任务异常");
    }
}, 0, 1, TimeUnit.SECONDS);

// 当异常抛出后，后续任务不再执行
```

**最佳实践**：任务内部捕获所有异常

```java
scheduler.scheduleAtFixedRate(() -> {
    try {
        // 业务逻辑
        performTask();
    } catch (Exception e) {
        logger.error("定时任务执行失败", e);
        // 异常处理，不影响下次执行
    }
}, 0, 1, TimeUnit.SECONDS);
```

## 应用 - 定时任务

ScheduledThreadPoolExecutor 虽然不直接支持基于日历的调度（如"每周四18点"），但可以通过计算延迟时间实现。

**案例：每周四18点生成周报**

```java
public class WeeklyReportTask {
    private final ScheduledExecutorService scheduler;

    public WeeklyReportTask() {
        this.scheduler = Executors.newScheduledThreadPool(1);
        scheduleNextExecution();
    }

    private void scheduleNextExecution() {
        long delay = calculateDelayToNextThursday18();

        scheduler.schedule(() -> {
            try {
                // 执行任务
                generateWeeklyReport();

                // 任务完成后，调度下次执行
                scheduleNextExecution();
            } catch (Exception e) {
                System.err.println("周报生成失败: " + e.getMessage());
                // 失败后仍然调度下次执行
                scheduleNextExecution();
            }
        }, delay, TimeUnit.MILLISECONDS);

        System.out.println("已调度下次执行，延迟: " + delay / 1000 / 60 + " 分钟");
    }

    private long calculateDelayToNextThursday18() {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime nextRun = now
            .with(TemporalAdjusters.nextOrSame(DayOfWeek.THURSDAY))
            .withHour(18)
            .withMinute(0)
            .withSecond(0)
            .withNano(0);

        // 如果今天是周四但已经过了18点，或者现在就是周四18点之后，则调度到下周四
        if (nextRun.isBefore(now) || nextRun.isEqual(now)) {
            nextRun = nextRun.plusWeeks(1);
        }

        return Duration.between(now, nextRun).toMillis();
    }

    private void generateWeeklyReport() {
        System.out.println("开始生成周报: " + LocalDateTime.now());
        // 实际的周报生成逻辑
        // 1. 收集本周数据
        // 2. 生成报表
        // 3. 发送邮件通知
        System.out.println("周报生成完成");
    }

    public void shutdown() {
        scheduler.shutdown();
    }
}
```

**使用示例**：

```java
public static void main(String[] args) {
    WeeklyReportTask task = new WeeklyReportTask();

    // 应用退出时关闭
    Runtime.getRuntime().addShutdownHook(new Thread(task::shutdown));
}
```

**核心要点**：

1. **计算延迟**：使用 `TemporalAdjusters.nextOrSame()` 找到下个周四，设置为18:00
2. **递归调度**：任务执行完成后，调用 `scheduleNextExecution()` 再次调度
3. **异常安全**：即使任务失败，也会继续调度下次执行

::: tip 其他定时场景
- **每天凌晨2点**：`nextRun = now.plusDays(1).withHour(2).withMinute(0)`
- **每月1号9点**：`nextRun = now.with(TemporalAdjusters.firstDayOfNextMonth()).withHour(9)`
- **工作日早上9点**：判断 `DayOfWeek`，跳过周末
:::

::: warning 生产环境建议
在实际开发中，不建议自己使用 ScheduledThreadPoolExecutor 实现定时任务，而应使用成熟的框架和组件：

**推荐方案**：
- **Spring 的 `@Scheduled` 注解**：简单易用，支持 Cron 表达式
- **Quartz**：功能强大，支持集群、持久化、复杂调度规则
- **XXL-JOB**：分布式任务调度平台，提供管理界面、执行日志、失败重试等
- **ElasticJob**：分布式调度解决方案，支持分片、弹性扩容

**原因**：
- 成熟框架提供了完善的任务管理、监控、失败重试机制
- 支持 Cron 表达式，无需手动计算时间
- 分布式环境下提供任务去重、负载均衡等能力
- 减少重复造轮子，降低维护成本

上述案例仅用于理解 ScheduledThreadPoolExecutor 的工作原理和使用方式。
:::

## 最佳实践

1. **使用 ScheduledThreadPoolExecutor 替代 Timer**
   - Timer 是单线程，存在任务相互阻塞和异常传播问题
   - ScheduledThreadPoolExecutor 支持多线程并发，更加健壮

2. **任务内部必须捕获所有异常**
   - 周期性任务抛出异常会导致后续任务不再执行
   - 始终在任务内部使用 try-catch 包裹业务逻辑

3. **根据任务特性选择调度方式**
   - `scheduleAtFixedRate`：适合需要精确控制执行频率的场景
   - `scheduleWithFixedDelay`：适合需要确保任务间有固定间隔的场景

4. **合理设置线程池大小**
   - 根据任务数量和执行时间设置核心线程数
   - 避免任务堆积导致内存溢出

5. **及时关闭调度线程池**
   - 应用退出时调用 `shutdown()` 或 `shutdownNow()`
   - 使用 `awaitTermination()` 等待任务完成

6. **生产环境优先使用成熟框架**
   - Spring `@Scheduled`、Quartz、XXL-JOB 等
   - 提供更完善的管理、监控和容错能力
