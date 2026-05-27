# wait / notify 机制

`synchronized` 解决的是**互斥访问**问题，即同一时刻只能有一个线程进入临界区；但它本身并不负责处理**线程协作**。

当线程拿到锁后，如果发现执行条件暂时不满足，与其不断轮询浪费 CPU，不如主动进入等待状态，等条件变化后再被其他线程唤醒继续执行。`wait / notify` 就是基于 **Monitor（管程）** 实现的这一套协作机制。

常见使用场景：

- **保护性暂停（Guarded Suspension）**：等待结果准备完成
- **生产者 / 消费者**：等待队列非空或非满
- **条件同步**：一个线程等待另一个线程更新共享状态

## 核心机制（基于 Monitor）

每个 Java 对象都可以作为一个监视器对象使用，因此 `wait()`、`notify()`、`notifyAll()` 都定义在 `Object` 类中。

### Monitor 中的三个关键区域

| 结构 | 作用 |
|------|------|
| `Owner` | 当前持有锁的线程 |
| `EntryList` | 等待获取锁的线程队列 |
| `WaitSet` | 调用 `wait()` 后进入等待状态的线程集合 |

### 线程等待流程

1. 线程进入 `synchronized(lock)` 同步块，成为该 Monitor 的 `Owner`
2. 线程发现条件不满足，调用 `lock.wait()`
3. 当前线程**释放锁**，进入该对象 Monitor 的 `WaitSet`
4. 线程状态变为 `WAITING`，如果调用的是 `wait(timeout)`，则进入 `TIMED_WAITING`

### 线程唤醒流程

1. 另一个线程进入同一个 `lock` 的同步块
2. 修改共享条件，使等待条件成立
3. 调用 `lock.notify()` 或 `lock.notifyAll()`
4. 被唤醒的线程从 `WaitSet` 转移到 `EntryList`
5. 通知线程退出同步块并释放锁后，被唤醒线程重新竞争锁
6. 竞争成功后，`wait()` 才真正返回，线程继续向下执行

## API 语义与约束

### 方法总览

| 方法 | 是否必须持有该对象锁 | 是否释放锁 | 状态 / 效果 | 补充说明 |
|------|------------------|-----------|-------------|----------|
| `wait()` | 是 | 是 | 当前线程进入 `WaitSet`，状态变为 `WAITING` | 直到被 `notify / notifyAll`、中断，或发生虚假唤醒后才可能返回 |
| `wait(long timeout)` | 是 | 是 | 当前线程进入 `WaitSet`，状态变为 `TIMED_WAITING` | 最多等待指定毫秒数，也可能提前被唤醒 |
| `wait(long timeout, int nanos)` | 是 | 是 | 当前线程进入 `WaitSet`，状态变为 `TIMED_WAITING` | 语义与 `wait(long)` 相同，只是时间精度更细 |
| `notify()` | 是 | 否 | 从 `WaitSet` 中唤醒一个线程，转入 `EntryList` | 唤醒目标不可控，不保证公平 |
| `notifyAll()` | 是 | 否 | 唤醒 `WaitSet` 中所有线程，统一转入 `EntryList` | 更安全，但会带来更多锁竞争 |

::: warning 注意
`notify()` 或 `notifyAll()` 只是把等待线程从 `WaitSet` 挪到可竞争锁的位置，并**不意味着线程会立刻继续执行**。被唤醒线程必须重新获得同一把锁，`wait()` 才会返回。
:::

### 使用约束

- 必须在 `synchronized(obj)` 内部调用 `obj.wait()`、`obj.notify()`、`obj.notifyAll()`
- 等待和通知必须针对**同一个监视器对象**
- `wait()` 返回后，线程一定是**重新拿到锁**之后才继续执行
- `wait()` 可能因为以下原因返回：
  - 收到 `notify()`
  - 收到 `notifyAll()`
  - 等待超时
  - 线程被中断
  - 发生虚假唤醒

