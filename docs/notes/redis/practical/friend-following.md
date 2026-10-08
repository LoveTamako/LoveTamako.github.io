# 好友关注

## 关注和取关

在探店笔记详情页，用户可以关注笔记作者，关注后按钮显示为“已关注”；再次点击则取消关注。进入详情页时，还需要查询当前用户是否已关注该作者，以便展示正确的按钮状态。

**核心需求：**

1. **关注/取关用户**：根据前端传入的目标状态，新增或删除关注关系
2. **判断是否关注**：查询当前登录用户是否关注了指定用户，返回布尔值
3. **防止重复关注**：同一个用户对同一个作者最多保留一条关注记录

### 数据库设计

#### 数据表结构

`tb_follow` 是保存用户关注关系的中间表，结构如下：

```sql
CREATE TABLE `tb_follow` (
    `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
    `user_id` bigint unsigned NOT NULL COMMENT '关注者用户 ID',
    `follow_user_id` bigint unsigned NOT NULL COMMENT '被关注者用户 ID',
    `create_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '关注时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_follow` (`user_id`, `follow_user_id`),
    KEY `idx_follow_user` (`follow_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户关注关系表';
```

用户之间的关注是**多对多关系**，表中 `user_id` 和 `follow_user_id` 分别表示关注者与被关注者。

**索引说明：**

- **联合唯一索引** `uk_user_follow(user_id, follow_user_id)`：防止重复关注，同时支持查询关注列表和关注状态。
- **普通索引** `idx_follow_user(follow_user_id)`：支持查询某位用户的粉丝列表。

#### 实体类设计

使用 `Follow` 实体类映射 `tb_follow`，其中 `userId` 和 `followUserId` 分别对应关注者与被关注者，`createTime` 记录关注时间。

```java
@Data
@TableName("tb_follow")
public class Follow {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;          // 当前登录用户，即关注者
    private Long followUserId;    // 被关注的用户
    private LocalDateTime createTime;
}
```

### 关注/取关用户

#### 接口说明

根据前端传入的目标状态，新增或删除当前用户对指定用户的关注关系。

| 项目 | 内容 |
|------|------|
| 请求方式 | PUT |
| 请求路径 | `/follow/{followUserId}/{isFollow}` |
| 请求参数 | `followUserId`（被关注用户 ID）、`isFollow`（目标关注状态），均为路径参数 |
| 返回结果 | `Result` 对象，表示操作是否成功 |

`followUserId` 在笔记详情页中取自 `blog.userId`；`isFollow` 为 `true` 表示关注，为 `false` 表示取关。

#### 实现思路

1. 从 `UserHolder` 获取当前登录用户 ID
2. `isFollow` 为 `true` 时，新增关注记录
3. `isFollow` 为 `false` 时，按关注者和被关注者 ID 删除关注记录

#### 代码实现

两个接口均沿用 [短信登录](./sms-login.md) 中的 `UserHolder` 和统一返回对象 `Result`，由登录拦截器校验登录状态。以下代码省略常规 import。

::: tip 教程示例说明

本节只展示关注关系的新增、删除和查询，默认用户已登录、参数和目标用户有效。参数校验、禁止关注自己、重复请求及异常处理等细节，在实际项目中再补充；联合唯一索引会阻止重复记录，但示例未将重复关注的异常转换为成功响应。

:::

**Controller 层：**

```java
@RestController
@RequestMapping("/follow")
public class FollowController {

    @Resource
    private IFollowService followService;

    /**
     * 关注/取关用户
     */
    @PutMapping("/{followUserId}/{isFollow}")
    public Result follow(@PathVariable("followUserId") Long followUserId,
                         @PathVariable("isFollow") Boolean isFollow) {
        return followService.follow(followUserId, isFollow);
    }
}
```

**Mapper 接口：**

```java
@Mapper
public interface FollowMapper extends BaseMapper<Follow> {
}
```

**Service 接口：**

```java
public interface IFollowService extends IService<Follow> {

    Result follow(Long followUserId, Boolean isFollow);
}
```

**Service 层：**

`FollowServiceImpl` 继承 MyBatis-Plus 的 `ServiceImpl`，使用 `save()` 新增关系、`remove()` 删除关系。

```java
@Service
public class FollowServiceImpl extends ServiceImpl<FollowMapper, Follow>
        implements IFollowService {

    @Override
    public Result follow(Long followUserId, Boolean isFollow) {
        // 1. 获取当前登录用户 ID
        Long userId = UserHolder.getUser().getId();

        if (isFollow) {
            // 2. 关注：保存关注关系
            Follow follow = new Follow();
            follow.setUserId(userId);
            follow.setFollowUserId(followUserId);
            follow.setCreateTime(LocalDateTime.now());
            save(follow);
        } else {
            // 3. 取关：删除当前用户对目标用户的关注关系
            remove(new LambdaQueryWrapper<Follow>()
                .eq(Follow::getUserId, userId)
                .eq(Follow::getFollowUserId, followUserId));
        }

        return Result.ok();
    }
}
```

**关键实现点：**

1. **关注者来自登录上下文**：`userId` 从 `UserHolder` 获取，前端只传目标用户 ID
2. **取关同时匹配双方 ID**：只删除当前用户对指定用户的关注关系

### 判断是否关注

#### 接口说明

进入笔记详情页时，查询当前登录用户是否关注了笔记作者，供前端展示“关注”或“已关注”按钮。

| 项目 | 内容 |
|------|------|
| 请求方式 | GET |
| 请求路径 | `/follow/or/not/{followUserId}` |
| 请求参数 | `followUserId`（被关注用户 ID，取自 `blog.userId`），为路径参数 |
| 返回结果 | `Result` 对象，`data` 为 `true`（已关注）或 `false`（未关注） |

#### 实现思路

1. 获取当前登录用户 ID
2. 按 `user_id` 和 `follow_user_id` 查询 `tb_follow` 中是否存在关注记录
3. 存在则返回 `true`，不存在则返回 `false`

#### 代码实现

在上一小节的 Controller 和 Service 中补充查询方法，复用已有的 `FollowMapper`。

**Controller 层：**

在 `FollowController` 中增加以下方法：

```java
/**
 * 判断当前用户是否关注了指定用户
 */
@GetMapping("/or/not/{followUserId}")
public Result isFollow(@PathVariable("followUserId") Long followUserId) {
    return followService.isFollow(followUserId);
}
```

**Service 接口：**

在 `IFollowService` 中增加方法声明：

```java
Result isFollow(Long followUserId);
```

**Service 层：**

在 `FollowServiceImpl` 中增加以下方法，使用 `count()` 判断关系是否存在：

```java
@Override
public Result isFollow(Long followUserId) {
    // 1. 获取当前登录用户 ID
    Long userId = UserHolder.getUser().getId();

    // 2. 查询当前用户与目标用户之间是否存在关注关系
    long count = count(new LambdaQueryWrapper<Follow>()
        .eq(Follow::getUserId, userId)
        .eq(Follow::getFollowUserId, followUserId));

    // 3. 返回布尔值，供前端展示关注状态
    return Result.ok(count > 0);
}
```

本节先通过 MySQL 查询关注状态。后续实现“共同关注”时，可以引入 Redis Set，通过集合交集查询共同关注的用户。

## 共同关注

## 关注推送
