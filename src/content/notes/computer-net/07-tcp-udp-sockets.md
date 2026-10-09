---
title: "TCP、UDP、端口与 Socket：从“连接成功”到“业务成功”"
description: "理解端口、Socket、TCP 与 UDP 的基本语义，区分连接成功、传输确认与业务处理成功。"
date: 2026-10-07
tags: ["计算机网络", "TCP", "UDP", "Socket"]
---

前面的章节解决了这些问题：

```text
目标 IP 在本地还是远端？
下一跳是谁？
Packet 如何经过交换机和路由器？
ICMP 测试究竟证明什么？
```

本章继续向上看传输层：

```text
应用程序
   ↓
TCP / UDP
   ↓
IP
   ↓
Ethernet / Wi-Fi
```

核心问题变成：

> IP 把 Packet 送到一台主机后，操作系统怎样把数据交给正确的程序？连接正常时，为什么业务仍可能没有回复？

对上位机、控制器和自定义协议来说，最重要的证据边界是：

```text
send() 返回成功
≠ 对端 TCP 已确认
≠ 对端应用已读取
≠ 命令已解析
≠ 业务执行成功
≠ 业务响应已返回
```

## 1. IP 找主机，Port 找传输层端点

一台主机可以同时运行浏览器、上位机、数据库和远程管理服务。目标 IP 只能标识要送往哪台主机或哪个网络接口地址，无法单独说明应交给哪个通信端点。

TCP 和 UDP Header 中都有 16 bit 的 Source Port 与 Destination Port：

```text
Destination IP
→ 找到目标主机

Transport Protocol + Destination Port
→ 在目标主机上进行传输层分用
```

这里必须把协议也算进去。`TCP 53` 与 `UDP 53` 属于不同的传输协议空间，数字相同并不表示它们是同一个端点。

端口号范围是：

```text
0 ～ 65535
```

端口 `0` 有特殊含义，通常不作为普通服务的实际通信端口。IANA 将端口号大致分为：

```text
0 ～ 1023       System / Well-Known Ports
1024 ～ 49151   User / Registered Ports
49152 ～ 65535  Dynamic / Private Ports
```

这些分类不是“某个数字永远只能被某个程序使用”的完整规则。最终能否绑定，还取决于操作系统、权限、地址、协议以及端口是否已被其他 Socket 占用。

## 2. 常见端口不是服务本身

常见约定包括：

| 协议或服务 | 常见传输方式与端口 |
| --- | --- |
| SSH | TCP 22 |
| DNS | UDP 53，也可使用 TCP 53 |
| HTTP | TCP 80 |
| HTTPS（HTTP/1.1、HTTP/2） | 通常 TCP 443 |
| HTTP/3 | QUIC，通常使用 UDP 443 |

端口号只是一项约定和寻址信息。`443` 本身不是 HTTPS，也不能保证监听该端口的程序真的使用 TLS 或 HTTP。

同一台服务器可以同时提供多个服务，例如：

```text
203.0.113.10:22/TCP   → SSH 服务
203.0.113.10:80/TCP   → HTTP 服务
203.0.113.10:443/TCP  → HTTPS 服务
```

其中 `203.0.113.0/24` 是文档示例地址段，不应把 `8.8.8.8` 之类的真实公共服务地址随意假设成运行了这些服务。

## 3. Socket、Socket Address 与 Connection 不一样

这三个概念经常被混用。

### Socket

Socket 是操作系统提供给应用的通信对象和编程接口。应用通过它执行：

```text
bind
listen
accept
connect
send / receive
close
```

程序通常不直接构造网卡要发送的每一个帧，而是把数据交给 Socket 和操作系统网络栈。

### Socket Address

在常见 IPv4 TCP/UDP 场景中，可以先把 Socket Address 理解为：

```text
IP Address + Port
```

例如：

```text
192.168.0.253:51701
```

