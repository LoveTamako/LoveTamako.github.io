# CAS

**CAS（Compare And Swap）** 是一种实现并发算法的原子操作，通过硬件指令保证比较-交换的原子性，是无锁编程的基础。

## 基本概念

CAS 包含三个操作数：
- **V（内存位置）**：要更新的变量
- **A（预期值）**：期望的旧值
- **B（新值）**：要设置的新值

**执行逻辑**：
```
if (V == A) {
    V = B;
    return true;  // 操作成功
} else {
    return false; // 操作失败
}
```

**关键特性**：比较和交换是一个原子操作，由 CPU 提供的原子指令保证。

**底层实现**：不同 CPU 架构提供了不同的原子指令
- x86 架构：`cmpxchg`（Compare and Exchange）
- ARM 架构：`LDREX/STREX`（Load/Store Exclusive）

Java 中的 `compareAndSet()` 最终会通过 JVM 调用这些底层 CPU 指令完成 CAS 操作。

## 问题引入

使用 `synchronized` 或 `Lock` 实现线程安全时会有性能开销：

```java
class Account {
    private int balance;

    public synchronized void withdraw(int amount) {
        balance -= amount;
    }
}
```

**主要问题**：
- 线程获取不到锁会被阻塞，涉及用户态与内核态切换
- 锁竞争激烈时性能下降明显

**能否不使用锁来保证线程安全？** CAS 提供了一种无锁的解决方案。

## 问题解决

Java 提供了 `AtomicInteger` 类，底层基于 CAS 实现无锁的原子操作。

```java
import java.util.concurrent.atomic.AtomicInteger;

class Account {
    private AtomicInteger balance;

    public Account(int balance) {
        this.balance = new AtomicInteger(balance);
    }

    public void withdraw(int amount) {
        while (true) {
            int prev = balance.get();           // 获取当前值
            int next = prev - amount;           // 计算新值

            // CAS 操作：如果当前值仍是 prev，则更新为 next
            if (balance.compareAndSet(prev, next)) {
                break;  // 成功则退出
            }
            // 失败则重试（自旋）
        }
    }

    public int getBalance() {
        return balance.get();
    }
}
```

**执行流程**：

| 时刻 | 线程 A | 线程 B | balance 值 |
|------|--------|--------|-----------|
| t0 | | | 1000 |
| t1 | get() 读到 1000 | | 1000 |
| t2 | | get() 读到 1000 | 1000 |
| t3 | CAS(1000, 900) 成功 | | 900 |
| t4 | | CAS(1000, 900) 失败 | 900 |
| t5 | | 重新 get() 读到 900 | 900 |
| t6 | | CAS(900, 800) 成功 | 800 |

**关键点**：
- 线程 B 的 CAS 失败后会重试，这个过程称为**自旋**
- 无需加锁，避免了线程阻塞和上下文切换

::: tip volatile 的作用

`AtomicInteger` 的核心字段定义：

```java
private volatile int value;
```

**为什么需要 volatile？**

CAS 只能保证"比较并交换"过程的原子性，而 `volatile` 保证变量的可见性：

- `get()` 读取到的是最新值
- CAS 比较时使用的是最新值
- CAS 成功后的写入能够立即被其他线程看到

**两者配合**：
```text
CAS       → 保证原子性
volatile  → 保证可见性
```

两者配合才能实现无锁线程安全。
:::

## 效率分析

### 锁的性能开销

使用 `synchronized` 或 `Lock` 时，线程会经历以下过程：

```
线程竞争锁
  ↓
获取失败
  ↓
阻塞等待（用户态 → 内核态）
  ↓
唤醒（内核态 → 用户态）
  ↓
重新竞争
```

**主要开销**：
1. **上下文切换**：用户态和内核态的切换代价高昂
2. **线程调度**：阻塞和唤醒需要操作系统介入
3. **CPU 缓存失效**：线程切换导致 CPU 缓存行失效

### CAS 的性能优势

CAS 采用**乐观策略**，不涉及线程阻塞：

```
读取旧值
  ↓
计算新值
  ↓
CAS 尝试更新
  ↓
成功 → 完成
失败 → 自旋重试（仍在用户态）
```

**关键优势**：
1. **始终在用户态运行**：无需内核态切换
2. **线程不阻塞**：失败后立即重试，避免调度开销
3. **CPU 缓存友好**：线程持续运行，缓存命中率高

### 性能对比

**低竞争场景**（CAS 胜出）：
- CAS 通常一次成功，开销极小
- 加锁仍需执行完整的加锁/解锁流程

**高竞争场景**（锁胜出）：
- CAS 频繁失败自旋，消耗 CPU 资源
- 锁让线程阻塞休息，释放 CPU 给其他任务

::: tip 适用场景
CAS 用 CPU 时间换取了线程调度的开销。在竞争不激烈时，避免阻塞的收益远大于自旋的成本。

在多核 CPU 环境下，如果线程数量少于或接近 CPU 核心数，自旋线程能够并行执行，CAS 往往能够获得优于锁的性能表现。但如果竞争非常激烈，CAS 会频繁失败并不断重试，此时使用锁可能更加高效。
:::

## CAS 的特点

结合 CAS 和 volatile 可以实现无锁并发，适用于线程数少、多核 CPU 的场景。

**CAS vs synchronized**：
- **CAS** 是基于乐观锁的思想：不怕别的线程来修改共享变量，就算改了也没关系，重试即可
- **synchronized** 是基于悲观锁的思想：防着其它线程来修改共享变量，上锁后其他线程无法修改

**无锁并发的特点**：
- **无阻塞**：因为没有使用 `synchronized`，线程不会陷入阻塞，这是效率提升的因素之一
- **自旋重试**：如果竞争激烈，重试必然频繁发生，反而效率会受影响


## 应用场景

### 1. 原子类

Java 并发包提供了基于 CAS 的原子类：

**基本类型**：
- `AtomicInteger`
- `AtomicLong`
- `AtomicBoolean`

**引用类型**：
- `AtomicReference`
- `AtomicStampedReference`（解决 ABA 问题）
- `AtomicMarkableReference`

**数组类型**：
- `AtomicIntegerArray`
- `AtomicLongArray`
- `AtomicReferenceArray`

**字段更新器**：
- `AtomicIntegerFieldUpdater`
- `AtomicLongFieldUpdater`
- `AtomicReferenceFieldUpdater`

### 2. 无锁数据结构

基于 CAS 实现的无锁队列、栈等数据结构：

```java
// JDK 中的无锁队列
ConcurrentLinkedQueue<String> queue = new ConcurrentLinkedQueue<>();
queue.offer("item");  // 基于 CAS 实现
```

### 3. 乐观锁

数据库和缓存中的乐观锁机制类似 CAS 思想：

```sql
-- 添加版本号字段
UPDATE account
SET balance = balance - 100, version = version + 1
WHERE id = 1 AND version = 10;  -- 比较版本号
```




