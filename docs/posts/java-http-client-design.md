---
title: Java HTTP 调用设计详解：从基本模型到可靠性架构
date: 2026-11-03
type: post
tags: [Java, HTTP, 分布式系统, 系统架构, 可靠性设计]
description: 介绍 Java 应用调用第三方 HTTP 接口的基本模型，分析 HTTP 调用结果的分类方式，以及前端调用、微服务调用和第三方接口调用的区别，进一步讲解超时、重试、幂等、熔断等可靠性设计，并通过 Java 代码示例展示一套合理的 HTTP 调用架构。
---

# Java HTTP 调用设计：从基本模型到可靠性架构

## 1. HTTP 调用的基本模型

### 1.1 HTTP 是什么

HTTP（Hypertext Transfer Protocol，超文本传输协议）是一种应用层通信协议，采用请求—响应（Request-Response）模型，定义了客户端与服务端之间如何交换数据。

在实际开发中，无论是前端调用后端、微服务之间相互调用，还是调用第三方系统提供的接口，本质上都是通过 HTTP 请求和响应来完成通信。

本文不打算详细介绍 HTTP 的底层原理，而是重点讨论 HTTP 调用过程中可能遇到的问题，例如如何判断调用结果、如何处理异常，以及如何保证调用的可靠性。最后会结合 Java 代码，介绍一套相对合理的设计方案。

::: info 其他通信方式

HTTP 并不是唯一的网络通信方式。实际开发中，我们还经常会接触到 WebSocket、gRPC 等技术，它们的通信方式和适用场景有所不同：

- **HTTP**：通常采用请求—响应（Request-Response）模型，适用于常见的接口调用和资源访问。
- **WebSocket**：建立连接后，客户端和服务端可以进行双向实时通信，常用于实时消息推送、在线聊天等场景。
- **gRPC**：基于 HTTP/2 实现远程过程调用（RPC），常用于微服务之间的通信。

:::

### 1.2 一次 HTTP 调用的执行过程

从调用方的角度来看，一次 HTTP 调用其实很简单，本质上就是发送一个请求（Request），然后接收一个响应（Response）。

下面以客户端调用服务端接口为例：

```text
          客户端                             服务端
            |                                 |
            | -------- HTTP Request --------> |
            |                                 |
            | <------- HTTP Response -------- |
            |                                 |
```

1. **请求**：客户端根据接口定义构造 HTTP 请求，并将请求发送给服务端。
2. **处理**：服务端接收到请求后进行处理，并将处理结果封装成 HTTP 响应返回给客户端。
3. **响应**：客户端收到响应后，解析 HTTP 状态码和响应内容，获取本次请求的处理结果。

以上就是一次 HTTP 调用最基本的过程。实际开发中，这个过程并不总是能够顺利完成，下面我们就来看看 HTTP 调用过程中可能遇到的问题。

### 1.3 HTTP 调用面临的核心问题

从前面的调用过程可以看出，一次 HTTP 调用主要涉及客户端发送请求和接收响应两个阶段。理想情况下，请求能够正常发送，服务端能够成功处理，并将处理结果正常返回给客户端。但在实际开发中，网络通信可能出现各种异常，导致调用过程无法按照预期完成。

从客户端的角度来看，HTTP 调用主要面临两类问题：

1. **请求发送失败：**客户端可能因为网络异常、DNS 解析失败、连接被拒绝等原因，无法成功建立连接或完成请求发送。这种情况下，客户端可能无法将请求正常发送到服务端；如果请求发送过程中发生异常，也可能无法确定服务端是否已经收到完整请求。

2. **响应接收失败或超时：**客户端完成请求发送后，需要等待服务端处理并返回响应。但由于服务端处理时间过长、网络中断或响应数据丢失等原因，客户端可能无法正常收到响应，最终触发读取超时或连接异常。

需要特别注意的是，客户端没有收到响应，并不代表服务端没有处理请求。服务端可能已经成功完成业务操作，只是响应没有正常返回客户端。这种情况下，客户端无法确定本次调用究竟成功还是失败。

这两类问题看起来比较简单，但会引出调用结果判断、异常处理、超时、重试和幂等等一系列问题。后续章节将围绕这些问题，逐步介绍 HTTP 调用的结果分类和可靠性设计。

## 2. HTTP 调用结果分类

