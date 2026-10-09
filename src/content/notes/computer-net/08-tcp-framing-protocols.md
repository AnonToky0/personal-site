---
title: "TCP 消息边界与应用层协议设计"
description: "从 TCP 字节流出发设计消息边界、长度前缀、流式解析、超时与应用层协议错误恢复。"
date: 2026-10-07
tags: ["计算机网络", "TCP", "协议设计"]
---

上一章已经建立了最关键的前提：

> TCP 提供可靠、有序的 Byte Stream，但不保留应用消息边界。

这意味着 TCP 能保证字节的顺序，却不知道 `?PST` 是一条命令、`?PERL` 是下一条命令，也不知道一次 `Receive()` 应该返回几条业务消息。

对 MMI、控制器和自定义二进制协议来说，TCP 只是承载层：

```text
TCP
→ 可靠、有序地传输字节

ScopeWireProtocol / 设备协议
→ 定义一条消息从哪里开始、到哪里结束以及表示什么
```

因此，所谓“粘包、拆包”最终要靠应用层 Framing 解决，而不是寻找一个能让每次 `Send()` 与 `Receive()` 永远一一对应的 Socket 选项。

## 1. 先区分四种边界

理解这个问题时，最容易混淆的是四种不同边界：

```text
应用调用边界
→ 程序每次调用 Send()/Write() 的范围

TCP Segment 边界
→ TCP 在网络上传输时形成的 Segment 范围

应用读取边界
→ 每次 Receive()/Read() 实际返回的字节范围

应用消息边界
→ 协议定义的一条完整 Request、Response 或 Event
```

它们没有一一对应关系：

```text
一次 Send
→ 可能形成多个 TCP Segment

多次 Send
→ 可能在发送路径上被共同承载

一个 TCP Segment
→ 可能被多次 Read 才取完

一次 Read
→ 可能取得多条应用消息，也可能只取得半条
```

应用真正应该依赖的只有自己协议定义的消息边界。

## 2. UDP Datagram 与 TCP Byte Stream

UDP 保留 Datagram 边界。假设发送端分别发送两个 UDP Datagram：

```text
Datagram 1 = "ABC"
Datagram 2 = "DEF"
```

接收端不会把它们作为一个 UDP Datagram `"ABCDEF"` 交付。一次 UDP 接收对应一份 Datagram；如果接收缓冲区太小，超出部分如何报告或截断取决于具体 Socket API，不能指望下一次接收自动取得“同一 Datagram 的剩余部分”。

TCP 则只向应用提供：

```text
A B C D E F
```

如果发送端执行：

```text
Send("ABC")
Send("DEF")
```

接收端都可能合法地看到：

```text
Read 1 → "ABCDEF"
```

或者：

```text
Read 1 → "A"
Read 2 → "BCDE"
Read 3 → "F"
```

只要最终字节内容和顺序正确，就符合 TCP 的承诺。

## 3. “粘包”和“拆包”不是 TCP 出错

在中文网络编程语境里，常把下面两种观察称为：

```text
粘包
→ 一次读取拿到了多条应用消息的字节

拆包 / 半包
→ 一条应用消息需要多次读取才能收齐
```

这些名称方便交流，但容易让人误以为 TCP 修改或破坏了 Packet。更准确地说：

> 应用读取边界与应用消息边界不同。

例如两条命令：

```text
Message A = ?PST
Message B = ?PERL
```

可能一次读到：

```text
?PST?PERL
```

也可能先读到：

```text
?PS
```

随后读到：

```text
T?PERL
```

第一份 `?PS` 不能立即判定为非法命令，因为它可能只是尚未收齐的合法消息前缀。

## 4. 为什么读取结果会这样变化

字节从应用到另一端应用会经过多个缓冲和调度环节：

```text
发送应用
 ↓
发送 Socket Buffer
 ↓
TCP 分段与重传
 ↓
IP 与链路层
 ↓
网络中的不同路径、排队与 MTU
 ↓
接收 TCP 重组与 Receive Buffer
 ↓
接收应用何时、以多大 Buffer 调用 Read
```

读取边界会受到很多因素影响：

```text
每次写入的大小与时机
发送、接收缓冲区状态
MSS 与路径 MTU
流量控制与拥塞控制
丢包与重传
Nagle Algorithm 和 Delayed ACK
操作系统线程调度
接收应用何时读取以及给出的 Buffer 大小
网卡分段或合并卸载
```

