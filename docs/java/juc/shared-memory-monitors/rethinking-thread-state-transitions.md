# 线程状态转换

本文详细梳理 Java 线程在不同场景下的状态转换路径，涵盖 `wait/notify`、`join`、`park/unpark`、`sleep` 以及 `synchronized` 锁竞争等核心机制。

![thread state](../java-thread/thread-state.assets/java-thread-state.png)

::: info 说明
以下所有场景中，假设有线程 `Thread t` 作为目标线程。不同情况下会明确说明是"线程 t"还是"当前线程"发生状态转换。
:::

---

## 情况 1：NEW → RUNNABLE

**触发条件：** 调用 `t.start()` 方法

当线程对象创建后处于 `NEW` 状态，调用 `start()` 方法后，线程进入 `RUNNABLE` 状态，等待 CPU 调度执行。

```java
Thread t = new Thread(() -> {
    // 线程执行逻辑
});
t.start();  // NEW → RUNNABLE
```

---

## 情况 2：RUNNABLE ↔ WAITING（wait/notify）

**前提：** 线程 t 通过 `synchronized(obj)` 获取了对象锁

**进入等待：** 调用 `obj.wait()` 方法，线程 t **释放锁**并从 `RUNNABLE` → `WAITING`，进入该对象的 WaitSet 等待队列。

**被唤醒后：** 当其他线程调用 `obj.notify()`、`obj.notifyAll()` 或 `t.interrupt()` 后：

- **竞争锁成功**：`WAITING → RUNNABLE`
- **竞争锁失败**：`WAITING → BLOCKED`（进入 EntryList 继续等待锁）

::: tip 核心要点
- `wait()` 会释放锁，允许其他线程进入同步块
- 被唤醒后必须重新竞争锁，`wait()` 才会返回
- 标准写法必须使用 `while` 循环检查条件，防止虚假唤醒
:::

**示例代码：**

```java
public class TestWaitNotify {
    final static Object obj = new Object();

    public static void main(String[] args) throws InterruptedException {
        new Thread(() -> {
            synchronized (obj) {
                log.debug("t1 start...");
                try {
                    obj.wait();  // RUNNABLE → WAITING
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
                log.debug("t1 end...");
            }
        }, "t1").start();

        new Thread(() -> {
            synchronized (obj) {
                log.debug("t2 start...");
                try {
                    obj.wait();  // RUNNABLE → WAITING
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
                log.debug("t2 end...");
            }
        }, "t2").start();

        Thread.sleep(1000);

        log.debug("唤醒 obj 上其他线程...");
        synchronized (obj) {
            obj.notifyAll();  // 唤醒所有等待线程
        }
    }
}
```

---

## 情况 3：RUNNABLE ↔ WAITING（join）

**触发条件：** 当前线程调用 `t.join()` 方法

**进入等待：** 当前线程调用 `t.join()` 后，当前线程从 `RUNNABLE` → `WAITING`，在 **t 线程对象的监视器**上等待。

::: warning 注意
等待的是 t 线程对象的监视器，不是当前线程的监视器。
:::

**恢复运行：** 当以下任一条件满足时，当前线程从 `WAITING` → `RUNNABLE`：

- 线程 t 运行结束
- 调用了当前线程的 `interrupt()` 方法

---

## 情况 4：RUNNABLE ↔ WAITING（park）

**触发条件：** 当前线程调用 `LockSupport.park()` 方法

**进入等待：** 当前线程调用 `LockSupport.park()` 后，从 `RUNNABLE` → `WAITING`。

**恢复运行：** 当以下任一条件满足时，目标线程从 `WAITING` → `RUNNABLE`：

- 其他线程调用 `LockSupport.unpark(目标线程)`
- 调用了目标线程的 `interrupt()` 方法

::: tip park 的优势
- 不需要获取锁即可使用
- 可以精确指定要唤醒的线程
- 可以先 `unpark` 再 `park`（许可机制）
:::

---

## 情况 5：RUNNABLE ↔ TIMED_WAITING（wait 超时）

**前提：** 线程 t 通过 `synchronized(obj)` 获取了对象锁

**进入等待：** 调用 `obj.wait(long timeout)` 方法，线程 t 从 `RUNNABLE` → `TIMED_WAITING`。

**被唤醒后：** 当以下任一条件满足后：

- 等待时间超过 timeout
- 其他线程调用 `obj.notify()` 或 `obj.notifyAll()`
- 调用 `t.interrupt()` 方法

线程 t 被唤醒后：

- **竞争锁成功**：`TIMED_WAITING → RUNNABLE`
- **竞争锁失败**：`TIMED_WAITING → BLOCKED`

---

