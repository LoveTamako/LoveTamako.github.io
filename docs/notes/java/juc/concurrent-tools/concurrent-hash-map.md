# ConcurrentHashMap

## 案例：单词计数

### 问题场景

将 26 个英文字母各生成 200 次，打乱后写入 26 个文件中。然后使用多线程从这些文件中读取字母并统计每个字母出现的次数。理论上每个字母应该统计到 200 次，但使用普通的 HashMap 会因为线程安全问题导致统计结果不准确。

### 错误示例：使用 HashMap

```java
import java.io.*;
import java.nio.file.*;
import java.util.*;

public class WordCountWithHashMap {
    public static void main(String[] args) throws Exception {
        // 1. 准备数据：生成26个字母各200次
        List<String> letters = new ArrayList<>();
        for (char c = 'a'; c <= 'z'; c++) {
            for (int i = 0; i < 200; i++) {
                letters.add(String.valueOf(c));
            }
        }

        // 2. 打乱并写入26个文件
        Collections.shuffle(letters);
        Path tempDir = Files.createTempDirectory("word-count");
        for (int i = 0; i < 26; i++) {
            Path file = tempDir.resolve("file" + i + ".txt");
            Files.write(file, letters.subList(i * 200, (i + 1) * 200));
        }

        // 3. 使用HashMap多线程统计（线程不安全）
        Map<String, Integer> wordCount = new HashMap<>();

        Thread[] threads = new Thread[26];
        for (int i = 0; i < 26; i++) {
            int fileIndex = i;
            threads[i] = new Thread(() -> {
                try {
                    Path file = tempDir.resolve("file" + fileIndex + ".txt");
                    List<String> words = Files.readAllLines(file);
                    for (String word : words) {
                        // 问题代码：get-check-put 组合不是原子操作
                        Integer count = wordCount.get(word);
                        if (count == null) {
                            wordCount.put(word, 1);
                        } else {
                            wordCount.put(word, count + 1);
                        }
                    }
                } catch (IOException e) {
                    e.printStackTrace();
                }
            });
            threads[i].start();
        }

        for (Thread thread : threads) {
            thread.join();
        }

        // 4. 验证结果
        System.out.println("统计结果：");
        wordCount.forEach((k, v) -> System.out.println(k + ": " + v));

        long wrongCount = wordCount.values().stream().filter(v -> v != 200).count();
        System.out.println("\n错误数量：" + wrongCount + " 个字母的计数不等于200");
        // 预期：每个字母都是 200
        // 实际：很多字母的计数都小于 200
    }
}
```

**问题分析：**

虽然 `get()` 和 `put()` 单个操作是原子的，但 **"检查-更新"（check-then-act）这个组合操作不是原子的**：

1. 线程 A 执行 `get("a")` 得到 count = 5
2. 线程 B 执行 `get("a")` 也得到 count = 5
3. 线程 A 执行 `put("a", 6)`
4. 线程 B 执行 `put("a", 6)`

结果：两个线程都进行了累加操作，但计数只从 5 增加到 6，丢失了一次更新。这就是典型的**竞态条件（Race Condition）**。

### 正确示例：使用 ConcurrentHashMap + computeIfAbsent

ConcurrentHashMap 提供了线程安全的原子操作方法，可以解决上述问题：