::: warning 为什么必须用 while，而不是 if
`wait / notify` 不是“信号计数器”，不会记住历史通知；同时 JVM 也允许虚假唤醒。

因此标准写法必须是：

```java
synchronized (lock) {
    while (!condition) {
        lock.wait();
    }
    // 条件满足，继续执行
}
```

如果写成 `if`，线程被唤醒后不会再次检查条件，容易导致逻辑错误。
:::

### notify() vs notifyAll()

#### 区别对比

| 对比项 | `notify()` | `notifyAll()` |
|--------|------------|---------------|
| 唤醒数量 | 一个等待线程 | 所有等待线程 |
| 唤醒目标 | 不可控，由 JVM 选择 | 全部转入锁竞争 |
| 锁竞争开销 | 更小 | 更大 |
| 适用场景 | 等待条件单一，且能确定任意被唤醒线程都可继续 | 多种等待条件共用同一把锁，或无法确定唤醒谁更合适 |
| 典型风险 | 可能唤醒“错误线程”，导致系统没有实质进展 | 会造成更多线程竞争，但正确性更高 |

#### `notify()` 示例：单一等待条件

```java
public final class SingleWaiterDemo {
    private final Object lock = new Object();
    private boolean ready = false;

    public void await() throws InterruptedException {
        synchronized (lock) {
            while (!ready) {
                lock.wait();
            }
        }
    }

    public void signal() {
        synchronized (lock) {
            ready = true;
            lock.notify();
        }
    }
}
```

这个场景适合使用 `notify()`，因为等待条件单一，并且只需要唤醒一个等待线程继续执行。

#### `notifyAll()` 示例：多个等待线程共享同一条件

```java
public final class MultiWaiterDemo {
    private final Object lock = new Object();
    private boolean ready = false;

    public void await() throws InterruptedException {
        synchronized (lock) {
            while (!ready) {
                lock.wait();
            }
            System.out.println(Thread.currentThread().getName() + " continue");
        }
    }

    public void publish() {
        synchronized (lock) {
            ready = true;
            lock.notifyAll();
        }
    }
}
```

当多个线程都在等待同一个结果时，`notifyAll()` 可以确保所有等待线程都被唤醒，随后各自重新竞争锁并再次检查条件。

#### 为什么多条件场景更适合 notifyAll

以生产者 / 消费者模型为例，同一把锁上可能同时存在两类等待条件：

- 消费者等待“队列非空”
- 生产者等待“队列未满”

如果这时只调用 `notify()`，可能把“暂时仍然无法继续执行”的那一类线程唤醒，结果它拿到锁之后发现条件依旧不满足，又重新 `wait()`，系统进展就会变慢，甚至出现“看起来像卡住”的现象。

因此在这类场景下，更常见也更安全的策略是：

- 共享状态变化后使用 `notifyAll()`
- 所有等待线程被唤醒后，再通过 `while` 判断自己是否真的满足执行条件

::: tip 选择建议
- 单一等待条件、且能确认唤醒任意一个线程都能继续执行时，可以考虑 `notify()`
- 多条件共用同一把锁，或无法准确控制应该唤醒谁时，优先使用 `notifyAll()`
:::

### wait(timeout) vs sleep(timeout)

`wait(timeout)` 和 `sleep(timeout)` 都能让线程暂停一段时间，但它们的语义完全不同。

| 对比维度 | `wait(timeout)` | `sleep(timeout)` |
|----------|-----------------|------------------|
| 所属类 | `Object` 实例方法 | `Thread` 静态方法 |
| 是否必须在同步块中调用 | 是 | 否 |
| 是否释放锁 | 是 | 否 |
| 主要用途 | 线程协作、等待条件成立 | 单纯让当前线程暂停执行 |
| 唤醒方式 | `notify`、`notifyAll`、超时、中断、虚假唤醒 | 超时或中断 |
| 典型线程状态 | `TIMED_WAITING`，返回前通常还要重新竞争锁 | `TIMED_WAITING` |
| 是否进入 `WaitSet` | 是 | 否 |

