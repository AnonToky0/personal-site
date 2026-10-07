---
title: "Socket 编程模型与连接生命周期"
description: "整理阻塞、非阻塞与异步 I/O，以及连接状态、业务超时、心跳、重连和请求收尾策略。"
date: 2026-10-07
tags: ["计算机网络", "Socket", "异步编程"]
---

TCP 为应用提供可靠、有序的 Byte Stream，但应用仍要决定：

```text
在哪个线程或异步任务中收发
一次读取没有数据时如何等待
什么时候判定业务超时
怎样发现静默失联
断线后是否以及如何重连
未完成请求、迟到响应和 UI 状态如何收尾
```

这些问题属于 Socket 编程模型和应用架构，不是 TCP 自动替应用解决的事情。

本章最重要的区分是：

```text
TCP Retransmission Timeout
≠ Socket Receive Timeout
≠ Frame Assembly Timeout
≠ Application Request Timeout
≠ Heartbeat Failure Threshold
≠ Reconnect Backoff
```

它们位于不同层次，触发条件和后果也不同。

## 1. TCP 的可靠性边界

从应用视角看，只要一条 TCP 连接仍能继续交付数据，TCP 提供：

```text
按序的字节流
重复数据不重复交付
丢失后的传输层重传
流量控制与拥塞控制
通过 TCP Checksum 检测许多传输错误
```

如果发送端的字节流是：

```text
ABCDEF
```

接收应用不会因为网络乱序而得到：

```text
ABFDEC
```

网络中的 Segment 可以丢失、重复或乱序，TCP 会在协议栈内重传、去重和重排。应用通常看不到这些过程，只会读到连续字节，或者最终观察到连接关闭、错误或长时间没有进展。

但是 TCP 不保证：

```text
网络永远不断
所有已提交数据最终一定送达
在业务截止时间内完成交付
一次 Read 返回完整消息
对端应用已经读取或处理
业务操作成功
对端应用仍然健康
数据具备密码学防篡改能力
```

TCP Checksum 不是加密完整性或身份认证机制，也存在极低概率的未检出错误及端系统内部故障风险。需要抵抗主动篡改时应使用 TLS 或合适的消息认证；需要端到端业务完整性时还应按系统需求设计校验和验证。

TCP 还可能先交付一个正确前缀，然后连接才失败。假设业务发送方原本想发送：

```text
ABCDEF
```

接收应用可能先从 Byte Stream 读到：

```text
AB
```

随后因为连接复位或持续网络故障得到 Socket Error，再也收不到 `CDEF`。这不表示 TCP 把一条已知消息错误地交付为 `AB`；TCP 根本不知道 `ABCDEF` 是一条应用消息。它只正确交付了已经到达的字节前缀，应用的 Frame Decoder 必须在连接结束时识别缓存中仍有一条未完成 Frame。

更准确的总结是：

> TCP 尽力维护一条可靠、有序、无重复的字节流；成功交付的数据遵循这一抽象，无法继续时应用必须面对关闭、错误或超时，而业务语义仍由应用协议负责。

## 2. Socket API 与 TCP 协议栈

典型路径是：

```text
Application
   ↓ Socket API
Operating System TCP/IP Stack
   ↓ Driver
Network Interface
   ↓
Network
```

应用通常调用：

```text
Connect
Send / Write
Receive / Read
Shutdown
Close
```

操作系统 TCP/IP 协议栈负责：

```text
构造 TCP Header
Sequence Number 与 ACK
重传与乱序重组
接收窗口
拥塞控制
TCP 状态机
```

Socket 是应用访问这些能力的内核对象和 API 抽象。不能说“Socket 自己在业务代码旁边生成 ACK”；更准确的是内核 TCP 实现通过与 Socket 关联的状态和缓冲完成协议处理。

## 3. TCP Client 的基本生命周期

```text
Create Socket
   ↓
Connect
   ↓
Protocol Handshake / Authentication（如果有）
   ↓
Ready
   ↓
Send and Receive
   ↓
Shutdown / Disconnect
   ↓
Dispose
```