从上面的分析可以看出，HTTP 调用的结果并非只有成功和失败：在通信过程中发生异常或超时时，客户端可能无法确定请求是否已经到达服务端，也无法判断服务端是否已经执行了对应的业务操作。因此，需要引入更细粒度的结果分类。

从调用方的角度来看，一次 HTTP 调用可以分为以下三种结果：

| 调用结果 | 含义 | 判断依据 | 典型场景 |
|---|---|---|---|
| COMPLETED | 调用已完成 | 完整接收到 HTTP 响应，包括状态行、响应头和响应体，不论 HTTP 状态码是多少 | HTTP 200 正常响应、HTTP 500 错误响应 |
| FAILED | 请求发送失败 | 能够确认请求数据尚未发送到服务端 | DNS 解析失败、连接建立超时或被拒绝、连接池获取连接超时、TLS 握手失败 |
| UNKNOWN | 调用结果未知 | 无法确认请求是否已经到达服务端，或未能收到完整响应 | 请求发送过程中连接中断、读取响应超时、响应体读取中断 |

**FAILED 与 UNKNOWN 的分界，在于能否确认请求数据尚未发送到服务端**。能够确认请求尚未发送，则判定为 FAILED；请求已经发送或无法确认时，一律按 UNKNOWN 处理。例如，发送请求过程中连接中断，可能已有部分数据到达服务端，也可能尚未发送任何数据。在无法确认的情况下，就不能将其判定为 FAILED。

需要明确的是，上述调用结果仅描述 **HTTP 调用层的通信结果**，而不是业务操作的执行结果。两者的职责边界如下：

- **调用层**：负责发送 HTTP 请求、接收 HTTP 响应，并判断本次通信过程是否完成。
- **业务层**：结合 HTTP 状态码、响应内容和接口约定，进一步判断业务操作是否成功。

因此，三种调用结果能推导出的业务结论并不相同：

- **COMPLETED 不等于业务成功**：只表示客户端已经收到完整的 HTTP 响应，响应中仍可能包含业务错误。业务层可以根据 HTTP 状态码、响应内容和接口约定进一步判断实际结果。
- **FAILED 意味着本次请求不会触发远端业务操作**：因此可以在排除故障后重新发起调用。
- **UNKNOWN 不等于业务失败**：客户端无法确认远端是否已经执行操作，服务端可能已经完成业务处理，只是响应没有完整返回。在没有幂等性保障或状态确认机制的情况下，直接重试可能导致业务操作重复执行。因此，应结合接口幂等性、业务状态查询等机制进一步确认实际执行结果，再决定是否重试。

本文后续将以这三种调用结果为基础，进一步讨论 HTTP 超时、异常处理、重试和幂等性等可靠性设计问题。

::: tip 为什么现有框架没有统一的调用结果分类？

既然 `COMPLETED`、`FAILED`、`UNKNOWN` 能够更清晰地描述一次 HTTP 调用的结果，为什么 Apache HttpClient、OkHttp、Spring RestClient 等成熟框架没有直接提供这样的分类？

主要有两个原因。

**1. 技术上难以完全统一**

HTTP 协议只规定了请求和响应的交互方式，并没有定义客户端应该把一次调用抽象成什么结果。`COMPLETED` 相对容易判断，即客户端收到了完整的 HTTP 响应；难点在于 `FAILED` 与 `UNKNOWN` 的分界，它取决于请求报文究竟写出了多少。而这个信息在异常发生时往往已经丢失：客户端知道自己抛出了什么异常，却不知道自己有没有把请求写完。

例如，连接建立失败时可以确认请求尚未发送；而请求发送过程中连接中断，就无法确定服务端是否已经收到完整请求。同一个 `SocketTimeoutException` 可能来自连接阶段，也可能来自读取阶段，仅凭异常类型同样无法区分。由于不同客户端的底层实现和异常模型并不一致，很难通过统一的异常类型准确判断调用结果。

**2. 不同系统的处理需求不同**

即使能够统一识别调用结果，不同系统对结果的处理策略也不一样。例如，`UNKNOWN` 是否允许重试、是否需要查询业务状态，以及如何保证幂等性，都取决于具体业务场景。

现有框架通常提供底层通信能力、异常处理机制，以及重试、熔断等通用扩展能力，而将具体的调用结果模型和处理策略留给上层应用决定。

