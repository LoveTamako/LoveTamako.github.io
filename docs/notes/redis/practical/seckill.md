# 优惠券秒杀

## 全局唯一 ID

### 业务场景

在优惠券秒杀系统中，每个店铺可以发布优惠券，用户抢购成功后会生成订单并保存到 `tb_voucher_order` 表中。

**订单表结构：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | bigint | 订单 ID（主键） |
| user_id | bigint | 用户 ID |
| voucher_id | bigint | 优惠券 ID |
| pay_type | tinyint | 支付方式（1:余额 2:支付宝 3:微信） |
| status | tinyint | 订单状态（1:未支付 2:已支付 3:已核销 4:已取消 5:退款中 6:已退款） |
| create_time | timestamp | 创建时间 |
| pay_time | timestamp | 支付时间 |
| use_time | timestamp | 核销时间 |
| refund_time | timestamp | 退款时间 |
| update_time | timestamp | 更新时间 |

**为什么不能使用数据库自增 ID？**

- **安全性问题**：ID 规律性太明显，容易被恶意用户遍历订单信息，暴露业务量等敏感数据
- **扩展性问题**：分库分表后无法保证全局唯一性，需要额外配置起始值和步长

### 全局 ID 生成器

#### 设计要求

分布式系统下的全局 ID 生成器需要满足以下特性：

| 特性 | 说明 |
|------|------|
| **唯一性** | 在分布式环境下保证 ID 全局唯一 |
| **高可用** | 服务故障时仍能持续生成 ID，不成为系统瓶颈 |
| **高性能** | 生成速度快，能支撑高并发场景 |
| **递增性** | ID 呈趋势递增，利于数据库 B+ 树索引性能 |
| **安全性** | ID 不易被猜测，避免业务信息泄露 |

#### 方案选型

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **UUID** | 本地生成，无需依赖外部系统 | 无序，不利于索引；占用空间大（128位） | 对性能和存储空间要求不高的场景 |
| **数据库独立ID表** | 实现简单，ID严格递增，可按业务分配号段 | 性能瓶颈在数据库；存在单点故障风险 | 并发量中等的分布式系统 |
| **Redis自增** | 性能优秀（10W+ QPS），趋势递增，易于统计 | 依赖Redis；需考虑持久化策略 | **高并发秒杀场景（本方案）** |
| **Snowflake** | 性能极高，本地生成，趋势递增；MyBatis-Plus 已内置实现（`IdType.ASSIGN_ID`） | 依赖系统时钟；需维护机器ID | 超大规模分布式系统 |

:::tip 为什么选择 Redis 自增方案？

1. **性能满足需求**：Redis 的 INCR 命令单机 QPS 可达 10W+，足以支撑秒杀场景
2. **趋势递增**：通过时间戳+序列号组合，保证 ID 整体递增，利于数据库索引
3. **便于统计**：按日期分组的 Key 设计，可方便统计每日订单量
4. **实现简单**：相比 Snowflake，无需维护机器 ID 和处理复杂的时钟回拨问题

:::

#### ID 结构设计

采用 **64 位 Long 型** 整数，由以下三部分组成：

```
┌─────────┬──────────────────────────────┬────────────────────────────────┐
│ 符号位  │         时间戳（31位）        │        序列号（32位）           │
│  1 bit  │  当前秒数 - 起始时间（秒）     │   Redis 自增值（每秒重置）      │
└─────────┴──────────────────────────────┴────────────────────────────────┘
    0             可用约 69 年                  每秒最多 2^32 个 ID
```

| 组成部分 | 位数 | 说明 |
|---------|------|------|
| 符号位 | 1 bit | 固定为 0，表示正数 |
| 时间戳 | 31 bit | 当前时间戳减去起始时间（秒级），可用约 69 年 |
| 序列号 | 32 bit | Redis 自增计数器，按天分组，每秒最多生成 2^32 个不同 ID |