```java
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;

public class WordCountWithConcurrentHashMap {
    public static void main(String[] args) throws Exception {
        // 1. 准备数据：生成26个字母各200次
        List<String> letters = new ArrayList<>();
        for (char c = 'a'; c <= 'z'; c++) {
            for (int i = 0; i < 200; i++) {
                letters.add(String.valueOf(c));
            }
        }

        // 2. 打乱并写入26个文件
        Collections.shuffle(letters);
        Path tempDir = Files.createTempDirectory("word-count");
        for (int i = 0; i < 26; i++) {
            Path file = tempDir.resolve("file" + i + ".txt");
            Files.write(file, letters.subList(i * 200, (i + 1) * 200));
        }

        // 3. 使用ConcurrentHashMap多线程统计（线程安全）
        Map<String, LongAdder> wordCount = new ConcurrentHashMap<>();

        Thread[] threads = new Thread[26];
        for (int i = 0; i < 26; i++) {
            int fileIndex = i;
            threads[i] = new Thread(() -> {
                try {
                    Path file = tempDir.resolve("file" + fileIndex + ".txt");
                    List<String> words = Files.readAllLines(file);
                    for (String word : words) {
                        // 使用computeIfAbsent确保原子性
                        wordCount.computeIfAbsent(word, k -> new LongAdder()).increment();
                    }
                } catch (IOException e) {
                    e.printStackTrace();
                }
            });
            threads[i].start();
        }

        for (Thread thread : threads) {
            thread.join();
        }

        // 4. 验证结果
        System.out.println("统计结果：");
        wordCount.forEach((k, v) -> System.out.println(k + ": " + v.sum()));

        long wrongCount = wordCount.values().stream()
                .filter(v -> v.sum() != 200).count();
        System.out.println("\n错误数量：" + wrongCount + " 个字母的计数不等于200");
        // 结果：所有字母的计数都正确为 200
    }
}
```

**关键改进点：**

1. **computeIfAbsent 方法的原子性**
   ```java
   wordCount.computeIfAbsent(word, k -> new LongAdder()).increment();
   ```

   - `computeIfAbsent(key, mappingFunction)` 是一个**原子操作**
   - 它保证了"检查键是否存在"和"不存在则创建"这两个步骤作为一个整体执行
   - 多个线程同时调用时，只有一个线程会执行 mappingFunction 创建新值
   - 其他线程会等待并获取已创建的值

2. **使用 LongAdder 而不是 Integer**

   - `LongAdder` 是专门为高并发累加设计的类
   - `increment()` 方法是线程安全的，性能优于 `AtomicInteger`
   - 内部使用分段锁机制，减少线程竞争

## JDK7 HashMap 并发死链

### HashMap数据结构

JDK7 的 HashMap 采用**数组 + 链表**的结构：

```
数组索引      链表（头插法）
[0]  -----> null
[1]  -----> Entry(key1, val1) -> Entry(key2, val2) -> null
[2]  -----> Entry(key3, val3) -> null
[3]  -----> null
...
```

**关键特点：**

1. **数组**：HashMap 内部维护一个 `Entry[] table` 数组
2. **链表**：当多个键的 hash 值冲突时，使用链表存储
3. **头插法**：在 JDK7 中，插入新节点时采用**头插法**（插入到链表头部）
4. **扩容机制**：当元素数量超过阈值（capacity × loadFactor）时，会触发扩容，容量翻倍

### 并发死链问题

**问题根源：** 在 JDK7 中，多线程环境下同时进行扩容操作时，由于使用**头插法**转移节点，可能导致链表形成**环形结构**，造成死循环。

#### 扩容过程（transfer 方法）

JDK7 HashMap 的扩容核心代码简化如下：

```java
void transfer(Entry[] newTable) {
    Entry[] src = table;
    int newCapacity = newTable.length;

    for (int j = 0; j < src.length; j++) {
        Entry<K,V> e = src[j];
        if (e != null) {
            src[j] = null;  // 释放旧数组引用

            do {
                Entry<K,V> next = e.next;  // 保存下一个节点
                int i = indexFor(e.hash, newCapacity);  // 计算新位置

                // 头插法：将节点插入到新数组对应位置的链表头部
                e.next = newTable[i];
                newTable[i] = e;

                e = next;  // 处理下一个节点
            } while (e != null);
        }
    }
}
```

**关键点：** 头插法会导致链表顺序反转。

#### 死链形成过程

假设有初始状态：HashMap 中某个索引位置有链表 `A -> B -> null`，两个线程 T1 和 T2 同时进行扩容。

**初始状态：**
```
旧数组 [index] -> A -> B -> null
```

**线程执行时序：**

**步骤1：线程 T1 开始执行 transfer**

```java
// T1 执行到这里
Entry<K,V> e = A;
Entry<K,V> next = e.next;  // next = B
```

此时 T1 的局部变量：`e = A, next = B`

**步骤2：T1 被挂起，线程 T2 执行并完成整个 transfer**

T2 使用头插法完成转移后，链表顺序反转：

