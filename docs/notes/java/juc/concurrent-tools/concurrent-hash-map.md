# ConcurrentHashMap

ConcurrentHashMap 是 Java 并发包中最重要的线程安全 Map 实现，相比 Hashtable 和 `Collections.synchronizedMap()`，它提供了更高的并发性能。

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

## JDK8 源码分析

本节分析 JDK8 ConcurrentHashMap 的核心实现，重点关注以下内容：

- **数据结构**：Node 数组 + 链表/红黑树
- **并发控制**：CAS + synchronized 细粒度锁
- **核心方法**：put、get、扩容机制
- **性能优化**：无锁读取、协作扩容、红黑树

### 构造器

ConcurrentHashMap 构造器采用**懒加载**策略，不会立即初始化数组，而是在首次插入时才初始化。

```java
public ConcurrentHashMap(int initialCapacity,
                         float loadFactor,
                         int concurrencyLevel) {
    // 参数校验：loadFactor 必须大于 0，容量和并发级别必须为正数
    if (!(loadFactor > 0.0f) || initialCapacity < 0 || concurrencyLevel <= 0)
        throw new IllegalArgumentException();

    // 确保初始容量至少等于并发级别
    if (initialCapacity < concurrencyLevel)
        initialCapacity = concurrencyLevel;

    // 计算实际需要的容量：initialCapacity / loadFactor + 1
    long size = (long)(1.0 + (long)initialCapacity / loadFactor);
    // 确保容量不超过最大值，并向上取整到 2 的幂次
    int cap = (size >= MAXIMUM_CAPACITY) ?
        MAXIMUM_CAPACITY : tableSizeFor((int)size);

    // 将计算出的容量保存到 sizeCtl，作为初始化时的容量
    // table 数组此时为 null，延迟到首次 put 时才初始化
    this.sizeCtl = cap;
}
```

**关键点：**
- **懒加载**：只设置 sizeCtl，不分配数组空间
- **参数兼容**：loadFactor 和 concurrencyLevel 在 JDK8 中已不使用，仅为兼容旧版本

### get()

get 方法是**无锁操作**，通过 volatile 读保证线程安全，性能极高。

```java
public V get(Object key) {
    Node<K,V>[] tab; Node<K,V> e, p; int n, eh; K ek;
    // 计算 hash 值，spread 方法会将 hash 值的高位也参与计算
    int h = spread(key.hashCode());

    // 检查 table 是否已初始化，并定位到对应的桶
    if ((tab = table) != null && (n = tab.length) > 0 &&
        (e = tabAt(tab, (n - 1) & h)) != null) {

        // 检查头节点是否就是要找的节点
        if ((eh = e.hash) == h) {
            if ((ek = e.key) == key || (ek != null && key.equals(ek)))
                return e.val;
        }
        // hash < 0 表示特殊节点：ForwardingNode(正在扩容) 或 TreeBin(红黑树)
        else if (eh < 0)
            return (p = e.find(h, key)) != null ? p.val : null;

        // 遍历链表查找
        while ((e = e.next) != null) {
            if (e.hash == h &&
                ((ek = e.key) == key || (ek != null && key.equals(ek))))
                return e.val;
        }
    }
    // 未找到返回 null
    return null;
}
```

**无锁原因：** volatile 保证可见性，get 只读不写，扩容时 ForwardingNode 自动转向新数组。

### put()

put 方法使用**细粒度锁**（锁单个桶的头节点）保证线程安全，并发性能高于 JDK7 的分段锁。

