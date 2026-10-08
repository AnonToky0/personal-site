---
title: "Wireshark 综合实战"
description: "选择抓包接口与过滤条件，从 DNS、TCP、TLS 和应用数据中还原连接过程与故障证据。"
date: 2026-10-08
tags: ["计算机网络","Wireshark","抓包"]
---

Wireshark 的价值不在于背菜单，而在于把抽象模型变成证据：

```text
应用有没有发出请求？
名称解析问了谁、答了什么？
路由选择后的当前二层下一跳是谁？
TCP 握手、ACK、窗口与关闭发生了什么？
TLS 在哪里开始？
抓包里没有明文，是没有业务数据还是因为它被加密？
```

本章目标是建立一套可重复的工作流：

> 先明确故障时间和 Flow，再选正确抓包点，用最少的过滤条件定位事件，最后只得出 Packet 真正支持的结论。

## 1. Wireshark 是观察者，不是 Proxy

典型抓包路径：

```text
Application
   ↓
OS Network Stack
   ↓
Capture Interface ── copy ──> Wireshark
   ↓
Network
```

Wireshark 通常读取抓包机制提供的 Packet 副本，不替双方转发。停止 Wireshark 一般不会中断连接；停止必经 Proxy、VPN Gateway 或 Relay 则可能中断通信。

但“旁路”不表示它能看到机器中的所有网络事件。它只能观察选定抓包点暴露的内容。

## 2. 抓包点决定能看到什么

同一台 Windows 主机可能有：

```text
Physical Ethernet
Wi-Fi
Loopback
TUN / TAP / VPN Adapter
Hyper-V / VM Virtual Switch
Container Interface
```

不同抓包点可能看到：

```text
Loopback
→ Application 与 Local Proxy 之间的连接

TUN
→ VPN 加密封装前的 Inner IP Packet

Physical NIC
→ 到 VPN Server 的 Outer Encrypted Flow

Controller Ethernet
→ MMI 与工业设备之间的本地 Flow
```

抓错接口时，“没有 Packet”只证明这个抓包点没看到，不证明系统没有通信。

## 3. Wi‑Fi 抓包的链路层边界

在 Windows 普通 Wi‑Fi 接口上抓包时，驱动或 Npcap 可能向 Wireshark呈现经过转换的 Ethernet-like Header，而不是完整原始 IEEE 802.11 空中帧。若使用支持 Monitor Mode 的适配器和捕获方式，才可能看到：

```text
Radiotap
802.11 Frame Control
多个 Address Field
BSSID
Management / Control Frame
```

因此看到 `Ethernet II` 不能直接断言空中实际使用了 Ethernet Frame；它描述的是该捕获接口交给抓包程序的链路层视图。

在普通主机视角中，显示的 Destination MAC 常对应 IP 下一跳的邻居地址。但 Wi‑Fi AP、Proxy ARP、虚拟交换、桥接和驱动转换都会影响可见地址，最终应结合 Neighbor Table、抓包接口和网络拓扑判断。

## 4. Capture Filter 与 Display Filter

### Capture Filter

在抓包前决定哪些 Packet 被保存，通常使用 BPF 风格语法：

```text
host 8.8.8.8
tcp port 51701
net 192.168.0.0/24
```

未匹配的数据不会进入 Capture File，事后无法恢复。

### Display Filter

对已经捕获的数据进行显示筛选：

```text
icmp
dns
tcp.port == 51701
ip.addr == 192.168.0.253
```

入门和未知故障通常先用范围适中的 Capture，再用 Display Filter 逐步缩小。但在高速或长时间环境中无条件全抓会迅速产生巨大文件，应使用受控 Capture Filter、Ring Buffer 和时间窗口。

## 5. 抓包前先记录问题上下文

不要从一份 100 GB 文件里盲找。先记录：

```text
故障开始和结束时间
客户端与服务端 IP
Transport Protocol 和 Port
应用命令或 RequestId
是否通过 Proxy / VPN
预期响应时间
复现步骤
两端时钟是否同步
```

最好在复现时加入可识别事件，例如应用日志中的 RequestId；不要为了标记而向生产设备发送未知命令。

## 6. Capture File 可能包含敏感数据

PCAP/PCAPNG 可能保存：

```text
明文协议凭据
Cookie、Token 或业务数据
内部 IP 与拓扑
DNS 查询名称
设备标识
TLS Handshake Metadata
若另有 Key Log，甚至可解密对应会话
```