```
新数组 [newIndex] -> B -> A -> null
```

注意：原本是 `A -> B`，现在变成了 `B -> A`（顺序反转）

**步骤3：T1 恢复执行，第一次循环**

T1 继续执行，此时 `e = A, next = B`（T1 的局部变量没有改变）

```java
int i = indexFor(e.hash, newCapacity);  // 计算新位置
e.next = newTable[i];     // A.next = B（新数组头节点）
newTable[i] = e;          // A 成为新头节点
e = next;                 // e = B，准备处理下一个节点
```

结果：新数组变为 `A -> B -> null`（但注意，B.next 实际指向 A）

**步骤4：T1 第二次循环 - 形成环形链表**

```java
// T1 第二次循环：处理节点 B
next = e.next;            // next = B.next = A（关键！B 此时指向 A）
e.next = newTable[i];     // B.next = A（新数组头节点）
newTable[i] = e;          // B 成为新头节点
e = next;                 // e = A
```

此时链表状态：`B -> A`，但 `A.next = B`，**形成环形：A <-> B**

**步骤5：T1 第三次循环 - 死链确认**

```java
// T1 第三次循环：再次处理节点 A
next = e.next;            // next = A.next = B
e.next = newTable[i];     // A.next = B
newTable[i] = e;          // A 成为新头节点
e = next;                 // e = B，进入下一次循环
```

**最终结果：**
```
A.next = B
B.next = A
形成环形链表：A <-> B
```

#### 后果

当后续调用 `get()` 方法查找不存在的 key 时，会在这个环形链表中无限循环：

```java
public V get(Object key) {
    int hash = hash(key);
    int i = indexFor(hash, table.length);

    // 从链表头开始查找
    for (Entry<K,V> e = table[i]; e != null; e = e.next) {
        if (e.hash == hash && eq(key, e.key))
            return e.value;
    }
    return null;
}
```

由于链表形成环形 `A <-> B`，`e = e.next` 永远不会为 null，导致：
- **CPU 使用率 100%**
- **线程挂起（hang）**
- **应用程序无响应**

#### JDK8 的改进

JDK8 通过以下方式解决了这个问题：

1. **改用尾插法**：扩容时使用尾插法而不是头插法，保持链表顺序不变
2. **引入红黑树**：当链表长度超过 8 时，转换为红黑树，提高查询效率
3. **但仍不是线程安全的**：JDK8 的 HashMap 依然不能在多线程环境下使用，只是避免了死链问题

**多线程环境下的正确选择：**
- 使用 `ConcurrentHashMap`（推荐）
- 使用 `Collections.synchronizedMap(new HashMap<>())`
- 使用 `Hashtable`（不推荐，性能差）

## JDK8 ConcurrentHashMap

### 重要属性和内部类

```java
public class ConcurrentHashMap<K,V> {

    // ========== 重要属性 ==========

    /**
     * sizeCtl: 控制标识符，用于控制初始化和扩容
     * - 负数：表示正在进行初始化或扩容操作
     *   -1: 表示正在初始化
     *   -(1 + 正在扩容的线程数): 表示正在扩容
     * - 0: 默认值，表示还未初始化
     * - 正数: 如果已初始化，表示下一次扩容的阈值(threshold)
     */
    private transient volatile int sizeCtl;

    /**
     * table: 存储数据的数组，首次插入时初始化，大小总是2的幂次
     * volatile 保证可见性
     */
    transient volatile Node<K,V>[] table;

    /**
     * nextTable: 扩容时的新数组，只在扩容期间非空
     */
    private transient volatile Node<K,V>[] nextTable;

    // ========== 重要内部类 ==========

    /**
     * Node: 普通链表节点
     * hash、key、val 和 next 指针
     */
    static class Node<K,V> implements Map.Entry<K,V> {
        final int hash;
        final K key;
        volatile V val;        // volatile 保证可见性
        volatile Node<K,V> next;  // volatile 保证可见性

        Node(int hash, K key, V val, Node<K,V> next) {
            this.hash = hash;
            this.key = key;
            this.val = val;
            this.next = next;
        }
    }

    /**
     * ForwardingNode: 扩容时的占位节点，hash值为MOVED(-1)
     * 表示该位置的数据已经迁移到新数组
     */
    static final class ForwardingNode<K,V> extends Node<K,V> {
        final Node<K,V>[] nextTable;

        ForwardingNode(Node<K,V>[] tab) {
            super(MOVED, null, null, null);  // hash = -1
            this.nextTable = tab;
        }
    }

    /**
     * TreeBin: 红黑树的头节点，hash值为TREEBIN(-2)
     * 不直接存储key-value，而是持有TreeNode链表的引用
     */
    static final class TreeBin<K,V> extends Node<K,V> {
        TreeNode<K,V> root;  // 红黑树的根节点
        volatile TreeNode<K,V> first;  // 链表的头节点
        volatile Thread waiter;  // 等待的线程
        volatile int lockState;  // 锁状态

        // 锁状态常量
        static final int WRITER = 1;  // 持有写锁
        static final int WAITER = 2;  // 等待写锁
        static final int READER = 4;  // 持有读锁
    }
}
```

