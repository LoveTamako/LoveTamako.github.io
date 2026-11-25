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

### 3.3 HTTP 请求执行器（HttpCallExecutor）

有了调用结果模型之后，还需要一个组件负责执行 HTTP 请求，并将底层 HTTP Client 返回的响应或抛出的异常转换为统一的调用结果。这个组件就是位于统一调用层与底层 HTTP Client 之间的 `HttpCallExecutor`，主要承担以下职责：

- **请求执行**：准备 HTTP 请求，组装请求头和请求体，并调用底层 HTTP Client 发送请求、接收响应。
- **结果转换**：根据请求执行情况及其产生的响应或异常，判断调用状态，并封装为 `CallResult`。

通过这层封装，调用方只需要提供请求构建逻辑和执行参数，就可以获得统一的 `CallResult`，而不需要直接处理底层 HTTP Client 的响应和异常。

接下来，我们先分析 HTTP 请求的执行过程，了解不同阶段可能出现的异常及其判断依据，再据此设计 `HttpCallExecutor` 的结果处理逻辑。

#### 执行过程与结果判定

为了让 `HttpCallExecutor` 能够正确判断调用结果，需要先了解底层 HTTP Client 的执行过程，以及不同阶段发生异常时能够获得哪些判断依据。

以 JDK `HttpClient` 为例，一次同步调用大致经历以下过程：

```text
请求准备 → 调用 HttpClient.send() → 建立连接、发送请求 → 接收响应 → 读取完整响应体
```

根据请求执行过程和能够获得的判断依据，可以将调用结果分为以下三种情况：
* **COMPLETED**：已经完整接收 HTTP 响应。如果底层 HTTP Client 正常返回，并且已经完整读取响应体，则归为 `COMPLETED`。例如，使用 `BodyHandlers.ofByteArray()` 时，`send()` 正常返回意味着响应体已经完整读取。

* **FAILED**：能够确认请求数据尚未发送。如果请求准备阶段发生异常，或者在底层客户端执行过程中能够确认请求数据尚未发送，则归为 `FAILED`。例如，DNS 解析失败、连接建立失败或 TLS 握手失败。

* **UNKNOWN**：无法确认请求是否已经发送。如果请求执行过程中发生连接中断、I/O 异常或超时，且无法确认请求是否已经发送，则归为 `UNKNOWN`。以 JDK `HttpClient` 为例，其内部执行阶段并未完整暴露，因此无法仅凭异常类型准确判断请求发送状态。

在实际实现中，不能简单地根据异常类型判断调用结果，而需要结合请求执行过程及能够获得的判断依据。例如，JDK `HttpClient` 提供的 `HttpConnectTimeoutException` 表示连接建立超时，但执行器仍需要判断是否有足够证据证明请求数据尚未发送。对于无法获得明确证据的情况，应采用保守策略，将调用结果归为 `UNKNOWN`。

因此，异常类型可以作为判断依据的一部分，但不能替代对请求执行过程的判断。这也是封装 `HttpCallExecutor` 时需要重点考虑的问题。

#### HttpCallExecutor 实现

基于上述思路，可以将请求准备、底层客户端调用和结果转换统一放在 `HttpCallExecutor` 中。执行器负责协调整个请求执行过程，并根据执行结果和异常信息创建对应的 `CallResult`，不需要额外引入独立的异常分类接口。

在请求准备阶段，执行器需要获取已经组装好的 HTTP 请求。由于不同接口的请求地址、请求头和请求体各不相同，这些具体内容交由调用方构建即可。为了让执行器能够管理请求准备过程，可以使用 `Supplier<HttpRequest>` 将请求构建逻辑传递进来。

`Supplier` 是 Java 提供的函数式接口，通过 `get()` 方法获取一个对象。在这里，它负责执行请求构建逻辑并返回 `HttpRequest`。这样，执行器就可以在同一个调用过程中区分请求准备阶段和底层 HTTP 执行阶段。

首先，定义执行器：

