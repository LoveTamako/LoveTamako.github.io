# CopyOnWriteArrayList

## 基本介绍

CopyOnWriteArrayList 是一个**线程安全的 ArrayList 变体**，使用**写时复制（Copy-On-Write）** 策略实现线程安全。

**核心思想：**
- **读操作**：直接读取底层数组，**不加锁**，性能极高
- **写操作**：复制一份新数组，在新数组上修改，修改完成后替换原数组

**核心特点：**
- **读写分离**：读操作不阻塞，写操作之间互斥
- **适合读多写少**：写操作有复制开销，读操作无锁高效
- **弱一致性**：读操作可能读到旧数据
- **迭代器不会抛出 ConcurrentModificationException**

**CopyOnWriteArraySet：** 基于 CopyOnWriteArrayList 实现，是它的 Set 版本。

## 实现原理

### 写操作：add() 方法

```java
public boolean add(E e) {
    final ReentrantLock lock = this.lock;
    lock.lock();  // 写操作加锁
    try {
        Object[] elements = getArray();  // 获取当前数组
        int len = elements.length;
        Object[] newElements = Arrays.copyOf(elements, len + 1);  // 复制新数组
        newElements[len] = e;  // 在新数组上添加元素
        setArray(newElements);  // 替换为新数组
        return true;
    } finally {
        lock.unlock();
    }
}
```

**关键步骤：**
1. 获取锁（写操作之间互斥）
2. 复制原数组到新数组
3. 在新数组上进行修改
4. 用新数组替换原数组
5. 释放锁

### 读操作：get() 方法

```java
public E get(int index) {
    return get(getArray(), index);  // 直接读取，不加锁
}

private E get(Object[] a, int index) {
    return (E) a[index];
}
```

**关键点：**
- 读操作不加锁，直接访问底层数组
- 多个线程可以同时读取
- 读取时可能读到旧数据（弱一致性）

## 弱一致性

### get() 弱一致性

```
时刻 T1：线程 A 开始读取 list.get(0)，此时数组为 [1, 2, 3]
时刻 T2：线程 B 执行 list.add(4)，创建新数组 [1, 2, 3, 4]，替换原数组
时刻 T3：线程 A 继续读取 list.get(3)，读取到新数组，返回 4

线程 A 在一次操作中可能看到不同版本的数据
```

### 迭代器弱一致性

**迭代器快照特性：**

```java
CopyOnWriteArrayList<Integer> list = new CopyOnWriteArrayList<>(Arrays.asList(1, 2, 3));

Iterator<Integer> it = list.iterator();  // 迭代器持有当前数组的快照
list.add(4);  // 修改操作创建新数组

while (it.hasNext()) {
    System.out.println(it.next());  // 输出：1, 2, 3（不包括 4）
}
```

**关键特点：**
- 迭代器创建时会保存当前数组的引用（快照）
- 后续的修改不会影响已创建的迭代器
- **不会抛出 ConcurrentModificationException**（与普通 ArrayList 不同）

**弱一致性并非缺陷：**
- 数据库的 MVCC（多版本并发控制）也是弱一致性
- **并发性和强一致性是矛盾的**，需要权衡
- 在读多写少场景下，弱一致性换来的高性能是值得的

## 使用场景

### 适用场景

**1. 读多写少**
- 读操作频率远高于写操作
- 典型场景：配置信息、监听器列表、白名单/黑名单

**2. 迭代操作频繁**
- 需要频繁遍历集合
- 不能容忍 ConcurrentModificationException
- 示例：事件监听器列表的遍历通知

**3. 集合规模不大**
- 写操作需要复制整个数组，开销与数组大小成正比
- 适合元素数量较少的场景（如几百个以内）

**4. 可以接受弱一致性**
- 读操作可以读到稍旧的数据
- 不需要实时看到最新写入的数据

### 不适用场景

**1. 写操作频繁**
- 每次写操作都要复制数组，开销很大
- 写多读少的场景应使用 Collections.synchronizedList() 或 ConcurrentHashMap

**2. 集合规模大**
- 数组很大时，复制开销不可接受
- 内存占用翻倍（新旧数组同时存在）

**3. 需要实时一致性**
- 写入后必须立即读到最新数据
- 应使用同步集合或 ConcurrentHashMap

**4. 内存敏感**
- 写操作会产生临时的数组副本，占用额外内存
- 在内存紧张的环境下不适合

## 与其他并发集合的对比

| 特性 | CopyOnWriteArrayList | Collections.synchronizedList | Vector |
|------|---------------------|------------------------------|--------|
| **读操作加锁** | 否 | 是 | 是 |
| **写操作加锁** | 是 | 是 | 是 |
| **读写并发** | 读读并发，读写并发 | 都互斥 | 都互斥 |
| **迭代器** | 快照，不会抛异常 | 需要手动同步 | 需要手动同步 |
| **写操作开销** | 大（复制数组）| 小（只加锁）| 小（只加锁）|
| **读操作性能** | 极高（无锁）| 一般（需要锁）| 一般（需要锁）|
| **适用场景** | 读多写少 | 读写均衡 | 已过时，不推荐 |

**选择建议：**
- **读多写少** → CopyOnWriteArrayList
- **读写均衡或写多** → Collections.synchronizedList 或 ConcurrentHashMap
- **需要强一致性** → 同步集合