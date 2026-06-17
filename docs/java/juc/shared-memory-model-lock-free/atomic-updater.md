# 原子更新器

当字段已定义为普通类型且无法修改时，可以使用原子字段更新器以 CAS 方式更新对象字段。

## 为什么需要

假设有一个已存在的类：

```java
class Account {
    volatile int balance;  // 已有代码，不能改为 AtomicInteger
}
```

**使用场景**：
- 字段类型无法修改（第三方库、已有代码）
- 需要减少内存占用（大量对象时，原子类占用内存更多）

## AtomicIntegerFieldUpdater

### 基本使用

```java
import java.util.concurrent.atomic.AtomicIntegerFieldUpdater;

class Account {
    volatile int balance;  // 必须是 volatile 修饰的实例字段
}

public class Example {
    private static final AtomicIntegerFieldUpdater<Account> updater =
        AtomicIntegerFieldUpdater.newUpdater(Account.class, "balance");

    public static void main(String[] args) {
        Account account = new Account();
        account.balance = 1000;

        // CAS 操作
        updater.compareAndSet(account, 1000, 900);
        System.out.println(account.balance);  // 900

        // 自增
        updater.incrementAndGet(account);
        System.out.println(account.balance);  // 901
    }
}
```

### 使用要求

::: warning 字段约束
被更新的字段必须满足：
1. 使用 `volatile` 修饰
2. 不能是 `static` 字段
3. 不能是 `final` 字段
4. 字段对更新器所在类可见（同包或 `public`）
:::

## AtomicLongFieldUpdater

用于更新 `long` 类型字段，使用方式与 `AtomicIntegerFieldUpdater` 类似：

```java
import java.util.concurrent.atomic.AtomicLongFieldUpdater;

class Statistics {
    volatile long totalCount;
}

class Counter {
    private static final AtomicLongFieldUpdater<Statistics> updater =
        AtomicLongFieldUpdater.newUpdater(Statistics.class, "totalCount");

    public void increment(Statistics stats) {
        updater.incrementAndGet(stats);
    }
}
```

## AtomicReferenceFieldUpdater

用于更新引用类型字段：

```java
import java.util.concurrent.atomic.AtomicReferenceFieldUpdater;

class Node {
    volatile String status;
}

class StatusManager {
    private static final AtomicReferenceFieldUpdater<Node, String> updater =
        AtomicReferenceFieldUpdater.newUpdater(Node.class, String.class, "status");

    public boolean updateStatus(Node node, String oldStatus, String newStatus) {
        return updater.compareAndSet(node, oldStatus, newStatus);
    }
}
```

## 与原子类对比

| 特性 | AtomicInteger | AtomicIntegerFieldUpdater |
|------|---------------|---------------------------|
| 使用便利性 | ✅ 简单直接 | ❌ 需要配置 |
| 内存占用 | 较多 | 较少 |
| 已有代码改造 | 需要修改字段类型 | 无需修改字段 |
| 适用场景 | 新代码 | 已有代码、大量对象 |

::: tip 最佳实践
- 将更新器声明为 `static final` 常量，避免重复创建
- 字段必须用 `volatile` 修饰
- 新项目优先使用原子类，已有代码或内存敏感场景使用更新器
:::
