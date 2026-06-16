# 原子整数

Java 并发包提供了基于 CAS 的原子类，可以在无锁情况下保证线程安全。原子整数类包括：

- `AtomicInteger`：原子整型
- `AtomicLong`：原子长整型
- `AtomicBoolean`：原子布尔型

## 常用方法

以 `AtomicInteger` 为例，常用方法如下：

```java
AtomicInteger i = new AtomicInteger(0);

// 获取并自增（i = 0, 结果 i = 1, 返回 0），类似 i++
i.getAndIncrement();

// 自增并获取（i = 1, 结果 i = 2, 返回 2），类似 ++i
i.incrementAndGet();

// 获取并自减（i = 2, 结果 i = 1, 返回 2），类似 i--
i.getAndDecrement();

// 自减并获取（i = 1, 结果 i = 0, 返回 0），类似 --i
i.decrementAndGet();

// 获取并加值（i = 0, 结果 i = 5, 返回 0），类似 i += 5 但返回旧值
i.getAndAdd(5);

// 加值并获取（i = 5, 结果 i = 10, 返回 10），类似 i += 5
i.addAndGet(5);

// 获取并更新（传入函数式接口）
i.getAndUpdate(x -> x * 10);

// 更新并获取（传入函数式接口）
i.updateAndGet(x -> x * 10);

// 获取并计算（传入值和二元运算）
i.getAndAccumulate(10, (x, y) -> x + y);

// 计算并获取（传入值和二元运算）
i.accumulateAndGet(10, (x, y) -> x + y);
```

**方法规律**：
- `getAndXxx`：先返回旧值，再进行操作
- `xxxAndGet`：先进行操作，再返回新值

## updateAndGet

### 原理

`updateAndGet` 接收一个函数式接口 `IntUnaryOperator`，通过 CAS + 自旋实现原子更新。

**源码实现**：

```java
public final int updateAndGet(IntUnaryOperator updateFunction) {
    int prev, next;
    do {
        prev = get();                        // 读取当前值
        next = updateFunction.applyAsInt(prev);  // 计算新值
    } while (!compareAndSet(prev, next));    // CAS 更新，失败则重试
    return next;
}
```

**执行流程**：
1. 读取当前值 `prev`
2. 调用函数计算新值 `next = updateFunction(prev)`
3. CAS 尝试更新：如果当前值仍为 `prev`，则更新为 `next`
4. 失败则自旋重试，直到成功
5. 返回新值

### 使用示例

**案例：账户余额扣减**

```java
AtomicInteger balance = new AtomicInteger(1000);

// 扣减 500，但余额不能为负
balance.updateAndGet(current -> {
    int newBalance = current - 500;
    return newBalance >= 0 ? newBalance : current;
});

System.out.println(balance.get());  // 500

// 再次扣减 800，余额不足
balance.updateAndGet(current -> {
    int newBalance = current - 800;
    return newBalance >= 0 ? newBalance : current;
});

System.out.println(balance.get());  // 500（未扣减）
```

**案例：限制范围更新**

```java
AtomicInteger score = new AtomicInteger(50);

// 增加分数，但不超过 100
score.updateAndGet(current -> Math.min(current + 60, 100));
System.out.println(score.get());  // 100

// 减少分数，但不低于 0
score.updateAndGet(current -> Math.max(current - 120, 0));
System.out.println(score.get());  // 0
```

**多线程安全性**：

```java
AtomicInteger counter = new AtomicInteger(0);

// 100 个线程并发更新
for (int i = 0; i < 100; i++) {
    new Thread(() -> {
        counter.updateAndGet(x -> x + 1);  // 线程安全
    }).start();
}

Thread.sleep(1000);
System.out.println(counter.get());  // 100
```

::: tip 使用场景
`updateAndGet` 适合需要基于当前值进行复杂计算的场景，如条件更新、范围限制、业务规则校验等。
:::