## 情况 6：RUNNABLE ↔ TIMED_WAITING（join 超时）

**触发条件：** 当前线程调用 `t.join(long timeout)` 方法

**进入等待：** 当前线程调用 `t.join(long timeout)` 后，从 `RUNNABLE` → `TIMED_WAITING`，在 **t 线程对象的监视器**上等待。

**恢复运行：** 当以下任一条件满足时，当前线程从 `TIMED_WAITING` → `RUNNABLE`：

- 等待时间超过 timeout
- 线程 t 运行结束
- 调用了当前线程的 `interrupt()` 方法

---

## 情况 7：RUNNABLE ↔ TIMED_WAITING（sleep）

**触发条件：** 当前线程调用 `Thread.sleep(long millis)` 方法

**进入等待：** 当前线程调用 `Thread.sleep(long millis)` 后，从 `RUNNABLE` → `TIMED_WAITING`。

**恢复运行：** 等待时间超过指定毫秒数后，当前线程从 `TIMED_WAITING` → `RUNNABLE`。

::: warning sleep 的特点
- `sleep()` **不会释放锁**
- 只能通过超时或中断返回
- 常用于控制任务执行频率或模拟耗时操作
:::

---

## 情况 8：RUNNABLE ↔ TIMED_WAITING（park 超时）

**触发条件：** 当前线程调用 `LockSupport.parkNanos(long nanos)` 或 `LockSupport.parkUntil(long millis)` 方法

**进入等待：** 调用上述方法后，当前线程从 `RUNNABLE` → `TIMED_WAITING`。

**恢复运行：** 当以下任一条件满足时，目标线程从 `TIMED_WAITING` → `RUNNABLE`：

- 等待超时
- 其他线程调用 `LockSupport.unpark(目标线程)`
- 调用了目标线程的 `interrupt()` 方法

---

## 情况 9：RUNNABLE ↔ BLOCKED

**触发条件：** 线程 t 尝试获取 `synchronized(obj)` 锁

**进入阻塞：** 线程 t 尝试通过 `synchronized(obj)` 获取对象锁，如果**竞争失败**，从 `RUNNABLE` → `BLOCKED`，进入该对象的 EntryList 队列。

**恢复运行：** 当持有 `obj` 锁的线程释放锁后，会唤醒该对象上所有 `BLOCKED` 状态的线程重新竞争锁：

- **竞争成功**：线程 t 从 `BLOCKED → RUNNABLE`
- **竞争失败**：线程 t 继续保持 `BLOCKED` 状态

::: info BLOCKED vs WAITING
- `BLOCKED`：等待获取 `synchronized` 锁，**不会**释放已持有的其他锁
- `WAITING`：调用 `wait()` 等方法主动等待，**会释放**当前持有的锁
:::

---

## 情况 10：RUNNABLE → TERMINATED

**触发条件：** 线程的 `run()` 方法执行完毕

当线程的所有代码执行完毕，或者发生未捕获的异常导致线程终止，线程进入 `TERMINATED` 状态。

```java
Thread t = new Thread(() -> {
    System.out.println("线程执行");
    // run() 方法结束
});
t.start();
t.join();  // 等待线程结束
System.out.println(t.getState());  // TERMINATED
```

::: warning 注意
线程一旦进入 `TERMINATED` 状态，就无法再次启动，再次调用 `start()` 会抛出 `IllegalThreadStateException`。
:::

---

## 总结

| 情况 | 转换路径 | 触发方式 | 是否释放锁 | 备注 |
|------|---------|---------|----------|------|
| 1 | NEW → RUNNABLE | `t.start()` | - | 线程启动 |
| 2 | RUNNABLE ↔ WAITING | `obj.wait()` / `notify()` | 是 | 需要 synchronized |
| 3 | RUNNABLE ↔ WAITING | `t.join()` | - | 等待线程结束 |
| 4 | RUNNABLE ↔ WAITING | `LockSupport.park()` | - | 不需要锁 |
| 5 | RUNNABLE ↔ TIMED_WAITING | `obj.wait(timeout)` | 是 | 需要 synchronized |
| 6 | RUNNABLE ↔ TIMED_WAITING | `t.join(timeout)` | - | 超时等待线程结束 |
| 7 | RUNNABLE ↔ TIMED_WAITING | `Thread.sleep(millis)` | 否 | 不释放锁 |
| 8 | RUNNABLE ↔ TIMED_WAITING | `LockSupport.parkNanos()` | - | 不需要锁 |
| 9 | RUNNABLE ↔ BLOCKED | 竞争 `synchronized` 锁 | - | 被动阻塞 |
| 10 | RUNNABLE → TERMINATED | `run()` 方法结束 | - | 线程终止 |