以普通 TCP `Send()` 为例，可以把发送方向继续展开：

```text
Application Buffer
   ↓ Send()
Socket Send Path / Send Buffer
   ↓
Kernel TCP：分段、Sequence、重传、流量与拥塞控制
   ↓
IP：选择源地址、路由与下一跳
   ↓
Network Driver / NIC
   ↓
Link
```

传统实现常把用户 Buffer 中的 byte 复制或接受到内核发送路径后就让 `Send()` 返回；具体实现也可能使用不同的缓冲和零拷贝优化。因此最可靠的 API 结论不是“必然完成了一次特定内存复制”，而是：返回值所表示的 byte 已被本机 Socket 发送机制接受，尚不能证明远端已收到。

创建 Socket 时还没有建立 TCP 连接。`Connect` 成功表示三次握手完成，但应用协议可能还需要：

```text
版本协商
登录或认证
Session 建立
能力交换
订阅恢复
```

所以应用状态不应只有一个布尔值 `Connected`。至少要区分 TCP 已连接与业务已就绪。

## 4. `Send()` 和 `Receive()` 的证据边界

### `Send()`

同步 `Send()` 成功通常表示本次返回值所指示的 byte 已被本机 Socket 发送路径接受。它可能只接受部分数据，不能证明：

```text
对端已经收到
对端 TCP 已 ACK
对端应用已 Read
对端业务已执行
```

### `Receive()`

对于 TCP Stream，`Receive()` 返回正数表示本次从接收字节流中取出了这么多 byte：

```text
count > 0
→ 获得 count byte，可能是半帧、一帧或多帧
```

在请求的 Buffer 长度大于 0 时：

```text
count == 0
→ 对端已对其发送方向完成有序关闭，读到 EOF
```

这是接收方向的 EOF。TCP 支持 Half-Close，因此它不必然表示本地方向已经无法继续发送；应用协议是否允许在收到 EOF 后继续发送，需要自行定义。多数请求—响应协议会在清理完成后关闭整个连接。

`0` 不是“这次暂时没有数据”。暂时没有数据时，阻塞 Socket 会等待，非阻塞 Socket 会报告 WouldBlock，异步操作则保持未完成。

异常断开、复位和本地网络错误通常通过 Socket 错误或异常报告，而不是返回一段标记为“错误数据”的 Payload。但错误之前已经成功返回的 byte 仍然有效；它们可能恰好只是应用 Frame 的一部分。

## 5. 阻塞 I/O

阻塞 Socket 上调用：

```csharp
int count = socket.Receive(buffer);
```

如果当前没有可读数据，调用线程会进入等待。它通常由操作系统挂起，不会因为等待本身持续占满一个 CPU Core。

阻塞模型的优点：

```text
控制流直观
适合单连接、专用通信线程
调试相对简单
```

局限包括：

```text
线程在等待期间不能做其他工作
取消和优雅关闭需要额外设计
大量连接时一连接一线程成本较高
在 UI 线程调用会冻结界面
```

阻塞并不等于死锁。它只是等待某个 I/O 条件；但如果系统没有 Timeout、取消或关闭路径，它可能表现为无限等待。

## 6. 非阻塞 I/O

非阻塞模式下，如果操作现在无法立即完成，调用不会睡眠等待，而是报告类似：

```text
WouldBlock / EWOULDBLOCK
```

应用需要使用 readiness mechanism 或事件循环，例如：

```text
select / poll / epoll / kqueue
Windows event or completion mechanisms
```

然后在 Socket 可读或可写时继续操作。

非阻塞不意味着“不断 while 循环重试”。忙轮询会浪费 CPU。正确模型是等待 readiness/completion 通知，并且每次操作仍要处理部分读写。

## 7. 异步 I/O

现代 .NET 常使用：

```csharp
await socket.ConnectAsync(...);
await socket.ReceiveAsync(...);
await socket.SendAsync(...);
```

