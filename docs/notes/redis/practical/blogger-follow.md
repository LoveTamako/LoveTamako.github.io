# 达人探店

## 概述

达人探店是类似大众点评的UGC（用户生成内容）功能，用户可以发布图文并茂的店铺体验笔记，其他用户可以浏览、点赞和评论这些笔记。本章节将实现探店笔记的发布、查询、点赞等核心功能。

**主要功能模块：**

1. **探店笔记发布**：支持上传图片和发布笔记
2. **探店笔记查询**：查询笔记详情，展示发布者信息
3. **点赞功能**：点赞/取消点赞，使用 Redis Set 防止重复点赞
4. **点赞人 Top 5**：使用 Redis SortedSet 在笔记详情页展示最早点赞的 5 位用户

## 探店笔记

探店笔记类似大众点评的评价功能，用户可以发布图文并茂的店铺体验内容。系统涉及两个核心数据表：

- **tb_blog**：探店笔记表，存储笔记的标题、文字、图片等内容
- **tb_blog_comments**：评论表，存储其他用户对探店笔记的评价

### 数据表结构

**tb_blog 表结构：**

```sql
CREATE TABLE `tb_blog` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `shop_id` bigint(20) NOT NULL COMMENT '商户id',
  `user_id` bigint(20) unsigned NOT NULL COMMENT '用户id',
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '标题',
  `images` varchar(2048) NOT NULL COMMENT '探店的照片，最多9张，多张以”,”隔开',
  `content` varchar(2048) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '探店的文字描述',
  `liked` int(8) unsigned DEFAULT '0' COMMENT '点赞数量',
  `comments` int(8) unsigned DEFAULT NULL COMMENT '评论数量',
  `create_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4;
```

**Blog 实体类：** {#blog-entity}

```java
@Data
@TableName(“tb_blog”)
public class Blog {
    @TableId(type = IdType.AUTO)
    private Long id;                     // 主键
    private Long shopId;                 // 商户id
    private Long userId;                 // 用户id
    @TableField(exist = false)
    private String name;                 // 用户昵称（非数据库字段）
    @TableField(exist = false)
    private String icon;                 // 用户头像（非数据库字段）
    private String title;                // 标题
    private String images;               // 探店图片，最多9张，多张以”,”隔开
    private String content;              // 探店文字描述
    private Integer liked;               // 点赞数量
    private Integer comments;            // 评论数量
    private LocalDateTime createTime;    // 创建时间
    private LocalDateTime updateTime;    // 更新时间
}
```

### 发布探店笔记

发布探店笔记包含两个核心接口：

1. **上传图片接口**：用户上传探店照片，返回图片 URL
2. **发布笔记接口**：提交笔记标题、内容、图片等信息，创建探店笔记

#### 上传图片接口

**接口说明：**

| 项目 | 内容 |
|------|------|
| 请求方式 | POST |
| 请求路径 | `/upload/blog` |
| 请求参数 | MultipartFile file（图片文件） |
| 返回结果 | Result 对象（包含图片 URL） |

**实现思路：**

1. 接收前端上传的图片文件
2. 生成唯一文件名（防止重名覆盖）
3. 保存图片到 Nginx 静态资源目录
4. 返回图片访问 URL

**Controller 层：**

```java
@RestController
@RequestMapping(“/upload”)
@Slf4j
public class UploadController {

    @PostMapping(“/blog”)
    public Result uploadImage(@RequestParam(“file”) MultipartFile image) {
        try {
            // 获取原始文件名
            String originalFilename = image.getOriginalFilename();
            
            // 生成新文件名（时间戳 + 随机数 + 扩展名）
            String fileName = createNewFileName(originalFilename);
            
            // 保存文件到指定目录
            image.transferTo(new File(SystemConstants.IMAGE_UPLOAD_DIR, fileName));
            
            // 返回图片访问路径
            log.debug(“图片上传成功：{}”, fileName);
            return Result.ok(fileName);
        } catch (IOException e) {
            throw new RuntimeException(“文件上传失败”, e);
        }
    }

