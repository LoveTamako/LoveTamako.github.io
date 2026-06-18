# 共享模型之无锁

前面章节学习了使用**管程（Monitor）** 通过锁机制保证线程安全，但加锁会带来线程阻塞和上下文切换的开销。

本章将学习**无锁编程**，通过 CAS（Compare And Swap）和原子类实现线程安全，在特定场景下获得更好的性能。

## 学习目标

通过本章学习，你将掌握：

- 理解 **CAS（Compare And Swap）** 的原理与特点
- 掌握 **原子类**的使用：AtomicInteger、AtomicReference 等
- 理解 **ABA 问题**及其解决方案
- 掌握 **Unsafe** 类的底层 CAS 操作
- 学会选择有锁与无锁方案的时机

## 主要内容

### CAS 原理
- 比较并交换的原子操作
- CAS 与 volatile 的配合
- 无锁编程的乐观策略
- 自旋重试机制
- 性能对比：CAS vs synchronized

### 原子整数
- AtomicInteger、AtomicLong、AtomicBoolean
- 常用方法：getAndIncrement、updateAndGet 等
- 底层 CAS 实现原理

### 原子引用
- AtomicReference：保护引用类型
- **ABA 问题**：CAS 的经典陷阱
- AtomicStampedReference：版本号解决 ABA
- AtomicMarkableReference：布尔标记解决 ABA

### 原子数组
- AtomicIntegerArray、AtomicLongArray、AtomicReferenceArray
- 数组元素的原子更新

### 原子字段更新器
- AtomicIntegerFieldUpdater
- AtomicLongFieldUpdater
- AtomicReferenceFieldUpdater
- 对普通字段进行原子操作

### 原子累加器
- LongAdder、LongAccumulator
- 高并发下的性能优化
- 分段累加思想

### Unsafe 底层操作
- 获取 Unsafe 实例
- 底层 CAS 方法：compareAndSwapInt
- 手动实现原子整数类
- 内存操作、线程调度等高级功能

## 无锁 vs 有锁

### 无锁优势
- **无阻塞**：线程不会陷入阻塞，避免上下文切换
- **轻量级**：始终在用户态运行，无需内核态切换
- **高性能**：低竞争场景下性能优于锁

### 无锁劣势
- **自旋消耗**：高竞争场景下频繁重试消耗 CPU
- **ABA 问题**：需要额外的版本号或标记
- **适用范围有限**：只适合简单的原子操作

### 选择建议

| 场景 | 推荐方案 |
|------|----------|
| 简单的计数器、标志位 | 原子类（无锁） |
| 低竞争、多核 CPU | CAS（无锁） |
| 高竞争、复杂操作 | synchronized / Lock（有锁） |
| 大量累加操作 | LongAdder（分段无锁） |

## 学习建议

1. **理解原理**：重点掌握 CAS 的工作机制和与 volatile 的配合
2. **对比分析**：理解无锁与有锁的性能差异和适用场景
3. **关注 ABA**：了解 ABA 问题的危害和解决方案
4. **动手实践**：使用 Unsafe 手动实现原子类加深理解

::: tip 重点提示
无锁编程是高性能并发的重要技术。掌握本章内容后，你将能够：
- 在合适的场景使用原子类替代锁
- 理解 Java 原子类的底层实现原理
- 识别并避免 ABA 等无锁编程陷阱
- 根据实际场景选择最优的并发方案
:::