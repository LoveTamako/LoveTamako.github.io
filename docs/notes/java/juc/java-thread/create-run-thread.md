# 创建和使用线程

## Thread

```java
// 创建线程对象
Thread t = new Thread(){
    @Override
    public void run(){
        // 线程执行任务
    }
};

// 启动线程
t.start();
```

## Runnable

```java
// 创建线程对象
Runnable r = new Runnable(){
    @Override
    public void run(){
        // 线程执行任务
    }
};

Thread t = new Thread( runnable );
// 启动线程
t.start();
```

java8后，`Runnable`作为**函数式接口**还可以使用lambda精简代码

```java
// 创建线程对象
Runnable r = () -> { // 线程执行任务 };

Thread t = new Thread( runnable );
// 启动线程
t.start();
```

::: tip 推荐
Runnable 将“任务”与“线程”解耦：
- 更易与线程池等高级 API 集成
- 避免继承 Thread，提高类的独立性

因此在实际开发中更推荐使用 Runnable。
:::

## FutureTask

FutureTask能够接收`Callable`类型的参数，用来处理有返回结果的情况

```java
// 创建任务对象
FutureTask<Interger> task = new FutureTask<>(() -> {
    return 100;
});

new Thread(task).start();

// 阻塞获取执行结果
log.debug("{}", task.get());
```

