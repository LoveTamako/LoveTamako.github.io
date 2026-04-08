# 线程安全分析
## 成员变量和静态变量
* 如果它们没有共享，则线程安全
* 如果它们有共享，根据它们的状态是否能够改变，又分两种情况：
  * 只读操作，线程安全
  * 读写操作，则这段代码是临界区，需要考虑线程安全

### 代码实例分析
```java
class ThreadUnsafe {
  ArrayList<String> list = new ArrayList<>();
  public void method1(int loopNumber) {
    for (int i = 0; i < loopNumber; i++) {
      // 临界区
      method2();
      method3();
    }
  }

  private void method2() {
    list.add("1");
  }
  private void method3() {
    list.remove(0);
  }
}
```
执行
```java
static final int THREAD_NUMBER = 2;
static final int LOOP_NUMBER = 200;
public static void main(String[] args) {
  ThreadUnsafe threadUnsafe = new ThreadUnsafe();
  for (int i = 0; i < THREAD_NUMBER; i++) {
    new Thread(() -> {
      threadUnsafe.method1(LOOP_NUMBER);
    }, "Thread" + (i + 1)).start();
  }
}
```
多线程引用的均是同一对象中的list成员变量，如图所示
![alt text](thread-safety-analysis.assets/image.png)
## 局部变量
* 局部变量是线程安全的
* 但局部变量引用的对象未必
  * 如果该对象没有逃离方法的作用域，则线程安全
  * 如果对象逃离方法的作用范围，需要考虑线程安全

### 代码实例分析

```java
class ThreadSafe {
  public void method1(int loopNumber) {
    ArrayList<String> list = new ArrayList<>();
    for (int i = 0; i < loopNumber; i++) {
      // 临界区
      method2(list);
      method3(list);
    }
  }

  private void method2(ArrayList<String> list) {
    list.add("1");
  }
  private void method3(ArrayList<String> list) {
    list.remove(0);
  }
}
```
list此时是局部变量，每个线程调用时会创建其不同实例，没有共享
![alt text](thread-safety-analysis.assets/image1.png)

局部变量的引用稍有不同