因此，这层分类只能由应用自己补上：我们不需要重新实现 HTTP 客户端，而是可以在现有客户端之上增加一层轻量级封装，统一调用结果分类和处理规范。

:::

## 3. 统一 HTTP 调用层的设计与实现

前面已经将 HTTP 调用结果划分为 `COMPLETED`、`FAILED` 和 `UNKNOWN` 三种状态。接下来，我们将基于现有 Java HTTP Client，在其之上增加一层轻量级封装，统一处理 HTTP 请求、响应以及调用结果的识别与转换。

本章以 JDK `HttpClient` 为例，给出这层封装的具体实现。

::: tip 代码所用的 JDK 版本

文中代码基于 JDK 17 编写，涉及的新语法与最低版本要求如下：

- `java.net.http.HttpClient`：Java 11 及以上
- `CallResult` 使用的 `record`：Java 16 及以上

如果项目版本低于 Java 16，可以将 `record` 改写为普通类，并自行实现构造器、访问器以及 `equals()`、`hashCode()`、`toString()` 等方法。

:::

### 3.1 整体设计与代码结构

在正式编写代码之前，先通过下面的目录结构了解统一 HTTP 调用层的整体设计。

```text
http/
├── CallStatus.java       // 状态枚举
├── CallResult.java       // 结果对象
└── HttpCallExecutor.java // 请求执行器
```

其中，`HttpCallExecutor` 基于底层 `HttpClient` 执行请求，并根据执行过程判断调用结果；`CallStatus` 和 `CallResult` 负责定义和封装调用结果。

需要注意的是，调用结果并不是简单地根据异常类型进行映射，因为异常类型难以穷举，也不能始终准确反映请求执行阶段。因此，`HttpCallExecutor` 将结合请求执行过程判断调用结果：能够确认请求尚未发送时返回 `FAILED`，无法确认时返回 `UNKNOWN`。这种设计不需要额外引入独立的异常分类接口，既保持了结果模型的通用性，也避免了不必要的抽象。

接下来，我们按照实现顺序，先定义调用结果模型，再实现请求执行器。

### 3.2 调用结果模型

#### CallStatus

`CallStatus` 是一个枚举，对应第二章介绍的三种调用结果：

```java
public enum CallStatus {

    /**
     * 已收到完整 HTTP 响应
     */
    COMPLETED,

    /**
     * 能够确认请求数据尚未发送到服务端
     */
    FAILED,

    /**
     * 无法确认请求是否已发送，或响应是否完整
     */
    UNKNOWN
}
```

#### CallResult

`CallResult` 用于保存一次 HTTP 调用结束后的完整结果，包括调用状态、HTTP 响应和异常信息：

```java
/**
 * 一次 HTTP 调用的完整结果。
 *
 * @param status   调用结果状态
 * @param response 完整 HTTP 响应，仅 COMPLETED 时存在
 * @param cause    调用异常，FAILED 与 UNKNOWN 时存在
 */
public record CallResult<T>(
        CallStatus status,
        T response,
        Throwable cause
) {

    /**
     * 已收到完整 HTTP 响应。
     */
    public static <T> CallResult<T> completed(T response) {
        return new CallResult<>(CallStatus.COMPLETED, response, null);
    }

    /**
     * 能够确认请求数据尚未发送到服务端。
     */
    public static <T> CallResult<T> failed(Throwable cause) {
        return new CallResult<>(CallStatus.FAILED, null, cause);
    }

    /**
     * 无法确认远端是否已经执行，需结合幂等性或状态查询处理。
     */
    public static <T> CallResult<T> unknown(Throwable cause) {
        return new CallResult<>(CallStatus.UNKNOWN, null, cause);
    }
}
```

**实现要点**

- **`record`**：`CallResult` 是典型的数据载体，使用 `record` 可以自动生成构造器、访问器以及 `equals()`、`hashCode()`、`toString()` 等方法，减少样板代码。
- **字段约定**：`COMPLETED` 时保存完整响应，`cause` 为 `null`；`FAILED` 和 `UNKNOWN` 时，`response` 为 `null`，通过 `cause` 保存异常信息。
- **静态工厂**：通过 `completed()`、`failed()` 和 `unknown()` 分别创建三种状态的结果对象，避免调用方手动填写三个字段，让代码更直观。
- **泛型**：适配不同 HTTP 客户端的响应类型。例如，JDK `HttpClient` 使用 `HttpResponse<byte[]>`，Apache HttpClient 和 OkHttp 也可以使用各自的响应类型，无需修改 `CallResult`。
- **职责边界**：`CallResult` 只负责承载调用结果，不负责判定结果。具体由哪种状态表示，由 `HttpCallExecutor` 根据请求执行过程和异常信息判断。