    /**
     * 生成新文件名
     * 使用 Hutool 工具类简化文件名生成
     */
    private String createNewFileName(String originalFilename) {
        // 获取文件扩展名
        String suffix = FileUtil.getSuffix(originalFilename);
        // 生成唯一文件名：yyyyMMdd/yyyyMMddHHmmssSSS_随机数.扩展名
        String date = DateUtil.format(new Date(), “yyyyMMdd”);
        String timestamp = DateUtil.format(new Date(), “yyyyMMddHHmmssSSS”);
        String random = RandomUtil.randomNumbers(4);
        return StrUtil.format(“blogs/{}/{}_{}.{}”, date, timestamp, random, suffix);
    }
}
```

**常量配置：**

```java
public class SystemConstants {
    public static final String IMAGE_UPLOAD_DIR = “/usr/local/nginx/html/hmdp/imgs/”;
}
```

::: tip 图片存储方案
本示例将图片保存到本地 Nginx 目录，适用于学习和小型项目。生产环境建议使用：
- **对象存储服务**（如阿里云 OSS、腾讯云 COS、七牛云等）
- **CDN 加速**：提升图片访问速度
- **图片处理**：支持缩略图、水印、格式转换等
:::

#### 发布笔记接口

**接口说明：**

| 项目 | 内容 |
|------|------|
| 请求方式 | POST |
| 请求路径 | `/blog` |
| 请求参数 | Blog 对象（JSON 格式） |
| 返回结果 | Result 对象（包含笔记 ID） |

**Controller 层：**

```java
@RestController
@RequestMapping(“/blog”)
@Slf4j
public class BlogController {

    @Resource
    private IBlogService blogService;

    /**
     * 发布探店笔记
     */
    @PostMapping
    public Result saveBlog(@RequestBody Blog blog) {
        // 获取登录用户
        UserDTO user = UserHolder.getUser();
        blog.setUserId(user.getId());
        
        // 保存探店笔记
        blogService.save(blog);
        
        // 返回笔记 id
        return Result.ok(blog.getId());
    }
}
```

**请求示例：**

```json
POST /blog
{
    “shopId”: 1,
    “title”: “这家店的奶茶真的太好喝了！”,
    “images”: “/blogs/a/b/uuid1.jpg,/blogs/a/b/uuid2.jpg”,
    “content”: “环境很好，服务态度也很棒，推荐芝士奶盖...”
}
```

**返回示例：**

```json
{
    “success”: true,
    “data”: 10,
    “errorMsg”: null
}
```

### 查看探店笔记

用户可以查看笔记详情，包括笔记内容、发布者信息等。

**接口说明：**

| 项目 | 内容 |
|------|------|
| 请求方式 | GET |
| 请求路径 | `/blog/{id}` |
| 请求参数 | id（笔记ID，路径参数） |
| 返回结果 | Result 对象（包含笔记详情） |

**Controller 层：**

```java
@RestController
@RequestMapping(“/blog”)
public class BlogController {

    @Resource
    private IBlogService blogService;

    /**
     * 查询笔记详情
     */
    @GetMapping(“/{id}”)
    public Result queryBlogById(@PathVariable(“id”) Long id) {
        return blogService.queryBlogById(id);
    }
}
```

**Service 层：**

```java
@Service
public class BlogServiceImpl extends ServiceImpl<BlogMapper, Blog> implements IBlogService {

    @Resource
    private IUserService userService;

    @Override
    public Result queryBlogById(Long id) {
        // 1. 查询笔记
        Blog blog = getById(id);
        if (blog == null) {
            return Result.fail(“笔记不存在”);
        }
        
        // 2. 查询笔记发布者信息
        queryBlogUser(blog);
        
        return Result.ok(blog);
    }

