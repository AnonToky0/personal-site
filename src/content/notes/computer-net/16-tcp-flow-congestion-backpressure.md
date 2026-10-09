---
title: "TCP 流量控制、拥塞控制与背压"
description: "区分接收窗口与拥塞窗口，理解 ZeroWindow、重传和应用背压的证据边界及排查方法。"
date: 2026-10-08
tags: ["计算机网络","TCP","背压"]
---

TCP 不只负责排序、确认和重传，还需要限制发送方放入连接的数据量。本章承接 [Socket 编程模型](/notes/computer-net/09-socket-lifecycle/)，把窗口、应用消费速度与 MMI/Controller 抓包联系起来。

## 1. 对话核验：主线正确，结论要有边界

| 对话表述 | 核验与补充 |
|---|---|
| `rwnd` 保护接收方，`cwnd` 控制网络负载 | 正确；两者按发送方向分别维护 |
| 发送窗口约为 `min(rwnd, cwnd)` | 可作入门模型，但新数据额度还要扣除已发送未确认数据 |
| ZeroWindow 表示缓冲区满了 | 更准确是接收方通告可接收窗口为零，不能推断应用完全停止处理 |
| 收到 ZeroWindow 说明网络和 TCP 栈正常 | 只能说明该通告到达抓包点；不能证明整条路径或对端整体正常 |
| 重传意味着网络拥塞 | 重传是线索；也可能是 ACK 丢失、乱序、路径故障或抓包分析误判 |
| 慢启动从 `1, 2, 4…` 增长 | 是示意；初始窗口不固定为一个 Segment，也不总是精确翻倍 |
| `Send()` 成功不等于对端收到 | 正确；数据此时可能已发出，不能说“一定还没发送” |

## 2. Receive Buffer 与接收窗口

```text
网络 → 接收端 TCP Receive Buffer → 应用 Receive()/Read() → 业务处理
```

应用读取慢，缓冲中的数据通常会累积。接收方通过 TCP Window 字段通告还能接受的字节范围。`rwnd` 是通告的接收额度，不必等于缓冲容量减去已占空间的简单算术值；实现还可能考虑内存压力和窗口更新策略。

在不考虑序列号回绕、SYN/FIN 和缩放的示例中：

```text
ACK = 1000，Window = 500
累计确认到 999；接收窗口覆盖 [1000, 1500)，即 1000～1499
```

窗口以 ACK 为左边界，不是“收到 ACK 后额外再发 500 字节”。若 1000～1299 已发送但未确认，窗口内只剩 200 字节可用于新数据。ACK 前进时窗口向前移动，通告大小也可能变化。[TCP 规范 §3.8.6](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.8.6)

### Window Scale