需要注意，当前实现通过静态工厂方法约定了不同状态对应的字段组合，但没有强制校验。例如，调用方仍然可以直接通过构造器创建一个状态为 `COMPLETED`、但 `response` 为 `null` 的对象。现阶段先保持实现简单，后续如果需要严格保证结果对象的合法性，再考虑增加构造器校验。

### 3.3 请求执行阶段与异常处理

有了调用结果模型之后，还需要解决一个关键问题：请求执行过程中发生异常时，应该返回 `FAILED` 还是 `UNKNOWN`？

最初可以考虑通过异常类型进行分类，例如遇到连接异常返回 `FAILED`，遇到读取超时返回 `UNKNOWN`。但这种方式存在一个问题：Java HTTP 调用涉及不同的 HTTP Client、底层网络实现以及各种请求处理逻辑，异常类型不仅难以穷举，也不一定能够准确反映请求执行到了哪个阶段。同一种异常可能发生在不同的执行阶段，而不同的异常也可能代表相似的执行结果。

更重要的是，调用层真正关心的并不是发生了哪一种异常，而是**能否确认请求数据尚未发送到服务端**。因此，与其建立一套不断扩充的异常类型映射规则，不如让 `HttpCallExecutor` 结合请求执行过程和当前能够获得的信息来判断调用结果。

#### 请求执行阶段

一次 HTTP 调用可以按照执行过程划分为以下几个阶段：

```text
创建请求 → 组装 Header、Body → 调用 HttpClient.send()
                                      ↓
                              接收 HTTP 响应
                                      ↓
                                读取完整响应体
```

在调用底层 HTTP Client 之前，执行器通常需要完成请求对象的创建、请求头组装以及请求体准备等工作。这些操作属于本地请求准备阶段。如果此时发生参数错误、请求构建失败或 Body 序列化异常，并且能够确认没有其他操作提前发送请求，就可以将调用结果归为 `FAILED`。

当执行器调用 `HttpClient.send()` 后，请求就进入底层客户端的执行过程。此时，客户端可能正在解析 DNS、建立连接、发送请求数据或接收响应。以 JDK `HttpClient` 为例，这些内部执行阶段并没有完整地暴露给调用方，因此当执行过程中发生普通 I/O 异常或超时时，调用方通常无法准确判断请求是否已经发送，更无法确认服务端是否已经执行了对应的业务操作。此时应当采用保守策略，将调用结果归为 `UNKNOWN`。

如果客户端正常返回，并且已经完整读取 HTTP 响应体，则归为 `COMPLETED`。这里需要注意，收到响应头并不代表已经取得完整响应，响应体读取失败仍然不能算作 `COMPLETED`。

#### 异常处理策略

结合上述执行过程，可以得到以下判断原则：

| 执行情况               | 调用结果        | 判断依据         |
| ------------------ | ----------- | ------------ |
| 本地请求准备阶段发生异常       | `FAILED`    | 能够确认请求尚未发送   |
| 明确的连接建立失败          | `FAILED`    | 能够确认请求数据尚未发送 |
| 请求执行过程中发生普通 I/O 异常 | `UNKNOWN`   | 无法确认请求是否已经发送 |
| 请求执行过程中发生超时        | `UNKNOWN`   | 无法确认远端是否已经处理 |
| 请求执行过程中线程被中断       | `UNKNOWN`   | 请求可能已经发送     |
| 收到完整 HTTP 响应       | `COMPLETED` | 已经取得完整响应     |

这里的核心原则是：只有存在明确证据证明请求数据尚未发送，才返回 `FAILED`；如果无法确认，就返回 `UNKNOWN`。例如，JDK `HttpClient` 提供的 `HttpConnectTimeoutException` 表示连接建立超时，可以作为连接阶段失败的明确依据；但普通的 `HttpTimeoutException`、`IOException` 等异常，不能仅凭类型就认定请求尚未发送。对于其他连接异常，也需要结合客户端能够提供的执行信息进行判断，而不能简单地根据异常名称推断结果。

#### 实现方式