```java
import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Objects;
import java.util.function.Supplier;

public class HttpCallExecutor {

    private final HttpClient httpClient;

    public HttpCallExecutor(HttpClient httpClient) {
        this.httpClient = Objects.requireNonNull(httpClient);
    }

    /**
     * 准备并执行 HTTP 请求，返回统一的调用结果。
     */
    public CallResult<HttpResponse<byte[]>> execute(
            Supplier<HttpRequest> requestSupplier) {

        Objects.requireNonNull(requestSupplier);

        HttpRequest request;

        try {
            // 准备 HTTP 请求
            request = Objects.requireNonNull(requestSupplier.get());

        } catch (RuntimeException e) {

            // 请求尚未交给底层客户端执行
            return CallResult.failed(e);
        }

        try {
            // 发起请求，并完整读取响应体
            HttpResponse<byte[]> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofByteArray()
            );

            return CallResult.completed(response);

        } catch (InterruptedException e) {

            // 恢复线程中断状态
            Thread.currentThread().interrupt();

            return CallResult.unknown(e);

        } catch (IOException e) {

            return CallResult.unknown(e);
        }
    }
}
```

下面结合执行过程分析这段代码。

首先，构造方法接收一个 `HttpClient` 实例，并将其保存为成员变量。这里没有在执行器内部创建 `HttpClient`，而是通过构造方法注入，将 HTTP Client 的创建与请求执行职责分离。调用方可以根据实际需求配置连接超时、代理、重定向策略等参数，也可以在多个请求之间复用同一个 `HttpClient` 实例。

接下来，`execute()` 接收一个 `Supplier<HttpRequest>`。调用方通过这个函数式接口传入请求构建逻辑，执行器调用 `requestSupplier.get()` 获取最终的 `HttpRequest`。在请求构建过程中，调用方可以设置请求地址、请求头和请求体，例如使用 `HttpRequest.newBuilder()` 创建请求对象，并通过 `header()`、`POST()` 等方法完成配置。

如果请求准备过程中发生运行时异常，或者没有成功生成请求对象，执行器就可以确认请求尚未交给底层 HTTP Client 执行，因此返回 `FAILED`。这里需要注意，传入的 `Supplier` 应当只负责本地请求准备，不能在其中提前发送 HTTP 请求或执行其他外部操作。另外，`Supplier` 不支持直接抛出受检异常，如果请求准备过程涉及受检异常，需要在调用方进行适当转换，或者定义支持受检异常的函数式接口。

请求准备完成后，执行器调用 `httpClient.send()` 发起同步请求。这里使用 `HttpResponse.BodyHandlers.ofByteArray()` 作为响应体处理器，表示将响应体完整读取为字节数组。当 `send()` 正常返回时，说明完整响应已经接收，可以将其封装为 `COMPLETED`。

需要注意，`COMPLETED` 只表示 HTTP 调用已经完整获得响应，并不代表业务处理成功。例如，服务端返回 HTTP 400、404 或 500，只要客户端完整接收到了响应，调用结果仍然是 `COMPLETED`。至于响应代表业务成功还是失败，应由上层业务代码根据 HTTP 状态码、响应体以及接口约定进一步判断。

如果 `send()` 执行过程中发生 `IOException`，执行器将返回 `UNKNOWN`。这是因为该异常可能发生在不同阶段：请求可能尚未发送，也可能已经发送到服务端，只是在等待响应或读取响应体时发生了异常。由于当前 JDK `HttpClient` 没有向执行器提供足够的信息来可靠判断请求是否已经发送，因此这里采用保守策略。

对于 `InterruptedException`，处理方式也类似。线程中断并不能证明 HTTP 请求尚未发送。此时，执行器通过 `Thread.currentThread().interrupt()` 恢复线程的中断标记，再返回 `UNKNOWN`，避免丢失中断信号，同时保留调用结果的不确定性。

**实现要点**

- **请求准备与执行分离**：调用方负责构建请求地址、请求头和请求体，执行器通过 `Supplier<HttpRequest>` 管理请求准备过程，并调用底层客户端执行请求。
- **根据执行过程判断结果**：请求准备阶段发生异常时返回 `FAILED`；底层执行期间无法确认请求发送状态时返回 `UNKNOWN`；完整接收响应后返回 `COMPLETED`。
- **统一结果处理**：由 `HttpCallExecutor` 负责协调请求准备、执行请求、处理异常和创建 `CallResult`，不额外引入独立的异常分类组件。

通过这种方式，请求准备、底层 HTTP 调用和结果转换被统一组织在一个组件中，调用方不需要重复处理底层客户端的响应和异常。后续如果需要适配 Apache HttpClient、OkHttp 等其他客户端，可以根据各自能够提供的执行阶段信息调整具体实现。