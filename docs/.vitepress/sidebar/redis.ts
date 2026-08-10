export const redisSidebar = [
    {
        text: 'Redis',
        link: '/notes/redis/',
        items: [
            {
                text: '基础',
                collapsed: true,
                items: [
                    { text: '1. 初识 Redis', link: '/notes/redis/basic/introduction' },
                    { text: '2. Redis 命令', link: '/notes/redis/basic/commands' },
                    { text: '3. Redis Java 客户端', link: '/notes/redis/basic/java-client' }
                ]
            },
            {
                text: '实战',
                link: '/notes/redis/practical/',
                collapsed: true,
                items: [
                    { text: '1. 短信登录', link: '/notes/redis/practical/sms-login' },
                    { text: '2. 商户查询缓存', link: '/notes/redis/practical/merchant-cache' },
                    { text: '3. 优惠券秒杀', link: '/notes/redis/practical/seckill' },
                ]
            }
        ]
    },


]