异步 I/O 让等待期间不必独占调用线程。操作完成后，Continuation 再继续执行。

需要避免三个误解：

```text
async ≠ 自动新建一个线程
async ≠ 自动并行处理所有消息
async ≠ 自动获得 Timeout、重连和线程安全
```

阻塞、非阻塞和异步描述的是“等待 I/O 的方式”。无论使用哪一种，TCP 的字节流语义、Framing、部分读写和业务超时都完全相同。

## 8. 为什么 UI 线程不能直接等待网络

WinForms、WPF 等 UI 框架通常要求 UI 事件循环保持响应。如果按钮事件里直接执行阻塞的 Connect 或 Receive：

```text
UI Thread
→ Receive 等待
→ 无法处理重绘、点击和窗口消息
→ 界面假死
```

网络 I/O 应在异步任务或专用通信线程中进行。收到结果后，再通过 UI 框架允许的调度机制更新界面。

同时要注意：后台接收线程通常不能直接修改 UI 控件；异步 Continuation 是否回到 UI Context 也取决于调用位置和框架。通信层最好发布结构化状态或事件，由 UI 层负责调度和展示。

## 9. TCP Retransmission Timeout：传输层内部计时

发送 Segment 后没有得到所需 ACK，TCP 会基于动态估计的 Retransmission Timeout（RTO）重传。RTO 会参考测得的 RTT 和波动，不是应用协议固定的 `500 ms`。

```text
Segment 丢失
→ TCP 等待并检测丢失
→ 重传
→ 成功后继续交付有序字节流
```

应用通常不会收到“刚才第几号 Segment 重传了”的普通 Socket 回调。重传成功时应用可能完全无感，只表现为延迟增大。

如果多次重传仍无法恢复，操作系统可能最终使相关 Socket 操作失败。但具体时长和错误受操作系统、连接状态和网络行为影响，不能把 TCP 自身超时当作工业业务的确定 Deadline。

## 10. Socket Receive Timeout：一次同步读取等待多久

.NET 同步 Socket 可以设置：

```csharp
socket.ReceiveTimeout = 1000;
```

它约束的是同步 `Receive()` 在没有数据时等待多久。超时通常表现为 `SocketException`，应用需要检查具体 SocketError。

它不能回答：

```text
哪个 Request 超时？
某条 Frame 是否只收到一半？
Heartbeat 是否失败？
业务操作是否已在控制器执行？
```

而且持续有无关事件、日志或其他响应到达时，每次 Receive 都可能成功，但某个特定 Request 仍然早已超时。因此 Receive Timeout 不能替代 Request Timeout。

异步 API 的超时通常使用 CancellationToken、带超时的等待组合或框架提供的 Timeout 能力；`ReceiveTimeout` 不应被假定为适用于所有异步调用。

## 11. Frame Assembly Timeout：半帧能等多久

长度前缀解析器可能已经收到 Header：

```text
Length = 4096
```

但对端只发来 20 byte Payload 后停止。连接仍未关闭，普通 Receive Loop 可能一直保留半帧。

Frame Assembly Timeout 用于限制：

```text
从识别 Frame 开始到收齐完整 Frame 的最长时间
```

触发后通常应把它视为协议或连接故障，因为字节流已经停在半帧状态。不能简单丢掉半帧再假装下一 byte 是新 Header，除非协议明确定义了安全的重新同步方式。

## 12. Application Request Timeout：业务响应期限

假设 MMI 发送：

```text
RequestId = 100
Type = GetState
```

协议要求 500 ms 内获得 Response。应用应为这个 Request 保存：

```text
RequestId
开始时间或 Deadline
Completion / Waiter
取消状态
重试策略
```

接收循环解析到 Response 后，通过 RequestId 找到等待者并完成它。Timeout 管理器则独立检查 Deadline：

```text
Now >= Deadline
→ 将 Request 100 标记为 Timeout
→ 从 Pending Request Table 移除或进入迟到响应策略
```