```java
final V putVal(K key, V value, boolean onlyIfAbsent) {
    // ConcurrentHashMap 不允许 null 键和 null 值
    if (key == null || value == null) throw new NullPointerException();

    // 计算 hash 值
    int hash = spread(key.hashCode());
    int binCount = 0;  // 记录链表长度，用于判断是否需要树化

    // 自旋直到插入成功
    for (Node<K,V>[] tab = table;;) {
        Node<K,V> f; int n, i, fh;

        // 情况1：table 未初始化，先初始化
        if (tab == null || (n = tab.length) == 0)
            tab = initTable();
        // 情况2：目标桶为空，使用 CAS 无锁插入
        else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
            if (casTabAt(tab, i, null, new Node<K,V>(hash, key, value, null)))
                break;  // CAS 成功，插入完成
        }
        // 情况3：遇到 ForwardingNode，说明正在扩容，帮助扩容
        else if ((fh = f.hash) == MOVED)
            tab = helpTransfer(tab, f);
        // 情况4：桶中已有节点，需要加锁操作
        else {
            V oldVal = null;
            // 锁住桶的头节点，只影响当前桶，其他桶可并发访问
            synchronized (f) {
                // 双重检查，确保头节点没有被其他线程修改
                if (tabAt(tab, i) == f) {
                    // 4.1 链表节点 (hash >= 0)
                    if (fh >= 0) {
                        binCount = 1;
                        // 遍历链表
                        for (Node<K,V> e = f;; ++binCount) {
                            K ek;
                            // 找到相同的 key，更新 value
                            if (e.hash == hash &&
                                ((ek = e.key) == key || key.equals(ek))) {
                                oldVal = e.val;
                                if (!onlyIfAbsent) e.val = value;
                                break;
                            }
                            // 到达链表尾部，插入新节点（尾插法）
                            Node<K,V> pred = e;
                            if ((e = e.next) == null) {
                                pred.next = new Node<K,V>(hash, key, value, null);
                                break;
                            }
                        }
                    }
                    // 4.2 红黑树节点
                    else if (f instanceof TreeBin) {
                        binCount = 2;
                        Node<K,V> p;
                        if ((p = ((TreeBin<K,V>)f).putTreeVal(hash, key, value)) != null) {
                            oldVal = p.val;
                            if (!onlyIfAbsent) p.val = value;
                        }
                    }
                }
            }

            // 插入完成后的处理
            if (binCount != 0) {
                // 链表长度达到阈值（8），转换为红黑树
                if (binCount >= TREEIFY_THRESHOLD)
                    treeifyBin(tab, i);
                // 如果是更新操作，返回旧值
                if (oldVal != null) return oldVal;
                break;
            }
        }
    }

    // 更新元素计数，可能触发扩容
    addCount(1L, binCount);
    return null;
}
```

**关键点：**
- **CAS 优化**：空桶用 CAS 无锁插入
- **细粒度锁**：只锁单个桶，不同桶可并发
- **协作扩容**：遇到扩容自动帮忙
- **链表转树**：长度≥8 时转红黑树

### initTable()

initTable() 方法负责懒初始化数组，使用 **sizeCtl 配合 CAS** 确保只有一个线程执行初始化。

```java
private final Node<K,V>[] initTable() {
    Node<K,V>[] tab; int sc;

    // 自旋等待，直到初始化完成
    while ((tab = table) == null || tab.length == 0) {
        // sizeCtl < 0 表示有其他线程正在初始化，当前线程让出 CPU
        if ((sc = sizeCtl) < 0)
            Thread.yield();  // 让出 CPU 时间片，等待初始化完成
        // 尝试通过 CAS 将 sizeCtl 设置为 -1，表示当前线程获得初始化权限
        else if (U.compareAndSwapInt(this, SIZECTL, sc, -1)) {
            try {
                // 双重检查：防止在获得锁之前，其他线程已经完成初始化
                if ((tab = table) == null || tab.length == 0) {
                    // 确定数组大小：sc > 0 表示构造器中设置的容量，否则使用默认容量
                    int n = (sc > 0) ? sc : DEFAULT_CAPACITY;
                    // 创建新数组
                    @SuppressWarnings("unchecked")
                    Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n];
                    table = tab = nt;
                    // 计算扩容阈值：n - n/4 = 0.75n
                    sc = n - (n >>> 2);
                }
            } finally {
                // 将扩容阈值保存到 sizeCtl，恢复为正数
                sizeCtl = sc;
            }
            break;
        }
    }
    return tab;
}
```

**线程安全机制：** CAS 保证只有一个线程能将 sizeCtl 设为 -1 执行初始化，其他线程通过 `sizeCtl < 0` 判断并 yield 等待。双重检查防止重复初始化，volatile 保证可见性。