    /**
     * 查询并设置笔记发布者信息
     */
    private void queryBlogUser(Blog blog) {
        Long userId = blog.getUserId();
        User user = userService.getById(userId);
        blog.setName(user.getNickName());
        blog.setIcon(user.getIcon());
    }
}
```

**返回示例：**

```json
{
    “success”: true,
    “data”: {
        “id”: 10,
        “shopId”: 1,
        “userId”: 1,
        “name”: “张三”,
        “icon”: “/imgs/user/default.jpg”,
        “title”: “这家店的奶茶真的太好喝了！”,
        “images”: “/blogs/20240315/img1.jpg,/blogs/20240315/img2.jpg”,
        “content”: “环境很好，服务态度也很棒，推荐芝士奶盖...”,
        “liked”: 0,
        “comments”: 0,
        “createTime”: “2024-03-15T10:30:00”
    }
}
```

::: tip 为什么要关联查询用户信息？
Blog 表只存储了 `userId`，没有冗余存储用户的昵称和头像。查询笔记详情时需要关联查询用户信息，方便前端展示发布者信息。

**这种设计的权衡：**
- **优点**：避免数据冗余，用户信息修改时无需同步更新所有笔记记录
- **缺点**：每次查询需要额外查询一次用户表，增加数据库访问次数

**性能优化建议：**
- 可以将用户信息缓存到 Redis 中，减少数据库查询
- 对于列表查询场景，可以考虑使用 MyBatis 的联表查询或批量查询优化
:::

## 点赞

点赞功能是 UGC 内容平台的核心互动功能之一。用户可以为喜欢的探店笔记点赞，同一个用户只能点赞一次，再次点击则取消点赞。

**核心需求**：

1. **点赞/取消点赞**：点击点赞按钮，未点赞则点赞，已点赞则取消
2. **防止重复点赞**：同一用户对同一笔记只能点赞一次
3. **点赞状态显示**：前端根据 `isLike` 字段高亮显示点赞按钮
4. **点赞数统计**：实时更新笔记的点赞数量

### 技术方案选型：Redis vs 数据库

点赞功能的核心是记录"哪些用户给哪些笔记点了赞"，常见的实现方案有两种：

**方案一：数据库中间表**

创建一张 `tb_blog_like` 中间表记录点赞关系：

```sql
CREATE TABLE tb_blog_like (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    blog_id BIGINT NOT NULL,      -- 笔记ID
    user_id BIGINT NOT NULL,      -- 用户ID
    create_time DATETIME NOT NULL,
    UNIQUE KEY uk_blog_user (blog_id, user_id)  -- 联合唯一索引防止重复点赞
);
```

**方案二：Redis Set 集合**

使用 Redis Set 存储每篇笔记的点赞用户列表：

```
Key:   blog:liked:{blogId}
Type:  Set
Value: {userId1, userId2, userId3, ...}
```

**对比分析**

| 维度 | 数据库中间表 | Redis Set |
|------|------------|-----------|
| **查询性能** | 需要走索引查询，QPS 约 1000-5000 | 内存操作，QPS 可达 10w+ |
| **并发写入** | 依赖数据库锁，高并发时容易成为瓶颈 | 单线程模型 + 原子操作，天然支持高并发 |
| **数据量** | 热门笔记可能产生百万级记录 | 只存储用户 ID，内存占用小 |
| **防重复** | 依赖联合唯一索引 | Set 自动去重 |
| **判断是否点赞** | `SELECT COUNT(*) ... WHERE blog_id=? AND user_id=?` | `SISMEMBER` 命令，O(1) 时间复杂度 |
| **数据持久化** | 天然持久化 | 需要配置持久化策略 |

**为什么选择 Redis？**

1. **性能优势明显**：点赞是高频操作，用户每次查看笔记都需要判断点赞状态，Redis 的内存读取速度远超数据库磁盘 I/O
2. **减轻数据库压力**：热门笔记可能有数万次点赞，如果每次都查询数据库，会对 MySQL 造成很大压力
3. **更适合临时状态**：点赞状态属于"用户会话级别"的临时数据，不需要像订单、支付那样强持久化

**数据持久化方案**

虽然使用 Redis，但仍需考虑数据安全：

- **方案一**：开启 Redis AOF 持久化，数据写入即刻同步到磁盘
- **方案二**：定期将 Redis Set 数据批量同步到数据库备份表（推荐）
- **方案三**：在点赞/取消点赞时，同时写入数据库中间表（适合对数据一致性要求极高的场景）

::: tip 生产环境建议

对于大多数场景，**Redis + 定期同步数据库** 是最优方案：

- 热点数据用 Redis 提供高性能查询
- 数据库作为冷备份，Redis 故障时可以快速恢复
- 定期（如每小时）将 Redis 数据批量写入数据库，兼顾性能和安全

:::

### 数据结构设计

为了支持点赞功能，需要在 [Blog 实体类](#blog-entity) 中添加 `isLike` 字段，用于标识当前用户是否已点赞：

```java
@TableField(exist = false)
private Boolean isLike;  // 当前用户是否点赞（非数据库字段）
```

**Redis 数据结构**

```
Key:   blog:liked:{blogId}     # 某篇笔记的点赞用户集合
Type:  Set                      # Set 自动去重，判断是否点赞时间复杂度 O(1)
Value: {userId1, userId2, ...}  # 存储已点赞的用户 ID
```

### 点赞/取消点赞

用户点击点赞按钮时，系统需要判断当前点赞状态并执行相应操作：未点赞则添加点赞，已点赞则取消点赞。

**接口说明**

| 项目 | 内容 |
|------|------|
| 请求方式 | PUT |
| 请求路径 | `/blog/like/{id}` |
| 请求参数 | id（笔记ID，路径参数） |
| 返回结果 | Result 对象 |

**实现思路**

1. 获取当前登录用户
2. 判断用户是否已点赞（检查 Redis Set）
3. 如果未点赞：
   - 数据库点赞数 +1
   - 用户 ID 添加到 Redis Set
4. 如果已点赞：
   - 数据库点赞数 -1
   - 用户 ID 从 Redis Set 中移除

**Controller 层**

```java
@RestController
@RequestMapping("/blog")
public class BlogController {