这与 Receive 是否持续读到其他消息无关，也与 TCP 是否还在重传无关。

## 13. 为什么“缺 Payload”不应请求 TCP 层重传

解析器目前只有：

```text
Header + 部分 Payload
```

正常处理是把现有 byte 留在 Buffer 中，等待后续 Receive。TCP 已经负责网络丢失重传，应用不知道缺少的 byte 对应哪个原始 Segment，也不应该自行请求 TCP 重传某段字节。

应用层 Retry 解决的是另一件事：完整 Request 已发送，但在业务 Deadline 内没有对应 Response。即使如此，也必须先考虑请求是否幂等、第一次是否可能已经执行以及迟到响应如何处理。

## 14. 静默断线为什么不能立即发现

如果网线被拔掉、中间 NAT 状态消失或远端主机断电，且双方此时都不发送数据，本机 TCP 可能暂时没有新证据判断路径已经失效。

```text
没有 Packet 需要发送
→ 没有 ACK 缺失可观察
→ 阻塞 Receive 可能继续等待
```

`Socket.Connected` 之类属性通常只反映最近已知状态，不是对当前路径进行实时探测。不能用轮询一个布尔属性代替协议级 Liveness 检测。

即使开始发送，第一次 `Send()` 也可能先把数据接受到本地缓冲，错误在稍后的重传失败或下一次操作才暴露。因此“Send 没抛异常”仍不证明链路当前可达。

## 15. TCP Keepalive 与应用 Heartbeat

### TCP Keepalive

TCP Keepalive 是传输层探测机制，通常在连接空闲一段时间后发送探测，以发现无法响应的对端或路径。默认时间、探测次数和可配置能力依操作系统而异，默认值往往不适合短周期工业故障检测。

它最多帮助回答：

> 这个 TCP 对端及路径是否还能对传输层探测作出响应？

它不知道控制器业务线程是否还能解析和处理命令。

### 应用 Heartbeat

应用协议可以定义：

```text
Heartbeat Request
→ 必须经过应用解析和调度

Heartbeat Response
→ 携带 Session、状态或健康信息
```

它能覆盖比 TCP Keepalive 更高的层次，但覆盖程度取决于实现。如果 Heartbeat 在一个独立线程里机械回复，而主要业务线程已经死锁，它仍可能产生假健康。

所以 Heartbeat 必须明确“证明什么”，例如：

```text
只证明消息解析循环可运行
证明主控制循环完成一次迭代
证明设备仍处于可接受命令的状态
```

## 16. Heartbeat 的设计细节

需要定义：

```text
发送周期
Response Deadline
允许连续失败次数
是否只在连接空闲时发送
是否携带 SessionId / Sequence / Timestamp
高负载时如何避免误判
失败后关闭、降级还是重连
```

例如：

```text
每 1 s 发送一次
每次 500 ms Deadline
连续 3 次失败才判定 Unhealthy
```

这只是示例，不能脱离设备响应时间和安全要求照抄。过于频繁会增加负载；过于宽松则延迟故障发现。

Heartbeat Response 必须由统一接收循环解析并分发，不能让心跳线程与业务线程同时竞争同一个 Socket 的 Receive。

## 17. 一个 Socket 通常只保留一个接收循环

错误结构：

```text
Thread A：Send GetState → Receive 等回复
Thread B：Send GetAlarm → Receive 等回复
Thread C：Send Heartbeat → Receive 等回复
```

TCP 只提供一条字节流。多个线程同时 Receive 时，任意线程都可能拿到任意一段 byte，Frame 甚至可能被不同线程分走。

更稳健的结构：

```text
One Receive Loop
   ↓
Incremental Frame Decoder
   ↓
Message Decoder
   ↓
Dispatcher
   ├── 按 RequestId 完成 Pending Request
   ├── 处理主动 Event
   └── 处理 Heartbeat Response
```

这不是说操作系统永远禁止多个读者，而是说对一个需要顺序 Framing 的应用连接，单一所有者最容易保证正确性和可推理性。

