# 享元模式

**享元模式（Flyweight Pattern）** 是一种结构型设计模式，通过共享对象来减少内存占用和对象创建开销。当需要大量相似对象时，享元模式可以显著提升性能。

**核心思想**：
- 将对象的**内部状态**（可共享）与**外部状态**（不可共享）分离
- 共享内部状态相同的对象
- 外部状态由客户端维护

## JDK 中的体现

### 包装类

Java 的包装类使用了享元模式来缓存常用对象。

**Integer 缓存**：

```java
public class IntegerCache {
    public static void main(String[] args) {
        Integer a = 127;
        Integer b = 127;
        System.out.println(a == b);  // true（使用缓存）

        Integer c = 128;
        Integer d = 128;
        System.out.println(c == d);  // false（超出缓存范围）
    }
}
```

**Integer.valueOf() 源码**：

```java
public static Integer valueOf(int i) {
    // -128 到 127 之间的数值使用缓存
    if (i >= IntegerCache.low && i <= IntegerCache.high)
        return IntegerCache.cache[i + (-IntegerCache.low)];
    return new Integer(i);  // 超出范围创建新对象
}
```

**缓存范围**：

| 包装类 | 缓存范围 | 说明 |
|--------|----------|------|
| `Integer` | -128 ~ 127 | 可通过 JVM 参数调整上限 |
| `Long` | -128 ~ 127 | 固定范围 |
| `Short` | -128 ~ 127 | 固定范围 |
| `Byte` | -128 ~ 127 | 所有值（byte 范围） |
| `Character` | 0 ~ 127 | ASCII 字符范围 |
| `Boolean` | true / false | 只有两个实例 |

**使用建议**：

```java
// 推荐：使用 valueOf()，享受缓存优化
Integer i1 = Integer.valueOf(100);

// 不推荐：直接 new，每次都创建新对象
Integer i2 = new Integer(100);

// 自动装箱使用 valueOf()
Integer i3 = 100;  // 等价于 Integer.valueOf(100)
```

### String 串池

`String` 使用字符串常量池实现享元模式。

**字符串常量池**：

```java
public class StringPool {
    public static void main(String[] args) {
        // 字面量会进入串池
        String s1 = "hello";
        String s2 = "hello";
        System.out.println(s1 == s2);  // true（共享同一个对象）

        // new String() 创建新对象
        String s3 = new String("hello");
        System.out.println(s1 == s3);  // false（不同对象）

        // intern() 方法尝试将字符串放入串池
        String s4 = s3.intern();
        System.out.println(s1 == s4);  // true（返回池中对象）
    }
}
```

**内存结构**：

```
堆内存：
  ┌─────────────┐
  │ "hello"     │ ← s3（new String 创建）
  └─────────────┘

字符串常量池（堆中）：
  ┌─────────────┐
  │ "hello"     │ ← s1, s2, s4（共享）
  └─────────────┘
```

**串池的优势**：
- 节省内存：相同字符串只存储一份
- 提升性能：== 比较更快
- 线程安全：String 不可变，天然线程安全

**intern() 方法**：

```java
public class InternExample {
    public static void main(String[] args) {
        // 拼接字符串不会自动进入串池
        String s1 = new String("a") + new String("b");

        // 手动将 "ab" 放入串池
        String s2 = s1.intern();

        // 字面量 "ab" 从串池获取
        String s3 = "ab";

        System.out.println(s2 == s3);  // true
    }
}
```

### BigDecimal 与 BigInteger

`BigDecimal` 和 `BigInteger` 也使用了享元模式。

**BigDecimal 缓存**：

```java
public class BigDecimal {
    // 缓存 0 到 10 的 BigDecimal 对象
    private static final BigDecimal[] ZERO_THROUGH_TEN = {
        new BigDecimal(BigInteger.ZERO, 0, 0, 1),
        new BigDecimal(BigInteger.ONE, 1, 0, 1),
        // ... 2 到 10
    };

    public static BigDecimal valueOf(long val) {
        if (val >= 0 && val < ZERO_THROUGH_TEN.length)
            return ZERO_THROUGH_TEN[(int)val];
        return new BigDecimal(BigInteger.valueOf(val), 0, 0, 0);
    }
}
```

**使用示例**：

```java
BigDecimal d1 = BigDecimal.valueOf(5);
BigDecimal d2 = BigDecimal.valueOf(5);
System.out.println(d1 == d2);  // true（使用缓存）

BigDecimal d3 = new BigDecimal("5");
System.out.println(d1 == d3);  // false（新对象）
```

**为何原子类包装 BigDecimal 仍需保证线程安全？**

```java
class Account {
    private AtomicReference<BigDecimal> balance;

    public Account(BigDecimal balance) {
        this.balance = new AtomicReference<>(balance);
    }

    public void withdraw(BigDecimal amount) {
        while (true) {
            BigDecimal prev = balance.get();
            // BigDecimal.subtract() 是线程安全的
            BigDecimal next = prev.subtract(amount);

            // 但多个方法的组合不是原子的
            // 需要 CAS 保证整个操作的原子性
            if (balance.compareAndSet(prev, next)) {
                break;
            }
        }
    }
}
```

**原因**：
- **单个方法线程安全**：`BigDecimal.subtract()` 返回新对象，不修改原对象
- **组合操作非原子**：读取 → 计算 → 更新这三步不是原子的
- **需要 CAS**：使用 `AtomicReference` 保证整个操作的原子性

## 自定义连接池

使用享元模式实现一个简单的数据库连接池。

### 实现代码