Header 中原始 Window 是 16 bit，最大值为 65535。握手成功协商 Window Scale 后，后续有效窗口可按 `原始值 × 2^shift` 计算，因此可以超过 64 KiB。SYN/SYN-ACK 自身的窗口字段不缩放；两个方向的缩放因子可以不同。Wireshark 应区分原始 Window 与 Calculated Window，最好从握手开始抓包。[RFC 7323 §2](https://www.rfc-editor.org/rfc/rfc7323.html#section-2)

## 3. ZeroWindow 与窗口恢复

`Controller → MMI: Window = 0` 表示 Controller 当前不给 MMI 新数据的接收额度。先检查 Controller 的 Receive Loop、线程阻塞、消费速度和内存资源，不能仅凭该包认定具体原因。

应用读走数据后，TCP 可以通告正窗口。发送端仍会进行零窗口探测，以免窗口恢复通知丢失后永久等待。零窗口不意味着连接立即断开，也不意味着所有 ACK 和控制报文停止。[TCP 规范 §3.8.6.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.8.6.1)

## 4. Congestion Window 与新数据额度

`cwnd` 是发送端根据网络反馈维护的拥塞窗口，不是 TCP Header 中由对端通告的字段。接收端有空间，也不能无限增加网络中的在途数据。

```text
在途额度的入门模型 ≈ min(rwnd, cwnd)
可发送的新数据 ≈ max(0, min(rwnd, cwnd) - FlightSize)
```

`FlightSize` 是已发送、尚未累计确认的数据量。这个式子用于正常发送的直觉；SACK、重传恢复、窗口收缩与 pacing 的实现还需更细的计数和规则。

例如 `rwnd = 1 MiB`、`cwnd = 32 KiB`、在途数据 `24 KiB`，主要受 `cwnd` 限制，新数据约还能发 `8 KiB`，不是额外再发 `32 KiB`。[RFC 5681 §2](https://www.rfc-editor.org/rfc/rfc5681.html#section-2)

窗口单位是字节，不是 bytes/s。在持续发送、窗口为主要瓶颈时，吞吐可粗略估为 `窗口 / RTT`，实际仍受带宽、应用供给和丢包等限制。例如 64 KiB 窗口、100 ms RTT 对应约 640 KiB/s 的窗口上限直觉。[RFC 7323 §1.1](https://www.rfc-editor.org/rfc/rfc7323.html#section-1.1)

## 5. 拥塞反馈与经典算法

经典 TCP 根据超时和重复 ACK 等反馈推断丢包。重复 ACK 也可能源自乱序，单个 Duplicate ACK 不等同于拥塞。ECN 可让支持它的网络设备标记拥塞，由端点反馈，不必先丢包。[RFC 3168](https://www.rfc-editor.org/rfc/rfc3168.html)

以经典 Reno 思路理解：

- Slow Start：从较小窗口开始，确认新数据的 ACK 推动快速增长；理想条件下每 RTT 近似翻倍。
- Congestion Avoidance：达到 `ssthresh` 附近后转为较缓增长，典型约每 RTT 增加一个 MSS。
- Fast Retransmit / Recovery：经典算法通常以三个重复 ACK 触发快速重传并调整窗口。
- RTO：超时通常采取更保守的退让，重新进入慢启动；不能把所有丢包反应都概括为“减半”。

这些是经典模型，不是所有现代实现的精确状态机。CUBIC、BBR 等不能统一解释成一套 Reno 的 AIMD 规则。[RFC 5681 §3](https://www.rfc-editor.org/rfc/rfc5681.html#section-3)

## 6. Send、ACK 与业务回复

```text
Send() 成功 → 本地 Socket 接受了返回值所指示的字节
TCP ACK     → 对端 TCP 确认了相应字节范围
业务回复    → 按应用协议表达接收、执行或完成状态
```

三层不可互相替代。业务回复是否代表“执行完成”，取决于协议定义。检查 `Socket.Send()` 返回的字节数，并正确处理部分发送；非阻塞 Socket 缓冲不足可能报 WouldBlock，阻塞发送可能等待缓冲空间，异步发送也可能等待或失败。[Microsoft Socket.Send 文档](https://learn.microsoft.com/en-us/dotnet/api/system.net.sockets.socket.send)

对端零窗口 → 本地 TCP 无法持续发送新数据 → Send Buffer 逐渐满 → 压力传回应用。这就是背压。应用仍需有界发送队列和超时策略，不能通过无限堆积任务或扩大缓冲掩盖消费速度不足。相关设计见 [第 09 章](/notes/computer-net/09-socket-lifecycle/)。

## 7. MMI/Controller 抓包排障

| 观察 | 优先检查 | 不能直接推出 |
|---|---|---|
| Controller 通告零窗口 | Controller 读取速度、缓冲与资源 | 整条网络正常，或应用一定死锁 |
| MMI 通告零窗口 | MMI Receive Loop、业务线程与队列 | Controller 接收缓冲满 |
| 重传、重复 ACK | 数据及 ACK 路径、乱序、双方状态 | 必定拥塞或网线损坏 |
| RTT 上升 | 排队、路径变化与端点调度 | 单凭 RTT 定位具体 Router |
| TCP ACK 正常但业务超时 | 解帧、RequestId、线程和业务执行 | 对端业务已经成功 |

Wireshark 显示过滤器（先替换 Flow 编号）：

```text
tcp.stream eq 3
tcp.analysis.zero_window
tcp.analysis.zero_window_probe
tcp.analysis.window_update
tcp.analysis.retransmission || tcp.analysis.fast_retransmission
tcp.analysis.duplicate_ack
```

分析标记基于抓到的报文推导。抓包遗漏、从连接中途开始抓取和 Offload 会影响结果。普通抓包没有直接提供发送端 `cwnd`；精确了解它需结合端点 TCP 诊断信息。[Wireshark TCP Analysis](https://www.wireshark.org/docs/wsug_html_chunked/ChAdvTCPAnalysis.html)

一次排查应记录窗口方向、零窗口持续时间、恢复通知、发送返回值与双方应用日志。可在自有测试环境模拟慢读取，观察窗口收缩及恢复；这只是实验方案，本笔记未执行此实验。

## 思考题与答案要点

1. `rwnd` 与 `cwnd` 分别保护什么？——接收端容量与网络负载。
2. 应用不读为什么可能零窗口？——数据累积，接收端不再通告新额度。
3. `rwnd=1 MiB`、`cwnd=32 KiB` 能否再发 32 KiB？——还要看已有在途数据。
4. 零窗口与重传先查哪里？——前者先查通告方消费能力，后者结合数据及 ACK 路径与抓包质量。
5. `Send()` 返回是否代表执行成功？——只确认本地接受的字节数，业务结果由协议确认。

下一章：[SSH Tunnel：本地转发、远程转发与动态代理](/notes/computer-net/17-ssh-tunnels-forwarding/)。

---

## 系列导航

- [学习清单与完整目录](/notes/computer-net/00-learning-roadmap/)
- [上一章：IPv6：地址、邻居发现与双栈排障](/notes/computer-net/15-ipv6-neighbor-discovery-dual-stack/)
- [下一章：SSH Tunnel：本地转发、远程转发与动态代理](/notes/computer-net/17-ssh-tunnels-forwarding/)