    @Resource
    private IBlogService blogService;

    /**
     * 点赞/取消点赞
     */
    @PutMapping("/like/{id}")
    public Result likeBlog(@PathVariable("id") Long id) {
        return blogService.likeBlog(id);
    }
}
```

**Service 层**

```java
@Service
public class BlogServiceImpl extends ServiceImpl<BlogMapper, Blog> implements IBlogService {

    @Resource
    private StringRedisTemplate stringRedisTemplate;

    @Resource
    private IUserService userService;

    private static final String BLOG_LIKED_KEY = "blog:liked:";

    @Override
    public Result likeBlog(Long id) {
        // 1. 获取当前登录用户
        Long userId = UserHolder.getUser().getId();

        // 2. 判断当前用户是否已点赞
        String key = BLOG_LIKED_KEY + id;
        Boolean isMember = stringRedisTemplate.opsForSet().isMember(key, userId.toString());

        if (BooleanUtil.isFalse(isMember)) {
            // 3. 如果未点赞，可以点赞
            // 3.1 数据库点赞数 +1
            boolean isSuccess = update().setSql("liked = liked + 1").eq("id", id).update();
            
            // 3.2 保存用户到 Redis 的 Set 集合
            if (isSuccess) {
                stringRedisTemplate.opsForSet().add(key, userId.toString());
            }
        } else {
            // 4. 如果已点赞，取消点赞
            // 4.1 数据库点赞数 -1
            boolean isSuccess = update().setSql("liked = liked - 1").eq("id", id).update();
            
            // 4.2 把用户从 Redis 的 Set 集合移除
            if (isSuccess) {
                stringRedisTemplate.opsForSet().remove(key, userId.toString());
            }
        }

        return Result.ok();
    }
}
```

**关键实现点**

1. **数据库更新优化**
   - 使用 `setSql("liked = liked + 1")` 直接在 SQL 层面更新
   - 避免"查询 → 修改 → 更新"的并发问题
   - MyBatis-Plus 的 `update()` 方法返回布尔值，便于判断是否成功

2. **事务一致性**：先更新数据库，成功后再更新 Redis

::: tip 为什么先更新数据库再更新 Redis？

| 更新顺序 | 失败情况 | 后果 | 是否可恢复 |
|---------|---------|------|-----------|
| 先 Redis 后数据库 | Redis 成功，数据库失败 | Redis 显示已点赞，数据库未记录 | ❌ 数据不一致 |
| 先数据库后 Redis（推荐） | 数据库成功，Redis 失败 | 下次查询时从数据库加载正确数据 | ✅ 可自动修复 |

**结论**：即使 Redis 更新失败，下次查询笔记详情时会重新判断点赞状态，可以自动修复不一致。

:::

### 查询笔记时判断点赞状态

在查询笔记详情时，需要判断当前用户是否已点赞，并将结果赋值给 `isLike` 字段，前端根据此字段高亮显示点赞按钮。

**修改查询笔记详情接口**

```java
@Service
public class BlogServiceImpl extends ServiceImpl<BlogMapper, Blog> implements IBlogService {