抓包前应获得必要授权，限制范围和时长；分享前脱敏，并将 Capture 与 TLS Key Log 视为敏感材料。Wireshark 不是绕过访问权限的理由。

## 7. 从 Conversation 缩小范围

常用 Display Filter：

```text
ip.addr == 192.168.0.253
tcp.port == 51701
ip.addr == 192.168.0.253 && tcp.port == 51701
```

方向过滤：

```text
ip.src == 192.168.0.253
ip.dst == 192.168.0.253
```

识别某条 TCP Stream 后，可使用：

```text
tcp.stream == 7
```

Stream Index 是当前 Capture 中 Wireshark 的编号，不是线上 TCP 字段。

## 8. 实验一：观察 ARP

显示过滤器：

```text
arp
```

如果目标邻居已经在 Cache 中，随后通信不需要重新 ARP，因此可能看不到 Request。先只读查看：

```powershell
arp -a
Get-NetNeighbor -AddressFamily IPv4
```

需要实验时，优先选择尚未访问的同链路测试地址，或在明确授权和影响范围后仅删除指定动态邻居项。不要在生产机器上无差别清空全部 Neighbor Cache。

ARP Request 常见证据：

```text
Ethernet Destination = ff:ff:ff:ff:ff:ff
ARP Opcode = Request
Sender Protocol Address = 本机 IPv4
Target Protocol Address = 待解析 IPv4
```

ARP Reply 常见证据：

```text
Opcode = Reply
Sender Protocol Address = 目标 IPv4
Sender Hardware Address = 对方声称的 MAC
```

ARP 本身没有认证。Reply 表示收到了一项地址声明，不构成设备身份的密码学证明。

## 9. 实验二：验证最终 IP 与当前下一跳

执行：

```powershell
ping -n 1 8.8.8.8
```

在本机 LAN 接口观察发出的 Echo Request：

```text
IP Source      = 本机 IP
IP Destination = 8.8.8.8

Visible L2 Source      = 本机接口地址
Visible L2 Destination = 本地下一跳对应地址
```

如果 `8.8.8.8` 不在本地 Prefix，Route Table 选择 Gateway；ARP 解析的是 Gateway，而不是 `8.8.8.8`。

回程在同一抓包点常显示为：

```text
IP Source      = 8.8.8.8
IP Destination = 本机 IP

Visible L2 Source      = 本地网络的上一跳
Visible L2 Destination = 本机接口
```

所以严格说是同一对本地链路地址方向反转，而不是“去程与回程 MAC 完全相同”。

## 10. 如何确认 MAC 是否属于默认网关

Windows 可对照：

```powershell
Get-NetIPConfiguration
Get-NetNeighbor -AddressFamily IPv4
arp -a
```

若默认网关 IP 对应的 Neighbor Entry 与 Capture 中下一跳 MAC 一致，可以得出：

> 本机协议栈当前把该网关 IP 解析为这个链路层地址，并用它发送这次 Flow。

这比“根据厂商名称猜设备”可靠。OUI Vendor 只反映地址前缀注册信息，可能受虚拟 MAC、地址重写、设备模块厂商和数据库版本影响，不能单独证明设备角色。

## 11. Router 每一跳都会重新封装链路层 Header

概念模型：

```text
PC → Gateway
L2: PC MAC → Gateway local-interface MAC
L3: PC IP  → Final IP

Router A → Router B
L2: Router A outgoing-link address → Router B next-hop address
L3: PC IP → Final IP
```

Router 移除收到链路的封装，执行 IP Forwarding，再按下一条链路重新封装。IPv4 Source/Destination 在普通路由转发中通常保持，但 NAT、Tunnel、Proxy 和某些中间功能可以改写或增加 Header。

因此“MAC 不会一路跟到远端服务器”是正确模型；但不同链路未必都使用 Ethernet/MAC，例如点到点链路可以使用其他 Link Protocol。

## 12. 实验三：观察 ICMP 与 TTL

显示过滤器：

```text
icmp
```

观察：

```text
Echo Request: icmp.type == 8
Echo Reply:   icmp.type == 0
Time Exceeded: icmp.type == 11
```

IPv4 TTL 在 IP Header 中：

```text
ip.ttl
```

TLS 与 TTL 完全不同：

```text
TTL = Time To Live，IPv4 Header 的跳数限制
TLS = Transport Layer Security，保护应用协议的安全协议
```

## 13. 实验四：观察 DNS