这些因素能解释某次运行为什么呈现特定切分，但应用协议不能依赖它们维持消息边界。即使实验中连续运行一万次都是“一次 Read 一条消息”，也不构成协议保证。

## 5. 为什么一次 `Receive()` 不能直接调用业务解析

下面的代码隐含了错误假设：

```csharp
byte[] buffer = new byte[1024];
int count = socket.Receive(buffer);
ParseOneMessage(buffer, count);
```

`Receive()` 的返回值只表示本次取得了多少字节，不表示取得了一条完整消息。

对于 Stream Socket，还必须处理：

```text
count > 0
→ 本次取得了一些字节，数量可能小于请求长度

count == 0
→ 对端已经有序关闭其发送方向，后面不会再有新字节

异常 / 错误
→ 连接复位、超时、取消或其他 Socket 问题，具体看 API
```

如果关闭发生时缓存里还留着半条消息，应报告“连接在 Frame 完成前关闭”，而不是把半帧当作完整消息处理。

## 6. Framing：由应用协议定义消息边界

常见方案包括：

| Framing 方式 | 判断完整消息的方法 | 优点 | 主要风险或限制 |
| --- | --- | --- | --- |
| 固定长度 | 累积到固定 N byte | 解析简单、耗时稳定 | 变长数据浪费空间，版本扩展不灵活 |
| 分隔符 | 扫描终止符，如 `\r\n` | 文本协议直观、调试方便 | Payload 中出现分隔符时需要转义或编码 |
| 长度前缀 | 先解析 Header 中的 Length，再等待指定字节数 | 高效，适合二进制和变长消息 | 必须防御非法、超大和溢出的 Length |
| 自描述格式 | 由格式解析完整对象 | 表达力强 | 流式解析、资源限制和错误恢复更复杂 |

工程中也常组合使用，例如：

```text
Magic + Version + Type + Length + RequestId + Payload + Checksum
```

## 7. 固定长度协议

如果协议规定每条记录固定为 100 byte，那么接收端每积累够 100 byte 就提取一条：

```text
Receive Buffer
┌──────────────────────┬──────────────────────┐
│ Frame 1: 100 bytes   │ Frame 2: 100 bytes   │
└──────────────────────┴──────────────────────┘
```

即使一次只读到 30 byte，也应继续累计剩余 70 byte；即使一次读到 250 byte，也应提取两条并保留最后 50 byte。

固定长度适合结构稳定、字段长度明确的场景，但必须规定：

```text
不足字段如何 Padding
字符串编码和终止方式
整数的 Endianness
保留字段含义
协议升级如何兼容
```

## 8. 分隔符协议

文本协议常使用结束符，例如：

```text
?PST\r\n
?PERL\r\n
```

即使一次读取为：

```text
?PST\r\n?PERL\r\n
```

解析器也可以逐个扫描 `\r\n` 并提取消息。

设计时必须回答：

```text
Payload 是否允许包含分隔符？
如果允许，使用转义、引号还是 Base64 等编码？
连续转义如何解析？
一条消息最大允许多长？
一直没有分隔符时何时终止并报错？
```

没有最大长度限制的分隔符解析器可能因为恶意或故障对端持续发送无终止符数据而无限占用内存。

HTTP/1.1 的 Header 行使用 CRLF，但 HTTP 消息整体边界还涉及空行、Content-Length、Transfer-Encoding 以及不同类型消息的规则，不能简化成“HTTP 只按 CRLF 切包”。

## 9. 长度前缀协议

长度前缀非常适合二进制和工业通信：

```text
┌────────┬─────────┬──────────┐
│ Header │ Length  │ Payload  │
└────────┴─────────┴──────────┘
```

接收逻辑分两步：

```text
先等到固定大小的 Header
→ 解析并校验 Length

再等到指定数量的 Payload
→ 提取一条完整 Frame
```

假设 Header 是 12 byte，其中 Length 表示 Payload 长度：

```text
当前缓存 < 12
→ Header 未完整，继续读取

当前缓存 ≥ 12
→ 解析 Length

当前缓存 < 12 + Length
→ Payload 未完整，继续读取

当前缓存 ≥ 12 + Length
→ 提取一帧，再尝试解析缓存中的下一帧
```

协议规范必须精确定义 Length：

```text
表示 Payload Length，还是整个 Frame Length？
单位是 byte 还是元素个数？
Length 字段自身是否包含在内？
使用 Big-Endian 还是 Little-Endian？
最小值和最大值是多少？
空 Payload 是否合法？
```

## 10. Length 是字节数，不一定是字符数