## 18. 发送同样需要单一顺序和背压策略

多个线程并发向同一 TCP Socket 写入时，即使所有 byte 最终有序进入流，也不能依赖不同调用之间形成预期的完整 Frame 顺序；部分发送和并发调度还可能让应用层实现难以推理。

常见做法是：

```text
Application Producers
   ↓
Bounded Send Queue
   ↓
One Send Loop
   ↓
Socket
```

发送循环负责：

```text
完整写出每条已编码 Frame
定义优先级
处理取消和连接代次
限制 Queue 大小
报告发送失败
```

Bounded Queue 很重要。若控制器消费速度低于 MMI 生产速度，无限 Queue 只会把网络背压变成内存增长和越来越旧的命令。

## 19. Pending Request Table

典型结构：

```text
Request API
   ↓ allocate RequestId
Pending[RequestId] = Completion + Deadline
   ↓ enqueue encoded Frame
Send Loop

Receive Loop
   ↓ decode Response(RequestId)
Pending.Remove(RequestId)
   ↓ complete matching caller
```

需要处理竞态：

```text
Response 与 Timeout 同时发生
Cancellation 与 Response 同时发生
连接断开时批量失败所有 Pending Request
RequestId 回绕和复用
迟到 Response 到达时原等待者已移除
```

通常应让“移除 Pending 项”成为原子胜负条件：谁成功移除，谁负责完成该请求；另一路看到不存在时按迟到或已取消消息处理。

## 20. 同步等待与异步完成

同步设计可能使用：

```csharp
waitHandle.WaitOne(timeout);
```

如果没有 Timeout、取消和断线清理，等待可能永远不返回。即使有 Timeout，也要处理 Wait 与 Response 同时发生的竞态。

异步设计通常为每个请求保存一个可完成的异步结果，并使用 Deadline 或 Cancellation。它减少阻塞线程，但不会自动消除竞态；完成对象仍必须只完成一次，连接断开时仍必须统一失败。

在库接口中还应区分：

```text
调用者主动取消
业务 Deadline 到期
连接断开
协议错误
设备返回错误
```

不要把所有情况都压成同一个 `TimeoutException`。

## 21. 连接状态机

用明确状态比多个互相矛盾的布尔值更可靠：

```text
Disconnected
   ↓
Connecting
   ↓ TCP connected
Negotiating / Authenticating
   ↓ protocol ready
Ready
   ↓ fault detected
Disconnecting / Faulted
   ↓ cleanup complete
Disconnected
```

状态转换应由单一连接管理器串行化。它负责：

```text
确保同一时刻只有一个 Connect Attempt
启动和停止 Send/Receive Loop
取消旧连接的操作
关闭并 Dispose Socket
失败所有旧 Pending Request
发布一致的状态事件
决定是否进入 Reconnect
```

`Connected=true` 与 `Ready=true` 不应混为一谈。

## 22. Reconnect 不是简单的 `while(true) Connect()`

可靠重连至少包含：

```text
停止旧 Receive/Send Loop
创建全新的 Socket
建立 TCP
执行协议握手、认证和版本协商
获得新的 Session / Generation
恢复必要订阅和只读状态
再对外发布 Ready
```

旧 Socket 不应在失败后无限复用。旧连接的异步 Continuation 也不能更新新连接状态，因此常为每次连接分配 Generation ID：

```text
Generation 41 disconnected
Generation 42 connected

late callback from 41
→ 丢弃，不能修改 42
```

## 23. Exponential Backoff 与 Jitter

持续每毫秒重连会消耗 CPU、日志、网络和控制器资源。常见策略：

```text
第一次失败 → 等 0.5 s
第二次失败 → 等 1 s
第三次失败 → 等 2 s
...
最大不超过某个上限
```

再加入随机 Jitter，避免大量客户端同时恢复后在相同时间点冲击服务器。

Backoff 何时重置也要定义。刚连接成功 10 ms 就再次失败时，立即把延迟重置到最小值可能形成快速抖动；可以要求连接稳定一段时间后再重置失败计数。