传统 DNS Display Filter：

```text
dns
```

执行：

```powershell
Resolve-DnsName example.com -Type A
```

观察：

```text
Query Name and Type
Destination Resolver Address
UDP/TCP Source and Destination Port
Transaction ID
Response Code
Answers / CNAME / TTL
Truncated Flag and TCP Retry
```

DNS Response 常见方向：

```text
Resolver:53 → Client ephemeral port
```

但 DoT、DoH、DoQ 或 Proxy Remote Resolution 不会在物理接口上呈现为普通 UDP/TCP 53，因此 `dns` Filter 没结果不等于没有名称解析。

## 14. 实验五：观察 TCP 三次握手

先用地址和端口限制 Flow：

```text
tcp.port == 443
```

初始 SYN：

```text
tcp.flags.syn == 1 && tcp.flags.ack == 0
```

典型序列：

```text
Client ephemeral port → Server 443   SYN
Server 443 → Client ephemeral port   SYN, ACK
Client → Server                      ACK
```

`tcp.port == 443` 会匹配这条 TCP Flow 的握手、TLS 和数据 Segment；`tls` 只匹配 Wireshark 成功识别为 TLS 的内容，不会匹配纯 TCP SYN。

端口号只是线索。443 上可能不是 TLS，TLS 也可以运行在其他端口。必要时使用 Decode As，并结合协议内容判断。

## 15. Relative Sequence Number

线上 TCP ISN 是 32-bit 值。Wireshark 默认常把每个方向的起点显示成相对值：

```text
SYN      Seq=0
SYN,ACK  Seq=0 Ack=1
ACK      Seq=1 Ack=1
```

这不表示原始 Header 中的 ISN 真是 0。需要查看绝对值时可以调整 TCP Protocol Preference 或展开字段。

## 16. 实验六：观察 TLS

执行：

```powershell
curl.exe -v https://example.com/
```

过滤：

```text
tls
```

可能看到：

```text
ClientHello
ServerHello
Certificate-related handshake messages
Encrypted Application Data
Alerts
```

具体可见程度取决于 TLS 版本。TLS 1.3 在 ServerHello 之后对更多 Handshake 内容加密；不能期待所有版本都像简化教材一样明文显示完全相同字段。

ClientHello 可能包含 SNI、ALPN、Supported Versions、Key Share 等 Extension。ECH 启用时，外部观察者可见的 Server Name 信息会发生变化。

## 17. 为什么 `tls` 看不到 HTTP 明文

没有对应会话 Secret 时，Wireshark 能看到 TLS Record 和元数据，但通常无法读取：

```text
HTTP Method / Path
Cookie
Authorization
Body
```

若在自己的授权测试环境配置 TLS Key Log，Wireshark 可以解密匹配会话。Key Log 与 Capture 组合非常敏感，应限制访问并在实验后安全处理。

## 18. `curl -v` 与 Wireshark 是互补证据

```text
curl -v
→ 应用视角：Resolver、Proxy、TLS、HTTP 状态

Wireshark
→ 抓包点视角：实际 Flow、Sequence、ACK、重传、RST、窗口和封装
```

二者时间对齐后，可以判断：

```text
curl 说连接 Proxy
→ Loopback 是否出现 Proxy Flow？

curl 报 TLS Error
→ 是否收到 TLS Alert 或 TCP Reset？

curl 等待 Response
→ Request Payload 是否已被 ACK？是否有回程 Payload？
```

任何一方都不是全知视角：应用日志看不到每个 Packet，抓包也看不到应用内部队列和线程。

## 19. Follow TCP Stream 能做什么

Wireshark 根据 Sequence Number 对抓到的 Segment 进行重组，处理所见范围内的乱序和重传，形成两个方向的 Byte Stream。

它适合：

```text
检查明文协议 Request / Response
观察应用 Framing
导出已重组 Byte
确认双方实际发送内容
```

限制：

```text
Capture 丢失的 Byte 无法凭空恢复
TLS Ciphertext 没有 Secret 时仍是密文
TCP Byte Stream 不自动标出应用消息边界
抓包从连接中途开始可能缺少前文
```

Follow TCP Stream 还原的是捕获到的 TCP Stream，不是对端应用内存状态。

## 20. Wireshark TCP Analysis 是启发式分析

常见 Filter：