但 Socket 本身不是这两个数字的同义词。Socket 是操作系统对象；地址是可以绑定或连接到该对象上的寻址信息。

### TCP Connection

一条 TCP 连接通常由下面的四元组区分：

```text
Local IP
Local Port
Remote IP
Remote Port
```

讨论抓包时也常写成：

```text
Source IP, Source Port, Destination IP, Destination Port
```

再结合传输协议，就能避免与 UDP 或其他网络命名空间中的端点混淆。

## 4. 服务器如何同时服务多个客户端

假设控制器在下面的端点监听：

```text
192.168.1.20:51701/TCP
```

两个客户端分别建立连接：

```text
192.168.1.10:50000 → 192.168.1.20:51701
192.168.1.11:50000 → 192.168.1.20:51701
```

虽然目标端口相同，两个连接的远端 IP 不同，因此四元组不同。即使两个连接来自同一台客户端，也可以用不同的客户端端口区分：

```text
192.168.1.10:50000 → 192.168.1.20:51701
192.168.1.10:50001 → 192.168.1.20:51701
```

服务器通常有一个 Listening Socket 等待新连接。握手完成后，操作系统为每条已建立连接提供相应的 Connected Socket：

```text
Listening Socket
192.168.1.20:51701
       │
       ├── Connection A：客户端 192.168.1.10:50000
       └── Connection B：客户端 192.168.1.11:50000
```

所以“一个端口只能有一个连接”是错误的。一个监听端口可以对应许多四元组不同的已建立连接。

## 5. 客户端为什么常使用临时端口

客户端连接服务器时，通常让操作系统从临时端口范围选择一个尚可使用的本地端口：

```text
192.168.1.10:52341 → 203.0.113.10:443
```

下一条连接可能使用：

```text
192.168.1.10:52342 → 203.0.113.10:443
```

这类端口称为 Ephemeral Port。具体动态范围和分配算法由操作系统配置决定，不能把某个示例范围当成所有设备的固定规则。

在 Windows 上可查看动态 TCP 端口范围：

```powershell
netsh int ipv4 show dynamicport tcp
```

也可以查看 UDP 或 IPv6 对应配置：

```powershell
netsh int ipv4 show dynamicport udp
netsh int ipv6 show dynamicport tcp
netsh int ipv6 show dynamicport udp
```

## 6. TCP 与 UDP 的基本语义

不能只把它们记成“TCP 慢、UDP 快”。更重要的是应用拿到的通信语义不同。

| 特性 | TCP | UDP |
| --- | --- | --- |
| 通信模型 | 面向连接 | 发送独立 Datagram |
| 应用看到的数据 | 有序 Byte Stream | 一个个 Datagram |
| 消息边界 | 不保留 | 保留 Datagram 边界 |
| 丢失处理 | TCP 重传并按序交付 | UDP 本身不重传 |
| 顺序 | 按序交付给应用 | 可能乱序 |
| 重复 | TCP 向应用提供无重复的有序字节流 | 应用可能收到重复 Datagram |
| 流量控制 | 有 | UDP 本身没有 |
| 拥塞控制 | 标准 TCP 有 | UDP 本身没有，应用协议需要负责合适的发送行为 |

“UDP 无连接”表示 UDP 协议本身不使用 TCP 那样的握手和连接状态。某些 Socket API 仍允许对 UDP Socket 调用 `connect()`，用于固定默认对端并简化收发；这不会把 UDP 变成 TCP，也不会产生三次握手或可靠交付保证。

## 7. TCP 的“可靠”究竟保证什么

只要连接仍能正常工作，TCP 试图向应用提供：

```text
按顺序的字节流
丢失后的重传
重复数据的识别
校验和错误检测
接收端流量控制
网络拥塞控制
```

TCP 的“可靠”不表示：

```text
网络永远不会断
每次数据都能在某个业务期限前到达
对端应用一定读取了数据
对端一定理解命令
业务操作一定成功
业务响应一定返回
```

