# JVM 概述

## 什么是 JVM？

JVM（Java Virtual Machine，Java 虚拟机）是 Java 程序运行的核心，它是一个虚拟的计算机，负责执行 Java 字节码。

## JVM 的主要特性

### 1. 平台无关性

Java 的"一次编写，到处运行"（Write Once, Run Anywhere）特性正是通过 JVM 实现的。Java 源代码编译成字节码后，可以在任何安装了 JVM 的平台上运行。

### 2. 自动内存管理

JVM 提供了自动内存管理机制，包括：
- 自动分配内存
- 垃圾回收（GC）
- 内存泄漏检测

### 3. 安全性

JVM 提供了多层安全机制：
- 字节码验证
- 类加载器的安全检查
- 安全管理器

## JVM 架构

JVM 主要由以下几个部分组成：

### 类加载子系统（Class Loader Subsystem）
负责加载 .class 文件到内存中

### 运行时数据区（Runtime Data Area）
- 方法区（Method Area）
- 堆（Heap）
- 虚拟机栈（VM Stack）
- 本地方法栈（Native Method Stack）
- 程序计数器（Program Counter Register）

### 执行引擎（Execution Engine）
- 解释器（Interpreter）
- JIT 编译器（Just-In-Time Compiler）
- 垃圾回收器（Garbage Collector）

### 本地方法接口（Native Method Interface）
用于调用本地方法库

## JVM 的工作流程

1. **加载**：类加载器加载 .class 文件
2. **验证**：验证字节码的正确性
3. **准备**：为类变量分配内存并设置默认值
4. **解析**：将符号引用转换为直接引用
5. **初始化**：执行类构造器
6. **执行**：执行引擎执行字节码

## 常见的 JVM 实现

- **HotSpot VM**：Oracle/Sun 官方实现，最广泛使用
- **OpenJ9**：IBM 开源的 JVM
- **GraalVM**：支持多语言的高性能 JVM
- **Zing VM**：Azul Systems 的商业 JVM

## 下一步

继续学习 JVM 的各个组成部分，深入理解其工作原理。