### addCount()

addCount 方法用于更新元素计数，并在必要时触发扩容。使用类似 **LongAdder** 的分段计数技术减少竞争。

```java
private final void addCount(long x, int check) {
    CounterCell[] as; long b, s;

    // 分段计数：尝试更新 baseCount 或 CounterCell
    // 如果 counterCells 已存在 或 CAS 更新 baseCount 失败，则使用 CounterCell
    if ((as = counterCells) != null ||
        !U.compareAndSwapLong(this, BASECOUNT, b = baseCount, s = b + x)) {

        CounterCell a; long v; int m;
        boolean uncontended = true;  // 是否存在竞争

        // 尝试在 CounterCell 中更新计数
        // 以下情况需要调用 fullAddCount 进行完整的计数更新：
        // 1. counterCells 未初始化
        // 2. 当前线程对应的 Cell 为 null
        // 3. CAS 更新 Cell 失败（存在竞争）
        if (as == null || (m = as.length - 1) < 0 ||
            (a = as[ThreadLocalRandom.getProbe() & m]) == null ||
            !(uncontended = U.compareAndSwapLong(a, CELLVALUE, v = a.value, v + x))) {
            // 完整的计数更新逻辑（可能扩容 CounterCell 数组）
            fullAddCount(x, uncontended);
            return;
        }

        // check <= 1 表示链表长度 <= 1，不需要检查是否扩容
        if (check <= 1)
            return;

        // 计算当前元素总数
        s = sumCount();
    }

    // 检查是否需要扩容
    if (check >= 0) {
        Node<K,V>[] tab, nt; int n, sc;

        // 循环检查：元素数量 >= 扩容阈值 且 未达到最大容量
        while (s >= (long)(sc = sizeCtl) && (tab = table) != null &&
               (n = tab.length) < MAXIMUM_CAPACITY) {

            // 计算扩容标记（根据当前容量生成唯一标识）
            int rs = resizeStamp(n);

            // sc < 0 表示已经有线程在扩容
            if (sc < 0) {
                // 检查是否可以加入扩容：
                // 1. 扩容标记不匹配（其他容量的扩容）
                // 2. 扩容即将完成或已达到最大帮助线程数
                // 3. nextTable 为 null 或 transferIndex <= 0（没有可分配的任务）
                if ((sc >>> RESIZE_STAMP_SHIFT) != rs || sc == rs + 1 ||
                    sc == rs + MAX_RESIZERS || (nt = nextTable) == null ||
                    transferIndex <= 0)
                    break;

                // CAS 增加 sizeCtl，表示多一个线程参与扩容
                if (U.compareAndSwapInt(this, SIZECTL, sc, sc + 1))
                    transfer(tab, nt);  // 帮助扩容
            }
            // 当前线程是第一个发起扩容的线程
            else if (U.compareAndSwapInt(this, SIZECTL, sc,
                                         (rs << RESIZE_STAMP_SHIFT) + 2))
                transfer(tab, null);  // 开始扩容

            // 重新计算元素总数，继续检查
            s = sumCount();
        }
    }
}
```

**关键机制：**
- **分段计数**：baseCount + CounterCell[] 数组，类似 LongAdder 设计，减少线程竞争
- **扩容触发**：元素总数 >= sizeCtl 时触发，多线程可协作扩容
- **sizeCtl 编码**：扩容期间高 16 位存储扩容标记，低 16 位记录参与线程数

### size()

size() 方法通过 sumCount() 计算元素总数，采用分段计数技术。

```java
public int size() {
    // 通过 sumCount() 计算元素总数
    long n = sumCount();
    // 处理边界情况：负数返回0，超过int最大值返回最大值
    return ((n < 0L) ? 0 :
            (n > (long)Integer.MAX_VALUE) ? Integer.MAX_VALUE :
            (int)n);
}

final long sumCount() {
    CounterCell[] as = counterCells;
    CounterCell a;
    // 从 baseCount 开始累加
    long sum = baseCount;
    // 遍历所有 CounterCell，累加每个 Cell 的值
    if (as != null) {
        for (int i = 0; i < as.length; ++i) {
            if ((a = as[i]) != null)
                sum += a.value;  // 累加非空 Cell 的计数
        }
    }
    return sum;  // 返回总数：baseCount + sum(CounterCell[])
}
```

