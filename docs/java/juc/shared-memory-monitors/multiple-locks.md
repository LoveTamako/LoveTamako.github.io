# 多把锁

在并发编程中，合理使用多把锁可以**提高并发度**，减少线程间的竞争，从而提升系统性能。

::: warning 注意
使用多把锁时容易发生**死锁**问题，需要格外小心。
:::

## 为什么需要多把锁

当一个类中有多个互相独立的共享资源时，如果使用同一把锁来保护所有资源，会导致不必要的串行化执行，降低并发性能。

**单锁问题示例：**

```java
public class BigRoom {
    private int count1 = 0;  // 资源 1
    private int count2 = 0;  // 资源 2

    // 使用同一把锁保护两个独立资源
    public synchronized void operation1() {
        count1++;
    }

    public synchronized void operation2() {
        count2++;
    }
}
```

在上面的例子中，虽然 `count1` 和 `count2` 是完全独立的资源，但由于都使用 `this` 作为锁对象，导致操作 `count1` 和操作 `count2` 的线程也会互相阻塞，这是不必要的。

::: tip 核心思想
**将锁的粒度细分**：为互相独立的共享资源分配独立的锁，让不相关的操作可以并发执行。
:::

---

## 多把锁优化方案

通过为不同的资源分配不同的锁对象，可以提高并发度。

```java
public class BigRoom {
    private int count1 = 0;
    private int count2 = 0;

    // 为两个资源分别创建锁对象
    private final Object lock1 = new Object();
    private final Object lock2 = new Object();

    public void operation1() {
        synchronized (lock1) {  // 只锁定资源 1
            count1++;
        }
    }

    public void operation2() {
        synchronized (lock2) {  // 只锁定资源 2
            count2++;
        }
    }
}
```

**优化效果：**

- 操作 `count1` 的线程和操作 `count2` 的线程可以并发执行
- 只有同时操作同一个资源的线程才会互斥
- 提高了系统的吞吐量

---

## 实际案例：餐厅点餐系统

假设一个餐厅有两个独立的业务：**点餐** 和 **取餐**，它们操作不同的数据。

### 单锁实现（低并发）

```java
public class Restaurant {
    private int orderCount = 0;   // 点餐数量
    private int pickupCount = 0;  // 取餐数量

    // 使用同一把锁
    public synchronized void order() {
        orderCount++;
        sleep(1000);  // 模拟点餐耗时操作
    }

    public synchronized void pickup() {
        pickupCount++;
        sleep(1000);  // 模拟取餐耗时操作
    }
}
```

在这种实现下，点餐和取餐无法并发进行，即使它们操作的是不同的数据。

### 多锁优化（高并发）

```java
public class Restaurant {
    private int orderCount = 0;
    private int pickupCount = 0;

    private final Object orderLock = new Object();   // 点餐锁
    private final Object pickupLock = new Object();  // 取餐锁

    public void order() {
        synchronized (orderLock) {
            orderCount++;
            sleep(1000);
        }
    }

    public void pickup() {
        synchronized (pickupLock) {
            pickupCount++;
            sleep(1000);
        }
    }
}
```

**性能对比：**

| 实现方式 | 10个点餐线程 + 10个取餐线程 | 总耗时 |
|---------|------------------------|--------|
| 单锁方案 | 串行执行，完全互斥 | ~20秒 |
| 多锁方案 | 点餐和取餐并发执行 | ~10秒 |

::: info 适用场景
多把锁适用于：
- 不同资源之间互不影响
- 操作耗时较长，值得优化
- 并发访问量较大

不适用于：
- 资源之间存在依赖关系
- 操作非常快速，锁竞争不明显
:::

---

## 使用建议

### 1. 确保资源独立性

使用多把锁的前提是资源之间**真正独立**，不存在依赖关系。

```java
// ✓ 适合使用多把锁：资源独立
public class BankAccount {
    private int balance;           // 账户余额
    private List<String> history;  // 交易历史

    private final Object balanceLock = new Object();
    private final Object historyLock = new Object();

    // 查询余额和查询历史可以并发
}

// ✗ 不适合使用多把锁：资源相关
public class Counter {
    private int value;
    private int doubleValue;  // 始终是 value 的两倍

    // 这两个值有依赖关系，应该用同一把锁保护
}
```

### 2. 避免过度细化

锁的粒度不是越细越好，过度细化会增加代码复杂度和维护成本。

```java
// ✗ 过度细化
public class OverFineLock {
    private int field1, field2, field3, field4, field5;
    private Object lock1 = new Object();
    private Object lock2 = new Object();
    private Object lock3 = new Object();
    private Object lock4 = new Object();
    private Object lock5 = new Object();
    // 管理5把锁，复杂且容易出错
}

// ✓ 合理分组
public class ReasonableLock {
    private int readCount, readTotal;    // 读相关
    private int writeCount, writeTotal;  // 写相关

    private Object readLock = new Object();
    private Object writeLock = new Object();
    // 按业务分组，清晰易维护
}
```

### 3. 最小化锁的范围

尽量缩小同步块的范围，减少持有锁的时间。

```java
// ✗ 锁的范围过大
public void badPractice() {
    synchronized (lock) {
        准备数据();          // 不需要锁保护
        修改共享资源();      // 需要锁保护
        后续处理();          // 不需要锁保护
    }
}

// ✓ 最小化锁的范围
public void goodPractice() {
    准备数据();              // 在锁外执行
    synchronized (lock) {
        修改共享资源();      // 只锁住必要部分
    }
    后续处理();              // 在锁外执行
}
```

---

## 总结

| 方面 | 说明 |
|------|------|
| **核心思想** | 将锁的粒度细分，为独立资源分配独立的锁 |
| **主要优势** | 提高并发度，减少不必要的线程阻塞，提升吞吐量 |
| **适用场景** | 多个互相独立的共享资源，操作耗时较长，并发访问量大 |
| **使用前提** | 资源之间真正独立，不存在依赖关系 |
| **注意事项** | 避免过度细化，保持代码简洁可维护 |

::: warning 设计原则
- **能不加锁就不加锁**：优先考虑无锁方案（如原子类、线程安全集合）
- **能加粗锁就不加细锁**：除非性能瓶颈明确，否则不过早优化
- **保持简单**：多把锁会增加复杂度，需要在性能和可维护性之间权衡
:::
