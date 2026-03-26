# 线程常见方法

## 一、线程启动与执行

| 方法名  | static | 功能说明 | 备注 |
| ------- | ------ | ------- | ----- |
| start() | ❌ | 启动线程，创建新执行路径 | start只是让线程进入就绪状态，里面代码不一定执行。只能调用一次，会自动调用 run() |
| run()   | ❌  | 线程执行逻辑 | 普通方法调用，不会创建新线程   |

### start() vs run()

```java
Thread t = new Thread(() -> {
    System.out.println("线程执行：" + Thread.currentThread().getName());
});

// 正确：启动新线程
t.start();  // 输出：线程执行：Thread-0

// 错误：在当前线程中执行
t.run();    // 输出：线程执行：main
```

::: warning 注意
`start()` 方法只能调用一次，重复调用会抛出 `IllegalThreadStateException`。
:::

## 二、线程等待与调度控制

| 方法名   | static | 功能说明 | 备注 |
| ------ | ------ | ------| ------ |
| join() | ❌ | 等待目标线程执行结束 | 当前线程进入 WAITING  |
| join(long millis)  | ❌ | 等待指定时间  | 进入TIMED_WAITING，超时返回 |
| sleep(long millis) | ✅| 当前线程休眠一段时间 | 不释放锁（重点）|
| yield()   | ✅  | 提示调度器让出 CPU   | 不保证生效  |

### join() - 等待线程结束

```java
Thread t1 = new Thread(() -> {
    try {
        Thread.sleep(1000);
        System.out.println("t1 执行完毕");
    } catch (InterruptedException e) {
        e.printStackTrace();
    }
});

t1.start();
t1.join();  // 主线程等待 t1 执行完毕
System.out.println("主线程继续执行");
```

### sleep() - 线程休眠

```java
// 休眠 1 秒
Thread.sleep(1000);

// 休眠期间可以被中断
try {
    Thread.sleep(5000);
} catch (InterruptedException e) {
    System.out.println("休眠被中断");
}
```

::: tip sleep() 特点
- 不会释放已持有的锁
- 休眠时间到后进入就绪状态，等待 CPU 调度
- 可以被 `interrupt()` 中断，抛出 `InterruptedException`
:::

## 三、线程中断机制（核心）

| 方法名| static | 功能说明  | 备注   |
| -------- | ------ | --------| ------ |
| interrupt() | ❌ | 中断线程（设置中断标志） | 不会强制停止线程 |
| interrupted()   | ✅      | 判断当前线程是否被中断   | 会清除中断标志   |
| isInterrupted() | ❌      | 判断线程是否被中断       | 不清除标志       |

### 中断机制示例

```java
Thread t = new Thread(() -> {
    while (!Thread.currentThread().isInterrupted()) {
        System.out.println("线程运行中...");
    }
    System.out.println("线程被中断，退出");
});

t.start();
Thread.sleep(100);
t.interrupt();  // 设置中断标志
```

### interrupted() vs isInterrupted()

```java
Thread t = new Thread(() -> {
    // isInterrupted() - 不清除标志
    System.out.println(Thread.currentThread().isInterrupted());  // true
    System.out.println(Thread.currentThread().isInterrupted());  // true

    // interrupted() - 清除标志
    System.out.println(Thread.interrupted());  // true
    System.out.println(Thread.interrupted());  // false
});
```

::: warning 中断不是强制停止
`interrupt()` 只是设置中断标志，线程需要自己检查并响应中断。如果线程正在 `sleep()`、`wait()` 或 `join()`，会抛出 `InterruptedException`。
:::

## 四、线程状态与生命周期

| 方法名     | static | 功能说明         | 备注                                  |
| ---------- | ------ | ---------------- | ------------------------------------- |
| getState() | ❌      | 获取线程当前状态 | java中用enum表示线程状态，NEW / RUNNABLE / BLOCKED / WAITING / TIMED_WAITING / TERMINATED|
| isAlive()  | ❌      | 判断线程是否存活 | 启动后未结束为 true                   |

### 线程状态示例

```java
Thread t = new Thread(() -> {
    try {
        Thread.sleep(1000);
    } catch (InterruptedException e) {
        e.printStackTrace();
    }
});

System.out.println(t.getState());  // NEW
t.start();
System.out.println(t.getState());  // RUNNABLE
System.out.println(t.isAlive());   // true
```

## 五、线程基本信息

| 方法名          | static | 功能说明         | 备注                   |
| --------------- | ------ | ---------------- | ---------------------- |
| getId()         | ❌      | 获取线程唯一 ID  | JVM 层唯一标识         |
| getName()       | ❌      | 获取线程名称     | 常用于日志             |
| setName(String) | ❌      | 设置线程名称     | 便于调试               |
| currentThread() | ✅      | 获取当前线程对象 | 常用于定位当前执行线程 |

### 线程命名示例

```java
Thread t = new Thread(() -> {
    System.out.println("当前线程：" + Thread.currentThread().getName());
    System.out.println("线程 ID：" + Thread.currentThread().getId());
}, "MyThread");

t.start();  // 输出：当前线程：MyThread
```

## 六、线程调度相关

| 方法名           | static | 功能说明       | 备注           |
| ---------------- | ------ | -------------- | -------------- |
| getPriority()    | ❌      | 获取线程优先级 | 范围 1~10      |
| setPriority(int) | ❌      | 设置线程优先级 | 仅作为调度建议 |

### 线程优先级示例

```java
Thread t1 = new Thread(() -> {
    System.out.println("t1 优先级：" + Thread.currentThread().getPriority());
});

Thread t2 = new Thread(() -> {
    System.out.println("t2 优先级：" + Thread.currentThread().getPriority());
});

t1.setPriority(Thread.MIN_PRIORITY);   // 1
t2.setPriority(Thread.MAX_PRIORITY);   // 10

t1.start();
t2.start();
```

::: tip 优先级说明
- 默认优先级：`Thread.NORM_PRIORITY = 5`
- 最小优先级：`Thread.MIN_PRIORITY = 1`
- 最大优先级：`Thread.MAX_PRIORITY = 10`
- 优先级只是给调度器的建议，不保证高优先级一定先执行
:::