如果网络持续中断，TCP 最终只能报告超时或连接错误，而不能凭空完成交付。因此更准确的说法是：

> TCP 在连接可维持的条件下提供可靠、有序的字节流，并在无法继续时向应用暴露失败；业务正确性仍由应用协议负责。

## 8. TCP 是字节流，没有业务消息边界

这是上位机开发中非常关键、却经常遗漏的一点。

假设发送端连续调用：

```text
send("ABC")
send("DEF")
```

接收端不能假设两次 `receive()` 一定分别得到：

```text
"ABC"
"DEF"
```

它可能看到：

```text
"ABCDEF"
```

也可能分成：

```text
"A"
"BCDE"
"F"
```

TCP 只保证字节顺序，不保留每次 `send()` 的边界。抓包中一个或多个 TCP Segment 的切分方式，也不等于应用协议消息的天然边界。

所以应用协议必须自己定义 Framing，例如：

```text
固定长度
长度字段 + Payload
结束符，例如 CRLF
明确的头部、长度和校验字段
```

解析器还必须处理：

```text
半包：一条业务消息只收到一部分
粘连：一次读取中包含多条业务消息
非法长度
超长消息
超时与重同步
```

“粘包”不是 TCP 把两个错误的 Packet 粘坏了，而通常是应用错误地把字节流读取边界当成了消息边界。

## 9. Sequence Number 与 ACK

TCP 使用序列号标识字节流中的位置。假设某个 Segment：

```text
Sequence Number = 100
Payload Length  = 5
Payload         = "hello"
```

如果接收端已经连续收到了这些字节，可以回复：

```text
Acknowledgment Number = 105
```

更准确的含义是：

> 下一个期望收到的字节序列号是 105；序列号到 104 为止的连续数据已经被 TCP 接收端确认。

这不是“收到了总共 105 个字节”。序列号从双方协商的初始序列号开始，而且会在 32 bit 空间中回绕。

TCP ACK 通常是累计确认。一个 ACK 可以确认此前连续收到的一段字节，不要求每个 Segment 都对应一个独立、立即返回的 ACK。接收端还可能使用 Delayed ACK；现代 TCP 也可能协商 SACK 来描述非连续到达的数据块。

### SYN 和 FIN 为什么让确认号加 1

SYN 和 FIN 即使不携带 Payload，也各自占用一个序列号。纯 ACK 本身不占用序列号。

假设客户端选择的 Initial Sequence Number（ISN）是 `1000`：

```text
Client                                      Server

SYN, Seq=1000
        ---------------------------------->

                              SYN + ACK, Seq=5000, Ack=1001
        <----------------------------------

ACK, Seq=1001, Ack=5001
        ---------------------------------->
```

第一份 SYN 没有 Payload，但它占用了序列号 `1000`，所以客户端后续字节从 `1001` 开始，服务器确认 `Ack=1001`。服务器的 SYN 同样占用 `5000`，所以客户端确认 `Ack=5001`。

FIN 的规则相同：

```text
FIN, Seq=2000
→ 对端在连续收到它后确认 Ack=2001
```

可以用下面的规则理解一个连续、没有缺口的新 Segment 结束在哪里：

```text
占用的序列空间
= TCP Payload Length
+ SYN（如果置位则加 1）
+ FIN（如果置位则加 1）
```

于是下一期待序列号通常可写成：

```text
Next Expected Seq
= Segment Seq
+ Payload Length
+ SYN/FIN 占用
```

但不能把它机械地套到每个抓包行上作为“该行对应的 ACK 公式”，因为 ACK 是累计的，还会受到重传、乱序、缺口、Delayed ACK 和抓包缺失的影响。

SYN、FIN 进入序列号空间的价值在于：TCP 可以明确确认“连接开始”和“该方向字节流结束”这两个状态事件，而不是把它们当成无法确认的带外提示。

