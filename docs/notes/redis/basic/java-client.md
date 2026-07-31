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