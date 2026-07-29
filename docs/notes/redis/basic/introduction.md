# 初识 Redis

## 认识 NoSQL

NoSQL（Not Only SQL）是一类非关系型数据库的统称，与传统关系型数据库相比，具有不同的设计理念和应用场景。

### SQL 与 NoSQL 对比

| 对比维度 | SQL（关系型数据库） | NoSQL（非关系型数据库） |
|---------|-------------------|----------------------|
| **数据结构** | 结构化（Structured） | 非结构化<br/>- 键值类型（Redis）<br/>- 文档类型（MongoDB）<br/>- 列类型（HBase）<br/>- 图类型（Neo4j） |
| **数据关联** | 关联的（Relational） | 无关联的 |
| **查询方式** | SQL 查询 | 非 SQL |
| **事务特性** | ACID | BASE |
| **存储方式** | 磁盘 | 内存 |
| **扩展性** | 垂直扩展 | 水平扩展 |
| **使用场景** | 数据结构固定<br/>对数据安全性、一致性要求较高 | 数据结构不固定<br/>对一致性、安全性要求不高<br/>对性能要求高 |

## 认识 Redis

Redis 诞生于 2009 年，全称是 **Remote Dictionary Server**（远程词典服务器），由 Salvatore Sanfilippo 创建。它是一个开源的键值数据库，基于内存存储，支持多种数据结构，如字符串、列表、哈希、集合、有序集合等。

### 核心特征

- **键值（key-value）型**：value 支持多种不同数据结构，功能丰富
- **单线程模型**：每个命令具备原子性
- **低延迟，速度快**：
  - 基于内存存储
  - IO 多路复用技术
  - 良好的编码结构
- **数据持久化**：支持 RDB 和 AOF 两种持久化方式
- **高可用性**：支持主从集群、分片集群
- **多语言支持**：提供多种编程语言的客户端

## 安装 Redis