如果 Payload 是 UTF-8 文本：

```text
字符串长度
≠ UTF-8 byte 长度
```

例如不同字符编码后可能占用不同数量的 byte。发送方必须先按协议指定编码得到 byte array，再填写 Length：

```text
Text
 ↓ UTF-8 encode
Payload Bytes
 ↓
Length = PayloadBytes.Length
```

接收方也应先按 Length 收齐 byte，再使用指定编码解码。使用字符数量填写二进制协议中的 byte Length，会直接造成后续 Frame 错位。

## 11. 一个更完整的 Header 应该解决什么

结合 ScopeWireProtocol 一类设计，可以考虑：

```text
┌───────────┬──────────────────────────────────────┐
│ Magic     │ 快速识别协议和辅助重新同步           │
│ Version   │ 明确协议版本                         │
│ Type      │ Request / Response / Event 或具体命令 │
│ Flags     │ 压缩、错误、分片等受控扩展           │
│ Length    │ 明确后续 Payload 的 byte 数           │
│ RequestId │ 将 Response 对应到 Request            │
│ SessionId │ 区分重连、任务或逻辑会话              │
│ Timestamp │ 表达协议明确定义的时间语义            │
│ Payload   │ 业务数据                              │
│ Checksum  │ 可选的应用级完整性检查                │
└───────────┴──────────────────────────────────────┘
```

并不是字段越多越好。每个字段都应该有明确语义、长度、字节序、合法范围和版本兼容规则。

### Magic

Magic 可以帮助判断当前位置是否像一条 Frame 的开头，也可在损坏后尝试重新同步。但 Payload 里也可能偶然出现相同 byte pattern，所以不能只找到 Magic 就无条件信任后续 Length；还要联合验证版本、类型、长度和校验。

### Version

Version 应明确接收端遇到未知版本时如何处理。静默按旧格式解析，通常比明确拒绝更危险。

### Type

Type 用于区分请求、响应、主动事件和错误。它可以让解析层先完成结构验证，再把消息路由给对应业务处理器。

### RequestId / CorrelationId

Request ID 用于关联应用层请求与响应：

```text
Request:  RequestId = 123, Type = GetState
Response: RequestId = 123, Type = GetStateResponse
```

它与 TCP Sequence Number 完全不同：

```text
TCP Sequence Number
→ TCP 协议栈用于可靠传送字节，应用通常不直接管理

Application RequestId
→ 应用协议用于匹配业务请求、响应、超时和日志
```

即使 TCP 按序交付字节，服务器也可能并发处理多个请求，让业务响应以不同顺序生成。因此是否允许并行请求、响应能否乱序以及 Request ID 是否可复用，都应写进协议规范。

### SessionId

Session ID 可以区分不同任务、采集会话或重连代次。例如旧连接断开后，新连接使用新的 Session ID，迟到或缓存中的旧消息就不会被误认为新会话的数据。

但 Session ID 不会自动提供安全认证，也不能只由单方随意生成后就假设两端理解一致。协议必须定义它由谁分配、何时更新、作用范围、长度、回绕和未知 Session 的处理方式。

### Application Sequence

应用 Sequence 可以用于请求关联、事件排序或应用层丢失检测，但这些用途并不完全相同。设计时应明确它到底是：

```text
每个 Request 的唯一 Correlation ID
每个 Session 内单调递增的消息序号
某类 Data Stream 的样本编号
```

不要让一个字段在不同 Message Type 中承担互相矛盾的语义。TCP 自己的 Sequence Number 对应用通常不可见，不能替代这些业务编号。

### Timestamp

Timestamp 可以帮助判断采样时间、延迟和数据是否过期，但必须定义：

```text
时间基准与单位
UTC wall clock 还是 monotonic elapsed time
发送、采样还是处理完成时刻
时钟是否同步以及允许多大偏差
回绕、精度和无效值如何表示
```

如果两台设备没有可靠时钟同步，不能仅用它们各自的 wall-clock Timestamp 精确计算单程网络延迟。

## 12. Length 字段必须先验证再分配内存

错误做法：

```text
从网络读取 Length
→ 立即 new byte[Length]
```

对端可能发送：

```text
Length = 2,147,483,647
```

造成巨量分配、整数溢出或进程崩溃。正确顺序是：

```text
解析无符号或有符号规则
→ 验证 Length >= 0
→ 验证 Length <= MaxPayloadLength
→ 使用 checked arithmetic 计算 Header + Length
→ 确认不会整数溢出
→ 再等待或分配受控大小的 Buffer
```