#### 结论

- 需要“**释放锁并等待条件变化**”时，用 `wait(timeout)`
- 只想“**让当前线程暂停一会儿**”时，用 `sleep(timeout)`

## 标准用法：保护性暂停（Guarded Suspension）

下面用一个“等待结果准备完成”的例子来说明 `wait / notify` 的标准写法：

```java
public final class GuardedObject {
    private final Object lock = new Object();
    private Object response;
    private boolean ready = false;

    public Object get() throws InterruptedException {
        synchronized (lock) {
            while (!ready) {
                lock.wait();
            }
            return response;
        }
    }

    public Object get(long timeout) throws InterruptedException {
        synchronized (lock) {
            long start = System.currentTimeMillis();
            long remaining = timeout;

            while (!ready && remaining > 0) {
                lock.wait(remaining);
                remaining = timeout - (System.currentTimeMillis() - start);
            }

            return ready ? response : null;
        }
    }

    public void complete(Object value) {
        synchronized (lock) {
            response = value;
            ready = true;
            lock.notifyAll();
        }
    }
}
```

### 代码要点

- **等待方**使用 `while (!ready)` 循环检查条件，避免虚假唤醒
- **通知方**先更新共享状态，再调用 `notifyAll()`，且整个过程必须在同一把锁内完成
- **超时等待**不能每次都固定 `wait(timeout)`，而是要根据已等待时间计算剩余时间，否则总等待时间可能超过预期

::: tip 工程建议
如果无法严格保证“任意一个被唤醒的线程都能继续执行”，优先使用 `notifyAll()` 配合 `while` 条件检查。这是最稳妥、最不容易出错的写法。
:::

## 常见错误与排查

### 1. 没有持有锁就调用 wait / notify

```java
lock.wait();
```

这会直接抛出 `IllegalMonitorStateException`。

正确写法：

```java
synchronized (lock) {
    lock.wait();
}
```

### 2. 用 if 判断等待条件

```java
synchronized (lock) {
    if (!ready) {
        lock.wait();
    }
}
```

问题在于：线程被唤醒后不会再次检查条件，容易因为虚假唤醒或竞争导致错误。

正确写法：

```java
synchronized (lock) {
    while (!ready) {
        lock.wait();
    }
}
```

### 3. 等待和通知不是同一个锁对象

如果线程在 `lock1` 上等待，却在 `lock2` 上通知，那么等待线程永远收不到对应通知。

`wait / notify` 的协作前提是：

- 使用同一个共享条件
- 绑定同一个监视器对象
- 基于同一把锁完成状态检查、状态修改和通知

### 4. 忽略中断信号

`wait()` 和 `wait(timeout)` 都会抛出 `InterruptedException`。如果直接吞掉异常，线程的中断语义可能被破坏。

常见处理方式有两种：

- 继续向上抛出异常
- 捕获后恢复中断标记：`Thread.currentThread().interrupt()`

::: tip 工程实践
`wait / notify` 是理解 Monitor 和线程协作的基础机制，但在实际业务开发中，通常更推荐优先使用更高层的并发工具，例如 `BlockingQueue`、`CountDownLatch`、`Condition` 等。
:::

## 总结

- `wait / notify` 是基于 `Monitor` 的线程协作机制，解决的是“条件不满足时如何等待”的问题
- 调用 `wait()` 的线程会释放锁并进入 `WaitSet`；被通知后还需要重新竞争锁
- `notify()` 只唤醒一个线程，`notifyAll()` 唤醒全部线程，但二者都不会立即释放锁
- 标准写法是 `while(条件不满足) { wait(); }`
- 多条件共享同一把锁时，优先使用 `notifyAll()` 配合 `while`，正确性更高