**实现原理：** 总数 = baseCount + sum(CounterCell[])，类似 LongAdder 设计。由于没有全局锁，返回的是近似值而非精确快照，满足**弱一致性**。

### transfer()

transfer() 负责扩容时的数据迁移，核心特点是**支持多线程协作扩容**。

**扩容触发：** putVal() 后元素数超过阈值，或 treeifyBin() 时数组长度 < 64。

```java
private final void transfer(Node<K,V>[] tab, Node<K,V>[] nextTab) {
    int n = tab.length, stride;

    // 计算每个线程处理的桶数量（stride）
    // 多核情况下：数组长度 / 8 / CPU核心数，最小为 16
    // 单核情况下：处理整个数组
    if ((stride = (NCPU > 1) ? (n >>> 3) / NCPU : n) < MIN_TRANSFER_STRIDE)
        stride = MIN_TRANSFER_STRIDE;

    // 初始化新数组（只有第一个发起扩容的线程执行）
    if (nextTab == null) {
        try {
            // 创建容量翻倍的新数组
            @SuppressWarnings("unchecked")
            Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n << 1];
            nextTab = nt;
        } catch (Throwable ex) {
            // 扩容失败，设置 sizeCtl 为最大值，不再扩容
            sizeCtl = Integer.MAX_VALUE;
            return;
        }
        nextTable = nextTab;
        transferIndex = n;  // 从数组末尾开始分配任务
    }

    int nextn = nextTab.length;
    // 创建 ForwardingNode，用于标记已迁移的桶
    ForwardingNode<K,V> fwd = new ForwardingNode<K,V>(nextTab);
    boolean advance = true;   // 是否继续处理下一个桶
    boolean finishing = false; // 是否完成扩容

    // 主循环：处理桶的迁移
    for (int i = 0, bound = 0;;) {
        Node<K,V> f; int fh;

        // 内层循环：获取下一个需要处理的桶索引
        while (advance) {
            int nextIndex, nextBound;
            // 当前区间还有未处理的桶，继续处理
            if (--i >= bound || finishing)
                advance = false;
            // transferIndex <= 0 表示所有桶都已分配完毕
            else if ((nextIndex = transferIndex) <= 0) {
                i = -1;
                advance = false;
            }
            // 通过 CAS 获取一批桶的处理权（stride 个）
            else if (U.compareAndSwapInt(this, TRANSFERINDEX, nextIndex,
                    nextBound = (nextIndex > stride ? nextIndex - stride : 0))) {
                bound = nextBound;      // 当前线程处理区间的下界
                i = nextIndex - 1;      // 从区间末尾开始处理
                advance = false;
            }
        }

        // 检查是否完成扩容
        if (i < 0 || i >= n || i + n >= nextn) {
            int sc;
            if (finishing) {
                // 扩容完成，清理临时变量
                nextTable = null;
                table = nextTab;                    // 切换到新数组
                sizeCtl = (n << 1) - (n >>> 1);     // 设置新的扩容阈值 0.75 * 2n
                return;
            }
            // 当前线程完成任务，sizeCtl - 1
            if (U.compareAndSwapInt(this, SIZECTL, sc = sizeCtl, sc - 1)) {
                // 如果不是最后一个完成的线程，直接返回
                if ((sc - 2) != resizeStamp(n) << RESIZE_STAMP_SHIFT)
                    return;
                // 最后一个线程负责完成收尾工作
                finishing = advance = true;
                i = n;  // 重新检查一遍，确保所有桶都已迁移
            }
        }

        // 处理空桶：直接放置 ForwardingNode
        else if ((f = tabAt(tab, i)) == null)
            advance = casTabAt(tab, i, null, fwd);

        // 该桶已被其他线程处理（遇到 ForwardingNode）
        else if ((fh = f.hash) == MOVED)
            advance = true;

        // 处理有数据的桶
        else {
            // 锁住桶的头节点
            synchronized (f) {
                // 双重检查，确保头节点未被修改
                if (tabAt(tab, i) == f) {
                    Node<K,V> ln, hn;  // 低位链表和高位链表

                    // 处理链表节点
                    if (fh >= 0) {
                        // runBit 用于标记节点应该放在低位还是高位
                        int runBit = fh & n;
                        Node<K,V> lastRun = f;

                        // 找到最后一段连续的相同 runBit 的节点
                        // 这部分节点可以直接复用，不需要重新创建
                        for (Node<K,V> p = f.next; p != null; p = p.next) {
                            int b = p.hash & n;
                            if (b != runBit) {
                                runBit = b;
                                lastRun = p;
                            }
                        }

                        // 设置最后一段的起始节点
                        if (runBit == 0) {
                            ln = lastRun;  // 低位链表
                            hn = null;
                        } else {
                            hn = lastRun;  // 高位链表
                            ln = null;
                        }

                        // 处理 lastRun 之前的节点，根据 hash & n 分配到两个链表
                        for (Node<K,V> p = f; p != lastRun; p = p.next) {
                            int ph = p.hash; K pk = p.key; V pv = p.val;
                            if ((ph & n) == 0)
                                ln = new Node<K,V>(ph, pk, pv, ln);  // 低位链表（原位置）
                            else
                                hn = new Node<K,V>(ph, pk, pv, hn);  // 高位链表（原位置+n）
                        }

                        // 将两个链表放到新数组的对应位置
                        setTabAt(nextTab, i, ln);        // 低位链表：原位置
                        setTabAt(nextTab, i + n, hn);    // 高位链表：原位置 + 旧容量
                        setTabAt(tab, i, fwd);           // 标记旧数组该位置已迁移
                        advance = true;
                    }
                    // 处理红黑树节点
                    else if (f instanceof TreeBin) {
                        TreeBin<K,V> t = (TreeBin<K,V>)f;
                        TreeNode<K,V> lo = null, loTail = null;  // 低位树节点链表
                        TreeNode<K,V> hi = null, hiTail = null;  // 高位树节点链表
                        int lc = 0, hc = 0;  // 低位和高位的节点计数

                        // 遍历红黑树，根据 hash & n 分成两部分
                        for (Node<K,V> e = t.first; e != null; e = e.next) {
                            int h = e.hash;
                            TreeNode<K,V> p = new TreeNode<K,V>(h, e.key, e.val, null, null);
                            if ((h & n) == 0) {
                                // 低位节点
                                if ((p.prev = loTail) == null)
                                    lo = p;
                                else
                                    loTail.next = p;
                                loTail = p;
                                ++lc;
                            } else {
                                // 高位节点
                                if ((p.prev = hiTail) == null)
                                    hi = p;
                                else
                                    hiTail.next = p;
                                hiTail = p;
                                ++hc;
                            }
                        }

                        // 根据节点数量决定保持树结构还是退化为链表
                        ln = (lc <= UNTREEIFY_THRESHOLD) ? untreeify(lo) :
                            (hc != 0) ? new TreeBin<K,V>(lo) : t;
                        hn = (hc <= UNTREEIFY_THRESHOLD) ? untreeify(hi) :
                            (lc != 0) ? new TreeBin<K,V>(hi) : t;

                        // 将两部分放到新数组的对应位置
                        setTabAt(nextTab, i, ln);
                        setTabAt(nextTab, i + n, hn);
                        setTabAt(tab, i, fwd);
                        advance = true;
                    }
                }
            }
        }
    }
}
```