### TCP Payload Length 从哪里来

TCP Header 没有一个直接命名为 `Payload Length` 的字段。TCP Data Offset 字段表示 TCP Header 自身的长度；Payload 长度要结合外层 IP 长度计算。

以没有 IPv4 分片的常见 Packet 为例：

```text
TCP Payload Length
= IPv4 Total Length
- IPv4 Header Length
- TCP Header Length
```

例如：

```text
IPv4 Total Length = 1500
IPv4 Header Length = 20
TCP Header Length = 32

TCP Payload Length = 1500 - 20 - 32 = 1448 bytes
```

这里的 `1500` 是 IPv4 Total Length，不是 Ethernet Frame 的完整线上长度。IPv4 Options、TCP Options、IPv6 Extension Header、分片以及抓包卸载都会让实际分析更复杂。Wireshark 通常已经计算并显示 `TCP Len`，分析时不必总靠手算。

### `ACK=1005` 不是“回复第 1005 个字节”

假设控制器连续收到：

```text
Seq = 1000
TCP Payload Length = 5
```

它回复 `Ack=1005` 的含义是：

> 当前连续字节已经收到至序列号 1004，下一步期待从 1005 开始。

ACK Number 描述字节流位置，不是应用回复内容，也不是“总共处理了 1005 字节”。

## 10. TCP 如何处理丢失和乱序

假设发送端依次发送三段数据：

```text
Segment A
Segment B
Segment C
```

网络可能让 B 丢失，而 C 先到达。接收端可以暂存乱序数据，但通常不能先把 C 中的后续字节作为连续字节流交给应用。发送端通过重传超时、重复 ACK 等信号判断需要重传；在支持相应机制时，SACK 还能帮助发送端更精确地知道哪些范围已经到达。

这带来 TCP 层面的 Head-of-Line Blocking：

```text
前面的字节缺失
→ 后面的字节即使已经到达
→ 也不能越过缺口按序交给应用
```

## 11. TCP 三次握手

假设客户端初始序列号为 `x`，服务器初始序列号为 `y`：

```text
Client                                      Server

SYN, Seq=x
        ---------------------------------->

                              SYN + ACK, Seq=y, Ack=x+1
        <----------------------------------

ACK, Seq=x+1, Ack=y+1
        ---------------------------------->
```

SYN 会占用一个序列号，所以确认号是初始序列号加 1。

常见状态变化可以简化为：

```text
Client: CLOSED → SYN-SENT → ESTABLISHED
Server: LISTEN → SYN-RECEIVED → ESTABLISHED
```

客户端收到合法的 SYN+ACK 后进入 Established，并发出第三次 ACK；服务器收到这个 ACK 后进入 Established。第三次 ACK 在某些情况下可以同时携带应用数据，因此不能把握手图误解成每一步都必须是一个完全不带数据的独立 Packet。

## 12. 为什么是三次握手

三次握手的核心目标是：

```text
双方交换并确认各自的初始序列号
双方建立一致的连接状态
降低网络中旧的、重复的连接请求造成错误连接的风险
协商 MSS、窗口扩大、SACK、时间戳等 TCP 选项
```

用“确认双向收发能力”可以帮助入门理解：

```text
Client SYN
→ Server 知道客户端到服务器方向可达，并得知 x

Server SYN+ACK
→ Client 知道服务器收到 SYN，也得知 y

Client ACK
→ Server 知道自己的 SYN 已被客户端确认
```

但这只是结果层面的直观描述。更准确的协议原因是双方都必须确认对方的初始序列号并建立匹配状态，而不是简单地“互相问好三次”。

第二次和第三次报文中的 `Ack=x+1`、`Ack=y+1`，正是因为双方的 SYN 各占用了一个序列号，而不是因为 SYN 含有 1 byte Payload。

握手成功可以证明目标 TCP 端点在当时完成了连接建立过程，但不能证明：

