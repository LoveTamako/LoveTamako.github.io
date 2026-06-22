# final 原理

**final 关键字** 在 Java 中用于修饰类、方法和变量，表示不可改变。对于变量来说，final 保证变量只能被赋值一次，这是实现不可变对象的基础。

## 设置 final 变量的原理

以一个简单的类为例：

```java
public class FinalDemo {
    final int a = 20;
}
```

### 字节码分析

使用 `javap -v FinalDemo.class` 查看字节码：

```
public class FinalDemo {
  final int a;

  public FinalDemo();
    Code:
      0: aload_0
      1: invokespecial #1    // Method java/lang/Object."<init>":()V
      4: aload_0
      5: bipush        20
      7: putfield      #2    // Field a:I
      // 写屏障
     10: return
}
```

**关键指令**：
- `putfield`：设置实例字段的值
- 在 `return` 指令前，JVM 会插入 **StoreStore 写屏障**

**写屏障的作用**：
- 禁止 final 字段的赋值操作与构造函数返回重排序
- 确保对象引用对其他线程可见时，final 字段已经完成初始化
- 保证其他线程读取该对象时，final 字段的值是正确的


## 获取 final 变量的原理

```java
public class FinalDemo {
    final static int A = 10;
    final static int B = Short.MAX_VALUE + 1;

    final int a = 20;
    final int b = Integer.MAX_VALUE;
}
```

### 字节码分析

使用 `javap -v FinalDemo.class` 查看字节码，可以发现 JVM 对不同类型的 final 变量有不同的优化：

**复制代码访问**：

```java
public class UseFinalDemo {
    public void test() {
        System.out.println(FinalDemo.A);
        System.out.println(FinalDemo.B);

        FinalDemo demo = new FinalDemo();
        System.out.println(demo.a);
        System.out.println(demo.b);
    }
}
```

查看字节码：

```
public void test();
  Code:
    0: getstatic     #2    // Field java/lang/System.out:Ljava/io/PrintStream;
    3: bipush        10    // A 被复制到常量池
    5: invokevirtual #3    // Method java/io/PrintStream.println:(I)V

    8: getstatic     #2
   11: ldc           #4    // B 从常量池加载
   13: invokevirtual #3

   16: new           #5    // class FinalDemo
   19: dup
   20: invokespecial #6    // Method FinalDemo."<init>":()V
   23: astore_1

   24: getstatic     #2
   27: aload_1
   28: getfield      #7    // Field FinalDemo.a:I
                           // 读屏障
   31: invokevirtual #3

   34: getstatic     #2
   37: aload_1
   38: getfield      #8    // Field FinalDemo.b:I
                           // 读屏障
   41: invokevirtual #3
```

### final 变量的读取优化

根据字节码可以看出：

**1. static final 常量折叠**：

```java
final static int A = 10;
```

- 值较小的常量（如 10）直接使用 `bipush` 指令内联
- 编译期就确定值，无需访问类的静态字段
- **无需读屏障**，因为值在编译期已固定

**2. static final 常量池引用**：

```java
final static int B = Short.MAX_VALUE + 1;
```

- 值较大或计算结果使用 `ldc` 从常量池加载
- 仍然是编译期常量
- **无需读屏障**

**3. 实例 final 字段访问**：

```java
final int a = 20;
final int b = Integer.MAX_VALUE;
```

- 必须通过 `getfield` 指令访问对象字段
- JVM 在读取前插入**读屏障**，确保能看到构造函数中的赋值
- 保证可见性和有序性

### 内存语义

读取 final 字段时，JVM 会插入 **LoadLoad 屏障**：

```
对象引用可见
  ↓
LoadLoad 屏障  ← 确保读取 final 字段前，该字段已初始化
  ↓
读取 final 字段
```

**LoadLoad 屏障的作用**：
- 禁止处理器把 final 字段的读取重排序到对象引用获取之前
- 确保读取到的 final 字段已经正确初始化

### final 的可见性保证

**happens-before 规则**：
- 对 final 字段的写入（构造函数中）
- happens-before 对象引用的发布（构造函数返回）
- happens-before 任何线程读取该对象的 final 字段

**示例**：

```java
public class FinalExample {
    private final int x;
    private int y;

    public FinalExample() {
        x = 1;  // 写入 final 字段
        y = 2;  // 写入普通字段
    }

    public static void main(String[] args) {
        // 线程 A
        FinalExample example = new FinalExample();

        // 线程 B
        new Thread(() -> {
            System.out.println(example.x);  // 保证读到 1
            System.out.println(example.y);  // 可能读到 0 或 2
        }).start();
    }
}
```

**区别**：
- **final 字段 x**：线程 B 保证能读到 1
- **普通字段 y**：线程 B 可能读到 0（未初始化的值）或 2

## final 引用类型的特殊性

### 引用本身不可变

final 修饰引用类型时，引用本身不可变，但引用的对象内容可变：

```java
public class FinalReference {
    private final int[] arr;

    public FinalReference() {
        arr = new int[]{1, 2, 3};
    }

    public void modify() {
        // arr = new int[]{4, 5, 6};  // 编译错误：无法修改引用
        arr[0] = 100;  // 允许：修改数组内容
    }
}
```

### 引用对象的可见性

对于 final 引用，JVM 保证：
- 引用本身的可见性
- **引用对象在构造函数中初始化的字段的可见性**

```java
public class Container {
    final Helper helper;

    public Container() {
        helper = new Helper();
        helper.value = 10;  // 这个写入也会对其他线程可见
    }
}

class Helper {
    int value;
}
```