最大帧长是协议的一部分，不应只是某个实现里的隐含常量。还应限制：

```text
每连接累计未完成数据量
并发未完成请求数
解析等待时间
解压后的最大大小
错误次数和重新同步扫描范围
```

## 13. 一个正确的流式解析循环

接收器通常包含两个层次：

```text
Transport Receive Loop
→ 只负责读取 byte 并追加到 Buffer

Frame Decoder
→ 从 Buffer 中尽可能提取 0、1 或多条完整 Frame
```

伪代码：

```text
while connection is open:
    count = Receive(tempBuffer)

    if count == 0:
        if accumulatedBuffer is not empty:
            report TruncatedFrame
        finish connection

    append tempBuffer[0..count] to accumulatedBuffer

    loop:
        if accumulatedBuffer has less than FixedHeaderSize:
            break and receive more

        header = peek header without removing it

        if magic/version/type/length is invalid:
            reject connection or perform bounded resynchronization

        frameLength = checked(FixedHeaderSize + header.PayloadLength)

        if accumulatedBuffer has less than frameLength:
            break and receive more

        frame = remove exactly frameLength bytes
        dispatch frame
```

内部的解析 `loop` 很重要：一次 Receive 可能已经包含多条完整 Frame。如果每次读取只解析一条，剩余完整消息会无谓地等待下一次网络事件。

## 14. “先读 Header，再读 Payload”也必须允许部分读取

一种实现方式是写一个 `ReadExactly(N)` 辅助逻辑：

```text
remaining = N

while remaining > 0:
    count = Read(destination slice)

    if count == 0:
        report EndOfStream before N bytes

    remaining -= count
```

流程为：

```text
ReadExactly(HeaderSize)
→ Parse and validate Length
→ ReadExactly(Length)
→ Construct Frame
```

这适合严格串行读取。但如果系统需要流水线、并发请求、零拷贝或高吞吐，累积 Buffer 加状态机通常更灵活。

无论采用哪种方式，都不能假设一次 `Read(headerBuffer)` 会自动填满整个 Header。

## 15. 发送端也可能只完成部分写入

接收端需要循环读取，发送端同样不能把“请求发送 N byte”与“调用一次一定接受 N byte”混为一谈。某些 Socket API 或非阻塞模式可能只接受部分数据。

发送逻辑应检查返回值：

```text
offset = 0

while offset < frame.Length:
    sent = Send(frame[offset..])

    if sent <= 0:
        handle close or error

    offset += sent
```

高级框架可能提供“写入全部”语义，但仍要理解底层背压、取消、超时和错误是如何暴露的。

## 16. Nagle Algorithm 能做什么，不能做什么

Nagle Algorithm 的目标是减少大量小 TCP Segment。简化理解是：当连接上已有尚未确认的数据时，新的少量数据可能先被缓冲，等到前面的数据得到确认或积累到足够大小再发送。

它不是一个固定的“每次等待几十毫秒再拼包”定时器。实际延迟还会受 Delayed ACK、发送策略、操作系统实现和网络 RTT 影响。

在 .NET Socket 中：

```csharp
socket.NoDelay = true;
```

通常表示设置 `TCP_NODELAY`，禁用 Nagle。对于频繁发送小型交互消息的系统，这可能减少某些等待；但它也可能增加小 Segment 数量和协议开销。

最重要的是：

```text
TCP_NODELAY
≠ 保留 Send 边界
≠ 保证一次 Read 得到一条消息
≠ 消除应用所谓“粘包/半包”
```

即使关闭 Nagle，发送缓冲、接收缓冲、分段、重传、调度和读取大小仍会让应用边界与读取边界不同。因此 `NoDelay` 是延迟与效率调优选项，不是 Framing 方案。

## 17. Request、Response、Timeout 与迟到消息

一问一答协议至少需要定义：

```text
Request Type
RequestId
Response Type
Success / Error Code
Timeout
取消行为
连接断开后的未完成请求如何结束
```

假设 Request 123 在 500 ms 后超时，但控制器在 700 ms 返回：

```text
t=0 ms    发送 RequestId=123
t=500 ms  客户端判定超时
t=700 ms  收到迟到的 ResponseId=123
```

客户端必须知道如何处理迟到响应，不能把它误配给下一个请求。Request ID、未完成请求表和有限的 ID 复用策略能解决关联问题。

超时只表示在规定时间内没有获得所需结果，不证明对端没有执行操作。对于具有副作用的命令：