### 重要方法

这些方法用于对 table 数组进行原子操作：

```java
public class ConcurrentHashMap<K,V> {

    /**
     * tabAt: 获取数组指定位置的元素
     * 使用 Unsafe 的 getObjectVolatile 方法，保证可见性
     * 相当于 volatile 读取
     */
    static final <K,V> Node<K,V> tabAt(Node<K,V>[] tab, int i) {
        return (Node<K,V>)U.getObjectVolatile(tab, ((long)i << ASHIFT) + ABASE);
    }

    /**
     * casTabAt: CAS 方式设置数组指定位置的元素
     * 使用 Unsafe 的 compareAndSwapObject 方法
     * 只有当前值等于期望值 c 时，才设置为新值 v
     * 返回是否设置成功
     */
    static final <K,V> boolean casTabAt(Node<K,V>[] tab, int i,
                                        Node<K,V> c, Node<K,V> v) {
        return U.compareAndSwapObject(tab, ((long)i << ASHIFT) + ABASE, c, v);
    }

    /**
     * setTabAt: 直接设置数组指定位置的元素
     * 使用 Unsafe 的 putObjectVolatile 方法，保证可见性
     * 相当于 volatile 写入
     */
    static final <K,V> void setTabAt(Node<K,V>[] tab, int i, Node<K,V> v) {
        U.putObjectVolatile(tab, ((long)i << ASHIFT) + ABASE, v);
    }
}
```

**为什么不直接用数组下标访问？**

- `tab[i]` 无法保证可见性和原子性
- 使用 `Unsafe` 的方法可以保证：
  - `getObjectVolatile` / `putObjectVolatile`: 保证可见性（volatile 语义）
  - `compareAndSwapObject`: 保证原子性（CAS 操作）

## 源码分析

### 构造器

ConcurrentHashMap 提供了多个构造器，但都**不会立即初始化数组**，而是在首次插入时才进行初始化（懒加载）。

以下是完整参数的构造器：

```java
public class ConcurrentHashMap<K,V> {

    /**
     * 完整参数的构造器
     * @param initialCapacity 初始容量
     * @param loadFactor 负载因子（JDK8 中不再使用，固定为 0.75）
     * @param concurrencyLevel 并发级别（JDK8 中不再使用，仅为兼容旧版本）
     */
    public ConcurrentHashMap(int initialCapacity,
                             float loadFactor, int concurrencyLevel) {
        // 参数校验
        if (!(loadFactor > 0.0f) || initialCapacity < 0 || concurrencyLevel <= 0)
            throw new IllegalArgumentException();

        // 至少要容纳 concurrencyLevel 个元素
        if (initialCapacity < concurrencyLevel)
            initialCapacity = concurrencyLevel;

        // 根据初始容量和负载因子计算实际容量
        long size = (long)(1.0 + (long)initialCapacity / loadFactor);
        int cap = (size >= (long)MAXIMUM_CAPACITY) ?
            MAXIMUM_CAPACITY : tableSizeFor((int)size);

        // 将计算出的容量保存到 sizeCtl 中，实际数组在首次 put 时才初始化
        this.sizeCtl = cap;
    }
}
```

**关键点：**

