# 有序性

**有序性**是指程序执行的顺序按照代码的先后顺序执行。Java 内存模型允许编译器和处理器对指令进行重排序以提高性能，但会保证单线程程序的执行结果不变。然而在多线程环境下，指令重排序可能会导致程序出现意料之外的结果。

## 指令重排

### 原理 - 指令并行优化

现代 CPU 为了提高执行效率，会采用**指令级并行**技术。在不影响单线程程序正确性的前提下，CPU 可以改变指令的执行顺序：

```
原始代码：          实际执行：
1. int a = 1;       1. int b = 2;  (重排)
2. int b = 2;       2. int a = 1;  (重排)
3. int c = a + b;   3. int c = a + b;
```

这种重排序在单线程下不会有问题，因为存在**数据依赖**的指令不会被重排序（如第 3 行依赖前两行的结果）。但在多线程环境下，一个线程内的指令重排序可能会被另一个线程观察到，从而导致问题。

### 问题

```java
int num = 0;
boolean ready = false;

public void actor1(I_Result r){
    if(ready){
        r.r1 = num + num;
    } else {
        r.r1 = 1;
    }
}

public void actor2(I_Result r){
    num = 2;
    ready = true;
}
```

**情况1**：线程2 还未执行，线程1 先执行，此时 `ready = false`，结果 `r.r1 = 1`

**情况2**：线程2 执行完，线程1 再执行，此时 `ready = true` 且 `num = 2`，结果 `r.r1 = 4`

**情况3**：由于指令重排序，线程2 中的赋值顺序可能变为先执行 `ready = true`，再执行 `num = 2`。如果此时线程1 执行，会读到 `ready = true`，但 `num` 仍是 0，结果 `r.r1 = 0`

这种诡异的结果就是指令重排序导致的。

### 测试

使用 JCStress 工具可以验证指令重排序现象。

**1. 添加 Maven 依赖**

```xml
<dependency>
    <groupId>org.openjdk.jcstress</groupId>
    <artifactId>jcstress-core</artifactId>
    <version>0.16</version>
</dependency>
```

**2. 编写测试代码**

```java
@JCStressTest
@Outcome(id = {"1", "4"}, expect = Expect.ACCEPTABLE, desc = "正常结果")
@Outcome(id = "0", expect = Expect.ACCEPTABLE_INTERESTING, desc = "发生了指令重排序")
@State
public class OrderingTest {
    int num = 0;
    boolean ready = false;

    @Actor
    public void actor1(I_Result r) {
        if (ready) {
            r.r1 = num + num;
        } else {
            r.r1 = 1;
        }
    }

    @Actor
    public void actor2(I_Result r) {
        num = 2;
        ready = true;
    }
}
```

**3. 运行测试**

```bash
mvn clean install
java -jar target/jcstress.jar
```

**测试结果示例**：

```
  RESULT      SAMPLES     FREQ       EXPECT  DESCRIPTION
       0        1,729    0.02%  Interesting  发生了指令重排序
       1      458,329   42.35%   Acceptable  正常结果
       4      621,942   57.63%   Acceptable  正常结果
```

可以看到确实出现了 `r.r1 = 0` 的情况，证明发生了指令重排序。

### 禁用

使用 `volatile` 关键字可以禁止指令重排序。

```java
int num = 0;
volatile boolean ready = false;  // 使用 volatile 修饰

public void actor1(I_Result r){
    if(ready){
        r.r1 = num + num;
    } else {
        r.r1 = 1;
    }
}

public void actor2(I_Result r){
    num = 2;
    ready = true;  // volatile 写操作
}
```

**volatile 的作用**：

- **禁止重排序**：`volatile` 写之前的操作不会被重排到 `volatile` 写之后
- 在上面的例子中，`num = 2` 不会被重排到 `ready = true` 之后
- 线程1 读取到 `ready = true` 时，一定能看到 `num = 2` 的结果

再次运行测试，将不会出现 `r.r1 = 0` 的情况。

::: tip volatile 的两大保证
1. **可见性**：一个线程对 volatile 变量的修改，对其他线程立即可见
2. **有序性**：禁止指令重排序，保证代码按顺序执行
:::

::: warning 注意
volatile 只能保证**可见性**和**有序性**，不能保证**原子性**。对于 `i++` 这样的复合操作，仍需要使用 `synchronized` 或 `AtomicInteger`。
:::