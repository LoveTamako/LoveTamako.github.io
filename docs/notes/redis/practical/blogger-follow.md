# 达人探店

## 概述

达人探店是类似大众点评的UGC（用户生成内容）功能，用户可以发布图文并茂的店铺体验笔记，其他用户可以浏览、点赞和评论这些笔记。本章节将实现探店笔记的发布、查询、点赞等核心功能。

**主要功能模块：**

1. **探店笔记发布**：支持上传图片和发布笔记
2. **探店笔记查询**：查询笔记详情，展示发布者信息
3. **点赞功能**：点赞/取消点赞，使用 Redis Set 防止重复点赞
4. **点赞排行榜**：使用 Redis SortedSet 实现点赞用户排行

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

**Blog 实体类：**

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

## 点赞排行榜