**关键机制：**
- **任务分配**：线程通过 CAS 从 transferIndex 获取一批桶（stride 个）的迁移权，从后往前分配
- **ForwardingNode 标记**：迁移完的桶标记为 ForwardingNode（hash=-1），读操作转向新数组，写操作帮助扩容
- **节点重定位**：根据 `hash & oldCapacity` 判断节点位置，要么留在原位置 i，要么移到 i+n
- **多线程协作**：第一个线程创建新数组，后续线程通过 helpTransfer() 加入，最后一个线程更新 table 引用

**性能优势：** 并行扩容、不阻塞读、细粒度锁、任务窃取，相比 JDK7 全表锁扩容性能显著提升。

## JDK7 ConcurrentHashMap

::: warning 学习重点
本部分主要介绍 JDK7 的**分段锁（Segment）设计思想**，帮助理解 JDK8 的改进方向。

**学习建议：**
- 重点理解 Segment 分段锁的核心思想和设计目的
- 了解基本的结构和主要方法即可，不需要深究实现细节
- 重点关注与 JDK8 的对比，理解为什么 JDK8 要放弃 Segment
:::

### 结构

JDK7 的 ConcurrentHashMap 采用**分段锁（Segment）**设计，是一种**数组 + 数组 + 链表**的三层结构。