```text
Start
Move
WriteConfiguration
Charge
```

盲目重试可能让操作执行两次。协议应考虑幂等命令、唯一 Operation ID、状态查询或服务端去重。

## 18. Checksum、CRC 与安全性

TCP Checksum 用于检测传输中的部分位错误，但它不是加密认证，也不证明消息来自可信设备。

应用级 Checksum 或 CRC 可以帮助检测：

```text
串口或其他链路复用中的损坏
持久化或共享内存中的意外破坏
错误 Framing 或实现缺陷
设备协议规定的完整性字段
```

但普通 CRC 不能抵抗主动篡改。需要机密性、身份认证和抗篡改时，应使用经过验证的安全协议，例如 TLS，或由安全专家设计和评审的消息认证方案，而不是自创加密或把 CRC 当成签名。

## 19. 错误恢复与重新同步

解析到非法 Magic、Version、Type 或 Length 后有两种常见策略：

```text
严格策略
→ 立即关闭连接并记录 Protocol Error

恢复策略
→ 在有限范围内寻找下一个可能的 Magic，再联合验证 Header
```

严格策略简单、安全，适合可靠 TCP 上的受控设备协议，因为出现非法 Frame 往往意味着双方状态已经不一致。恢复策略适合必须容忍噪声或与共享流复用的场景，但实现复杂，必须防止：

```text
在 Payload 中误认 Magic
无限扫描导致 CPU 消耗
攻击者构造大量伪 Header
丢弃合法数据后静默进入错误状态
```

协议应明确选择哪种策略，而不是解析器遇错后随意丢一个 byte 继续猜。

## 20. MMI 协议的分层架构

可以把上位机通信拆成清晰的职责：

```text
Socket Transport
→ 连接、读取、写入、关闭、传输错误

Frame Decoder / Encoder
→ Magic、Version、Length、Checksum、字节序

Message Codec
→ Type 与 Payload 的结构化编码

Request Dispatcher
→ RequestId、超时、取消、迟到响应

Business Logic
→ ?PST、状态读取、运动命令和错误处理
```

这样能够区分：

```text
Connection Error
Frame Error
Unsupported Message Type
Request Timeout
Controller Business Error
Response Decode Error
```

如果所有层都只抛出“通信失败”，抓包和日志就很难定位故障。

## 21. 日志应该记录什么

在不泄露凭据和敏感 Payload 的前提下，建议记录：

```text
Connection / Session 标识
Local 与 Remote Endpoint
协议版本
Message Type
RequestId
声明 Length 与实际 Length
发送、收到、解析、派发和完成时间
Timeout 阶段
Error Code 与异常类型
```

不要只记录：

```text
Send success
Receive timeout
```

更有用的是：

```text
RequestId=123 GetState encoded 28 bytes
RequestId=123 transport write completed
RequestId=123 response frame header received, payload pending
RequestId=123 timed out after 500 ms
late ResponseId=123 received after 702 ms and discarded
```

这能把传输成功、Frame 完整、业务响应和超时生命周期区分开。

## 22. 使用 Wireshark 判断消息边界问题

过滤目标连接：

```text
tcp.port == 51701
```

查看携带 TCP Payload 的 Segment：

```text
tcp.port == 51701 && tcp.len > 0
```

分析时要记住：

```text
TCP Segment 边界
≠ Send 调用边界
≠ Read 调用边界
≠ 应用 Frame 边界
```

Wireshark 可以为某些已知协议重组 TCP Stream。对于自定义协议，如果没有解析器，可以使用 Follow TCP Stream 查看重组后的字节，再按照 Magic、Length 和 RequestId 手工验证。

本机抓包还可能受到 TCP Segmentation Offload、Large Receive Offload 和 Checksum Offload 影响，看到比预期大的 Segment 或未验证 Checksum 不一定表示线上 Packet 就是那样。必要时在另一台设备或交换机镜像口抓包进行对照。

## 23. 一套协议设计检查表

在实现 ScopeWireProtocol 或类似协议前，至少明确：

### Framing

- 固定长度、分隔符还是长度前缀？
- Header 固定多长？Length 表示什么？
- 最大 Frame 与最大 Payload 是多少？
- 字节序是什么？
- 连接在半帧处关闭如何报告？

### Message Semantics

- Type、Version、Flags 的取值范围是什么？
- Request 与 Response 如何关联？
- 是否有服务端主动 Event？
- 是否允许并发请求和乱序响应？
- 未知消息与未知版本如何处理？

