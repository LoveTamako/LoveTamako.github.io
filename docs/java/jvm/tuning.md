# JVM 性能调优

## 概述

JVM 性能调优是一个系统工程，需要根据应用的特点和需求，合理配置 JVM 参数，以达到最佳的性能表现。

## 性能调优的目标

1. **降低 GC 停顿时间**：减少 Stop The World 的时间
2. **提高吞吐量**：提高应用的处理能力
3. **降低内存占用**：合理使用内存资源
4. **避免内存溢出**：防止 OOM 错误

## JVM 参数分类

### 标准参数（-）

所有 JVM 都支持的参数，如：
```bash
-version
-help
-server
-client
```

### 非标准参数（-X）

默认 JVM 实现的参数，如：
```bash
-Xms512m      # 设置堆的初始大小
-Xmx2g        # 设置堆的最大大小
-Xss256k      # 设置线程栈大小
```

### 不稳定参数（-XX）

各个 JVM 实现不同的参数，如：
```bash
-XX:+UseG1GC              # 使用 G1 垃圾收集器
-XX:MaxGCPauseMillis=200  # 设置最大 GC 停顿时间
```

## 常用 JVM 参数

### 堆内存配置

```bash
# 设置堆的初始大小为 512MB
-Xms512m

# 设置堆的最大大小为 2GB
-Xmx2g

# 设置新生代大小为 256MB
-Xmn256m

# 设置新生代与老年代的比例（1:2）
-XX:NewRatio=2

# 设置 Eden 区与 Survivor 区的比例（8:1:1）
-XX:SurvivorRatio=8
```

**最佳实践**：
- 将 `-Xms` 和 `-Xmx` 设置为相同值，避免堆自动扩展
- 堆大小一般设置为系统内存的 60%-80%

### 栈内存配置

```bash
# 设置线程栈大小为 256KB
-Xss256k
```

### 方法区配置

```bash
# JDK 8 之前（永久代）
-XX:PermSize=128m
-XX:MaxPermSize=256m

# JDK 8 及之后（元空间）
-XX:MetaspaceSize=128m
-XX:MaxMetaspaceSize=256m
```

### 垃圾收集器配置

```bash
# 使用 Serial 收集器
-XX:+UseSerialGC

# 使用 ParNew 收集器
-XX:+UseParNewGC

# 使用 Parallel Scavenge 收集器
-XX:+UseParallelGC

# 使用 CMS 收集器
-XX:+UseConcMarkSweepGC

# 使用 G1 收集器
-XX:+UseG1GC

# 使用 ZGC 收集器（JDK 11+）
-XX:+UseZGC
```

### GC 日志配置

```bash
# 打印 GC 详细信息
-XX:+PrintGCDetails

# 打印 GC 时间戳
-XX:+PrintGCDateStamps

# 指定 GC 日志文件
-Xloggc:gc.log

# JDK 9+ 统一日志配置
-Xlog:gc*:file=gc.log:time,level,tags
```

## 性能调优步骤

### 1. 性能监控

使用工具监控应用性能：

**JDK 自带工具**：
- `jps`：查看 Java 进程
- `jstat`：查看 JVM 统计信息
- `jmap`：生成堆转储快照
- `jstack`：生成线程快照
- `jinfo`：查看和修改 JVM 参数

**可视化工具**：
- JConsole
- VisualVM
- JProfiler
- Arthas

### 2. 性能分析

**关键指标**：
- GC 频率和停顿时间
- 内存使用情况
- CPU 使用率
- 线程状态

### 3. 参数调整

根据分析结果调整 JVM 参数。

### 4. 验证效果

重新监控和分析，验证调优效果。

## 常见性能问题及解决方案

### 1. 频繁 Full GC

**原因**：
- 老年代空间不足
- 永久代/元空间不足
- System.gc() 被显式调用

**解决方案**：
```bash
# 增加老年代大小
-Xmx4g

# 增加元空间大小
-XX:MaxMetaspaceSize=512m

# 禁用显式 GC
-XX:+DisableExplicitGC
```

### 2. 内存溢出（OOM）

**Java heap space**：
```bash
# 增加堆内存
-Xmx4g

# 生成堆转储文件
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/path/to/dump
```

**Metaspace**：
```bash
# 增加元空间大小
-XX:MaxMetaspaceSize=512m
```

### 3. 高 CPU 使用率

**排查步骤**：
1. 使用 `top` 命令找到占用 CPU 高的进程
2. 使用 `jstack` 生成线程快照
3. 分析线程状态，找出问题代码

### 4. 响应时间长

**可能原因**：
- GC 停顿时间过长
- 线程阻塞
- 数据库查询慢

**解决方案**：
```bash
# 使用低延迟的垃圾收集器
-XX:+UseG1GC
-XX:MaxGCPauseMillis=200

# 或使用 ZGC
-XX:+UseZGC
```

## G1 收集器调优示例

```bash
# 使用 G1 收集器
-XX:+UseG1GC

# 设置堆大小
-Xms4g
-Xmx4g

# 设置最大 GC 停顿时间目标
-XX:MaxGCPauseMillis=200

# 设置并发 GC 线程数
-XX:ConcGCThreads=4

# 设置 STW 工作线程数
-XX:ParallelGCThreads=8

# 设置触发并发 GC 的堆占用阈值
-XX:InitiatingHeapOccupancyPercent=45
```

## 性能调优最佳实践

1. **不要过早优化**：先确保功能正确，再考虑性能
2. **基于数据调优**：使用监控工具收集数据，基于数据做决策
3. **一次只改一个参数**：便于确定参数的影响
4. **在生产环境验证**：测试环境的表现可能与生产环境不同
5. **持续监控**：调优是一个持续的过程

## 总结

JVM 性能调优需要：
- 深入理解 JVM 原理
- 熟悉各种 JVM 参数
- 掌握性能监控和分析工具
- 根据应用特点选择合适的调优策略
