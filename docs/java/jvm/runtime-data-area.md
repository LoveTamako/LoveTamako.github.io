# 运行时数据区

## 概述

JVM 在执行 Java 程序时，会把它所管理的内存划分为若干个不同的数据区域。这些区域有各自的用途、创建和销毁时间。

## 运行时数据区的组成

根据《Java 虚拟机规范》，JVM 运行时数据区包括以下几个部分：

### 1. 程序计数器（Program Counter Register）

**特点**：
- 线程私有
- 占用内存空间较小
- 唯一不会出现 OutOfMemoryError 的区域

**作用**：
- 记录当前线程执行的字节码指令地址
- 如果执行的是 Native 方法，则计数器值为空（Undefined）

**为什么需要程序计数器？**

在多线程环境下，当线程切换后，需要通过程序计数器来恢复到正确的执行位置。

### 2. Java 虚拟机栈（Java Virtual Machine Stack）

**特点**：
- 线程私有
- 生命周期与线程相同
- 描述的是 Java 方法执行的内存模型

**栈帧（Stack Frame）**：

每个方法在执行时都会创建一个栈帧，用于存储：
- **局部变量表**：存放方法参数和局部变量
- **操作数栈**：用于存放方法执行过程中产生的中间结果
- **动态链接**：指向运行时常量池中该栈帧所属方法的引用
- **方法返回地址**：方法正常退出或异常退出的地址

**可能出现的异常**：
- `StackOverflowError`：线程请求的栈深度大于虚拟机允许的深度
- `OutOfMemoryError`：虚拟机栈动态扩展时无法申请到足够的内存

```java
public class StackDemo {
    public static void main(String[] args) {
        method1();
    }

    public static void method1() {
        int a = 10;
        method2();
    }

    public static void method2() {
        int b = 20;
        method3();
    }

    public static void method3() {
        int c = 30;
    }
}
```

### 3. 本地方法栈（Native Method Stack）

**特点**：
- 线程私有
- 与虚拟机栈类似，但为 Native 方法服务

**作用**：
- 为虚拟机使用到的 Native 方法服务

**可能出现的异常**：
- `StackOverflowError`
- `OutOfMemoryError`

### 4. Java 堆（Heap）

**特点**：
- 线程共享
- JVM 管理的最大一块内存区域
- 在虚拟机启动时创建

**作用**：
- 存放对象实例
- 是垃圾收集器管理的主要区域（GC 堆）

**堆的分代结构**：

```
+------------------+
|   新生代 (Young)  |
|  +------------+  |
|  | Eden       |  |
|  +------------+  |
|  | Survivor 0 |  |
|  | Survivor 1 |  |
|  +------------+  |
+------------------+
|   老年代 (Old)    |
+------------------+
```

- **新生代（Young Generation）**
  - Eden 区：新对象分配的区域
  - Survivor 区：存放经过一次 Minor GC 后存活的对象

- **老年代（Old Generation）**
  - 存放生命周期较长的对象

**可能出现的异常**：
- `OutOfMemoryError: Java heap space`

### 5. 方法区（Method Area）

**特点**：
- 线程共享
- 用于存储已被虚拟机加载的类信息

**存储内容**：
- 类信息（类的版本、字段、方法、接口等）
- 运行时常量池
- 静态变量
- 即时编译器编译后的代码

**运行时常量池（Runtime Constant Pool）**：
- 存放编译期生成的各种字面量和符号引用
- 具备动态性，可以在运行期间将新的常量放入池中

**方法区的实现**：
- JDK 7 及之前：永久代（PermGen）
- JDK 8 及之后：元空间（Metaspace），使用本地内存

**可能出现的异常**：
- `OutOfMemoryError: Metaspace`（JDK 8+）
- `OutOfMemoryError: PermGen space`（JDK 7-）

## 直接内存（Direct Memory）

**特点**：
- 不是运行时数据区的一部分
- 不受 Java 堆大小限制
- 受本机总内存限制

**使用场景**：
- NIO（New Input/Output）类
- 使用 Native 函数库直接分配堆外内存

**可能出现的异常**：
- `OutOfMemoryError`

## 内存分配示例

```java
public class MemoryAllocation {
    // 类变量，存储在方法区
    private static int staticVar = 100;

    // 实例变量，存储在堆中
    private int instanceVar = 200;

    public void method() {
        // 局部变量，存储在虚拟机栈的局部变量表中
        int localVar = 300;

        // 对象实例，存储在堆中
        Object obj = new Object();
    }
}
```

## 总结

理解运行时数据区的结构对于：
- 理解 Java 程序的内存分配
- 进行性能调优
- 排查内存相关问题

都至关重要。