```
ConcurrentHashMap
    └── Segment[] (默认16个，继承ReentrantLock)
        └── HashEntry[] (存储键值对)
            └── Entry -> Entry -> null (链表)
```

#### 核心类

```java
// 1. ConcurrentHashMap 主类
public class ConcurrentHashMap<K, V> {
    final Segment<K,V>[] segments;  // Segment 数组
    final int segmentMask;           // 定位掩码
    final int segmentShift;          // 定位位移
}

// 2. Segment 类（继承 ReentrantLock）
static final class Segment<K,V> extends ReentrantLock {
    transient volatile HashEntry<K,V>[] table;  // 存储数据
    transient int count;                        // 元素数量
}

// 3. HashEntry 类
static final class HashEntry<K,V> {
    final int hash;
    final K key;
    volatile V value;        // volatile 保证可见性
    volatile HashEntry<K,V> next;
}
```

#### 分段锁机制

**核心思想：** 将 Map 分成多个 Segment，每个 Segment 独立加锁，不同 Segment 可以并发访问。

- **并发度**：默认 16 个 Segment，最多支持 16 个线程同时写入
- **定位方式**：`(hash >>> segmentShift) & segmentMask` 定位 Segment
- **读操作**：大部分情况无需加锁（依赖 volatile）

::: tip JDK7 vs JDK8
- **JDK7**：使用 Segment 分段锁，并发度固定（默认16）
- **JDK8**：取消 Segment，使用 synchronized 锁桶头节点，并发度等于数组长度
:::

### 构造器

JDK7 ConcurrentHashMap 构造器负责初始化 Segment 数组，采用**懒加载**策略。

```java
public ConcurrentHashMap(int initialCapacity,
                         float loadFactor,
                         int concurrencyLevel) {
    // 1. 计算 Segment 数量 (必须是 2 的幂次，>= concurrencyLevel)
    int ssize = 1;
    while (ssize < concurrencyLevel) {
        ssize <<= 1;
    }

    // 2. 计算定位参数
    this.segmentShift = 32 - Integer.numberOfLeadingZeros(ssize - 1);
    this.segmentMask = ssize - 1;

    // 3. 创建 Segment 数组，只初始化第一个 Segment
    Segment<K,V>[] ss = new Segment[ssize];
    ss[0] = new Segment<K,V>(...);  // 其他 Segment 首次访问时创建
    this.segments = ss;
}
```

**关键参数：**

- **initialCapacity**：期望容量
- **loadFactor**：负载因子，默认 0.75
- **concurrencyLevel**：并发级别，决定 Segment 数量（JDK8 中此参数被忽略）

**初始化特点：**

1. **Segment 数量**：向上取整到 2 的幂次（例如 concurrencyLevel=12 → 16 个 Segment）
2. **懒加载**：只创建第一个 Segment，其他按需创建
3. **定位公式**：`segmentIndex = (hash >>> segmentShift) & segmentMask`

### put()

JDK7 的 put 方法使用 **Segment 级别的锁** 来保证线程安全。