```java
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.concurrent.atomic.AtomicIntegerArray;

public class ConnectionPool {
    // 连接池大小
    private final int poolSize;
    // 连接数组
    private final Connection[] connections;
    // 连接状态：0-空闲，1-繁忙
    private final AtomicIntegerArray states;

    public ConnectionPool(int poolSize, String url, String user, String password) {
        this.poolSize = poolSize;
        this.connections = new Connection[poolSize];
        this.states = new AtomicIntegerArray(poolSize);

        // 初始化连接池
        for (int i = 0; i < poolSize; i++) {
            try {
                connections[i] = DriverManager.getConnection(url, user, password);
            } catch (SQLException e) {
                throw new RuntimeException("连接创建失败", e);
            }
        }
    }

    // 获取连接
    public Connection getConnection() {
        while (true) {
            for (int i = 0; i < poolSize; i++) {
                // CAS 将状态从 0 改为 1
                if (states.compareAndSet(i, 0, 1)) {
                    System.out.println(Thread.currentThread().getName() + " 获取连接: " + i);
                    return connections[i];
                }
            }

            // 没有空闲连接，等待后重试
            synchronized (this) {
                try {
                    System.out.println(Thread.currentThread().getName() + " 等待连接...");
                    this.wait(100);
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
            }
        }
    }

    // 归还连接
    public void releaseConnection(Connection conn) {
        for (int i = 0; i < poolSize; i++) {
            if (connections[i] == conn) {
                // 将状态改回 0
                states.set(i, 0);
                System.out.println(Thread.currentThread().getName() + " 归还连接: " + i);

                // 唤醒等待的线程
                synchronized (this) {
                    this.notifyAll();
                }
                break;
            }
        }
    }
}
```

### 测试代码

```java
public class ConnectionPoolTest {
    public static void main(String[] args) {
        // 创建连接池（3 个连接）
        ConnectionPool pool = new ConnectionPool(
            3,
            "jdbc:mysql://localhost:3306/test",
            "root",
            "password"
        );

        // 10 个线程并发获取连接
        for (int i = 0; i < 10; i++) {
            new Thread(() -> {
                Connection conn = pool.getConnection();

                try {
                    // 模拟使用连接
                    Thread.sleep(1000);
                } catch (InterruptedException e) {
                    e.printStackTrace();
                } finally {
                    pool.releaseConnection(conn);
                }
            }, "Thread-" + i).start();
        }
    }
}
```

**输出示例**：

```
Thread-0 获取连接: 0
Thread-1 获取连接: 1
Thread-2 获取连接: 2
Thread-3 等待连接...
Thread-4 等待连接...
Thread-0 归还连接: 0
Thread-3 获取连接: 0
...
```

### 关键设计

**1. 使用 AtomicIntegerArray 管理状态**：

```java
// CAS 保证线程安全
if (states.compareAndSet(i, 0, 1)) {
    return connections[i];
}
```

避免使用 `synchronized` 锁住整个方法，提升并发性能。

**2. 等待与唤醒机制**：

```java
// 没有空闲连接时等待
synchronized (this) {
    this.wait(100);
}

// 归还连接时唤醒等待线程
synchronized (this) {
    this.notifyAll();
}
```

**3. 享元模式体现**：
- **内部状态**：Connection 对象（共享）
- **外部状态**：连接的使用线程（不共享）
- **池化管理**：复用连接，避免频繁创建销毁

::: warning 生产环境警告
以上连接池实现仅用于**学习享元模式原理**，实际生产环境中**不要自己实现连接池**，应使用成熟的连接池框架：

- **HikariCP**（推荐）：性能最优，Spring Boot 2.x 默认连接池
- **Druid**：阿里开源，功能强大，监控完善
- **Apache Commons DBCP**：Apache 基金会维护
- **Tomcat JDBC Pool**：Tomcat 内置连接池

这些框架经过充分测试，处理了连接泄漏、超时、健康检查等复杂场景。

**源码学习建议**：想深入学习连接池实现原理，可以参考 **Tomcat JDBC Pool** 的源码，其实现相对简单，代码清晰易懂，适合作为学习入门。
:::

## 享元模式的优缺点

### 优点

1. **减少内存占用**：
   - 共享对象，避免重复创建
   - 适合大量相似对象的场景

2. **提升性能**：
   - 减少对象创建开销
   - 降低 GC 压力

3. **集中管理**：
   - 统一管理共享对象
   - 便于监控和优化

### 缺点

1. **增加复杂度**：
   - 需要维护对象池
   - 需要区分内部状态和外部状态

2. **线程安全问题**：
   - 共享对象需要考虑并发访问
   - 可能需要加锁或使用无锁数据结构

3. **状态管理**：
   - 外部状态需要客户端维护
   - 容易混淆内外部状态

## 应用场景

| 场景 | 是否适合享元模式 |
|------|-----------------|
| 大量相似对象（字符串、数字） | ✅ 适合 |
| 对象创建开销大（连接池） | ✅ 适合 |
| 对象状态可分离（内部/外部） | ✅ 适合 |
| 对象需要频繁修改状态 | ❌ 不适合 |
| 对象数量少 | ❌ 不适合 |

**典型应用**：
- 字符串常量池
- 数据库连接池
- 线程池
- 对象池（如 Apache Commons Pool）
- 图形渲染中的纹理、字体缓存

::: tip 享元模式与不可变对象
享元模式通常与不可变对象结合使用。不可变对象天然线程安全，可以安全地被多个线程共享，是实现享元模式的理想选择。例如 String、Integer 等。
:::