#### 代码实现

**RedisIdWorker 工具类：**

```java
@Component
public class RedisIdWorker {

    /**
     * 开始时间戳（2022-01-01 00:00:00）
     */
    private static final long BEGIN_TIMESTAMP = 1640995200L;

    /**
     * 序列号的位数
     */
    private static final int COUNT_BITS = 32;

    @Resource
    private StringRedisTemplate stringRedisTemplate;

    /**
     * 生成全局唯一ID
     * @param keyPrefix 业务前缀（如 "order"、"voucher"）
     * @return 全局唯一ID
     */
    public long nextId(String keyPrefix) {
        // 1. 生成时间戳（当前时间 - 开始时间）
        LocalDateTime now = LocalDateTime.now();
        long nowSecond = now.toEpochSecond(ZoneOffset.UTC);
        long timestamp = nowSecond - BEGIN_TIMESTAMP;

        // 2. 生成序列号
        // 2.1 获取当前日期，精确到天
        String date = now.format(DateTimeFormatter.ofPattern("yyyy:MM:dd"));
        // 2.2 Redis自增（Key格式：icr:业务前缀:日期）
        // 例如：icr:order:2024:08:13
        Long count = stringRedisTemplate.opsForValue()
                .increment("icr:" + keyPrefix + ":" + date);

        // 3. 拼接并返回：时间戳左移32位，然后与序列号按位或运算
        return timestamp << COUNT_BITS | count;
    }
}
```

**核心实现细节：**

1. **时间戳计算**
   - 使用相对时间戳（当前时间 - 起始时间），避免浪费高位存储空间
   - 起始时间设为 2022-01-01，31 位可用约 69 年

2. **序列号生成**
   - Redis Key 格式：`icr:业务前缀:日期`（如 `icr:order:2024:08:13`）
   - 使用 `INCR` 命令原子性自增，保证并发安全
   - 按天分组的好处：
     - 方便统计每天的业务量
     - 避免单个 Key 的值过大
     - 自动按天隔离，无需手动清理

3. **位运算拼接**
   - 时间戳左移 32 位，占据高 32 位
   - 与序列号进行按位或运算，序列号占据低 32 位
   - 最终组成 64 位 Long 型 ID

**使用示例：**

```java
@Service
public class VoucherOrderServiceImpl implements IVoucherOrderService {

    @Resource
    private RedisIdWorker redisIdWorker;

    @Override
    public Result seckillVoucher(Long voucherId) {
        // 1. 生成订单ID
        long orderId = redisIdWorker.nextId("order");

        // 2. 创建订单
        VoucherOrder order = new VoucherOrder();
        order.setId(orderId);
        order.setUserId(UserHolder.getUser().getId());
        order.setVoucherId(voucherId);

        // 3. 保存订单
        save(order);

        return Result.ok(orderId);
    }
}
```

**测试验证：**

```java
@Test
void testIdWorker() throws InterruptedException {
    CountDownLatch latch = new CountDownLatch(300);

    Runnable task = () -> {
        for (int i = 0; i < 100; i++) {
            long id = redisIdWorker.nextId("order");
            System.out.println("id = " + id);
        }
        latch.countDown();
    };

    long begin = System.currentTimeMillis();
    for (int i = 0; i < 300; i++) {
        executor.submit(task);
    }
    latch.await();
    long end = System.currentTimeMillis();

    System.out.println("生成3万个ID耗时：" + (end - begin) + "ms");
}
```

## 实现优惠券秒杀下单

### 业务场景

每个店铺都可以发布优惠券，用户可通过优惠券享受相应的折扣或满减优惠。

**优惠券类型：**

- **平价券**：无库存限制，用户可随时购买
- **特价券**：限量发放，需要秒杀抢购，具有时间限制和库存限制

### 数据表设计