```text
服务器应用已经 accept() 并开始处理
双方使用相同的应用协议
认证一定成功
后续命令一定得到业务响应
连接之后不会立即断开
```

## 13. LISTEN 与 ESTABLISHED 表示什么

服务器通常执行类似流程：

```text
socket()
bind(local address, port)
listen()
accept()
```

`LISTEN` 表示 TCP 端点正在等待传入连接，不表示已经与某个客户端建立数据连接。

客户端通常执行：

```text
socket()
connect(remote address, port)
```

连接完成后，双方可观察到 `ESTABLISHED`。这个状态描述的是 TCP 状态机，不是业务状态机：

```text
TCP ESTABLISHED
≠ 用户已登录
≠ 控制器已进入 Remote Mode
≠ 设备已准备执行命令
```

## 14. `send()` 成功、TCP ACK 与业务回复

假设上位机发送：

```text
?PST
```

完整路径可能是：

```text
上位机生成命令
   ↓
send() 把字节交给本机 Socket
   ↓
本机 TCP 发送、必要时重传
   ↓
控制器 TCP 接收并确认字节
   ↓
控制器应用 read()/receive()
   ↓
应用协议拆帧与解析
   ↓
检查状态、权限和参数
   ↓
执行业务逻辑
   ↓
生成业务响应
   ↓
响应沿反方向返回并由上位机解析
```

### `send()` 返回成功

通常只表示本次调用接受了一定数量的字节进入本机发送路径。它不表示这些字节已经到达对端。调用还可能只接受部分字节；应用必须检查返回值并处理剩余数据。

### 收到 TCP ACK

说明相应字节已经被对端 TCP 实现接收并确认。对端应用可能尚未读取、尚未得到完整业务帧，或读取后尚未完成处理。

### 收到业务响应

这才证明对端应用至少生成并发送了某种应用协议消息。但是否表示操作成功，还要看响应中的状态码、错误码、事务 ID 和协议语义。

因此下面的抓包完全可能成立：

```text
MMI         -------- ?PST bytes -------->  Controller
MMI         <----------- TCP ACK --------  Controller
MMI         <------ 没有业务 Payload ----  Controller
```

这说明 TCP 接收端确认了相关字节，但单凭 ACK 无法判断控制器应用是否读取、解析或执行了命令。

## 15. 为什么 TCP ACK 不能证明应用处理成功

TCP 由操作系统网络栈处理，而业务逻辑通常运行在用户态进程或设备固件任务中：

```text
网卡
 ↓
驱动与 IP/TCP 处理
 ↓        ↘ TCP ACK 可以在这里产生
Socket Receive Buffer
 ↓
应用读取
 ↓
协议解析
 ↓
业务执行
```

Socket 是应用访问网络栈的操作系统对象和 API 抽象，但通常不是“Socket 自己执行协议算法”。ACK、重传、接收窗口和 TCP 状态机主要由操作系统内核的 TCP/IP 协议栈处理；应用通常只通过 `send()`、`receive()`、错误码和 Socket 状态间接感知这些过程。

即使 TCP 已确认，后续仍可能发生：

```text
应用线程阻塞或崩溃
应用长时间没有读取 Socket
接收队列或业务队列积压
缺少结束符，尚未组成完整命令
长度字段或校验失败
字符编码不一致
命令格式或状态不合法
应用处理成功但响应路径故障
响应已返回但客户端解析失败
```

“ACK 正常，所以控制器程序正常”是跨层过度推断。

## 16. 上位机通信的分层排查

面对“一问一答没有回复”，可以按证据逐层缩小范围。

### 连接能否建立

如果三次握手无法完成，优先检查：

```text
目标 IP 与路由
ARP 或下一跳
目标端口是否正确
服务器是否监听
防火墙策略
连接数与 Listen Backlog
```

常见抓包证据：

