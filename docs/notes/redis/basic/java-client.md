# Redis Java 客户端

[Redis 官网](https://redis.io/clients)提供了各种语言的客户端。

## Java 客户端对比

| 客户端 | 特点 | 优势 | 劣势 | 适用场景 |
|-------|------|------|------|---------|
| **Jedis** | 以 Redis 命令作为方法名称，同步阻塞式客户端 | API 简洁易用，学习成本低 | 线程不安全，多线程环境需要连接池 | 简单应用、学习测试 |
| **Lettuce** | 基于 Netty 实现，支持同步、异步和响应式编程，线程安全 | 支持哨兵、集群、管道模式，Spring Boot 默认使用 | API 相对复杂，学习成本较高 | 高并发场景、Spring Boot 项目 |
| **Redisson** | 分布式 Java 数据结构集合，线程安全 | 提供 Map、Queue、Lock、Semaphore 等分布式工具，开箱即用 | 功能重，体积较大 | 分布式应用、需要分布式工具 |

---

::: tip Spring Data Redis
Spring Data Redis 是 Spring 提供的 Redis 操作框架，兼容 Jedis 和 Lettuce 两种客户端，可以灵活切换。
:::

## Jedis

[Jedis 官网](https://github.com/redis/jedis)

### 引入依赖

```xml
<dependency>
    <groupId>redis.clients</groupId>
    <artifactId>jedis</artifactId>
    <version>5.1.0</version>
</dependency>
```

### 快速入门

```java
// 1. 建立连接
Jedis jedis = new Jedis("localhost", 6379);

// 2. 设置密码（如果需要）
// jedis.auth("password");

// 3. 选择库（默认是 0 号库）
jedis.select(0);

// 4. 执行操作，方法名与 Redis 命令一致
jedis.set("name", "张三");
String name = jedis.get("name");
System.out.println(name);

// 5. 释放资源
jedis.close();
```

::: warning 注意
Jedis 的方法名与 Redis 命令完全一致，例如 `SET` 命令对应 `jedis.set()` 方法。
:::

### Jedis 连接池

Jedis 本身是**线程不安全**的，并且频繁创建和销毁连接会有性能损耗。因此推荐使用 **Jedis 连接池**代替直连方式。

```java
public class JedisConnectionFactory {
    private static JedisPool jedisPool;

    static {
        // 配置连接池
        JedisPoolConfig poolConfig = new JedisPoolConfig();
        poolConfig.setMaxTotal(8);  // 最大连接数
        poolConfig.setMaxIdle(8);   // 最大空闲连接数
        poolConfig.setMinIdle(0);   // 最小空闲连接数
        poolConfig.setMaxWaitMillis(1000);  // 获取连接的最大等待时间

        // 创建连接池对象
        jedisPool = new JedisPool(poolConfig, "localhost", 6379, 1000);
    }

    // 获取 Jedis 对象
    public static Jedis getJedis() {
        return jedisPool.getResource();
    }
}
```

使用连接池：

```java
// 1. 从连接池获取连接
Jedis jedis = JedisConnectionFactory.getJedis();

// 2. 执行操作
jedis.set("name", "李四");
String name = jedis.get("name");
System.out.println(name);

// 3. 归还连接到连接池
jedis.close();
```

## SpringDataRedis

SpringData 是 Spring 中数据操作的模块，包含对各种数据库的集成，其中对 Redis 的集成模块就叫做 SpringDataRedis。[官网地址](https://spring.io/projects/spring-data-redis)

**主要特性：**

- 提供了对不同 Redis 客户端的整合（Lettuce 和 Jedis）
- 提供了 RedisTemplate 统一 API 来操作 Redis
- 支持 Redis 的发布订阅模型
- 支持 Redis 哨兵和 Redis 集群
- 支持基于 Lettuce 的响应式编程
- 支持基于 JDK、JSON、字符串、Spring 对象的数据序列化及反序列化
- 支持基于 Redis 的 JDK Collection 实现

### 快速入门

SpringDataRedis 提供了 RedisTemplate 工具类，封装了各种 Redis 操作。并且将不同数据类型的操作 API 封装到了不同的类型中。

**RedisTemplate 常用 API：**

| API | 返回值类型 | 说明 |
|-----|-----------|------|
| `redisTemplate.opsForValue()` | ValueOperations | 操作 String 类型数据 |
| `redisTemplate.opsForHash()` | HashOperations | 操作 Hash 类型数据 |
| `redisTemplate.opsForList()` | ListOperations | 操作 List 类型数据 |
| `redisTemplate.opsForSet()` | SetOperations | 操作 Set 类型数据 |
| `redisTemplate.opsForZSet()` | ZSetOperations | 操作 SortedSet 类型数据 |
| `redisTemplate` | - | 通用的命令 |

下面演示如何在 Spring Boot 中集成和使用 SpringDataRedis。

#### 1. 引入依赖

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

#### 2. 配置文件

在 `application.yml` 中配置 Redis 连接信息：

```yaml
spring:
  redis:
    host: localhost
    port: 6379
    password: # 如果有密码
    lettuce:
      pool:
        max-active: 8   # 最大连接数
        max-idle: 8     # 最大空闲连接数
        min-idle: 0     # 最小空闲连接数
        max-wait: 1000ms  # 连接池最大阻塞等待时间
```

#### 3. 注入 RedisTemplate

```java
@SpringBootTest
public class RedisTest {

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Test
    public void testString() {
        // 写入一条 String 数据
        redisTemplate.opsForValue().set("name", "王五");

        // 读取一条 String 数据
        Object name = redisTemplate.opsForValue().get("name");
        System.out.println("name = " + name);
    }
}
```

### 序列化

::: info 什么是序列化？
**序列化**：将对象转换为字节流的过程，便于存储或网络传输。

**反序列化**：将字节流还原为对象的过程。

Redis 只能存储字节数据，因此 Java 对象需要先序列化才能存入 Redis，读取时再反序列化还原为对象。
:::

RedisTemplate 可以接收任意 Object 作为值写入 Redis，写入前会将对象序列化为字节形式。**默认采用 JDK 序列化方式**。

例如执行 `redisTemplate.opsForValue().set("name", "张三")` 后，在 Redis 中实际存储的是：

```
key:   "\xac\xed\x00\x05t\x00\x04name"
value: "\xac\xed\x00\x05t\x00\x06\xe5\xbc\xa0\xe4\xb8\x89"
```

可以看到，无论是 key 还是 value 都被序列化成了不可读的字节码形式。

**JDK 序列化的缺点：**
- 可读性差，无法直观查看数据
- 内存占用较大

#### RedisSerializer 提供的序列化器

| 序列化器 | 说明 |
|---------|------|
| `JdkSerializationRedisSerializer` | JDK 序列化（默认），可读性差 |
| `StringRedisSerializer` | String 序列化，适用于 key 和简单的 String 值 |
| `GenericJackson2JsonRedisSerializer` | JSON 序列化，自动处理对象类型 |
| `Jackson2JsonRedisSerializer` | JSON 序列化，需指定具体类型 |

#### 自定义 RedisTemplate 序列化方式

推荐配置：**key 和 hashKey 使用 String 序列化，value 和 hashValue 使用 JSON 序列化**

```java
@Configuration
public class RedisConfig {

    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory connectionFactory) {
        // 创建 RedisTemplate 对象
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);

        // 创建 JSON 序列化器
        GenericJackson2JsonRedisSerializer jsonSerializer = new GenericJackson2JsonRedisSerializer();

        // String 序列化器
        StringRedisSerializer stringSerializer = new StringRedisSerializer();

        // key 和 hashKey 采用 String 序列化
        template.setKeySerializer(stringSerializer);
        template.setHashKeySerializer(stringSerializer);

        // value 和 hashValue 采用 JSON 序列化
        template.setValueSerializer(jsonSerializer);
        template.setHashValueSerializer(jsonSerializer);

        return template;
    }
}
```

配置后，存储的数据将以 JSON 格式保存，既可读又高效：

```java
redisTemplate.opsForValue().set("user:1", new User("张三", 18));
```

Redis 中存储：

```json
{
  "@class": "com.example.entity.User",
  "name": "张三",
  "age": 18
}
```

::: tip @class 字段说明
`@class` 是 `GenericJackson2JsonRedisSerializer` 自动添加的类型标识，用于在反序列化时正确还原对象类型。这样 Redis 在读取数据时就知道应该将 JSON 转换为哪个 Java 类。
:::

### StringRedisTemplate

虽然 JSON 序列化器解决了可读性问题，但为了在反序列化时正确还原对象类型，会在 JSON 中写入 `@class` 字段，这会带来额外的内存开销。

**更优的方案**：使用 **StringRedisTemplate**，统一采用 String 序列化，手动控制对象的序列化和反序列化。

**优势：**
- 不会在 JSON 中存储 `@class` 类型信息，节省内存
- 完全控制序列化过程，更灵活
- Spring 默认提供，无需自定义配置

**使用示例：**

```java
@SpringBootTest
public class StringRedisTemplateTest {

    @Autowired
    private StringRedisTemplate stringRedisTemplate;

    // JSON 工具（可选 Jackson、Gson、Fastjson 等）
    private static final ObjectMapper mapper = new ObjectMapper();

    @Test
    public void testStringRedisTemplate() throws JsonProcessingException {
        // 创建对象
        User user = new User("李四", 20);

        // 手动序列化为 JSON 字符串
        String json = mapper.writeValueAsString(user);

        // 存入 Redis
        stringRedisTemplate.opsForValue().set("user:2", json);

        // 从 Redis 读取
        String jsonStr = stringRedisTemplate.opsForValue().get("user:2");

        // 手动反序列化为对象
        User readUser = mapper.readValue(jsonStr, User.class);
        System.out.println("readUser = " + readUser);
    }
}
```

存储在 Redis 中的数据：

```json
{
  "name": "李四",
  "age": 20
}
```

::: tip 对比
使用 StringRedisTemplate 存储的 JSON 不包含 `@class` 字段，相比 GenericJackson2JsonRedisSerializer 更加简洁，节省存储空间。
:::