```java
public V put(K key, V value) {
    Segment<K,V> s;
    if (value == null)
        throw new NullPointerException();

    // 1. 计算 hash
    int hash = hash(key);

    // 2. 定位 Segment
    int j = (hash >>> segmentShift) & segmentMask;
    s = ensureSegment(j);  // 如果 Segment 不存在则创建

    // 3. 调用 Segment 的 put 方法（会加锁）
    return s.put(key, hash, value, false);
}

// Segment 的 put 方法
final V put(K key, int hash, V value, boolean onlyIfAbsent) {
    // 尝试获取锁,失败则自旋等待
    HashEntry<K,V> node = tryLock() ? null :
        scanAndLockForPut(key, hash, value);

    V oldValue;
    try {
        HashEntry<K,V>[] tab = table;
        int index = (tab.length - 1) & hash;
        HashEntry<K,V> first = entryAt(tab, index);

        // 遍历链表查找 key
        for (HashEntry<K,V> e = first;;) {
            if (e != null) {
                K k;
                if ((k = e.key) == key || (hash == e.hash && key.equals(k))) {
                    oldValue = e.value;
                    if (!onlyIfAbsent) {
                        e.value = value;  // 更新值
                    }
                    break;
                }
                e = e.next;
            } else {
                // 插入新节点（头插法）
                if (node != null)
                    node.setNext(first);
                else
                    node = new HashEntry<K,V>(hash, key, value, first);

                setEntryAt(tab, index, node);
                ++count;
                break;
            }
        }
    } finally {
        unlock();  // 释放锁
    }
    return oldValue;
}
```

**关键步骤:**

1. **定位 Segment**: 通过 hash 值定位到对应的 Segment
2. **获取锁**: 调用 `tryLock()` 尝试获取 Segment 的锁
3. **插入/更新**:
   - 找到 key 则更新 value
   - 未找到则使用**头插法**插入新节点
4. **释放锁**: finally 块中释放锁

**线程安全机制:**

- 不同 Segment 的 put 操作可以**并发执行**
- 同一 Segment 的 put 操作需要**串行执行**（加锁）
- 读操作（get）大部分情况下**不需要加锁**（依赖 volatile）

### rehash()

JDK7 中每个 Segment **独立进行扩容**，只锁定当前 Segment，不影响其他 Segment 的并发访问。

```java
void rehash(HashEntry<K,V> node) {
    HashEntry<K,V>[] oldTable = table;
    int oldCapacity = oldTable.length;
    int newCapacity = oldCapacity << 1;  // 容量翻倍
    threshold = (int)(newCapacity * loadFactor);

    // 创建新数组
    HashEntry<K,V>[] newTable = new HashEntry[newCapacity];

    // 转移节点
    for (int i = 0; i < oldCapacity; i++) {
        HashEntry<K,V> e = oldTable[i];
        if (e != null) {
            HashEntry<K,V> next = e.next;
            int idx = e.hash & sizeMask;

            // 整条链移动到同一位置
            if (next == null)
                newTable[idx] = e;
            else {
                // 遍历链表重新分配位置
                // ...
            }
        }
    }

    // 插入触发扩容的新节点
    int nodeIndex = node.hash & sizeMask;
    node.setNext(newTable[nodeIndex]);
    newTable[nodeIndex] = node;

    table = newTable;
}
```

**关键特点:**

- **Segment 级别扩容**: 只扩容当前 Segment，不影响其他 Segment
- **容量翻倍**: 新容量 = 旧容量 × 2
- **持有锁**: 扩容期间持有 Segment 锁，该 Segment 的其他操作需要等待
- **并发性**: 其他 Segment 可以同时进行读写操作

**与 JDK8 对比:**

- **JDK7**: Segment 独立扩容，并发度受限于 Segment 数量
- **JDK8**: 全局扩容，支持多线程协作扩容（transfer 方法）

### get()

JDK7 的 get 方法**几乎无锁**，通过 volatile 保证可见性。

```java
public V get(Object key) {
    Segment<K,V> s;
    HashEntry<K,V>[] tab;
    int h = hash(key);

    // 定位 Segment
    long u = (((h >>> segmentShift) & segmentMask) << SSHIFT) + SBASE;
    if ((s = (Segment<K,V>)UNSAFE.getObjectVolatile(segments, u)) != null &&
        (tab = s.table) != null) {

        // 定位 HashEntry 并遍历链表
        for (HashEntry<K,V> e = (HashEntry<K,V>) UNSAFE.getObjectVolatile
                 (tab, ((long)(((tab.length - 1) & h)) << TSHIFT) + TBASE);
             e != null; e = e.next) {
            K k;
            if ((k = e.key) == key || (e.hash == h && key.equals(k)))
                return e.value;
        }
    }
    return null;
}
```