- **loadFactor 和 concurrencyLevel 参数**：在 JDK8 中已不再使用，保留这些参数仅为了兼容旧版本 API
- **懒加载**：构造器只是设置 `sizeCtl` 的值，不会立即分配数组空间
- **容量计算**：最终容量会调整为 2 的幂次（通过 `tableSizeFor` 方法）

### get 方法

get 方法是**无锁操作**，通过 volatile 读保证线程安全，性能极高。

```java
public V get(Object key) {
    Node<K,V>[] tab; Node<K,V> e, p; int n, eh; K ek;

    // 1. 计算 key 的 hash 值（经过扰动处理）
    int h = spread(key.hashCode());

    // 2. 检查数组是否已初始化，且对应位置有节点
    if ((tab = table) != null && (n = tab.length) > 0 &&
        (e = tabAt(tab, (n - 1) & h)) != null) {

        // 3. 检查头节点是否就是目标节点（快速路径）
        if ((eh = e.hash) == h) {
            if ((ek = e.key) == key || (ek != null && key.equals(ek)))
                return e.val;
        }
        // 4. hash < 0 表示特殊节点（ForwardingNode 或 TreeBin）
        else if (eh < 0)
            return (p = e.find(h, key)) != null ? p.val : null;

        // 5. 遍历链表查找
        while ((e = e.next) != null) {
            if (e.hash == h &&
                ((ek = e.key) == key || (ek != null && key.equals(ek))))
                return e.val;
        }
    }

    // 6. 未找到，返回 null
    return null;
}
```

**执行流程：**

1. **计算 hash**：使用 `spread()` 方法对 key 的 hashCode 进行扰动处理
2. **定位桶位置**：通过 `(n - 1) & h` 计算数组下标
3. **快速检查**：先检查头节点是否匹配（最常见情况）
4. **特殊节点处理**：
   - `hash == MOVED(-1)`：ForwardingNode，表示正在扩容，调用其 `find()` 方法到新数组查找
   - `hash == TREEBIN(-2)`：TreeBin，调用其 `find()` 方法在红黑树中查找
5. **链表遍历**：普通链表节点，遍历查找匹配的 key

::: tip 为什么 get 方法无需加锁？

1. **volatile 保证可见性**：
   - `table` 数组是 volatile 的，读取时能看到最新值
   - `Node.val` 和 `Node.next` 都是 volatile 的，保证读取的数据是最新的

2. **不修改数据**：get 方法只读取数据，不修改任何状态

3. **扩容期间的特殊处理**：
   - 遇到 ForwardingNode 时，会自动到新数组（nextTable）中查找
   - 保证扩容过程中数据不丢失

:::

### put 方法

put 方法使用**细粒度锁**（锁住单个桶的头节点）保证线程安全，相比 JDK7 的分段锁，并发性能更高。