```text
只有重复 SYN
→ 没看到有效 SYN+ACK

SYN 后收到 RST
→ 目标或中间设备明确拒绝；常见原因是没有相应监听端点
```

RST 的来源和上下文仍需结合抓包判断，不能机械地把所有 RST 都解释成“服务没启动”。

### `send()` 是否完整提交

检查：

```text
返回的字节数
异常或错误码
Socket 是否已关闭
并发写入是否破坏应用帧
```

### 对端 TCP 是否确认

抓包查看：

```text
发送方向是否真的带有 Payload
Sequence Number 与 ACK Number
是否重传
是否出现 Zero Window
是否出现 RST 或 FIN
```

### 应用帧是否完整正确

检查：

```text
命令内容与编码
头部、长度、结束符和校验
事务 ID 或序号
设备当前模式与权限
协议要求的请求间隔
```

### 响应在哪里消失

可能是：

```text
控制器没有生成响应
响应在网络中丢失并最终超时
客户端未继续读取
客户端读到了半帧
客户端解析或匹配事务失败
```

## 17. UDP 与实时数据

UDP 没有 TCP 的按序等待和重传，因此对于“旧数据过期、最新状态更重要”的场景，应用可以自行决定丢弃旧 Datagram，而不必等待前面的丢失数据补齐。例如：

```text
位置快照
姿态遥测
音视频媒体
在线游戏状态
```

但不能据此得出“UDP 天生适合所有实时控制”。UDP 本身不提供：

```text
交付保证
顺序保证
重复抑制
流量控制
拥塞控制
会话状态
身份认证与加密
```

需要这些能力时，应用协议必须按需求补充，例如：

```text
Sequence Number
Timestamp
丢失与乱序检测
过期数据丢弃
关键消息 ACK 与有限重传
速率限制
完整性校验与认证
Fail-safe 行为
```

尤其涉及人身或设备安全的控制系统，选择 TCP 还是 UDP 不能只看延迟；必须结合截止时间、故障模型、安全标准、网络拓扑和应用级安全机制设计。

## 18. 什么时候更适合 TCP 或 UDP

以下只是常见倾向，不是绝对规则。

### 一问一答的配置或查询命令

TCP 往往合适，因为：

```text
每个请求字节都重要
通常要求按顺序处理
丢失后重传通常比静默跳过更合理
连接可承载多次请求和响应
```

不过应用仍需定义：

```text
消息边界
请求与响应的关联方式
业务超时
错误码
幂等性与重试规则
```

TCP 重传不能替代业务重试设计。例如客户端超时后重发“启动设备”命令时，必须考虑第一次命令其实已经执行、只是响应丢失的可能。

### 高频状态更新

UDP 可能更合适，因为应用可以直接使用最新 Datagram 并丢弃过期数据，避免 TCP 字节流的队头阻塞。但如果业务需要每个状态都完整、按序到达，TCP 或其他可靠协议可能更合适。

### 不是二选一

同一系统可以组合使用：

```text
TCP：配置、认证、任务下发
UDP：高频遥测或媒体
应用层：序号、时间戳、健康检测和安全策略
```

## 19. TCP 连接如何关闭

TCP 是全双工的，两个发送方向可以分别关闭。典型的有序关闭可以画成四个 Segment：

```text
Endpoint A                                  Endpoint B

FIN
        ---------------------------------->

                                             ACK
        <----------------------------------

                                             FIN
        <----------------------------------

ACK
        ---------------------------------->
```

之所以常说“四次挥手”，是因为一端收到 FIN 后可以先确认，而自己的发送方向稍后再关闭。但 ACK 与 FIN 也可能合并，因此抓包中不一定机械地看到四个独立 Packet。

FIN 表示：

> 发送 FIN 的这一方不会再发送新的字节。

它不自动关闭反方向，所以 TCP 支持 Half-Close。主动关闭的一方通常还会经历 `TIME_WAIT`，以便处理延迟到达的 Segment，并避免旧连接中的报文干扰后续复用相同四元组的连接。