基于上述思路，异常处理逻辑可以直接放在 `HttpCallExecutor` 中。执行器负责准备请求、调用底层客户端，并根据执行过程和异常信息创建对应的 `CallResult`，不需要额外引入独立的异常分类接口。

以 JDK `HttpClient` 为例，请求已经构建完成之后，核心执行逻辑可以简化为：

```java
public CallResult<HttpResponse<byte[]>> execute(
        HttpRequest request) {

    try {
        // 发起请求，并完整读取响应体
        HttpResponse<byte[]> response = httpClient.send(
                request,
                HttpResponse.BodyHandlers.ofByteArray()
        );

        return CallResult.completed(response);

    } catch (HttpConnectTimeoutException e) {

        // 连接建立超时，可以确认请求数据尚未发送
        return CallResult.failed(e);

    } catch (InterruptedException e) {

        // 恢复线程中断状态
        Thread.currentThread().interrupt();

        // 无法确认请求是否已经发送
        return CallResult.unknown(e);

    } catch (IOException e) {

        // 无法确认请求是否已经发送
        return CallResult.unknown(e);
    }
}
```

这里使用 `BodyHandlers.ofByteArray()`，是为了在 `send()` 正常返回时确保响应体已经完整读取。如果响应体读取过程中发生 I/O 异常，`send()` 会抛出异常，执行器也就无法返回一个完整的响应对象，因此不能将其判定为 `COMPLETED`。

需要注意，`HttpConnectTimeoutException` 是 `HttpTimeoutException` 的子类，因此如果同时处理这两种异常，应当优先捕获前者。另外，`InterruptedException` 并不意味着请求尚未发送，所以不能直接归为 `FAILED`。恢复线程中断标记后，将结果归为 `UNKNOWN`，可以避免丢失调用线程原本的中断状态。

这段代码展示的是请求已经构建完成之后的执行与异常处理过程。实际实现中，请求构建、Header 组装和 Body 准备等操作也可以由执行器负责，但应当与调用 `send()` 的部分明确区分。准备阶段能够确认请求尚未发送的异常可以归为 `FAILED`；进入底层客户端执行过程后，则需要根据客户端能够提供的证据判断，不能简单地将所有异常都归为 `FAILED`。

**实现要点**

- **以执行过程为依据**：结合请求执行阶段和可获得的证据判断调用结果，而不是仅根据异常类型进行分类。
- **保守处理不确定性**：能够确认请求尚未发送时返回 `FAILED`；无法确认时返回 `UNKNOWN`；收到完整响应时返回 `COMPLETED`。
- **保持职责简单**：由 `HttpCallExecutor` 负责执行请求、处理异常和创建 `CallResult`，不额外引入独立的异常分类组件。

通过这种方式，调用结果的判断逻辑与请求执行过程保持在同一个组件中，既避免了维护一套难以穷举的异常分类规则，也减少了不必要的抽象。后续如果需要适配 Apache HttpClient、OkHttp 等其他客户端，再根据各自能够提供的执行阶段信息调整具体实现即可。

### 3.4 HTTP 请求执行器：HttpCallExecutor

完成调用结果模型和异常分类之后，就可以实现真正的 HTTP 请求执行器。

这里使用 JDK 提供的 `java.net.http.HttpClient` 发送请求，并通过前面定义的 `FailureClassifier` 处理执行过程中发生的异常。

首先定义 `HttpCallExecutor`：

```java
public class HttpCallExecutor {

    private final HttpClient client;

    private final FailureClassifier failureClassifier;

    public HttpCallExecutor(
            HttpClient client,
            FailureClassifier failureClassifier) {

        this.client = client;
        this.failureClassifier = failureClassifier;
    }

    public CallResult<HttpResponse<byte[]>> execute(
            HttpRequest request) {

        try {
            HttpResponse<byte[]> response = client.send(
                    request,
                    HttpResponse.BodyHandlers.ofByteArray()
            );

            return CallResult.completed(response);

        } catch (InterruptedException e) {

            // 恢复线程中断标记
            Thread.currentThread().interrupt();

            return CallResult.unknown(e);

        } catch (IOException e) {

            CallStatus status = failureClassifier.classify(e);

            if (status == CallStatus.FAILED) {
                return CallResult.failed(e);
            }

            return CallResult.unknown(e);
        }
    }
}
```