```java
public V put(K key, V value) {
    return putVal(key, value, false);
}

final V putVal(K key, V value, boolean onlyIfAbsent) {
    // 1. 不允许 null 键或 null 值
    if (key == null || value == null) throw new NullPointerException();

    // 2. 计算 hash 值
    int hash = spread(key.hashCode());
    int binCount = 0;  // 记录链表长度

    // 3. 自旋，直到插入成功
    for (Node<K,V>[] tab = table;;) {
        Node<K,V> f; int n, i, fh;

        // 情况1：table 未初始化，先初始化
        if (tab == null || (n = tab.length) == 0)
            tab = initTable();

        // 情况2：目标位置为空，使用 CAS 插入（无锁操作）
        else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
            if (casTabAt(tab, i, null, new Node<K,V>(hash, key, value, null)))
                break;  // CAS 成功，插入完成，跳出循环
            // CAS 失败，说明有其他线程已经插入了节点，继续自旋
        }

        // 情况3：正在扩容，当前线程帮助扩容
        else if ((fh = f.hash) == MOVED)
            tab = helpTransfer(tab, f);

        // 情况4：目标位置有节点，需要加锁处理
        else {
            V oldVal = null;
            synchronized (f) {  // 锁住桶的头节点（细粒度锁）
                if (tabAt(tab, i) == f) {  // 双重检查，确保头节点没被修改

                    // 4.1 链表节点
                    if (fh >= 0) {
                        binCount = 1;
                        for (Node<K,V> e = f;; ++binCount) {
                            K ek;
                            // 找到相同 key，更新 value
                            if (e.hash == hash &&
                                ((ek = e.key) == key || (ek != null && key.equals(ek)))) {
                                oldVal = e.val;
                                if (!onlyIfAbsent)
                                    e.val = value;
                                break;
                            }
                            // 遍历到链表尾部，插入新节点
                            Node<K,V> pred = e;
                            if ((e = e.next) == null) {
                                pred.next = new Node<K,V>(hash, key, value, null);
                                break;
                            }
                        }
                    }
                    // 4.2 红黑树节点
                    else if (f instanceof TreeBin) {
                        Node<K,V> p;
                        binCount = 2;
                        if ((p = ((TreeBin<K,V>)f).putTreeVal(hash, key, value)) != null) {
                            oldVal = p.val;
                            if (!onlyIfAbsent)
                                p.val = value;
                        }
                    }
                }
            }

            // 5. 插入完成后的处理
            if (binCount != 0) {
                // 链表长度达到阈值，转换为红黑树
                if (binCount >= TREEIFY_THRESHOLD)
                    treeifyBin(tab, i);
                // 如果是更新操作，返回旧值
                if (oldVal != null)
                    return oldVal;
                break;  // 插入完成，跳出自旋
            }
        }
    }

    // 6. 更新元素计数，可能触发扩容
    addCount(1L, binCount);
    return null;
}
```

**执行流程总结：**

1. **参数校验**：不允许 null 键或值
2. **计算 hash**：使用 spread() 方法计算 hash 值
3. **自旋插入**：使用 for 循环，直到插入成功
   - **情况1**：table 未初始化 → 调用 initTable() 初始化
   - **情况2**：目标位置为空 → 使用 **CAS 无锁插入**
   - **情况3**：正在扩容 → 帮助扩容（helpTransfer）
   - **情况4**：目标位置有节点 → 使用 **synchronized 锁住头节点**
     - 链表：遍历链表，找到相同 key 则更新，否则尾插
     - 红黑树：调用 putTreeVal() 插入
4. **树化检查**：链表长度 ≥ 8 时，转换为红黑树
5. **更新计数**：调用 addCount()，可能触发扩容

::: tip 细粒度锁的优势

1. **锁粒度小**：只锁住单个桶的头节点，不同桶之间可以并发写入
2. **CAS 优化**：空桶插入使用 CAS，完全无锁，性能最优
3. **读写分离**：get 方法完全无锁，不会被 put 阻塞

相比 JDK7 的分段锁（Segment），JDK8 的细粒度锁将并发度从默认 16 提升到了桶的数量（默认 16，最大可达数组长度），大大提高了并发性能。

:::

### initTable()

initTable() 方法负责懒初始化数组，使用 **sizeCtl 配合 CAS** 确保只有一个线程执行初始化。

```java
private final Node<K,V>[] initTable() {
    Node<K,V>[] tab; int sc;

    // 自旋，直到初始化完成
    while ((tab = table) == null || tab.length == 0) {

        // 1. sizeCtl < 0 表示有其他线程正在初始化
        if ((sc = sizeCtl) < 0)
            Thread.yield();  // 让出 CPU，等待初始化完成

        // 2. CAS 将 sizeCtl 设置为 -1，表示当前线程正在初始化
        else if (U.compareAndSwapInt(this, SIZECTL, sc, -1)) {
            try {
                // 3. 双重检查，防止其他线程已经初始化
                if ((tab = table) == null || tab.length == 0) {
                    // 4. 确定数组大小
                    int n = (sc > 0) ? sc : DEFAULT_CAPACITY;

                    // 5. 创建数组
                    @SuppressWarnings("unchecked")
                    Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n];
                    table = tab = nt;

                    // 6. 计算扩容阈值：n - n/4 = 0.75n
                    sc = n - (n >>> 2);
                }
            } finally {
                // 7. 将 sizeCtl 设置为扩容阈值
                sizeCtl = sc;
            }
            break;
        }
    }
    return tab;
}
```