安全相关系统还可能要求人工确认，而不是自动无限重连。

## 24. 重连后哪些操作可以恢复

可自动恢复的常见状态：

```text
只读订阅
遥测流配置
无副作用的状态查询
本地缓存刷新
```

不应默认自动重放：

```text
Move
Start
Stop 后又 Start
写配置
触发生产或计费的命令
```

因为断线只说明客户端不知道结果，不说明服务端没有执行。需要自动重试时，应使用幂等语义、Operation ID、服务端去重或先查询状态。

## 25. 连接断开时如何处理缓存与请求

一旦连接故障，通常需要：

```text
停止接受依赖旧 Session 的新请求
失败或分类处理所有 Pending Request
清除半帧 Receive Buffer
处置尚未发送与发送一半的 Frame
清理旧 SessionId、认证和订阅状态
记录断开原因
```

不能把旧连接的半帧 byte 放到新连接继续解析。新 TCP 连接是全新的字节流。

对于尚未发送的 Queue 项，要明确：

```text
直接失败
只保留安全的幂等请求
等待新连接后由调用者重新提交
```

## 26. Graceful Shutdown

应用主动停止时，理想流程是：

```text
停止接收新 Request
→ 取消或等待已有 Request
→ 停止 Heartbeat 和 Reconnect
→ 结束 Send Queue
→ 按协议发送可选的 Logout / Close
→ Shutdown Socket 方向
→ 关闭并 Dispose
→ 等待后台 Loop 退出
```

实际故障路径不能无限等待优雅关闭，应有总 Shutdown Deadline，超时后强制清理。

关闭 Socket 常被用来唤醒正在阻塞的 Receive，但不同 API 的异常表现可能不同。接收循环应能区分“预期停止”与“非预期网络故障”，避免正常退出也刷大量错误日志或触发重连。

## 27. 观测与日志

建议记录：

```text
Connection Generation / SessionId
Local 与 Remote Endpoint
状态转换及原因
Connect Duration
最后一次收到任何 byte 的时间
最后一次成功业务 Response 的时间
Heartbeat RTT 与连续失败数
Pending Request 数量与最老 Deadline
Send Queue 深度
Frame / Protocol Error
Reconnect Attempt 与 Backoff
SocketErrorCode 和内部异常
```

要区分不同“活跃时间”：

```text
LastTransportReceive
LastValidFrame
LastBusinessSuccess
LastHeartbeatSuccess
```

收到无效 byte 不能刷新业务健康状态；TCP Keepalive 成功也不能刷新业务处理健康状态。

## 28. 推荐的 MMI 通信结构

```text
UI / Business Callers
        │
        ▼
Request API
        │ create RequestId + Deadline
        ▼
Pending Request Table ───────────────┐
        │                            │
        ▼                            │
Bounded Send Queue                   │
        │                            │
        ▼                            │
Single Send Loop                     │
        │                            │
        ▼                            │
TCP Socket                           │
        │                            │
        ▼                            │
Single Receive Loop                  │
        │                            │
        ▼                            │
Incremental Frame Decoder            │
        │                            │
        ▼                            │
Message Dispatcher ──────────────────┘
        │
        ├── Events / Telemetry
        ├── Heartbeat Manager
        └── Connection Manager
```

横向职责还包括：

```text
Timeout / Cancellation Manager
Reconnect State Machine
Metrics and Logging
UI-safe State Publication
```

这不是唯一实现，但职责边界应当清晰：只有统一接收循环读取字节，只有 Frame Decoder 决定消息边界，只有 Dispatcher 关联 Request，只有 Connection Manager 改变连接代次。

## 29. 本章核心模型

```text
TCP retransmission
→ 修复传输层丢失，通常对应用透明

Socket Receive Timeout
→ 限制一次同步读取等待无数据的时间

Frame Assembly Timeout
→ 限制半条应用 Frame 占用连接与缓存的时间

Request Timeout
→ 限制某个业务请求等待对应 Response 的时间

TCP Keepalive
→ 探测传输层对端或路径

Application Heartbeat
→ 按协议定义验证更高层健康

Reconnect Backoff
→ 控制重新建立会话的频率和冲击
```