这个类是整个统一调用层的核心。它持有底层 `HttpClient` 和异常分类器，对外提供统一的 `execute()` 方法。业务代码只需要提交一个 `HttpRequest`，就可以获得统一的 `CallResult`，不需要直接处理底层客户端的异常分类逻辑。

下面按照实际执行顺序分析这段代码。

首先，执行器调用 `client.send()` 发送 HTTP 请求，并使用 `BodyHandlers.ofByteArray()` 接收响应体。该处理方式会在响应体读取完成后返回，因此当 `send()` 正常返回时，可以将本次调用判定为 `COMPLETED`。

这里需要特别注意，不能仅仅因为收到了响应状态码和响应头，就认为调用已经完成。如果响应体还没有读取完成，后续仍然可能发生读取超时或连接中断。因此，当前实现选择将响应体完整读取作为调用完成的判断条件。

如果执行过程中抛出 `IOException`，执行器不会直接将其判定为 `FAILED`，而是交给 `FailureClassifier` 进行分类。只有分类器能够确认请求尚未发送时，才返回 `FAILED`；否则返回 `UNKNOWN`。

对于 `InterruptedException`，则采用保守处理。因为线程中断可能发生在请求执行过程中的不同阶段，仅凭中断异常无法确认请求是否已经发送，所以返回 `UNKNOWN`，同时恢复线程的中断标记，避免中断状态丢失。

另外，这里没有捕获所有 `RuntimeException`。例如，空指针、错误的参数使用等编程问题，不应该被当成普通的 HTTP 通信异常吞掉，而应该继续向外抛出，交由上层发现和处理。

至此，统一调用层已经具备最基本的执行能力：正常收到完整响应时返回 `COMPLETED`，发生通信异常时通过分类器判断，无法确认请求是否发送时返回 `UNKNOWN`。

需要说明的是，当前 `JdkFailureClassifier` 采用保守策略，因此这个最小实现尚不能主动识别所有 `FAILED` 场景。它优先保证结果分类不会因为错误判断而将可能已经发送的请求误认为未发送。这也是在实际项目中设计调用结果分类时需要遵循的原则。

### 3.5 完整调用示例

完成上述类的定义之后，就可以将它们组合起来，形成一次完整的 HTTP 调用。

首先，创建 JDK `HttpClient`，并初始化统一调用执行器：

```java
HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(3))
        .build();

HttpCallExecutor executor = new HttpCallExecutor(
        client,
        new JdkFailureClassifier()
);
```

接下来，构造一个 HTTP 请求：

```java
HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create("https://example.com/api/orders"))
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(
                "{\"productId\": 1001}"
        ))
        .build();
```

然后通过统一调用执行器发送请求：

```java
CallResult<HttpResponse<byte[]>> result =
        executor.execute(request);
```

业务代码不再需要直接处理 JDK `HttpClient` 的各种异常，而是根据统一的 `CallStatus` 处理调用结果：

```java
switch (result.status()) {

    case COMPLETED -> {
        HttpResponse<byte[]> response = result.response();

        int statusCode = response.statusCode();
        byte[] body = response.body();

        // 根据 HTTP 状态码和响应内容判断业务结果
    }

    case FAILED -> {
        // 确认请求尚未发送
        // 排除故障后，可以考虑重新发起调用
    }

    case UNKNOWN -> {
        // 无法确认远端是否已经执行操作
        // 结合业务幂等性或状态查询机制进一步处理
    }
}
```

可以看到，业务代码只需要关注统一的调用结果，而不需要了解底层 HTTP Client 的具体异常类型。对于 `COMPLETED`，业务层继续根据 HTTP 状态码和响应内容判断业务结果；对于 `FAILED`，可以在排除故障后考虑重新发起调用；对于 `UNKNOWN`，则需要结合业务幂等性或状态查询机制进一步确认远端执行结果。

通过这套设计，我们就把第二章提出的调用结果分类落实到了 Java 代码中：底层 HTTP Client 负责实际通信，统一调用层负责调用结果的识别和转换，业务层负责根据 HTTP 响应判断业务结果。

需要强调的是，这里实现的是一个最小化的统一调用层，并不是一个完整的 HTTP 客户端框架。实际项目中还可以根据需要增加请求日志、调用耗时统计、请求 ID、链路追踪，以及不同 HTTP Client 的适配实现，但这些功能都不应该改变三种调用结果的基本语义。