    @Resource
    private StringRedisTemplate stringRedisTemplate;

    @Resource
    private IUserService userService;

    private static final String BLOG_LIKED_KEY = "blog:liked:";

    @Override
    public Result queryBlogById(Long id) {
        // 1. 查询笔记
        Blog blog = getById(id);
        if (blog == null) {
            return Result.fail("笔记不存在");
        }
        
        // 2. 查询笔记发布者信息
        queryBlogUser(blog);
        
        // 3. 查询当前用户是否已点赞
        isBlogLiked(blog);
        
        return Result.ok(blog);
    }

    /**
     * 查询并设置当前用户是否点赞
     */
    private void isBlogLiked(Blog blog) {
        // 1. 获取当前登录用户
        UserDTO user = UserHolder.getUser();
        if (user == null) {
            // 用户未登录，无需查询点赞状态
            return;
        }

        // 2. 判断当前用户是否已点赞
        Long userId = user.getId();
        String key = BLOG_LIKED_KEY + blog.getId();
        Boolean isMember = stringRedisTemplate.opsForSet().isMember(key, userId.toString());
        blog.setIsLike(BooleanUtil.isTrue(isMember));
    }
}
```

**关键实现点**

1. **布尔值处理**
   - 使用 `BooleanUtil.isTrue()` 处理 `isMember` 返回值
   - 避免自动拆箱可能导致的空指针异常

## 点赞排行榜

在探店笔记详情页，需要展示**给当前笔记点赞的用户 Top 5**，包括用户的头像和昵称。这里按点赞时间从早到晚排序，展示当前仍在点赞集合中、最早点赞的 5 位用户；不足 5 位时展示全部点赞用户。

**核心需求**：

1. **按笔记区分**：每篇笔记维护自己的点赞用户集合
2. **记录点赞时间**：同一用户只能出现一次，并按点赞时间排序
3. **查询 Top 5**：返回该笔记最早点赞的 5 位用户的昵称和头像
4. **取消点赞同步移除**：用户取消点赞后，不再出现在点赞人列表中

### 数据结构设计

|  | Redis List | Redis Set | Redis SortedSet |
|----------|------------|-----------|-----------------|
| 排序方式 | 按插入位置形成顺序 | 无序 | 按 score 排序，score 相同时按成员字典序排列 |
| 唯一性 | 不唯一 | 唯一 | 唯一|
| 查找方式 | 按索引查找或首尾查找 | 根据元素查找 | 根据元素查找 |

SortedSet 以用户 ID 作为 Member 保证唯一，以点赞时间戳作为 score 排序；通过 `ZSCORE` 判断点赞状态，通过 `ZRANGE` 查询最早点赞的 5 位用户，满足点赞人 Top 5 的需求。

**Redis SortedSet 结构**

```
Key:    blog:liked:{blogId}     # 某篇笔记的点赞用户集合
Type:   SortedSet              # 按 score 排序，支持范围查询
Member: userId                 # 给该笔记点赞的用户 ID
Score:  timestamp              # 该用户的点赞时间戳（毫秒）
```

时间戳越小，表示点赞越早，因此使用 `range(key, 0, 4)`（对应 `ZRANGE key 0 4`）按 score 升序查询最早点赞的 5 位用户。`ZSCORE` 返回的 score 非空表示已点赞，为空表示未点赞。

::: tip 从 Set 升级为 SortedSet
本节的 SortedSet 实现替换前面的 Set 实现，仍使用 `blog:liked:{blogId}` 作为 key。点赞、取消点赞和点赞状态判断都要统一改用 `opsForZSet()`。

Redis 的同一个 key 不能同时是 Set 和 SortedSet。若已有 Set 类型的点赞数据，需要先迁移为 SortedSet，否则会出现 `WRONGTYPE` 错误。原 Set 未记录点赞时间，迁移时无法还原历史点赞的真实先后顺序。
:::

### 修改点赞接口

点赞时，将用户 ID 加入当前笔记的 SortedSet，并记录点赞时间；取消点赞时，将该用户 ID 从集合中移除。数据库中的 `liked` 字段仍用于记录笔记的总点赞数。

**修改 Service 层**

```java
@Service
public class BlogServiceImpl extends ServiceImpl<BlogMapper, Blog> implements IBlogService {