需要记住：

1. TCP 成功交付的是可靠、有序、无重复的字节流，不是永远在线的业务服务。
2. `Receive()` 返回正数、`0` 和抛出错误分别代表不同情况；`0` 不是暂时无数据，正数也可能只是连接失败前成功交付的 Frame 前缀。
3. 阻塞、非阻塞和异步只改变等待方式，不改变 TCP 与 Framing 语义。
4. TCP RTO 是协议栈内部机制，不能替代确定的业务 Deadline。
5. Receive Timeout 不能判断具体 Request 是否超时。
6. TCP Keepalive 与应用 Heartbeat 验证的层次不同。
7. 一个字节流连接通常应有一个接收循环和一个 Frame Decoder。
8. 请求通过应用 RequestId 分发，不应让多个业务线程竞争 Receive。
9. 重连必须清理旧连接代次、半帧、Pending Request 和异步回调。
10. 自动重试带副作用的命令可能造成重复执行。
11. 有界 Send Queue 与资源限制是完整可靠性设计的一部分。
12. `Connected` 不等于协议 `Ready`，传输层活着也不等于业务健康。

## 思考题

1. TCP 重传成功时，为什么应用可能完全不知道发生过丢包？
2. 阻塞 Socket 暂时没有数据时会怎样？为什么 `Receive()==0` 不是“暂时没数据”？
3. 非阻塞 I/O 为什么不应该用无休止的 while 重试实现？
4. `async/await` 改变了 TCP 的消息边界或可靠性语义吗？
5. TCP RTO、Receive Timeout、Frame Timeout 和 Request Timeout 分别解决什么问题？
6. 网线拔掉后，在完全空闲的连接上为什么本机可能不能立即发现？
7. TCP Keepalive 成功为什么不能证明控制器业务线程健康？
8. 为什么一个 Socket 不应让多个请求线程各自调用 Receive 等自己的响应？
9. Response 与 Timeout 同时发生时，Pending Request Table 怎样避免完成两次？
10. 重连为什么应该创建新 Socket、清除半帧并引入 Generation 或 Session？
11. 为什么 `Send()` 成功后第一次业务重试可能造成命令执行两次？
12. MMI 的 UI、连接管理、Frame 解析和业务请求应该怎样分工？

下一章将学习 **HTTP、TLS、Proxy、VPN 与抓包边界**：不同中间组件是否参与转发、在哪里终止加密，以及它们分别能看到哪些明文和元数据。

## 延伸阅读

- [Socket.Receive Method（Microsoft Learn）](https://learn.microsoft.com/en-us/dotnet/api/system.net.sockets.socket.receive)
- [Socket.ReceiveAsync Method（Microsoft Learn）](https://learn.microsoft.com/en-us/dotnet/api/system.net.sockets.socket.receiveasync)
- [Socket.ReceiveTimeout Property（Microsoft Learn）](https://learn.microsoft.com/en-us/dotnet/api/system.net.sockets.socket.receivetimeout)
- [TCP Keep-Alive（Microsoft Learn）](https://learn.microsoft.com/en-us/windows/win32/winsock/tcp-keepalive)
- [RFC 9293：Transmission Control Protocol（TCP）](https://www.rfc-editor.org/rfc/rfc9293)
- [RFC 6298：Computing TCP's Retransmission Timer](https://www.rfc-editor.org/rfc/rfc6298)

---

## 系列导航

- [学习清单与完整目录](/notes/computer-net/00-learning-roadmap/)
- [上一章：TCP 消息边界与应用层协议设计](/notes/computer-net/08-tcp-framing-protocols/)
- [下一章：HTTP、TLS、Proxy、VPN 与抓包边界](/notes/computer-net/10-http-tls-proxy-vpn/)
