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

> Runnable将线程和任务分开，更容易与线程池等高级api配合，同时让任务类脱离了Thread的继承体系，因此更加推荐使用Runnable

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