**关键点**：
- `helper` 是 final 的
- `helper.value` 虽然不是 final，但在构造函数中的赋值会随 final 引用一起可见
- 其他线程读取 `container.helper.value` 时保证能看到 10

**限制**：
这个保证仅限于构造函数中的赋值，构造函数外的修改不保证可见性：

```java
Container c = new Container();  // helper.value = 10 对其他线程可见
c.helper.value = 20;  // 这个修改不保证对其他线程可见
```

## 实践建议

### 1. 使用 final 保证线程安全

```java
public class SafePublish {
    private final int value;
    private final String name;

    public SafePublish(int value, String name) {
        this.value = value;
        this.name = name;
        // 不需要 volatile，final 保证可见性
    }
}
```

### 2. 不要让 this 引用逸出

**错误示例**：

```java
public class ThisEscape {
    final int value;

    public ThisEscape() {
        // 在构造函数中启动线程，this 引用逸出
        new Thread(() -> {
            System.out.println(value);  // 可能看到 0
        }).start();

        value = 10;  // final 字段赋值
    }
}
```

**问题**：
- this 引用在构造函数完成前就被其他线程获取
- 即使 value 是 final，其他线程也可能看到未初始化的值

**正确做法**：

```java
public class SafeConstruction {
    final int value;

    private SafeConstruction() {
        value = 10;
    }

    public static SafeConstruction create() {
        SafeConstruction obj = new SafeConstruction();
        // 构造完成后再启动线程
        new Thread(() -> {
            System.out.println(obj.value);  // 保证看到 10
        }).start();
        return obj;
    }
}
```

### 3. final 与不可变对象

结合 final 实现完全不可变的类：

```java
public final class ImmutablePoint {
    private final int x;
    private final int y;

    public ImmutablePoint(int x, int y) {
        this.x = x;
        this.y = y;
    }

    public int getX() { return x; }
    public int getY() { return y; }

    // 修改操作返回新对象
    public ImmutablePoint move(int dx, int dy) {
        return new ImmutablePoint(x + dx, y + dy);
    }
}
```

**优势**：
- 类用 final 修饰，防止被继承破坏不可变性
- 字段用 final 修饰，保证初始化后不可修改
- 无需同步，天然线程安全

### 4. 无状态设计

**无状态对象** 是指没有成员变量，或所有成员变量都是不可变的对象。无状态对象天然线程安全。

**无状态示例**：

```java
public class StatelessCalculator {
    // 没有成员变量，完全无状态
    public int add(int a, int b) {
        return a + b;
    }

    public int multiply(int a, int b) {
        return a * b;
    }
}
```

**只有不可变成员的"无状态"**：

```java
public class StatelessService {
    // 只有 final 不可变字段
    private final DateTimeFormatter formatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final Logger logger = LoggerFactory.getLogger(getClass());

    public String formatDate(LocalDate date) {
        String result = formatter.format(date);
        logger.info("Formatted date: {}", result);
        return result;
    }
}
```

**典型应用场景**：

**1. Servlet 无状态设计**：

```java
@WebServlet("/user")
public class UserServlet extends HttpServlet {
    // 不要定义可变的成员变量
    // private int count;  // ❌ 错误：多线程不安全

    // 可以定义不可变的成员变量
    private final UserService userService = new UserService();

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) {
        // 所有数据通过局部变量或参数传递
        String userId = req.getParameter("id");
        User user = userService.getUser(userId);
        // ...
    }
}
```

**2. Spring Bean 无状态设计**：

```java
@Service
public class OrderService {
    // 依赖注入的其他无状态 Bean
    private final OrderRepository orderRepository;
    private final PaymentService paymentService;

    public OrderService(OrderRepository orderRepository,
                       PaymentService paymentService) {
        this.orderRepository = orderRepository;
        this.paymentService = paymentService;
    }

    public Order createOrder(OrderRequest request) {
        // 不使用成员变量保存状态，所有数据通过参数和返回值传递
        Order order = new Order(request);
        orderRepository.save(order);
        paymentService.process(order);
        return order;
    }
}
```

**无状态 vs 有状态对比**：

| 特性 | 无状态对象 | 有状态对象 |
|------|-----------|-----------|
| 成员变量 | 无或只有不可变成员 | 有可变成员变量 |
| 线程安全 | 天然线程安全 | 需要同步保护 |
| 并发性能 | 高（无竞争） | 低（需要同步） |
| 典型场景 | Service、Util、Controller | 有状态的业务对象 |

**设计原则**：
- 优先使用无状态设计，避免共享可变状态
- 状态通过方法参数传递，通过返回值返回
- 需要状态时，使用局部变量或 ThreadLocal
- 依赖的对象也应该是无状态或不可变的

## 总结

| 操作 | 内存屏障 | 保证 |
|------|---------|------|
| 写入 final 字段 | StoreStore | 构造函数返回前完成，对其他线程可见 |
| 读取实例 final 字段 | LoadLoad | 读取到正确初始化的值 |
| 读取 static final 常量 | 无 | 编译期常量折叠，无需屏障 |

**final 的核心语义**：
1. **写入语义**：构造函数中对 final 字段的赋值，在构造函数返回前通过内存屏障确保完成
2. **读取语义**：读取实例 final 字段时，保证能看到构造函数中赋值后的正确状态
3. **编译优化**：static final 常量在编译期直接内联，无需运行时屏障
4. **引用传递**：final 引用的对象，在构造函数中初始化的字段也会一起可见

::: tip final 与并发安全
正确使用 final 可以实现安全的对象发布，无需额外的同步措施。但要注意避免构造函数中的 this 引用逸出，否则即使使用 final 也无法保证其他线程看到正确初始化的值。
:::