**关键特点:**

- **无需加锁**: 依赖 volatile 语义保证可见性
- **高性能**: 读操作不会被写操作阻塞
- **弱一致性**: 可能读到旧值（但不会读到未初始化的值）

### size()

JDK7 的 size 方法需要**汇总所有 Segment 的元素数量**，使用**重试机制**避免加锁。

```java
public int size() {
    final Segment<K,V>[] segments = this.segments;
    long sum = 0;
    long check = 0;
    int[] mc = new int[segments.length];

    // 最多重试 RETRIES_BEFORE_LOCK 次（默认2次）
    for (int k = 0; k < RETRIES_BEFORE_LOCK; ++k) {
        check = 0;
        sum = 0;

        // 统计所有 Segment 的 count 和 modCount
        for (int i = 0; i < segments.length; ++i) {
            sum += segments[i].count;
            check += mc[i] = segments[i].modCount;
        }

        // 如果 modCount 没有变化，说明期间没有修改操作
        if (check == 0)
            break;
    }

    // 重试失败，锁定所有 Segment 再统计
    if (check != 0) {
        for (int i = 0; i < segments.length; ++i)
            segments[i].lock();

        for (int i = 0; i < segments.length; ++i)
            sum += segments[i].count;

        for (int i = 0; i < segments.length; ++i)
            segments[i].unlock();
    }

    return (sum > Integer.MAX_VALUE) ? Integer.MAX_VALUE : (int)sum;
}
```

**实现策略:**

1. **乐观重试**: 先尝试无锁方式统计，通过 modCount 检测是否有修改
2. **悲观加锁**: 重试失败后，锁定所有 Segment 进行精确统计
3. **弱一致性**: 无锁方式返回的是近似值

**性能权衡:**

- 大多数情况下无需加锁，性能较好
- 高并发写入时可能需要锁定所有 Segment，性能下降

## JDK7 vs JDK8 对比总结

### 核心改进

| 对比维度 | JDK7 | JDK8 |
|---------|------|------|
| **锁机制** | 分段锁（Segment 继承 ReentrantLock） | synchronized 锁桶头节点 |
| **数据结构** | Segment[] → HashEntry[] → 链表 | Node[] → 链表/红黑树 |
| **并发度** | 固定（默认16，由 Segment 数量决定） | 动态（等于数组长度，最大可达数组大小） |
| **扩容方式** | 各 Segment 独立扩容，单线程 | 全局扩容，多线程协作 |
| **内存开销** | 较高（需要维护 Segment 数组结构） | 较低（去除了 Segment 层） |

### 为什么 JDK8 放弃 Segment？

**JDK7 Segment 的局限性：**

1. **并发度受限**：Segment 数量在初始化时确定，无法动态调整
2. **锁粒度较粗**：整个 Segment 加锁，而不是单个桶
3. **内存浪费**：Segment 数组占用额外空间，且懒加载机制复杂
4. **扩容效率低**：各 Segment 独立扩容，无法多线程协作

**JDK8 的优化策略：**

1. **更细粒度的锁**：只锁单个桶的头节点，不同桶可以完全并发
2. **CAS + synchronized**：空桶使用 CAS 无锁插入，有节点时才用 synchronized
3. **协作扩容**：多线程同时参与扩容，充分利用 CPU
4. **红黑树优化**：链表长度超过 8 时转为红黑树，提升查询效率

### 性能提升

JDK8 相比 JDK7 的性能提升主要体现在：

- **高并发写入**：并发度不再受限，理论上可达数组长度
- **扩容性能**：多线程协作扩容，速度更快
- **读取性能**：红黑树结构在 hash 冲突严重时性能更稳定
- **内存效率**：去除 Segment 层，减少内存占用

::: tip 总结
JDK8 的 ConcurrentHashMap 通过**取消 Segment**、**引入红黑树**、**实现协作扩容**三大改进，在并发性能、内存效率和代码简洁性上都有显著提升，是现代并发编程中的首选方案。
:::