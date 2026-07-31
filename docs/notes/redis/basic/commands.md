# Redis 命令

## Redis 数据结构介绍

Redis 是一个 key-value 数据库，key 一般是 String 类型，value 支持多种数据结构类型。

| 数据类型 | 说明 | 数据示例 | 典型应用场景 |
|---------|------|---------|------------|
| String | 字符串 | `"hello"` 或 `123` | 缓存、计数器、分布式锁 |
| Hash | 哈希表 | `{name: "张三", age: 20}` | 对象存储、购物车 |
| List | 列表 | `["A", "B", "C"]` | 消息队列、文章列表 |
| Set | 集合 | `{"A", "B", "C"}` | 标签、好友关系、抽奖 |
| SortedSet | 有序集合 | `{A:100, B:90, C:80}` | 排行榜、延时队列 |
| GEO | 地理坐标 | `(116.4, 39.9)` | 附近的人、打卡签到 |
| BitMap | 位图 | `1011010` | 签到统计、用户在线状态 |
| HyperLogLog | 基数统计 | 去重计数 `≈10000` | UV统计、独立访客计数 |

::: tip
在 [Redis 官网](https://redis.io/commands) 可以查看所有命令的详细文档，也可以使用 `help [command]` 查看命令的具体用法。
:::

## 通用命令

这些命令适用于所有数据类型的 key。

| 命令 | 语法 | 说明 | 注意事项 |
|------|------|------|---------|
| KEYS | `KEYS pattern` | 查看符合模板的所有 key | ⚠️ 不建议在生产环境使用，会阻塞服务器 |
| DEL | `DEL key [key ...]` | 删除指定的 key | 可以同时删除多个 key |
| EXISTS | `EXISTS key [key ...]` | 判断 key 是否存在 | 返回存在的 key 数量 |
| EXPIRE | `EXPIRE key seconds` | 给 key 设置有效期（秒） | 到期后 key 会被自动删除 |
| TTL | `TTL key` | 查看 key 的剩余有效期 | 返回 -1 表示永久，-2 表示不存在 |

::: tip
使用 `help [command]` 可以查看命令的具体用法和参数说明。
:::

## String

String 类型是 Redis 中最基本的数据类型，根据存储内容的不同，可以分为三种格式：

- **string**：普通字符串
- **int**：整数类型，可以进行自增自减操作
- **float**：浮点数类型，可以进行浮点数运算

::: warning 存储限制
底层都是字节数组存储，只不过编码方式不同。字符串类型的最大空间不能超过 **512MB**。
:::

### 常用命令

| 命令 | 语法 | 说明 | 返回值 |
|------|------|------|--------|
| SET | `SET key value` | 添加或者修改已经存在的一个String类型的键值对 | OK |
| GET | `GET key` | 获取指定 key 的值 | 字符串值或 nil |
| MSET | `MSET key1 value1 key2 value2 ...` | 批量设置多个 key-value | OK |
| MGET | `MGET key1 key2 ...` | 批量获取多个 key 的值 | 值列表 |
| INCR | `INCR key` | 将 key 中存储的数字值加 1 | 增加后的值 |
| INCRBY | `INCRBY key increment` | 将 key 中存储的数字值加上指定增量 | 增加后的值 |
| INCRBYFLOAT | `INCRBYFLOAT key increment` | 将 key 中存储的值加上指定浮点数增量 | 增加后的值 |
| SETNX | `SETNX key value` | 只在 key 不存在时设置值（常用于分布式锁） | 1 成功，0 失败 |
| SETEX | `SETEX key seconds value` | 设置值并指定过期时间（秒） | OK |

## key 的层级格式

Redis 的 key 允许使用冒号 `:` 分隔多个单词，形成层级结构，便于管理和查询。

**推荐格式**：`项目名:模块名:业务名:对象名:ID`（可根据实际业务需求灵活调整）

**实际示例**：

```bash
# 用户信息
mall:user:info:1001
mall:user:info:1002

# 商品库存
mall:product:stock:2001

# 订单数据
mall:order:detail:20240101001
mall:order:status:20240101001

# 缓存数据
blog:article:cache:12345
```

这种命名方式具有**结构清晰**、**便于管理**（支持 `KEYS` 模式匹配）、**避免冲突**等优势，有助于提高代码可维护性。

## Hash

Hash 类型，也叫散列，其 value 是一个无序字典，类似于 Java 中的 `HashMap` 结构。Hash 特别适合存储对象类型的数据。

**使用 String 存储对象**：将对象序列化为 JSON 字符串后存储，修改单个字段时需要反序列化整个对象，效率较低。

| key | value |
|----|----|
| user:1 | `{"id":1,"name":"张三","age":20}` |
| user:2 | `{"id":2,"name":"李四","age":25}` |

**使用 Hash 存储对象**：将对象的每个字段独立存储，可以针对单个字段进行 CRUD 操作，更加灵活高效。

| key    | field | value |
| ------ | ----- | ----- |
| user:1 | id    | 1     |
| user:1 | name  | 张三    |
| user:1 | age   | 20    |
| user:2 | id    | 2     |
| user:2 | name  | 李四    |
| user:2 | age   | 25    |

### 常用命令

| 命令 | 语法 | 说明 | 返回值 |
|------|------|------|--------|
| HSET | `HSET key field value [field value ...]` | 设置 hash 中一个或多个字段的值 | 新增字段数量 |
| HGET | `HGET key field` | 获取 hash 中指定字段的值 | 字段值或 nil |
| HMSET | `HMSET key field value [field value ...]` | 批量设置 hash 中多个字段的值（已废弃，推荐使用 HSET） | OK |
| HMGET | `HMGET key field [field ...]` | 批量获取 hash 中多个字段的值 | 值列表 |
| HGETALL | `HGETALL key` | 获取 hash 中所有的字段和值 | 字段和值的列表 |
| HKEYS | `HKEYS key` | 获取 hash 中所有的字段名 | 字段名列表 |
| HVALS | `HVALS key` | 获取 hash 中所有的字段值 | 字段值列表 |
| HINCRBY | `HINCRBY key field increment` | 将 hash 中指定字段的值增加指定整数 | 增加后的值 |
| HINCRBYFLOAT | `HINCRBYFLOAT key field increment` | 将 hash 中指定字段的值增加指定浮点数 | 增加后的值 |
| HSETNX | `HSETNX key field value` | 只在字段不存在时设置值 | 1 成功，0 失败 |
| HDEL | `HDEL key field [field ...]` | 删除 hash 中一个或多个字段 | 删除的字段数量 |
| HEXISTS | `HEXISTS key field` | 判断 hash 中字段是否存在 | 1 存在，0 不存在 |
| HLEN | `HLEN key` | 获取 hash 中字段的数量 | 字段数量 |

### 使用示例

```bash
# 设置用户信息
HSET user:1001 name "张三" age 20 city "北京"
# 返回：(integer) 3

# 获取单个字段
HGET user:1001 name
# 返回："张三"

# 批量获取多个字段
HMGET user:1001 name age city
# 返回：1) "张三" 2) "20" 3) "北京"

# 获取所有字段和值
HGETALL user:1001
# 返回：1) "name" 2) "张三" 3) "age" 4) "20" 5) "city" 6) "北京"

# 年龄增加 1
HINCRBY user:1001 age 1
# 返回：(integer) 21

# 删除字段
HDEL user:1001 city
# 返回：(integer) 1

# 判断字段是否存在
HEXISTS user:1001 name
# 返回：(integer) 1
```

## List

Redis 中的 List 类型与 Java 中的 `LinkedList` 类似，是一个双向链表结构，既可以支持正向检索也可以支持反向检索。

- **有序**：元素按照插入顺序排列
- **可重复**：允许存储重复的元素
- **插入删除快**：在列表头尾插入删除元素效率高，时间复杂度 O(1)
- **查询速度一般**：按索引查询需要遍历链表，时间复杂度 O(n)

### 常用命令

| 命令 | 语法 | 说明 | 返回值 |
|------|------|------|--------|
| LPUSH | `LPUSH key element [element ...]` | 从列表左侧插入一个或多个元素 | 插入后列表的长度 |
| RPUSH | `RPUSH key element [element ...]` | 从列表右侧插入一个或多个元素 | 插入后列表的长度 |
| LPOP | `LPOP key [count]` | 从列表左侧移除并返回一个或多个元素 | 被移除的元素 |
| RPOP | `RPOP key [count]` | 从列表右侧移除并返回一个或多个元素 | 被移除的元素 |
| LRANGE | `LRANGE key start stop` | 获取列表指定范围内的元素 | 元素列表 |
| LLEN | `LLEN key` | 获取列表长度 | 列表长度 |
| LINDEX | `LINDEX key index` | 获取列表指定索引位置的元素 | 元素值或 nil |
| LSET | `LSET key index element` | 设置列表指定索引位置的元素值 | OK |
| LREM | `LREM key count element` | 删除列表中指定数量的元素 | 删除的元素数量 |
| LTRIM | `LTRIM key start stop` | 保留列表指定范围内的元素，删除其他元素 | OK |
| BLPOP | `BLPOP key [key ...] timeout` | 从列表左侧弹出元素，列表为空时阻塞等待 | key 和元素，或 nil |
| BRPOP | `BRPOP key [key ...] timeout` | 从列表右侧弹出元素，列表为空时阻塞等待 | key 和元素，或 nil |

::: tip
`LRANGE` 的索引支持负数，`-1` 表示最后一个元素，`-2` 表示倒数第二个元素，以此类推。
:::

### 使用示例

```bash
# 从左侧插入元素
LPUSH tasks "task1" "task2" "task3"
# 返回：(integer) 3

# 从右侧插入元素
RPUSH tasks "task4"
# 返回：(integer) 4

# 获取列表所有元素（从左到右）
LRANGE tasks 0 -1
# 返回：1) "task3" 2) "task2" 3) "task1" 4) "task4"

# 获取列表长度
LLEN tasks
# 返回：(integer) 4

# 从左侧弹出元素
LPOP tasks
# 返回："task3"

# 从右侧弹出元素
RPOP tasks
# 返回："task4"

# 获取指定索引的元素
LINDEX tasks 0
# 返回："task2"

# 阻塞式弹出（超时时间 10 秒）
BLPOP tasks 10
# 返回：1) "tasks" 2) "task2"
```

### 应用场景

List 可以模拟多种数据结构：

- **栈（Stack）**：使用 `LPUSH` + `LPOP` 或 `RPUSH` + `RPOP` 实现后进先出（LIFO）
- **队列（Queue）**：使用 `LPUSH` + `RPOP` 或 `RPUSH` + `LPOP` 实现先进先出（FIFO）
- **阻塞队列（Blocking Queue）**：使用 `LPUSH` + `BRPOP` 或 `RPUSH` + `BLPOP` 实现消息队列，生产者消费者模式

常见应用场景：消息队列、文章列表、评论列表、关注列表等。

## Set

Redis 的 Set 与 Java 中的 `HashSet` 类似，可以看做一个 value 为 null 的 HashMap。Set 是 String 类型的无序集合，集合成员是唯一的。


- **无序**：元素没有特定的顺序
- **不可重复**：集合中不能出现重复的元素
- **查找快**：基于哈希表实现，查找效率高，时间复杂度 O(1)
- **支持集合运算**：支持交集、并集、差集等操作

### 常用命令

| 命令 | 语法 | 说明 | 返回值 |
|------|------|------|--------|
| SADD | `SADD key member [member ...]` | 向集合中添加一个或多个成员 | 成功添加的成员数量 |
| SREM | `SREM key member [member ...]` | 从集合中移除一个或多个成员 | 成功移除的成员数量 |
| SCARD | `SCARD key` | 获取集合中成员的数量 | 成员数量 |
| SISMEMBER | `SISMEMBER key member` | 判断成员是否在集合中 | 1 存在，0 不存在 |
| SMEMBERS | `SMEMBERS key` | 获取集合中的所有成员 | 成员列表 |
| SINTER | `SINTER key [key ...]` | 获取多个集合的交集 | 交集成员列表 |
| SINTERSTORE | `SINTERSTORE destination key [key ...]` | 将多个集合的交集存储到新集合中 | 交集成员数量 |
| SUNION | `SUNION key [key ...]` | 获取多个集合的并集 | 并集成员列表 |
| SUNIONSTORE | `SUNIONSTORE destination key [key ...]` | 将多个集合的并集存储到新集合中 | 并集成员数量 |
| SDIFF | `SDIFF key [key ...]` | 获取多个集合的差集 | 差集成员列表 |
| SDIFFSTORE | `SDIFFSTORE destination key [key ...]` | 将多个集合的差集存储到新集合中 | 差集成员数量 |
| SPOP | `SPOP key [count]` | 随机移除并返回集合中的一个或多个成员 | 被移除的成员 |
| SRANDMEMBER | `SRANDMEMBER key [count]` | 随机获取集合中的一个或多个成员（不移除） | 成员列表 |

### 使用示例

```bash
# 添加成员到集合
SADD users:1:tags "java" "redis" "mysql"
# 返回：(integer) 3

SADD users:2:tags "java" "mongodb" "docker"
# 返回：(integer) 3

# 获取集合中的所有成员
SMEMBERS users:1:tags
# 返回：1) "java" 2) "redis" 3) "mysql"

# 判断成员是否存在
SISMEMBER users:1:tags "java"
# 返回：(integer) 1

# 获取集合成员数量
SCARD users:1:tags
# 返回：(integer) 3

# 移除成员
SREM users:1:tags "mysql"
# 返回：(integer) 1

# 交集：找出两个用户共同的标签
SINTER users:1:tags users:2:tags
# 返回：1) "java"

# 并集：找出两个用户的所有标签
SUNION users:1:tags users:2:tags
# 返回：1) "java" 2) "redis" 3) "mongodb" 4) "docker"

# 差集：找出用户1独有的标签
SDIFF users:1:tags users:2:tags
# 返回：1) "redis"

# 随机获取成员（不移除）
SRANDMEMBER users:1:tags 2
# 返回：1) "java" 2) "redis"
```

### 应用场景

- **标签系统**：给用户或文章添加标签，利用集合运算找出共同标签
- **共同好友**：使用 `SINTER` 找出两个用户的共同好友
- **推荐系统**：根据用户标签的交集和并集进行内容推荐
- **抽奖系统**：使用 `SPOP` 随机抽取中奖用户
- **黑白名单**：快速判断用户是否在黑名单或白名单中
- **点赞/收藏**：记录用户点赞或收藏的文章 ID，快速判断是否已点赞

## SortedSet

Redis 的 SortedSet（有序集合）是一个可排序的 Set 集合，与 Java 中的 `TreeSet` 类似，但底层数据结构差别很大。SortedSet 中的每一个元素都带有一个 score 属性，可以基于 score 属性对元素排序，底层的实现是跳表（SkipList）加哈希表。

- **可排序**：每个元素都关联一个 score（分数），根据 score 自动排序
- **不可重复**：元素值（member）必须唯一，但 score 可以重复
- **查询速度快**：基于跳表实现，查询效率高，时间复杂度 O(log n)

### 常用命令

::: tip 命名规则
SortedSet 的排名和范围查询命令默认按分数**升序**排列。如需**降序**排列，在命令名中 `Z` 后添加 `REV` 即可，如 `ZRANGE` 对应 `ZREVRANGE`，`ZRANK` 对应 `ZREVRANK`。
:::

| 命令 | 语法 | 说明 | 返回值 |
|------|------|------|--------|
| ZADD | `ZADD key score member [score member ...]` | 向有序集合添加一个或多个成员及其分数 | 成功添加的成员数量 |
| ZREM | `ZREM key member [member ...]` | 从有序集合中移除一个或多个成员 | 成功移除的成员数量 |
| ZSCORE | `ZSCORE key member` | 获取有序集合中指定成员的分数 | 分数值或 nil |
| ZRANK | `ZRANK key member` | 获取有序集合中成员的排名（升序，从0开始） | 排名或 nil |
| ZCARD | `ZCARD key` | 获取有序集合的成员数量 | 成员数量 |
| ZCOUNT | `ZCOUNT key min max` | 获取指定分数区间内的成员数量 | 成员数量 |
| ZINCRBY | `ZINCRBY key increment member` | 为有序集合中指定成员的分数增加指定值 | 增加后的分数 |
| ZRANGE | `ZRANGE key start stop [WITHSCORES]` | 获取指定排名范围内的成员（升序） | 成员列表 |
| ZRANGEBYSCORE | `ZRANGEBYSCORE key min max [WITHSCORES] [LIMIT offset count]` | 获取指定分数区间内的成员（升序） | 成员列表 |
| ZPOPMIN | `ZPOPMIN key [count]` | 移除并返回分数最低的一个或多个成员 | 成员和分数列表 |
| ZPOPMAX | `ZPOPMAX key [count]` | 移除并返回分数最高的一个或多个成员 | 成员和分数列表 |
| ZDIFF | `ZDIFF numkeys key [key ...] [WITHSCORES]` | 计算多个有序集合的差集 | 成员列表 |
| ZINTER | `ZINTER numkeys key [key ...] [WEIGHTS weight ...] [AGGREGATE SUM\|MIN\|MAX] [WITHSCORES]` | 计算多个有序集合的交集 | 成员列表 |
| ZUNION | `ZUNION numkeys key [key ...] [WEIGHTS weight ...] [AGGREGATE SUM\|MIN\|MAX] [WITHSCORES]` | 计算多个有序集合的并集 | 成员列表 |

::: tip
`ZRANGE` 和 `ZREVRANGE` 的索引支持负数，`-1` 表示最后一个元素，`-2` 表示倒数第二个元素。添加 `WITHSCORES` 参数可以同时返回分数。
:::

### 使用示例

```bash
# 添加成员到排行榜（游戏积分）
ZADD game:rank 1000 "player1" 1500 "player2" 1200 "player3"
# 返回：(integer) 3

# 增加玩家积分
ZINCRBY game:rank 300 "player1"
# 返回："1300"

# 获取玩家积分
ZSCORE game:rank "player1"
# 返回："1300"

# 获取玩家排名（降序，第一名为0）
ZREVRANK game:rank "player2"
# 返回：(integer) 0

# 获取排行榜前3名（降序）
ZREVRANGE game:rank 0 2 WITHSCORES
# 返回：1) "player2" 2) "1500" 3) "player1" 4) "1300" 5) "player3" 6) "1200"

# 获取排行榜所有成员（升序）
ZRANGE game:rank 0 -1 WITHSCORES
# 返回：1) "player3" 2) "1200" 3) "player1" 4) "1300" 5) "player2" 6) "1500"

# 获取积分在1200到1400之间的玩家
ZRANGEBYSCORE game:rank 1200 1400 WITHSCORES
# 返回：1) "player3" 2) "1200" 3) "player1" 4) "1300"

# 获取集合成员数量
ZCARD game:rank
# 返回：(integer) 3

# 获取1000分以上的玩家数量
ZCOUNT game:rank 1000 +inf
# 返回：(integer) 3

# 移除成员
ZREM game:rank "player3"
# 返回：(integer) 1

# 创建两个有序集合用于演示集合运算
ZADD zset1 100 "a" 200 "b" 300 "c"
ZADD zset2 150 "b" 300 "c" 400 "d"

# 计算交集（默认分数求和）
ZINTER 2 zset1 zset2 WITHSCORES
# 返回：1) "b" 2) "350" 3) "c" 4) "600"

# 计算交集（分数取最小值）
ZINTER 2 zset1 zset2 AGGREGATE MIN WITHSCORES
# 返回：1) "b" 2) "150" 3) "c" 4) "300"

# 计算并集
ZUNION 2 zset1 zset2 WITHSCORES
# 返回：1) "a" 2) "100" 3) "b" 4) "350" 5) "c" 6) "600" 7) "d" 8) "400"

# 计算差集（zset1 有但 zset2 没有的元素）
ZDIFF 2 zset1 zset2 WITHSCORES
# 返回：1) "a" 2) "100"

# 使用权重计算交集（zset1 权重2，zset2 权重3）
ZINTER 2 zset1 zset2 WEIGHTS 2 3 WITHSCORES
# 返回：1) "b" 2) "850" 3) "c" 4) "1500"
```

### 应用场景

- **排行榜系统**：游戏积分榜、销售排行榜、热搜榜等，利用 score 排序
- **延时队列**：使用时间戳作为 score，按时间顺序处理任务
- **带权重的消息队列**：根据优先级（score）处理消息
- **范围查询**：查找某个分数区间内的数据，如查找某个价格区间的商品
- **点赞排序**：根据点赞数排序展示内容
- **时间线**：使用时间戳作为 score，按时间顺序展示内容