**tb_voucher（优惠券基础表）：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | bigint | 优惠券 ID（主键） |
| shop_id | bigint | 店铺 ID |
| title | varchar | 优惠券标题 |
| sub_title | varchar | 优惠券副标题 |
| rules | varchar | 使用规则 |
| pay_value | bigint | 支付金额（单位：分） |
| actual_value | bigint | 抵扣金额（单位：分） |
| type | tinyint | 优惠券类型（0:平价券 1:特价券） |
| status | tinyint | 状态（1:上架 2:下架 3:过期） |
| create_time | timestamp | 创建时间 |
| update_time | timestamp | 更新时间 |

**tb_seckill_voucher（秒杀券扩展表）：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| voucher_id | bigint | 关联的优惠券 ID（主键） |
| stock | int | 库存数量 |
| begin_time | timestamp | 秒杀开始时间 |
| end_time | timestamp | 秒杀结束时间 |
| create_time | timestamp | 创建时间 |
| update_time | timestamp | 更新时间 |

:::tip 表设计说明
特价券的秒杀相关信息（库存、时间限制）单独存储在 `tb_seckill_voucher` 表中，通过 `voucher_id` 与 `tb_voucher` 表关联。这种设计可以避免在基础表中存储大量空值，提高查询效率。
:::

### 添加秒杀券接口

**接口功能：**

提供 RESTful API 接口，用于商家发布秒杀优惠券，同时将优惠券基本信息和秒杀信息分别保存到对应的数据表中。

**接口基本信息：**

| 项目 | 内容 |
|------|------|
| 请求方式 | POST |
| 请求路径 | `/voucher-order/seckill` |
| 请求参数 | Voucher 对象（JSON 格式） |
| 返回结果 | Result 对象（包含优惠券 ID） |

**Controller 实现：**

```java
@RestController
@RequestMapping("/voucher-order")
public class VoucherOrderController {

    @Resource
    private IVoucherService voucherService;

    /**
     * 新增秒杀券
     * @param voucher 优惠券信息（包含秒杀信息）
     * @return 优惠券ID
     */
    @PostMapping("/seckill")
    public Result addSeckillVoucher(@RequestBody Voucher voucher) {
        voucherService.addSeckillVoucher(voucher);
        return Result.ok(voucher.getId());
    }
}
```

**Service 实现：**

```java
@Service
public class VoucherServiceImpl extends ServiceImpl<VoucherMapper, Voucher>
        implements IVoucherService {

    @Resource
    private ISeckillVoucherService seckillVoucherService;

    @Override
    @Transactional
    public void addSeckillVoucher(Voucher voucher) {
        // 1. 保存优惠券基本信息
        save(voucher);

        // 2. 保存秒杀券扩展信息
        SeckillVoucher seckillVoucher = new SeckillVoucher();
        seckillVoucher.setVoucherId(voucher.getId());
        seckillVoucher.setStock(voucher.getStock());
        seckillVoucher.setBeginTime(voucher.getBeginTime());
        seckillVoucher.setEndTime(voucher.getEndTime());
        seckillVoucherService.save(seckillVoucher);
    }
}
```

**核心逻辑：**

1. **事务保证**：使用 `@Transactional` 注解保证两张表的数据一致性
2. **分表存储**：优惠券基本信息存入 `tb_voucher`，秒杀信息存入 `tb_seckill_voucher`
3. **关联关系**：通过 `voucher_id` 建立两表之间的关联

**请求示例：**

```json
POST /voucher-order/seckill
{
    "shopId": 1,
    "title": "100元代金券",
    "subTitle": "周一至周五可用",
    "rules": "全场通用",
    "payValue": 8000,
    "actualValue": 10000,
    "type": 1,
    "stock": 100,
    "beginTime": "2024-08-13 10:00:00",
    "endTime": "2024-08-13 18:00:00"
}
```

## 超卖问题

## 一人一单

## 分布式锁

## Redis 优化秒杀

## Redis 消息队列实现异步秒杀