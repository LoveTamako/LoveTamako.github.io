# StampedLock

`StampedLock` 是 Java 8 引入的一种改进型读写锁，位于 `java.util.concurrent.locks` 包中。它在 `ReentrantReadWriteLock` 的基础上引入了**乐观读（Optimistic Read）**机制，在读多写少的场景下能获得更好的性能。

StampedLock 提供三种锁模式：

- **写锁（Write Lock）**：独占锁，与 `ReentrantReadWriteLock` 的写锁类似
  ```java
  long stamp = sl.writeLock();       // 阻塞式获取写锁
  long stamp = sl.tryWriteLock();    // 非阻塞式尝试获取写锁
  sl.unlockWrite(stamp);             // 释放写锁
  ```

- **悲观读锁（Pessimistic Read Lock）**：共享锁，与 `ReentrantReadWriteLock` 的读锁类似
  ```java
  long stamp = sl.readLock();        // 阻塞式获取读锁
  long stamp = sl.tryReadLock();     // 非阻塞式尝试获取读锁
  sl.unlockRead(stamp);              // 释放读锁
  ```

- **乐观读（Optimistic Read）**：一种无锁的读取方式，核心优势所在
  ```java
  long stamp = sl.tryOptimisticRead();  // 获取乐观读戳记（不加锁）
  // ... 读取数据 ...
  if (!sl.validate(stamp)) {            // 验证戳记是否有效
      // 验证失败，需要升级为悲观读锁
  }
  ```

## 乐观读机制

乐观读是 StampedLock 的核心特性，它的工作原理类似于数据库的 MVCC（多版本并发控制）：

1. **获取戳记**：调用 `tryOptimisticRead()` 获取一个版本戳记（stamp），此操作不会阻塞写线程
2. **读取数据**：使用获取的戳记读取共享数据
3. **验证戳记**：调用 `validate(stamp)` 检查期间是否有写操作发生
4. **处理失败**：如果验证失败，说明数据可能被修改，需要重新读取或升级为悲观读锁

这种机制避免了读操作对写操作的阻塞，在读操作远多于写操作时能显著提升性能。

## 基本使用示例

### 乐观读示例

以下示例演示了多线程场景下，乐观读验证失败后升级为悲观读锁的情况：

```java
public class Point {
    private double x, y;
    private final StampedLock sl = new StampedLock();

    // 使用乐观读
    public double distanceFromOrigin() {
        long stamp = sl.tryOptimisticRead();  // 获取乐观读戳记
        System.out.println(Thread.currentThread().getName() + " - 获取乐观读戳记: " + stamp);

        double currentX = x;
        double currentY = y;

        // 模拟读取过程中的耗时操作
        try {
            Thread.sleep(10);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        if (!sl.validate(stamp)) {  // 验证期间是否有写操作
            System.out.println(Thread.currentThread().getName() + " - 乐观读验证失败，升级为悲观读锁");
            // 验证失败，升级为悲观读锁
            stamp = sl.readLock();
            try {
                System.out.println(Thread.currentThread().getName() + " - 获取悲观读锁成功");
                currentX = x;
                currentY = y;
            } finally {
                sl.unlockRead(stamp);
                System.out.println(Thread.currentThread().getName() + " - 释放悲观读锁");
            }
        } else {
            System.out.println(Thread.currentThread().getName() + " - 乐观读验证成功");
        }

        return Math.sqrt(currentX * currentX + currentY * currentY);
    }

    // 写操作
    public void move(double deltaX, double deltaY) {
        long stamp = sl.writeLock();  // 获取写锁
        try {
            System.out.println(Thread.currentThread().getName() + " - 获取写锁，修改数据");
            x += deltaX;
            y += deltaY;
            Thread.sleep(5);  // 模拟写操作耗时
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            sl.unlockWrite(stamp);
            System.out.println(Thread.currentThread().getName() + " - 释放写锁");
        }
    }
}

// 测试代码：演示多线程场景下的乐观读升级
public class StampedLockTest {
    public static void main(String[] args) throws InterruptedException {
        Point point = new Point();

        // 启动多个读线程
        for (int i = 0; i < 3; i++) {
            new Thread(() -> {
                double distance = point.distanceFromOrigin();
                System.out.println(Thread.currentThread().getName() + " - 计算距离: " + distance);
            }, "读线程-" + i).start();
        }

        // 短暂延迟后启动写线程，确保写操作在读操作验证期间发生
        Thread.sleep(5);
        new Thread(() -> {
            point.move(1.0, 2.0);
        }, "写线程").start();

        Thread.sleep(100);  // 等待所有线程完成
    }
}
```

**输出示例**（可能的执行结果）：

