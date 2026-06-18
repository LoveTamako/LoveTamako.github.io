# 不可变对象

**不可变对象（Immutable Object）** 是指对象一旦创建，其状态就不能被修改的对象。不可变对象天然线程安全，无需加锁即可在多线程环境下安全共享。

## 为什么需要不可变对象

### 线程安全问题

可变对象在多线程环境下需要加锁保护：

```java
// 可变的日期格式化类 - 线程不安全
class MutableDateFormatter {
    private SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");

    public String format(Date date) {
        return sdf.format(date);  // 多线程下会出错
    }
}
```

**问题**：`SimpleDateFormat` 是可变的，多线程并发调用会导致格式化结果错误。

### 使用不可变对象

以日期转换为例，使用不可变的 `DateTimeFormatter`：

```java
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ImmutableExample {
    // DateTimeFormatter 是不可变的，线程安全
    private static final DateTimeFormatter formatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd");

    public static void main(String[] args) {
        ExecutorService pool = Executors.newFixedThreadPool(10);

        // 10 个线程并发格式化日期
        for (int i = 0; i < 10; i++) {
            pool.submit(() -> {
                LocalDate date = LocalDate.now();
                // 无需加锁，线程安全
                String formatted = formatter.format(date);
                System.out.println(formatted);
            });
        }

        pool.shutdown();
    }
}
```

**优势**：
- 无需加锁，性能更好
- 代码更简洁，没有同步逻辑
- 不会出现线程安全问题

## 不可变对象的设计

以 `String` 为例，分析不可变对象的设计要点。

### final 的使用

`String` 类的定义：

```java
public final class String {
    private final char[] value;  // JDK 8
    // private final byte[] value;  // JDK 9+

    private final int hash;

    public String(String original) {
        this.value = original.value;
        this.hash = original.hash;
    }

    // 其他方法...
}
```

**关键设计**：

1. **类用 final 修饰**：
   - 保证类不能被继承
   - 防止子类破坏不可变性

```java
// 如果 String 不是 final 的
class MutableString extends String {
    private char[] value;

    @Override
    public char charAt(int index) {
        // 子类可以修改行为，破坏不可变性
        return value[index];
    }
}
```

2. **属性用 final 修饰**：
   - 保证属性只能赋值一次
   - 属性不能被修改

### 保护性拷贝

不可变对象的方法不能修改对象状态，而是返回新对象。

以 `substring` 方法为例：

```java
public final class String {
    private final char[] value;

    // JDK 6 的实现（共享底层数组）
    public String substring(int beginIndex, int endIndex) {
        // 返回新的 String 对象，不修改原对象
        return new String(value, beginIndex, endIndex - beginIndex);
    }

    // JDK 7+ 的实现（拷贝数组）
    public String substring(int beginIndex, int endIndex) {
        int subLen = endIndex - beginIndex;
        // 创建新数组，拷贝数据
        return new String(value, beginIndex, subLen);
    }
}
```

**保护性拷贝的原则**：
- 不修改原对象的状态
- 返回新对象
- 防止外部修改内部数据

### 完整示例

手动实现一个不可变的 `Person` 类：

```java
import java.util.Date;

public final class ImmutablePerson {
    // 所有字段都是 final 的
    private final String name;
    private final int age;
    private final Date birthday;  // Date 是可变的

    public ImmutablePerson(String name, int age, Date birthday) {
        this.name = name;
        this.age = age;
        // 保护性拷贝：防止外部修改传入的 Date
        this.birthday = new Date(birthday.getTime());
    }

    public String getName() {
        return name;
    }

    public int age() {
        return age;
    }

    public Date getBirthday() {
        // 保护性拷贝：防止外部获取后修改
        return new Date(birthday.getTime());
    }

    // 修改操作返回新对象
    public ImmutablePerson withAge(int newAge) {
        return new ImmutablePerson(this.name, newAge, this.birthday);
    }
}
```

**使用示例**：

```java
public class Test {
    public static void main(String[] args) {
        Date date = new Date();
        ImmutablePerson person = new ImmutablePerson("张三", 20, date);

        // 修改外部的 date 不会影响 person
        date.setTime(0);
        System.out.println(person.getBirthday());  // 仍是原来的时间

        // 获取 birthday 后修改也不会影响 person
        Date birthday = person.getBirthday();
        birthday.setTime(0);
        System.out.println(person.getBirthday());  // 仍是原来的时间

        // 修改返回新对象
        ImmutablePerson person2 = person.withAge(21);
        System.out.println(person.age());   // 20（原对象未变）
        System.out.println(person2.age());  // 21（新对象）
    }
}
```

## 不可变对象的优缺点

### 优点

1. **线程安全**：
   - 无需加锁即可在多线程间安全共享
   - 避免同步开销

2. **简化并发编程**：
   - 不用担心状态被其他线程修改
   - 代码更容易理解和维护

3. **可以安全共享**：
   - 可以作为 HashMap 的 key
   - 可以放入 Set 中

4. **便于缓存**：
   - 可以安全地缓存不可变对象
   - 如 String 常量池

### 缺点

1. **创建新对象的开销**：
   - 每次修改都要创建新对象
   - 频繁修改会产生大量临时对象

2. **内存占用**：
   - 多个版本的对象同时存在
   - 垃圾回收压力增大

### 适用场景

| 场景 | 是否适合不可变对象 |
|------|-------------------|
| 多线程共享的配置对象 | ✅ 适合 |
| 作为 Map 的 key | ✅ 适合 |
| 频繁修改的数据 | ❌ 不适合 |
| 大对象且需要频繁创建 | ❌ 不适合 |

## 常见的不可变类

Java 标准库中的不可变类：

**基本类型包装类**：
- `Integer`、`Long`、`Double` 等
- `String`

**时间日期类（JDK 8+）**：
- `LocalDate`、`LocalTime`、`LocalDateTime`
- `ZonedDateTime`
- `DateTimeFormatter`

**集合类（不可修改视图）**：
```java
List<String> list = List.of("a", "b", "c");  // JDK 9+
Set<String> set = Set.of("x", "y", "z");
Map<String, Integer> map = Map.of("k1", 1, "k2", 2);

// JDK 8
List<String> unmodifiableList = Collections.unmodifiableList(Arrays.asList("a", "b"));
```

## 实践建议

1. **优先使用不可变对象**：
   - 多线程环境下优先考虑不可变设计
   - 减少同步开销

2. **正确处理可变字段**：
   - 对可变字段（如 Date、数组）进行保护性拷贝
   - 或使用不可变的替代品（如 LocalDate）

3. **使用 final 关键字**：
   - 类用 final 防止继承
   - 字段用 final 防止修改

4. **提供修改方法返回新对象**：
   - 类似 `String.substring()`
   - 保持原对象不变

::: tip 不可变对象与线程安全
不可变对象是实现线程安全最简单的方式。如果对象的状态不会改变，就不需要考虑同步问题。在设计多线程程序时，优先考虑使用不可变对象。
:::