### Failure Handling

- 连接、读取、整帧和业务处理分别使用什么 Timeout？
- 迟到 Response 如何处理？
- 哪些操作可以安全重试？
- 哪些错误关闭连接，哪些只拒绝当前 Frame？
- 是否需要 Heartbeat，以及它证明哪一层存活？

### Resource and Security Limits

- 如何限制 Length、缓存、并发和解析耗时？
- 是否需要认证、加密、防重放或消息认证？
- 日志中哪些 Payload 必须脱敏？
- Fuzz Test 是否覆盖非法 Length、截断 Frame 和未知 Type？

## 24. 本章核心模型

```text
TCP Byte Stream
        ↓
Receive Buffer
        ↓
Frame Decoder
        ↓
0 / 1 / 多条完整 Frame
        ↓
Message Decoder
        ↓
Request Dispatcher
        ↓
Business Logic
```

需要记住：

1. TCP 保证字节顺序，不保留 `Send()`、Segment、`Read()` 或业务消息边界。
2. “粘包、拆包”通常描述读取边界与应用消息边界不同，不表示 TCP 传错了数据。
3. UDP 保留 Datagram 边界；缓冲区太小时不能把剩余部分当作下一份 Datagram 继续读取。
4. Stream `Read()` 可能返回任意正数个当前可用字节；不能假设一次填满 Buffer 或一条 Frame。
5. 固定长度、分隔符和长度前缀都是 Framing 方案，各有明确适用条件。
6. Length 必须定义单位、覆盖范围、字节序与最大值，并在分配内存前验证。
7. 文本字符数不一定等于编码后的 byte 数。
8. TCP Sequence Number 与应用 RequestId 属于不同层次。
9. `TCP_NODELAY` 只影响 Nagle 行为，不能创造消息边界。
10. Timeout 不证明业务未执行；有副作用的重试必须考虑幂等和去重。
11. 解析器需要处理半帧、多帧、非法长度、关闭、超时和有限的错误恢复。
12. 抓包时应重组 Byte Stream，再按应用协议字段判断完整消息。

## 思考题

1. 为什么两次 `Send()` 不能保证接收端对应两次 `Read()`？
2. UDP 保留 Datagram 边界具体意味着什么？接收 Buffer 太小会带来什么风险？
3. 收到 `?PS` 时，为什么不能立即把它判定为非法的 `?PST` 命令？
4. 长度前缀协议在只收到完整 Header、尚未收到全部 Payload 时应该怎么做？
5. 一次 Read 得到三条完整 Frame 加半条 Frame 时，解析器应该怎样处理？
6. 为什么 Length 必须在内存分配前验证？
7. UTF-8 文本协议为什么不能总用字符串字符数填写 byte Length？
8. TCP Sequence Number 与 ScopeWireProtocol 的 RequestId 分别解决什么问题？
9. 为什么设置 `socket.NoDelay = true` 仍然必须实现 Framing？
10. Request 已超时但控制器稍后返回 Response 时，客户端为什么需要 RequestId？
11. 为什么一次业务命令超时不能证明控制器没有执行该命令？
12. `tcp.len > 0` 为什么仍不能单独证明其中恰好是一条完整应用消息？

下一章将学习 **Socket 编程模型与连接生命周期**：阻塞、非阻塞和异步 I/O 如何等待网络事件，以及 TCP 重传、Receive Timeout、业务 Timeout、Heartbeat 与 Reconnect 分别解决什么问题。

## 延伸阅读

- [RFC 9293：Transmission Control Protocol（TCP）](https://www.rfc-editor.org/rfc/rfc9293)
- [TCP_NODELAY socket option（Microsoft Learn）](https://learn.microsoft.com/en-us/windows/win32/winsock/ipproto-tcp-socket-options)
- [Socket.Receive Method（Microsoft Learn）](https://learn.microsoft.com/en-us/dotnet/api/system.net.sockets.socket.receive)
- [Socket.NoDelay Property（Microsoft Learn）](https://learn.microsoft.com/en-us/dotnet/api/system.net.sockets.socket.nodelay)

---

## 系列导航

- [学习清单与完整目录](/notes/computer-net/00-learning-roadmap/)
- [上一章：TCP、UDP、端口与 Socket：从“连接成功”到“业务成功”](/notes/computer-net/07-tcp-udp-sockets/)
- [下一章：Socket 编程模型与连接生命周期](/notes/computer-net/09-socket-lifecycle/)