```
读线程-0 - 获取乐观读戳记: 256
读线程-1 - 获取乐观读戳记: 256
读线程-2 - 获取乐观读戳记: 256
写线程 - 获取写锁，修改数据
写线程 - 释放写锁
读线程-0 - 乐观读验证失败，升级为悲观读锁
读线程-0 - 获取悲观读锁成功
读线程-1 - 乐观读验证失败，升级为悲观读锁
读线程-2 - 乐观读验证失败，升级为悲观读锁
读线程-0 - 释放悲观读锁
读线程-0 - 计算距离: 2.23606797749979
读线程-1 - 获取悲观读锁成功
读线程-1 - 释放悲观读锁
读线程-1 - 计算距离: 2.23606797749979
读线程-2 - 获取悲观读锁成功
读线程-2 - 释放悲观读锁
读线程-2 - 计算距离: 2.23606797749979
```

从输出可以看到：
1. 三个读线程几乎同时获取了相同的乐观读戳记（256）
2. 写线程在读线程验证之前获取写锁并修改了数据
3. 所有读线程的乐观读验证都失败，自动升级为悲观读锁
4. 悲观读锁是共享的，所以多个读线程可以并发持有

### 锁转换示例

StampedLock 支持锁模式之间的转换，可以根据实际需求灵活调整：

```java
public class DataProcessor {
    private int data;
    private final StampedLock sl = new StampedLock();

    public void conditionalUpdate(int newValue) {
        long stamp = sl.readLock();  // 先获取读锁
        try {
            while (data < 100) {
                // 尝试将读锁转换为写锁
                long ws = sl.tryConvertToWriteLock(stamp);
                if (ws != 0L) {  // 转换成功
                    stamp = ws;
                    data = newValue;
                    break;
                } else {  // 转换失败，释放读锁并获取写锁
                    sl.unlockRead(stamp);
                    stamp = sl.writeLock();
                }
            }
        } finally {
            sl.unlock(stamp);  // 统一释放锁
        }
    }
}
```

## 为什么不能取代 ReentrantReadWriteLock

尽管 StampedLock 在某些场景下性能更优，但它存在一些重要限制，使其无法完全取代 `ReentrantReadWriteLock`：

### 1. 不支持重入

StampedLock 的所有锁模式都**不支持重入**，这是最大的限制之一：

```java
StampedLock sl = new StampedLock();

long stamp = sl.writeLock();
try {
    // 同一线程再次获取写锁会导致死锁
    long stamp2 = sl.writeLock();  // ❌ 死锁！
} finally {
    sl.unlockWrite(stamp);
}
```

而 `ReentrantReadWriteLock` 支持锁的重入，同一线程可以多次获取同一把锁：

```java
ReentrantReadWriteLock rwl = new ReentrantReadWriteLock();
rwl.writeLock().lock();
rwl.writeLock().lock();  // ✅ 可以重入
rwl.writeLock().unlock();
rwl.writeLock().unlock();
```

### 2. 不支持条件变量

StampedLock **不支持条件变量（Condition）**，这在需要线程间协调时会成为限制：

```java
// ReentrantReadWriteLock 支持条件变量
ReentrantReadWriteLock rwl = new ReentrantReadWriteLock();
Condition condition = rwl.writeLock().newCondition();  // ✅ 支持

// StampedLock 不支持条件变量
StampedLock sl = new StampedLock();
// 没有 newCondition() 方法  // ❌ 不支持
```

如果你的场景需要使用条件变量进行线程协调（如生产者-消费者模式），必须使用 `ReentrantReadWriteLock` 或其他支持条件变量的锁。

### 3. 使用复杂，容易出错

StampedLock 的 API 设计与传统锁不同，需要**手动管理戳记（stamp）**，使用不当容易导致死锁或其他问题：

```java
// 错误示例：使用错误的 unlock 方法
long stamp = sl.writeLock();
try {
    // ...
} finally {
    sl.unlockRead(stamp);  // ❌ 错误！应该使用 unlockWrite
}

// 错误示例：忘记验证乐观读
long stamp = sl.tryOptimisticRead();
double x = this.x;
// ❌ 忘记调用 validate(stamp)，可能读取到不一致的数据
return x;
```

相比之下，`ReentrantReadWriteLock` 的 API 更符合传统习惯，不容易出错。

### 4. CPU 占用问题

StampedLock 在获取锁时会使用**自旋（spin）**优化，在竞争激烈的情况下可能导致 CPU 占用过高：

```java
// writeLock() 会自旋等待，消耗 CPU
long stamp = sl.writeLock();  // 可能导致 CPU 占用飙升
```

如果锁持有时间较长或竞争激烈，`ReentrantReadWriteLock` 的阻塞等待机制可能更合适。

## 使用建议

### 适合使用 StampedLock 的场景

- **读操作远多于写操作**（如缓存、配置读取）
- **读操作耗时很短**（避免乐观读频繁失败）
- **不需要锁重入**
- **不需要条件变量**
- 追求极致的读性能

### 适合使用 ReentrantReadWriteLock 的场景

- 需要**锁重入**功能
- 需要**条件变量**进行线程协调
- 代码逻辑复杂，需要更安全的 API
- 锁持有时间较长
- 读写操作比例接近