```text
tcp.analysis.retransmission
tcp.analysis.fast_retransmission
tcp.analysis.duplicate_ack
tcp.analysis.out_of_order
tcp.analysis.lost_segment
tcp.analysis.zero_window
tcp.flags.reset == 1
tcp.flags.fin == 1
```

`tcp.analysis.*` 是 Wireshark 根据当前 Capture 推断的标记，不是 TCP Header 中的原生字段。以下情况可能造成误判：

```text
抓包点丢 Packet
只抓到一个方向
Capture 从连接中途开始
网卡 Offload
多路径或镜像口乱序
时间戳异常
```

看到 `Retransmission` 应检查相同 Seq Range、ACK 进展、抓包完整性和时间线，而不是仅凭 Info 列定责网络。

## 21. Offload 为什么让本机抓包看起来奇怪

现代系统可能启用：

```text
Checksum Offload
TCP Segmentation Offload / Large Send Offload
Large Receive Offload / Receive Segment Coalescing
```

结果可能是：

```text
出站 Checksum 在抓包时尚未由 NIC 填写
本机 Capture 看到远大于线上 MSS 的逻辑 Segment
接收方向多个线上 Segment 被合并后才呈现
```

Wireshark 标出的 Bad Checksum 不一定表示线上真的错误。高风险诊断可在交换机 Mirror Port、网络 TAP 或另一台 Host 对照抓包。

## 22. ACK 后无业务 Payload 能证明什么

假设：

```text
MMI → Controller：完整 Request Payload
Controller → MMI：ACK 覆盖该 Seq Range
随后 30 s 无 Controller Application Payload
```

可以支持：

```text
该 Request Byte 到达了对端 TCP 接收路径并被确认
请求和 ACK 所需的双向网络路径在当时可用
抓包点未观察到对应业务 Response Payload
```

不能单凭这些 Packet 证明：

```text
控制器应用已经 Read
协议解析成功
业务线程正常
硬件动作完成
Response 生成后没有在另一个连接发送
抓包点没有丢失相关 Packet
```

若同时无重传、RST、FIN、Zero Window，优先调查应用读取、Framing、队列、锁、状态机和 Response 发送路径是合理的，但结论应写成“证据更指向应用层”，而不是“网络所有层绝对正常”。

## 23. RST、FIN、Zero Window 的不同含义

```text
FIN
→ 有序关闭一个发送方向

RST
→ 复位或异常终止当前 TCP Connection

Zero Window
→ 接收方通告当前没有更多接收窗口，发送方应暂停新数据
```

Zero Window 可能表示接收应用读取不及时，也可能是系统压力；它不同于网络丢包。应继续观察 Window Update 和持续时间。

RST 需要结合方向、Sequence 和上下文判断。它可能来自没有监听端口、应用主动复位、关闭后的旧 Segment、中间设备或其他状态错误。

## 24. Proxy 与 VPN 抓包

### Local Proxy

可能需要同时抓：

```text
Loopback：Application → 127.0.0.1:ProxyPort
Physical NIC：Proxy Client → Remote Node / Origin
```

这两段是不同 TCP/UDP Flow，Port 和 Sequence Number 不连续。

### TUN VPN

可能看到：

```text
TUN：Inner IP Packet
Physical NIC：Outer Encrypted Tunnel Packet
```

Inner Destination 与 Outer Destination 不同。若只抓 Physical NIC，通常看不到被 Tunnel 保护的原始上层内容。

## 25. 推荐的综合实验

在授权测试环境开始 Capture，然后依次执行：

```powershell
Get-NetIPConfiguration
Get-NetNeighbor
ping -n 1 8.8.8.8
Resolve-DnsName example.com
Test-NetConnection example.com -Port 443
curl.exe -v https://example.com/
```

依次过滤：

```text
arp
icmp
dns
tcp
tls
```

不是每次都能在一份 Capture 中看到完整 ARP、传统 DNS 和新 TCP Handshake：Cache、连接复用、DoH、HTTP/3 和已有 Neighbor State 都可能跳过某些步骤。实验前先预测哪些步骤应出现，再解释缺失原因。

## 26. 控制器通信排障模板

```text
1. 用 IP + Port + 时间范围找到 Flow
2. 确认三次握手或既有连接状态
3. 找到应用 Request 的完整 Seq Range
4. 确认对端 ACK 是否覆盖这些 Byte
5. 查看 Retransmission、Duplicate ACK、Window、RST、FIN
6. 重组两个方向的 Byte Stream
7. 按应用协议 Length / Delimiter / RequestId 解析
8. 将 Packet 时间与 MMI、控制器日志对齐
9. 分别记录传输证据与业务推断
```