    @Resource
    private StringRedisTemplate stringRedisTemplate;

    private static final String BLOG_LIKED_KEY = "blog:liked:";

    @Override
    public Result likeBlog(Long id) {
        Long userId = UserHolder.getUser().getId();

        String key = BLOG_LIKED_KEY + id;
        // 修改：改用 ZSet 的 score()，替换 Set 的 isMember()
        Double score = stringRedisTemplate.opsForZSet().score(key, userId.toString());

        // 修改：score 为 null 表示未点赞
        if (score == null) {
            boolean isSuccess = update().setSql("liked = liked + 1").eq("id", id).update();

            if (isSuccess) {
                // 修改：改用 ZSet 的 add()，新增点赞时间戳作为 score
                stringRedisTemplate.opsForZSet().add(
                    key, userId.toString(), System.currentTimeMillis()
                );
            }
        } else {
            boolean isSuccess = update().setSql("liked = liked - 1").eq("id", id).update();

            if (isSuccess) {
                // 修改：改用 ZSet 的 remove() 取消点赞
                stringRedisTemplate.opsForZSet().remove(key, userId.toString());
            }
        }

        return Result.ok();
    }
}
```

**同步修改点赞状态判断**

前面的 `isBlogLiked()` 方法也要从 `SISMEMBER` 改为查询 score：

```java
private void isBlogLiked(Blog blog) {
    UserDTO user = UserHolder.getUser();
    if (user == null) {
        // 未登录时无需查询点赞状态
        // 直接返回，避免后续 user.getId() 引发空指针异常
        return;
    }

    String key = BLOG_LIKED_KEY + blog.getId();
    // 修改：改用 ZSet 的 score()，替换 Set 的 isMember()
    Double score = stringRedisTemplate.opsForZSet()
        .score(key, user.getId().toString());
    // 修改：根据 score 是否为 null 设置点赞状态
    blog.setIsLike(score != null);
}
```

### 查询点赞人 Top 5

笔记详情页根据当前笔记 ID 调用接口，获取该笔记最早点赞的 5 位用户。

**接口说明**

| 项目 | 内容 |
|------|------|
| 请求方式 | GET |
| 请求路径 | `/blog/likes/{id}` |
| 请求参数 | id（当前笔记 ID，路径参数） |
| 返回结果 | Result 对象（包含最多 5 个 UserDTO，字段为 id、nickName、icon） |

**实现思路**

1. 从 `blog:liked:{id}` 中按点赞时间升序查询前 5 个用户 ID
2. 如果没有点赞用户，直接返回空列表
3. 根据用户 ID 批量查询用户信息，并保持 Redis 返回的顺序
4. 转换为 `UserDTO`，返回用户 ID、昵称和头像供详情页展示

**Controller 层**

```java
@RestController
@RequestMapping("/blog")
public class BlogController {

    @Resource
    private IBlogService blogService;

    /**
     * 查询当前笔记的点赞人 Top 5
     */
    @GetMapping("/likes/{id}")
    public Result queryBlogLikes(@PathVariable("id") Long id) {
        return blogService.queryBlogLikes(id);
    }
}
```

**Service 接口**

在 `IBlogService` 中声明对应方法：

```java
Result queryBlogLikes(Long id);
```

**Service 层**

```java
@Service
public class BlogServiceImpl extends ServiceImpl<BlogMapper, Blog> implements IBlogService {

    @Resource
    private StringRedisTemplate stringRedisTemplate;

    @Resource
    private IUserService userService;

    private static final String BLOG_LIKED_KEY = "blog:liked:";