RST 与 FIN 不同。RST 表示复位或异常终止，通常不会像有序 FIN 关闭那样完成剩余数据的正常交付。

## 20. Windows 上观察 TCP 与 UDP

### 查看 TCP 连接和监听端点

```powershell
netstat -ano -p tcp
```

常见列包括：

```text
Local Address
Foreign Address
State
PID
```

PowerShell 可以使用：

```powershell
Get-NetTCPConnection
Get-NetTCPConnection -State Established
Get-NetTCPConnection -State Listen
```

按端口筛选示例：

```powershell
Get-NetTCPConnection -RemotePort 51701
Get-NetTCPConnection -LocalPort 51701
```

注意客户端视角的服务器端口通常是 `RemotePort`，服务器本机视角的监听端口是 `LocalPort`。

### 查看 UDP 端点

UDP 没有 TCP 的 `LISTEN`、`SYN-SENT` 或 `ESTABLISHED` 状态。可以查看本地 UDP 端点：

```powershell
Get-NetUDPEndpoint
netstat -ano -p udp
```

### 从 PID 找进程

```powershell
Get-Process -Id 1234
```

需要管理员权限才能完整查看某些进程或连接信息；短连接也可能在命令执行前已经消失。

## 21. 使用 Wireshark 观察

### 观察三次握手

显示过滤器：

```text
tcp.port == 51701
```

寻找：

```text
SYN
SYN, ACK
ACK
```

只筛选初始 SYN：

```text
tcp.flags.syn == 1 && tcp.flags.ack == 0
```

### 观察带业务数据的 TCP Segment

```text
tcp.port == 51701 && tcp.len > 0
```

不要把 `PSH, ACK` 当成业务消息边界或业务处理成功的标志。

- `ACK` Flag 在连接建立后的绝大多数 TCP Segment 中都会置位。通常所说的“纯 ACK”至少应满足 `ACK` 置位且 `tcp.len == 0`，同时没有 SYN、FIN、RST 等需要单独解释的控制语义；所以 `tcp.len == 0` 是重要条件，但单凭它仍不充分。
- `PSH` 是发送端向接收 TCP 提供的交付提示，不表示“一条完整应用消息”。
- 带有应用数据的 Segment 不一定设置 PSH；设置 PSH 的 Segment 也不能单独证明里面恰好是一条完整业务响应。
- 一条应用消息可以跨多个 Segment，一份 Segment 也可以包含多条应用消息的字节。

因此判断是否真的有业务数据，优先看：

```text
tcp.len > 0
TCP Payload
Wireshark 的应用层解析或 Reassembled Data
应用协议自己的长度、结束符、事务 ID 和消息类型
```

`PSH, ACK, Len=162` 可以作为“这个 Segment 携带 162 byte TCP Payload”的线索，其中真正证明有 Payload 的是 `Len=162`，不是 PSH 本身。

Wireshark 默认可能显示相对 Sequence Number，便于阅读；它不一定是线上 Header 中的原始 32 bit 数值。

检查请求后是否只有纯 ACK 时，不要只看 Info 列的文字。应结合：

```text
TCP Payload Length
Sequence Number
Acknowledgment Number
重传与乱序分析标记
往返方向
```

### 观察连接问题

```text
tcp.flags.reset == 1
tcp.analysis.retransmission
tcp.analysis.zero_window
```

Wireshark 的 `tcp.analysis.*` 是分析器根据抓到的 Packet 推断出的结果。抓包点遗漏数据、网卡卸载和乱序都可能影响判断，因此它是证据和线索，不是操作系统内部状态的绝对真相。

## 22. 本章核心模型

```text
IP Address
→ 把 Packet 送到目标主机

TCP/UDP + Port
→ 让目标主机进行传输层分用

Socket
→ 应用使用操作系统网络栈的通信对象

TCP Connection
→ 由本地/远端 IP 与 Port 的组合区分
```

