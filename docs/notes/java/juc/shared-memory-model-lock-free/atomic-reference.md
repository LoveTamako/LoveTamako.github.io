# 原子引用

原子整数类（如 `AtomicInteger`）只能保护基本类型的变量。当需要保护引用类型时，Java 提供了原子引用类。

## AtomicReference

`AtomicReference` 可以原子地更新引用类型的变量，底层同样基于 CAS 实现。

### 基本使用

```java
import java.util.concurrent.atomic.AtomicReference;

class DecimalAccount {
    private AtomicReference<BigDecimal> balance;

    public DecimalAccount(BigDecimal balance) {
        this.balance = new AtomicReference<>(balance);
    }

    public void withdraw(BigDecimal amount) {
        while (true) {
            BigDecimal prev = balance.get();
            BigDecimal next = prev.subtract(amount);

            if (balance.compareAndSet(prev, next)) {
                break;
            }
        }
    }

    public BigDecimal getBalance() {
        return balance.get();
    }
}
```

**关键方法**：
- `get()`：获取当前值
- `set(V newValue)`：设置新值
- `compareAndSet(V expect, V update)`：CAS 操作
- `getAndSet(V newValue)`：设置新值并返回旧值

### 应用场景

```java
public class SharedResource {
    static class Task {
        String name;
        int status;

        Task(String name, int status) {
            this.name = name;
            this.status = status;
        }
    }

    private AtomicReference<Task> currentTask = new AtomicReference<>();

    // 线程安全地切换任务
    public boolean switchTask(Task oldTask, Task newTask) {
        return currentTask.compareAndSet(oldTask, newTask);
    }
}
```

## ABA 问题

### 问题描述

ABA 问题是 CAS 操作中的一个经典问题：线程在执行 CAS 时，虽然看到的值是预期值 A，但这个值可能已经被其他线程修改为 B，然后又改回 A。

```java
// 共享变量
AtomicReference<String> ref = new AtomicReference<>("A");

// 线程 1
Thread t1 = new Thread(() -> {
    String prev = ref.get();  // 读到 "A"
    // 模拟耗时操作
    sleep(1000);
    // 期望将 "A" 改为 "C"
    ref.compareAndSet(prev, "C");  // 成功！但中间状态被忽略了
});

// 线程 2
Thread t2 = new Thread(() -> {
    ref.compareAndSet("A", "B");  // A -> B
    ref.compareAndSet("B", "A");  // B -> A (改回去)
});
```

**执行时序**：

| 时刻 | 线程 1 | 线程 2 | ref 值 |
|------|--------|--------|--------|
| t0 | 读取到 "A" | | "A" |
| t1 | 睡眠中... | CAS("A", "B") 成功 | "B" |
| t2 | 睡眠中... | CAS("B", "A") 成功 | "A" |
| t3 | CAS("A", "C") 成功 | | "C" |

**问题**：线程 1 的 CAS 操作成功了，但它不知道 ref 经历了 A → B → A 的变化，可能导致逻辑错误。

### 实际案例

**场景**：实现一个简单的栈

```java
class Stack {
    static class Node {
        int value;
        Node next;

        Node(int value) {
            this.value = value;
        }
    }

    private AtomicReference<Node> top = new AtomicReference<>();

    // 压栈
    public void push(int value) {
        Node newNode = new Node(value);
        while (true) {
            Node oldTop = top.get();
            newNode.next = oldTop;
            if (top.compareAndSet(oldTop, newNode)) {
                break;
            }
        }
    }

    // 出栈
    public Integer pop() {
        while (true) {
            Node oldTop = top.get();
            if (oldTop == null) return null;

            Node newTop = oldTop.next;
            if (top.compareAndSet(oldTop, newTop)) {
                return oldTop.value;
            }
        }
    }
}
```

**ABA 问题场景**：

1. 线程 1 执行 `pop()`，读取到栈顶 A，准备将栈顶改为 A.next
2. 线程 2 执行两次 `pop()`，弹出 A 和 B
3. 线程 2 执行 `push(A)`，A 重新成为栈顶
4. 线程 1 的 CAS 操作成功，但此时 A.next 可能已经不是原来的节点

::: warning 危害
在链表结构中，ABA 问题可能导致：
- 节点丢失：中间节点被跳过
- 内存泄漏：节点无法被正确回收
- 数据不一致：结构被破坏
:::

## AtomicStampedReference

`AtomicStampedReference` 通过维护一个**版本号（stamp）**来解决 ABA 问题。

### 原理

每次修改引用时，不仅要比较引用值，还要比较版本号：

```java
public boolean compareAndSet(V expectedReference,
                             V newReference,
                             int expectedStamp,
                             int newStamp)
```

只有当**引用值和版本号都匹配**时，CAS 才会成功。

### 使用示例

```java
import java.util.concurrent.atomic.AtomicStampedReference;

public class AtomicStampedReferenceExample {
    public static void main(String[] args) {
        String initialRef = "A";
        int initialStamp = 0;

        AtomicStampedReference<String> ref =
            new AtomicStampedReference<>(initialRef, initialStamp);

        // 线程 1
        new Thread(() -> {
            int[] stampHolder = new int[1];
            String prev = ref.get(stampHolder);  // 读取值和版本号
            int stamp = stampHolder[0];

            System.out.println("线程1读取: ref=" + prev + ", stamp=" + stamp);

            // 模拟耗时操作
            try { Thread.sleep(1000); } catch (InterruptedException e) {}

            // 尝试修改
            boolean success = ref.compareAndSet(prev, "C", stamp, stamp + 1);
            System.out.println("线程1 CAS: " + success);
        }, "t1").start();

        // 线程 2
        new Thread(() -> {
            try { Thread.sleep(200); } catch (InterruptedException e) {}

            int[] stampHolder = new int[1];
            String prev = ref.get(stampHolder);
            int stamp = stampHolder[0];

            // A -> B
            ref.compareAndSet(prev, "B", stamp, stamp + 1);
            System.out.println("线程2修改: A -> B");

            // B -> A（版本号已变）
            prev = ref.get(stampHolder);
            stamp = stampHolder[0];
            ref.compareAndSet(prev, "A", stamp, stamp + 1);
            System.out.println("线程2修改: B -> A");
        }, "t2").start();
    }
}
```

