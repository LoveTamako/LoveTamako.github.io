# 垃圾回收机制

## 什么是垃圾回收？

垃圾回收（Garbage Collection，GC）是 JVM 自动管理内存的机制，负责回收不再使用的对象所占用的内存空间。

## 如何判断对象是否可回收？

### 1. 引用计数法（Reference Counting）

**原理**：
- 给对象添加一个引用计数器
- 每当有一个地方引用它时，计数器加 1
- 引用失效时，计数器减 1
- 计数器为 0 的对象可被回收

**缺点**：
- 无法解决循环引用问题

```java
public class CircularReference {
    public Object instance = null;

    public static void main(String[] args) {
        CircularReference obj1 = new CircularReference();
        CircularReference obj2 = new CircularReference();

        // 循环引用
        obj1.instance = obj2;
        obj2.instance = obj1;

        obj1 = null;
        obj2 = null;
        // 两个对象互相引用，引用计数永远不为 0
    }
}
```

### 2. 可达性分析算法（Reachability Analysis）

**原理**：
- 通过一系列称为 "GC Roots" 的对象作为起始点
- 从这些节点开始向下搜索，搜索走过的路径称为引用链
- 当一个对象到 GC Roots 没有任何引用链相连时，证明此对象不可用

**可以作为 GC Roots 的对象**：
- 虚拟机栈中引用的对象
- 方法区中类静态属性引用的对象
- 方法区中常量引用的对象
- 本地方法栈中 JNI 引用的对象

## Java 中的引用类型

### 1. 强引用（Strong Reference）

```java
Object obj = new Object();
```

只要强引用存在，垃圾收集器永远不会回收被引用的对象。

### 2. 软引用（Soft Reference）

```java
SoftReference<Object> softRef = new SoftReference<>(new Object());
```

在系统将要发生内存溢出之前，会把这些对象列入回收范围进行第二次回收。

### 3. 弱引用（Weak Reference）

```java
WeakReference<Object> weakRef = new WeakReference<>(new Object());
```

只能生存到下一次垃圾收集发生之前。

### 4. 虚引用（Phantom Reference）

```java
PhantomReference<Object> phantomRef = new PhantomReference<>(new Object(), queue);
```

无法通过虚引用获取对象实例，唯一目的是在对象被回收时收到一个系统通知。

## 垃圾回收算法

### 1. 标记-清除算法（Mark-Sweep）

**过程**：
1. 标记阶段：标记所有需要回收的对象
2. 清除阶段：回收被标记的对象

**缺点**：
- 效率不高
- 产生大量内存碎片

### 2. 标记-复制算法（Mark-Copy）

**过程**：
1. 将内存分为两块相等的区域
2. 每次只使用其中一块
3. 当这一块用完时，将存活的对象复制到另一块
4. 清理已使用的内存空间

**优点**：
- 实现简单，运行高效
- 不会产生内存碎片

**缺点**：
- 可用内存缩小为原来的一半
- 对象存活率高时效率降低

**应用场景**：
- 新生代的垃圾回收

### 3. 标记-整理算法（Mark-Compact）

**过程**：
1. 标记阶段：标记所有存活的对象
2. 整理阶段：让所有存活对象向一端移动
3. 清理掉边界以外的内存

**优点**：
- 不会产生内存碎片
- 不会浪费内存空间

**缺点**：
- 效率较低（需要移动对象）

**应用场景**：
- 老年代的垃圾回收

### 4. 分代收集算法（Generational Collection）

**原理**：
- 根据对象存活周期将内存划分为几块
- 不同区域采用不同的回收算法

**新生代**：
- 对象存活率低
- 使用标记-复制算法

**老年代**：
- 对象存活率高
- 使用标记-清除或标记-整理算法

## 垃圾收集器

### 1. Serial 收集器

- 单线程收集器
- 进行垃圾收集时，必须暂停所有工作线程（Stop The World）
- 适用于客户端模式

### 2. ParNew 收集器

- Serial 收集器的多线程版本
- 适用于服务端模式

### 3. Parallel Scavenge 收集器

- 多线程收集器
- 关注点是达到可控制的吞吐量
- 适合后台运算不需要太多交互的任务

### 4. Serial Old 收集器

- Serial 收集器的老年代版本
- 单线程收集器
- 使用标记-整理算法

### 5. Parallel Old 收集器

- Parallel Scavenge 收集器的老年代版本
- 多线程收集器
- 使用标记-整理算法

### 6. CMS 收集器（Concurrent Mark Sweep）

**特点**：
- 以获取最短回收停顿时间为目标
- 基于标记-清除算法

**运行过程**：
1. 初始标记（Stop The World）
2. 并发标记
3. 重新标记（Stop The World）
4. 并发清除

**优点**：
- 并发收集、低停顿

**缺点**：
- 对 CPU 资源敏感
- 无法处理浮动垃圾
- 产生内存碎片

### 7. G1 收集器（Garbage First）

**特点**：
- 面向服务端应用
- 并行与并发
- 分代收集
- 空间整合（整体基于标记-整理，局部基于标记-复制）
- 可预测的停顿

**内存布局**：
- 将堆内存划分为多个大小相等的 Region
- 新生代和老年代不再物理隔离

**运行过程**：
1. 初始标记（Stop The World）
2. 并发标记
3. 最终标记（Stop The World）
4. 筛选回收（Stop The World）

### 8. ZGC 收集器

**特点**：
- JDK 11 引入的低延迟垃圾收集器
- 停顿时间不超过 10ms
- 支持 TB 级别的堆

## GC 日志分析

启用 GC 日志：
```bash
-XX:+PrintGCDetails
-XX:+PrintGCDateStamps
-Xloggc:gc.log
```

## 总结

理解垃圾回收机制对于：
- 编写高性能的 Java 应用
- 进行 JVM 调优
- 排查内存问题

都非常重要。