::: tip sizeCtl 的状态转换

**初始化过程中 sizeCtl 的值变化：**

1. **构造器阶段**：`sizeCtl = 初始容量`（正数）
2. **竞争初始化**：某线程通过 CAS 将 `sizeCtl` 设为 `-1`，获得初始化权限
3. **其他线程等待**：其他线程看到 `sizeCtl < 0`，执行 `Thread.yield()` 等待
4. **初始化完成**：`sizeCtl = 扩容阈值`（0.75 × capacity）

**为什么线程安全？**

1. **CAS 保证互斥**：只有一个线程能成功将 sizeCtl 从正数改为 -1
2. **双重检查**：获得初始化权限后，再次检查 table 是否为空，防止重复初始化
3. **volatile 语义**：table 是 volatile 的，初始化完成后其他线程立即可见

:::

### addCount

addCount 方法用于更新元素计数，并在必要时触发扩容。使用类似 **LongAdder** 的分段计数技术减少竞争。

```java
private final void addCount(long x, int check) {
    CounterCell[] as; long b, s;

    // 1. 尝试更新 baseCount
    // 如果 counterCells 不为空 或 CAS 更新 baseCount 失败，则使用 CounterCell
    if ((as = counterCells) != null ||
        !U.compareAndSwapLong(this, BASECOUNT, b = baseCount, s = b + x)) {

        CounterCell a; long v; int m;
        boolean uncontended = true;

        // 2. 尝试在 CounterCell 中更新计数
        if (as == null || (m = as.length - 1) < 0 ||
            (a = as[ThreadLocalRandom.getProbe() & m]) == null ||
            !(uncontended = U.compareAndSwapLong(a, CELLVALUE, v = a.value, v + x))) {
            // 如果失败，调用 fullAddCount 处理（类似 LongAdder.longAccumulate）
            fullAddCount(x, uncontended);
            return;
        }

        if (check <= 1)
            return;

        // 3. 计算当前元素总数
        s = sumCount();
    }

    // 4. 检查是否需要扩容
    if (check >= 0) {
        Node<K,V>[] tab, nt; int n, sc;

        // 当元素数量 >= 扩容阈值 且 table 未达到最大容量时，触发扩容
        while (s >= (long)(sc = sizeCtl) && (tab = table) != null &&
               (n = tab.length) < MAXIMUM_CAPACITY) {

            int rs = resizeStamp(n);  // 扩容标记

            // 4.1 如果已经在扩容
            if (sc < 0) {
                // 检查扩容是否已完成或无法加入
                if ((sc >>> RESIZE_STAMP_SHIFT) != rs || sc == rs + 1 ||
                    sc == rs + MAX_RESIZERS || (nt = nextTable) == null ||
                    transferIndex <= 0)
                    break;

                // 加入扩容，将 sizeCtl + 1（表示多一个线程参与扩容）
                if (U.compareAndSwapInt(this, SIZECTL, sc, sc + 1))
                    transfer(tab, nt);
            }
            // 4.2 当前线程作为第一个扩容线程
            else if (U.compareAndSwapInt(this, SIZECTL, sc,
                                         (rs << RESIZE_STAMP_SHIFT) + 2))
                transfer(tab, null);

            // 重新计算元素总数
            s = sumCount();
        }
    }
}
```

::: tip 分段计数技术

**计数机制（类似 LongAdder）：**

1. **baseCount**：基础计数器，低竞争时直接 CAS 更新
2. **CounterCell[]**：计数单元数组，高竞争时分散到不同的 Cell 中更新
3. **总数计算**：`sumCount() = baseCount + sum(CounterCell[])`

**优势：**
- 减少线程竞争：不同线程可以更新不同的 CounterCell
- 性能更高：避免所有线程竞争同一个计数器

**扩容触发：**

1. **条件**：`元素总数 >= sizeCtl`（扩容阈值）
2. **协作扩容**：多个线程可以同时参与扩容（通过 `sizeCtl` 记录参与线程数）
3. **sizeCtl 在扩容期间**：
   - 高 16 位：扩容标记（resizeStamp）
   - 低 16 位：参与扩容的线程数 + 1

:::