对一次 TCP 业务交互，应按下面的证据链理解：

```text
三次握手成功
→ TCP 连接状态建立

send() 接受字节
→ 字节进入本机发送路径

收到 TCP ACK
→ 对端 TCP 确认相应字节

收到应用响应
→ 对端应用至少生成了协议消息

响应表示 Success
→ 按应用协议语义判断业务结果
```

需要记住：

1. Port 是 TCP/UDP Header 中的 16 bit 字段，端口号必须结合传输协议理解。
2. Socket 是操作系统通信对象；Socket Address 才是地址与端口的组合。
3. TCP 连接通常用本地 IP、Local Port、远端 IP、Remote Port 的四元组区分。
4. 一个监听端口可以承载许多四元组不同的连接。
5. TCP 提供可靠、有序的字节流，但没有应用消息边界。
6. 应用必须正确处理部分发送、半包、一次读取多条消息和业务超时。
7. 三次握手用于交换并确认双方初始序列号、建立连接状态及协商选项；SYN 和 FIN 各占用一个序列号。
8. `send()` 成功、TCP ACK、应用读取、业务处理和业务成功是不同层次的证据。
9. UDP 保留 Datagram 边界，但不保证交付、顺序或去重。
10. TCP 与 UDP 的选择取决于业务语义、截止时间和故障处理要求，不能简化成“可靠对快速”。
11. `PSH, ACK` 不是应用消息边界；是否携带数据应查看 TCP Payload Length 和重组后的应用消息。

## 思考题

1. 为什么只写 `51701` 还不足以唯一描述一个网络端点？
2. 两台客户端都连接服务器的 TCP 51701 时，服务器如何区分两条连接？
3. Socket、Socket Address 和 TCP Connection 有什么区别？
4. `send("ABC")` 后再 `send("DEF")`，为什么接收端不能假设会收到两个对应的 `receive()`？
5. `Seq=100`、Payload 长度为 5 时，`Ack=105` 的准确含义是什么？它为什么不表示“处理了 105 个字节”？
6. TCP 三次握手主要建立和确认了什么？为什么 SYN 没有 Payload 却使 ACK Number 加 1？
7. 上位机命令已经得到 TCP ACK，却没有业务响应，至少有哪些可能原因？
8. 为什么 `send()` 返回成功不能证明数据已经到达控制器？
9. UDP 用于高频状态更新时，应用层通常还需要补充哪些机制？
10. 为什么涉及副作用的命令不能在超时后不加判断地无限重试？
11. 为什么不能只看 `PSH, ACK` 就断定收到了一条完整业务回复？

下一章将深入学习 **TCP 消息边界与应用层协议设计**：如何从连续 Byte Stream 中提取完整 Frame，以及 Length、RequestId、Timeout 和 Nagle 在上位机协议中分别解决什么问题。

## 延伸阅读

- [RFC 9293：Transmission Control Protocol（TCP）](https://www.rfc-editor.org/rfc/rfc9293)
- [RFC 768：User Datagram Protocol（UDP）](https://www.rfc-editor.org/rfc/rfc768)
- [Service Name and Transport Protocol Port Number Registry（IANA）](https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.xhtml)
- [Get-NetTCPConnection（Microsoft Learn）](https://learn.microsoft.com/en-us/powershell/module/nettcpip/get-nettcpconnection)
- [Get-NetUDPEndpoint（Microsoft Learn）](https://learn.microsoft.com/en-us/powershell/module/nettcpip/get-netudpendpoint)

---

## 系列导航

- [学习清单与完整目录](/notes/computer-net/00-learning-roadmap/)
- [上一章：ICMP、ping 与 tracert：一次测试究竟证明了什么](/notes/computer-net/06-icmp-ping-tracert/)
- [下一章：TCP 消息边界与应用层协议设计](/notes/computer-net/08-tcp-framing-protocols/)