    @Override
    public Result queryBlogLikes(Long id) {
        // 1. 查询当前笔记最早点赞的 5 个用户 ID（按时间戳升序）
        String key = BLOG_LIKED_KEY + id;
        Set<String> top5 = stringRedisTemplate.opsForZSet().range(key, 0, 4);

        if (top5 == null || top5.isEmpty()) {
            return Result.ok(Collections.emptyList());
        }

        // 2. 将 Redis 中的用户 ID 转换为 Long
        List<Long> ids = top5.stream()
            .map(Long::valueOf)
            .collect(Collectors.toList());

        // 3. 批量查询用户，并保持点赞时间顺序
        String idStr = StrUtil.join(",", ids);
        List<User> users = userService.query().in("id", ids)
            .last("ORDER BY FIELD(id," + idStr + ")")
            .list();

        // 4. 只返回展示需要的用户信息
        List<UserDTO> userDTOs = users.stream()
            .map(user -> BeanUtil.copyProperties(user, UserDTO.class))
            .collect(Collectors.toList());

        return Result.ok(userDTOs);
    }
}
```

**关键实现点**

1. **ZSet 范围查询**
   - `range(key, 0, 4)`：获取下标 0～4 的成员，共最多 5 位用户，按 score 升序
   - 返回的是 Member（用户 ID），不包含 score

2. **批量查询并保持顺序**
   - 使用 `userService.query().in("id", ids)` 批量查询用户
   - 使用 `ORDER BY FIELD(id,...)` 保持 Redis 中的点赞时间顺序

3. **返回展示字段**
   - 将 `User` 转为 `UserDTO`，只返回用户 ID、昵称和头像
   - 无点赞用户时返回空列表，前端不展示点赞人头像

::: warning 为什么需要 ORDER BY FIELD？

MySQL 的 `WHERE id IN (5, 3, 1)` 不保证按 ID 在参数中的顺序返回。假设 Redis 返回的点赞用户 ID 依次是 5、3、1，需要保留这个点赞先后顺序：

```sql
-- 仅使用 IN，结果顺序不确定
SELECT * FROM tb_user WHERE id IN (5, 3, 1);

-- 按 Redis 返回的用户 ID 顺序排列
SELECT * FROM tb_user WHERE id IN (5, 3, 1) ORDER BY FIELD(id, 5, 3, 1);
-- 结果顺序：5, 3, 1
```

:::

## 总结

本章围绕探店笔记，实现了发布、详情查询、点赞/取消点赞以及点赞人 Top 5 展示。MySQL 保存笔记内容和点赞总数，Redis 保存点赞用户及其点赞时间，用户的昵称和头像通过查询用户表补充。

| 功能 | 实现要点 |
|------|----------|
| 发布笔记 | 先上传图片获取访问路径，再保存笔记内容，并绑定当前登录用户 |
| 查询详情 | 查询笔记并补充发布者信息；登录用户还需查询点赞状态，设置 `isLike` |
| 点赞/取消点赞 | 根据用户是否已在集合中，更新 MySQL 的 `liked`，并在 Redis 中添加或移除用户 ID |
| 点赞人 Top 5 | 从 ZSet 按点赞时间升序取前 5 个用户 ID，批量查询用户信息并保持原顺序 |

**需要掌握的关键点：**

1. **根据需求选择数据结构**：Set 适合去重和判断成员是否存在；需要按点赞时间排序时，改用 SortedSet，以用户 ID 为 Member、毫秒时间戳为 score。
2. **统一使用 ZSet 操作**：升级后使用 `ZSCORE` 判断点赞状态、`ZADD` 添加点赞、`ZREM` 取消点赞、`ZRANGE key 0 4` 查询 Top 5；已有 Set 数据需要迁移。
3. **保留查询顺序**：MySQL 的 `IN` 查询不保证结果顺序，需要通过 `ORDER BY FIELD` 或在应用层重排，保持 Redis 返回的点赞先后顺序。
4. **区分单条命令与完整业务的原子性**：集合成员唯一不代表“判断状态 → 更新计数 → 更新集合”整体原子；先写 MySQL 再写 Redis 也不保证两者一致，仍需处理并发请求和写入失败后的补偿。