推荐结论写法：

```text
在抓包点 X，于时间 T 观察到 RequestId 123 的 28 byte 请求；
对端在 2 ms 后累计确认至 Ack N；
随后 30 s 内未观察到该 Flow 的服务端 Payload、RST 或 FIN；
因此请求字节已被对端 TCP 确认，故障更可能位于对端读取、业务处理或响应生成路径，
但仍需结合对端日志与另一抓包点验证。
```

## 27. 本章核心模型

```text
正确接口
→ 正确时间窗口
→ 锁定 Conversation / Stream
→ 从低层到高层检查
→ 区分观察事实与推断
→ 用应用日志或另一抓包点交叉验证
```

需要记住：

1. Wireshark 通常是观察者，不是转发者。
2. 抓包点决定能看到 Loopback、Inner Packet、Outer Tunnel 还是物理链路流量。
3. Capture Filter 决定保存什么；Display Filter 只控制显示。
4. 本地 Wi‑Fi Capture 不一定呈现原始 802.11 空中 Header。
5. IP Destination 通常指最终目标，当前可见链路 Destination 指下一跳。
6. MAC/OUI Vendor 不能单独证明设备角色，应结合 Neighbor Table。
7. `tcp.port == 443` 与 `tls` 匹配不同层次；TLS 也不被固定在 443。
8. Follow TCP Stream 重组 Byte Stream，不恢复丢失 Capture，也不创造应用消息边界。
9. `tcp.analysis.*` 是启发式分析，必须考虑抓包丢失和 Offload。
10. TCP ACK 证明接收端 TCP 确认字节，不证明应用读取和业务成功。
11. RST、FIN、Zero Window 和 Timeout 是不同证据。
12. 抓包含敏感数据，采集、保存和分享都需要授权与保护。

## 思考题

1. 为什么在 Physical NIC 看不到 Local Application 与 `127.0.0.1` Proxy 的全部通信？
2. 为什么普通 Windows Wi‑Fi Capture 中的 `Ethernet II` 不一定等于空中使用 Ethernet Frame？
3. 访问远端 IP 时，为什么 IP Destination 是远端，而可见链路 Destination 是 Gateway？
4. 怎样比 OUI Vendor 更可靠地确认一个 MAC 是当前网关邻居地址？
5. `tcp.port == 443` 与 `tls` 为什么不会显示完全相同的 Packet？
6. Relative Sequence Number 为什么常从 0 开始？
7. Follow TCP Stream 能解决什么，不能解决什么？
8. 为什么 `tcp.analysis.retransmission` 不能脱离抓包完整性直接当作真相？
9. ACK 覆盖 Request Byte 但无业务 Payload，哪些是事实，哪些只是推断？
10. 开启 TUN VPN 后，应在哪两个接口分别观察 Inner 和 Outer Packet？
11. 为什么本机 Capture 中的 Bad Checksum 可能是 Offload 现象？
12. 如何把 Packet、RequestId 和应用日志组成一条可审计证据链？

下一章将学习 **Overlay Network**：如何在 Underlay 上构建稳定的虚拟地址与逻辑拓扑，以及控制面、数据面、直连与 Relay 如何协作。

## 延伸阅读

- [Wireshark User’s Guide](https://www.wireshark.org/docs/wsug_html_chunked/)
- [Wireshark Display Filter Reference](https://www.wireshark.org/docs/dfref/)
- [Npcap Guide](https://npcap.com/guide/)

## 窗口与背压补充

接收窗口、拥塞窗口、ZeroWindow、发送背压与证据边界，见 [TCP 流量控制、拥塞控制与背压](/notes/computer-net/16-tcp-flow-congestion-backpressure/)。

## 综合诊断补充

DNS 有答案不等于地址正确，独立 TCP 测试也不证明 curl 使用相同路径。证书名称不匹配的完整案例与对照步骤见 [综合网络实验与 TLS 身份验证排障](/notes/computer-net/18-network-labs-tls-identity/)。

---

## 系列导航

- [学习清单与完整目录](/notes/computer-net/00-learning-roadmap/)
- [上一章：DNS 解析链、缓存与故障诊断](/notes/computer-net/12-dns-resolution-cache/)
- [下一章：Overlay Network：Underlay 之上的逻辑网络](/notes/computer-net/14-overlay-control-data-planes/)