::: tip 视频教程
如果想了解详细的安装过程，可以观看视频教程：[安装 Redis 及启动的三种方式](https://www.bilibili.com/video/BV1cr4y1671t?p=5)
:::

本文推荐使用 **Docker** 方式安装 Redis，具有以下优势：
- 环境隔离，不污染系统环境
- 安装简单，无需处理依赖问题
- 易于管理和维护
- 支持快速部署和迁移

### 方式一：Docker 命令行

#### 1. 拉取 Redis 镜像

拉取最新版本：

```bash
docker pull redis:latest
```

或指定具体版本（推荐）：

```bash
docker pull redis:7.2
```

#### 2. 运行 Redis 容器

根据不同需求选择合适的运行方式：

**快速启动（开发测试）：**

```bash
docker run -d --name redis -p 6379:6379 redis:latest
```

**启用数据持久化：**

```bash
docker run -d --name redis \
  -p 6379:6379 \
  -v redis-data:/data \
  redis:latest redis-server --appendonly yes
```

**添加密码保护：**

```bash
docker run -d --name redis \
  -p 6379:6379 \
  redis:latest redis-server --requirepass yourpassword
```

**生产环境配置（推荐）：**

```bash
docker run -d --name redis \
  -p 6379:6379 \
  -v redis-data:/data \
  -v redis-conf:/etc/redis \
  --restart=always \
  redis:latest redis-server --requirepass yourpassword --appendonly yes
```

::: warning 参数说明
- `-d`：后台运行
- `-p 6379:6379`：映射端口
- `-v redis-data:/data`：挂载数据卷，持久化数据
- `--restart=always`：容器自动重启
- `--requirepass`：设置密码
- `--appendonly yes`：开启 AOF 持久化
:::

#### 3. 验证安装

使用 redis-cli 连接并测试：

```bash
# 进入容器内的 redis-cli
docker exec -it redis redis-cli

# 如果设置了密码，先进行认证
AUTH yourpassword

# 测试连接
ping
# 返回：PONG

# 设置和获取数据
set test "Hello Redis"
get test
# 返回："Hello Redis"
```

#### 4. 容器管理命令

```bash
# 查看运行状态
docker ps | grep redis

# 查看容器日志
docker logs redis
docker logs -f redis  # 实时查看

# 重启容器
docker restart redis

# 停止容器
docker stop redis

# 启动已停止的容器
docker start redis

# 删除容器（会丢失数据，谨慎操作）
docker rm -f redis
```

### 方式二：Docker Desktop（图形化）

适合 Windows 和 Mac 用户，通过图形界面操作更加直观。

#### 安装步骤

1. **下载并安装 Docker Desktop**
   - 访问 [Docker 官网](https://www.docker.com/products/docker-desktop)
   - 下载对应系统版本
   - 安装并启动 Docker Desktop

2. **拉取 Redis 镜像**
   - 打开 Docker Desktop
   - 点击左侧 **Images** 标签
   - 在搜索框输入 `redis`
   - 点击 **Pull** 按钮拉取镜像

3. **创建并运行容器**
   - 在 Images 列表中找到 redis 镜像
   - 点击 **Run** 按钮
   - 配置容器参数：
     - **Container name**：`redis`
     - **Ports**：`6379:6379`
     - **Volumes**（可选）：挂载数据目录实现持久化
   - 点击 **Run** 启动

4. **管理容器**
   - 点击左侧 **Containers** 标签
   - 可以进行启动、停止、重启、查看日志等操作
   - 点击容器名称可查看详细信息和日志

### 方式三：Docker Compose（生产推荐）

Docker Compose 是管理容器的最佳实践,适合生产环境和团队协作：
- 配置文件化，易于版本控制
- 一键启动/停止所有服务
- 支持环境变量和配置复用
- 便于多容器编排

#### 创建配置文件

在项目目录创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  redis:
    image: redis:7.2
    container_name: redis
    restart: always
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
      - ./redis.conf:/usr/local/etc/redis/redis.conf  # 自定义配置（可选）
    command: redis-server --requirepass yourpassword --appendonly yes
    networks:
      - redis-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 3s
      retries: 3

volumes:
  redis-data:

networks:
  redis-network:
    driver: bridge
```

#### 常用命令

```bash
# 启动服务（后台运行）
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看实时日志
docker-compose logs -f redis

# 停止服务（保留数据）
docker-compose stop

# 停止并删除容器（保留数据卷）
docker-compose down

# 停止并删除容器和数据卷（危险操作）
docker-compose down -v

# 重启服务
docker-compose restart redis

# 进入 Redis CLI
docker-compose exec redis redis-cli
```

## Redis 常见配置

### 配置文件说明

Redis 通过 `redis.conf` 配置文件进行详细配置。在 Docker 环境中，可以创建自定义配置文件并挂载到容器中。

### 核心配置参数

#### 1. 网络配置

```conf
# 绑定IP地址（0.0.0.0 表示接受所有网络接口的连接）
bind 0.0.0.0

# 保护模式（生产环境建议开启并设置密码）
protected-mode yes

# 端口号
port 6379

# TCP 连接队列长度
tcp-backlog 511

# 客户端超时时间（秒，0表示永不超时）
timeout 300
```

#### 2. 安全配置

```conf
# 设置密码（强烈推荐）
requirepass your_strong_password_here

# 禁用危险命令
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command CONFIG ""
rename-command KEYS ""
```

#### 3. 持久化配置

**RDB 配置（快照）：**

```conf
# RDB 快照规则：900秒内至少1个key变化，300秒内至少10个key变化
save 900 1
save 300 10
save 60 10000

# RDB 文件名
dbfilename dump.rdb

# 数据存储目录
dir /data

# RDB 压缩
rdbcompression yes
```

**AOF 配置（追加日志）：**

```conf
# 启用 AOF
appendonly yes

# AOF 文件名
appendfilename "appendonly.aof"

# AOF 同步策略
# always: 每次写入都同步（最安全但最慢）
# everysec: 每秒同步一次（推荐，性能和安全的平衡）
# no: 由操作系统决定何时同步（最快但可能丢失数据）
appendfsync everysec

# AOF 重写配置
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
```

#### 4. 内存管理

```conf
# 最大内存限制（建议设置为系统内存的75%）
maxmemory 2gb

# 内存淘汰策略
# noeviction: 不淘汰，写入时返回错误
# allkeys-lru: 所有key中淘汰最近最少使用的
# volatile-lru: 设置了过期时间的key中淘汰最近最少使用的
# allkeys-random: 随机淘汰
# volatile-random: 在设置了过期时间的key中随机淘汰
# volatile-ttl: 淘汰即将过期的key
maxmemory-policy allkeys-lru

# 样本数量（LRU算法采样数）
maxmemory-samples 5
```

#### 5. 日志配置

```conf
# 日志级别：debug, verbose, notice, warning
loglevel notice

# 日志文件路径（空字符串表示标准输出）
logfile ""

# 慢查询日志配置
slowlog-log-slower-than 10000  # 微秒，超过10ms记录
slowlog-max-len 128             # 最多保存128条慢查询记录
```

#### 6. 客户端连接

```conf
# 最大客户端连接数
maxclients 10000

# TCP keepalive
tcp-keepalive 300
```

### 完整配置示例

创建 `redis.conf` 文件：

```conf
# Redis 生产环境配置示例

# ==================== 网络配置 ====================
bind 0.0.0.0
protected-mode yes
port 6379
tcp-backlog 511
timeout 300
tcp-keepalive 300

# ==================== 安全配置 ====================
requirepass your_strong_password_here
rename-command FLUSHALL ""
rename-command CONFIG "CONFIG_ADMIN"

# ==================== 持久化配置 ====================
# RDB
save 900 1
save 300 10
save 60 10000
dbfilename dump.rdb
rdbcompression yes

# AOF
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# ==================== 内存管理 ====================
maxmemory 2gb
maxmemory-policy allkeys-lru
maxmemory-samples 5

# ==================== 日志配置 ====================
loglevel notice
logfile ""
slowlog-log-slower-than 10000
slowlog-max-len 128

# ==================== 客户端配置 ====================
maxclients 10000

# ==================== 其他配置 ====================
dir /data
```

### 在 Docker 中使用配置文件

#### 方法一：Docker 命令

```bash
docker run -d --name redis \
  -p 6379:6379 \
  -v $(pwd)/redis.conf:/usr/local/etc/redis/redis.conf \
  -v redis-data:/data \
  redis:7.2 redis-server /usr/local/etc/redis/redis.conf
```

#### 方法二：Docker Compose

```yaml
version: '3.8'

services:
  redis:
    image: redis:7.2
    container_name: redis
    restart: always
    ports:
      - "6379:6379"
    volumes:
      - ./redis.conf:/usr/local/etc/redis/redis.conf:ro  # 只读挂载
      - redis-data:/data
    command: redis-server /usr/local/etc/redis/redis.conf
    networks:
      - redis-network

volumes:
  redis-data:

networks:
  redis-network:
    driver: bridge
```

### 配置验证

启动 Redis 后，可以通过以下命令查看当前配置：

```bash
# 进入 Redis CLI
docker exec -it redis redis-cli

# 认证（如果设置了密码）
AUTH your_password

# 查看所有配置
CONFIG GET *

# 查看特定配置
CONFIG GET maxmemory
CONFIG GET appendonly

# 动态修改配置（重启后失效）
CONFIG SET maxmemory 4gb

# 将当前配置保存到配置文件（需要有写权限）
CONFIG REWRITE
```

::: warning 注意事项
- 配置文件中的密码等敏感信息需要妥善保管
- 生产环境建议将配置文件设置为只读模式（`:ro`）
- 修改配置后需要重启 Redis 才能生效（除非使用 CONFIG SET）
- 不同版本的 Redis 配置项可能有所差异，请参考对应版本的官方文档
:::

## Redis 客户端

安装完 Redis 后，需要通过客户端工具来操作 Redis。根据使用场景，Redis 提供了三种主要的客户端类型：

- **命令行客户端（redis-cli）**：适合开发调试和运维管理
- **图形化客户端**：提供可视化界面，便于数据浏览和管理
- **编程客户端**：各种编程语言的 SDK，用于应用程序集成

本节主要介绍前两种客户端的使用方法。

### 命令行客户端（redis-cli）

redis-cli 是 Redis 官方提供的命令行工具，功能强大且使用灵活。

#### 基本语法

```bash
redis-cli [options] [commands]
```

#### 常用选项

| 选项 | 说明 | 示例 |
|------|------|------|
| `-h <hostname>` | 指定 Redis 服务器地址 | `redis-cli -h 127.0.0.1` |
| `-p <port>` | 指定端口号 | `redis-cli -p 6379` |
| `-a <password>` | 指定密码 | `redis-cli -a mypassword` |
| `-n <database>` | 选择数据库（0-15） | `redis-cli -n 1` |
| `-c` | 集群模式连接 | `redis-cli -c` |
| `--raw` | 显示原始格式（解决中文乱码） | `redis-cli --raw` |
| `--bigkeys` | 分析大键 | `redis-cli --bigkeys` |
| `--stat` | 实时监控统计信息 | `redis-cli --stat` |

#### 使用示例

**连接本地 Redis：**

```bash
# 默认连接 localhost:6379
redis-cli

# 指定主机和端口
redis-cli -h 192.168.1.100 -p 6379

# 带密码连接
redis-cli -a yourpassword

# 或者连接后再认证
redis-cli
AUTH yourpassword
```

**在 Docker 中使用：**

```bash
# 进入容器内使用 redis-cli
docker exec -it redis redis-cli

# 带密码认证
docker exec -it redis redis-cli -a yourpassword

# 直接执行命令（不进入交互模式）
docker exec -it redis redis-cli -a yourpassword get mykey
```

**常用操作命令：**

```bash
# 测试连接
ping
# 返回：PONG

# 查看服务器信息
info

# 查看所有键（危险操作，生产环境慎用）
keys *

# 扫描键（推荐使用，不会阻塞）
scan 0

# 设置键值
set name "Redis"
get name

# 查看键的类型
type name

# 查看键的过期时间
ttl name

# 删除键
del name

# 清空当前数据库
flushdb

# 切换数据库
select 1

# 退出
exit
# 或按 Ctrl+D
```

**实用技巧：**

```bash
# 解决中文显示乱码
redis-cli --raw

# 批量执行命令
redis-cli -a password set key1 value1
redis-cli -a password set key2 value2

# 从文件读取命令执行
cat commands.txt | redis-cli -a password

# 监控 Redis 实时命令
redis-cli monitor

# 查看慢查询日志
redis-cli slowlog get 10

# 分析内存中的大键
redis-cli --bigkeys

# 实时统计信息
redis-cli --stat
```

### 图形化客户端

图形化客户端提供直观的界面，适合数据浏览、管理和分析。

#### 1. RedisInsight（官方推荐）

Redis 官方推荐的可视化工具，功能全面且免费。

**特点：**
- 官方支持，持续更新
- 支持 Redis Cluster、Sentinel
- 内置性能监控和分析工具
- 支持 RedisJSON、RedisGraph 等模块
- 跨平台（Windows、Mac、Linux）

**下载安装：**
- 官网：[https://redis.io/insight/](https://redis.io/insight/)
- 支持桌面版和 Docker 版本

**使用方法：**

1. 下载并安装 RedisInsight
2. 打开应用，点击 "Add Redis Database"
3. 填写连接信息：
   - Host：Redis 服务器地址
   - Port：端口号（默认 6379）
   - Name：连接名称（自定义）
   - Username/Password：认证信息
4. 点击 "Add Redis Database" 完成连接

#### 2. Another Redis Desktop Manager

开源的 Redis 桌面管理工具，界面简洁美观。

**特点：**
- 免费开源
- 支持 SSH 隧道连接
- 支持暗黑模式
- 跨平台

**下载安装：**
- GitHub：[https://github.com/qishibo/AnotherRedisDesktopManager](https://github.com/qishibo/AnotherRedisDesktopManager)
- 下载对应平台的安装包

#### 3. Redis Desktop Manager（付费）

老牌 Redis 图形化工具，功能成熟。

**特点：**
- 功能强大稳定
- 支持 SSL/TLS 连接
- 数据导入导出
- 需付费使用

**下载安装：**
- 官网：[https://resp.app/](https://resp.app/)

#### 4. Medis（Mac）

专为 Mac 设计的 Redis 客户端。

**特点：**
- 原生 Mac 应用
- 界面优雅
- 仅支持 macOS

**下载安装：**
- 官网：[https://getmedis.com/](https://getmedis.com/)

### 客户端选择建议

| 使用场景 | 推荐工具 | 理由 |
|---------|---------|------|
| 日常开发调试 | redis-cli | 轻量快速，功能完整 |
| 数据浏览管理 | RedisInsight | 官方支持，功能全面 |
| 跨平台使用 | Another Redis Desktop Manager | 免费开源，界面友好 |
| 运维监控 | RedisInsight + redis-cli | 图形化 + 命令行结合 |
| Mac 用户 | Medis / RedisInsight | 原生体验好 |

::: tip 最佳实践
- **开发环境**：优先使用 redis-cli 进行调试，熟悉命令操作
- **生产环境**：谨慎使用图形化工具，避免误操作
- **大数据量**：避免使用 `KEYS *`，使用 `SCAN` 命令代替
- **安全连接**：生产环境建议使用 SSH 隧道或 SSL/TLS 连接
:::