**输出结果**：
```
线程1读取: ref=A, stamp=0
线程2修改: A -> B
线程2修改: B -> A
线程1 CAS: false  // 失败！因为版本号已从 0 变为 2
```

### 关键方法

```java
// 获取当前引用和版本号
public V get(int[] stampHolder)

// CAS 操作（同时比较引用和版本号）
public boolean compareAndSet(V expectedReference,
                             V newReference,
                             int expectedStamp,
                             int newStamp)

// 仅设置值（版本号不变）
public void set(V newReference, int newStamp)

// 尝试原子地设置新值
public boolean attemptStamp(V expectedReference, int newStamp)
```

### 使用场景

```java
class Account {
    static class Balance {
        BigDecimal amount;

        Balance(BigDecimal amount) {
            this.amount = amount;
        }
    }

    // 初始余额和版本号
    private AtomicStampedReference<Balance> balance =
        new AtomicStampedReference<>(new Balance(new BigDecimal("1000")), 0);

    public boolean withdraw(BigDecimal amount) {
        while (true) {
            int[] stampHolder = new int[1];
            Balance prev = balance.get(stampHolder);
            int stamp = stampHolder[0];

            // 检查余额
            if (prev.amount.compareTo(amount) < 0) {
                return false;  // 余额不足
            }

            // 创建新的余额对象
            Balance next = new Balance(prev.amount.subtract(amount));

            // CAS 更新（版本号 +1）
            if (balance.compareAndSet(prev, next, stamp, stamp + 1)) {
                return true;
            }
        }
    }
}
```

## AtomicMarkableReference

`AtomicMarkableReference` 与 `AtomicStampedReference` 类似，但使用**布尔标记**而非版本号。

### 特点

- 只关心**引用是否被修改过**，不关心修改了多少次
- 使用 `boolean` 标记代替 `int` 版本号
- 适合只需要知道"是否改过"的场景

### 使用示例

```java
import java.util.concurrent.atomic.AtomicMarkableReference;

public class AtomicMarkableReferenceExample {
    public static void main(String[] args) {
        String initialRef = "A";
        boolean initialMark = false;

        AtomicMarkableReference<String> ref =
            new AtomicMarkableReference<>(initialRef, initialMark);

        // 标记为已修改
        boolean[] markHolder = new boolean[1];
        String current = ref.get(markHolder);

        System.out.println("当前值: " + current + ", 标记: " + markHolder[0]);

        // CAS 操作（同时修改值和标记）
        boolean success = ref.compareAndSet(
            current, "B",           // 引用：A -> B
            markHolder[0], true     // 标记：false -> true
        );

        System.out.println("修改成功: " + success);

        current = ref.get(markHolder);
        System.out.println("新值: " + current + ", 标记: " + markHolder[0]);
    }
}
```

### 关键方法

```java
// 获取当前引用和标记
public V get(boolean[] markHolder)

// CAS 操作（同时比较引用和标记）
public boolean compareAndSet(V expectedReference,
                             V newReference,
                             boolean expectedMark,
                             boolean newMark)

// 仅设置值和标记
public void set(V newReference, boolean newMark)

// 尝试原子地设置标记
public boolean attemptMark(V expectedReference, boolean newMark)
```

### 应用场景

**垃圾回收标记**：

```java
class GarbageCollector {
    static class Node {
        Object data;
        Node next;

        Node(Object data) {
            this.data = data;
        }
    }

    // 标记节点是否被删除
    private AtomicMarkableReference<Node> head =
        new AtomicMarkableReference<>(null, false);

    // 逻辑删除（标记为删除，实际不移除）
    public boolean logicalDelete(Node node) {
        boolean[] markHolder = new boolean[1];
        Node current = head.get(markHolder);

        // 标记为已删除（true 表示已删除）
        return head.attemptMark(node, true);
    }

    // 检查节点是否被删除
    public boolean isDeleted(Node node) {
        boolean[] markHolder = new boolean[1];
        head.get(markHolder);
        return markHolder[0];
    }
}
```

## 对比总结

| 类型 | 保护内容 | 解决 ABA | 额外信息 | 适用场景 |
|------|----------|----------|----------|----------|
| `AtomicReference` | 引用 | ❌ | 无 | 简单的引用原子更新 |
| `AtomicStampedReference` | 引用 + 版本号 | ✅ | int 版本号 | 需要跟踪修改次数 |
| `AtomicMarkableReference` | 引用 + 标记 | ✅ | boolean 标记 | 只需知道是否修改过 |

**选择建议**：
- 不关心中间状态变化 → `AtomicReference`
- 需要知道修改了多少次 → `AtomicStampedReference`
- 只需要知道是否修改过 → `AtomicMarkableReference`

::: tip 性能考虑
- `AtomicStampedReference` 和 `AtomicMarkableReference` 会带来额外的开销
- 版本号需要持续递增，可能溢出（需要考虑版本号回绕）
- 只在确实需要避免 ABA 问题时使用
:::