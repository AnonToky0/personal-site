---
title: "NAT、Tunnel 与 P2P 穿透"
description: "区分 NAT 映射与过滤、隧道封装、P2P 打洞、STUN、TURN、ICE 和信令的职责与排障边界。"
date: 2026-10-08
tags: ["计算机网络", "NAT", "P2P", "隧道"]
---

这一章同时出现许多“中间设备”，最容易混淆的是它们各自在改变什么：

```text
NAT
→ 改写地址或端口，并维护转换状态

Tunnel / VPN
→ 把内层流量封装进外层通信

STUN
→ 让 Endpoint 得知某个外部观察点看到的映射地址

TURN
→ 分配 Relay Address，并实际中继数据

ICE
→ 收集候选路径、进行连通性检查并选择可用 Candidate Pair

Signaling
→ 让两个 Peer 交换会话信息、Candidate 和凭据
```

理解这些概念前，应先严格区分：

```text
Address：IP
Endpoint：IP + Port + Transport Protocol
Flow：两个 Endpoint 之间的一次通信关系
Mapping：内外 Endpoint 之间的地址转换状态
Filtering：哪些外部来源允许通过 NAT / Firewall
Relay：服务器实际位于数据路径中搬运数据
```

## 1. 为什么大量设备使用私有 IPv4

IPv4 地址空间只有 `2^32` 个地址，其中还包含保留、特殊用途和不可分配范围。现实中的终端数量远超可直接分配的公网 IPv4 数量，因此大量网络使用 RFC 1918 私有地址：

```text
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
```

这些地址可以在不同私有网络重复使用，不会作为普通全局单播地址在公共 Internet 路由。例如北京和上海的两台主机都可以叫：

```text
192.168.1.10
```

因此告诉远端 Peer“连接 `192.168.1.10`”通常没有意义：远端 Internet Router 不知道它指的是哪个私有网络。

## 2. NAT 与 NAPT/PAT

NAT 是 Network Address Translation。家用 IPv4 上网常见的实际形式还会转换 Transport Port，常称为 NAPT 或 PAT。

原始 UDP Flow 可能是：

```text
192.168.1.10:53124
→ 198.51.100.20:443/UDP
```

经过 NAT 后，外部看到：

```text
203.0.113.5:61001
→ 198.51.100.20:443/UDP
```

NAT 设备保存状态，使回包：

```text
198.51.100.20:443
→ 203.0.113.5:61001
```

能够被反向转换并交给：

```text
192.168.1.10:53124
```

转换时设备还要相应更新 IP、TCP 或 UDP Checksum。实现可以尽量保留源端口，也可以选择另一个可用端口；不能假设所有 NAT 使用相同分配算法。

## 3. 目标端口相同为什么不冲突

多台内网主机都可以访问同一个 HTTPS 目标：

```text
192.168.1.10:53124 → 198.51.100.20:443/TCP
192.168.1.11:54872 → 198.51.100.20:443/TCP
```

转换后可能是：

```text
203.0.113.5:61001 → 198.51.100.20:443/TCP
203.0.113.5:61002 → 198.51.100.20:443/TCP
```

双方的 Destination Port 都是 `443`，区别来自 Source Endpoint。NAT 状态通常至少结合：

```text
Protocol
Internal IP and Port
External/Public-side IP and Port
Remote IP and Port（是否参与映射取决于 NAT 行为）
```

因此“所有人都访问 443，会不会冲突”混淆了客户端临时 Source Port 和服务器 Destination Port。

## 4. NAT Mapping 与 Filtering 必须分开

NAT 穿透中有两个独立问题。

### Mapping

内部 Endpoint 向外发送时，NAT 如何选择外部 Endpoint：

```text
192.168.1.10:50000
↔ 203.0.113.5:62000
```

访问不同 Remote Endpoint 时，这个外部端口会不会保持不变，属于 Mapping Behavior。

### Filtering

外部 Packet 到达 `203.0.113.5:62000` 后，哪些 Remote Endpoint 的 Packet 被允许映射回内部，属于 Filtering Behavior。

一个 NAT 可能使用较稳定的映射，但采用严格过滤；也可能反过来。只用一个“Cone NAT 类型”标签，往往不足以描述真实行为。

现代分析更适合分别讨论：

```text
Endpoint-Independent Mapping
Address-Dependent Mapping
Address-and-Port-Dependent Mapping

Endpoint-Independent Filtering
Address-Dependent Filtering
Address-and-Port-Dependent Filtering
```

传统所谓 Symmetric NAT 通常指与不同 Remote Endpoint 通信时产生不同外部映射的行为，但不同资料的术语并不总一致，应优先描述具体 Mapping 和 Filtering。

## 5. 为什么未经请求的入站通信通常失败

Internet 可以把 Packet 路由到公网地址：

```text
203.0.113.5:62000
```

真正的问题发生在 NAT 边界：

```text
External Packet
      ↓
NAT 查找 Mapping / Filtering State
      ↓
没有匹配状态或不允许该来源
      ↓
Drop
```

所以不是“Internet 完全找不到公网 IP”，而是到达 NAT 后，没有足够状态把 Packet 交给某个 Internal Endpoint，或过滤策略不允许它进入。

此外，现实设备通常同时运行 Stateful Firewall。需要严格区分：

```text
NAT
→ 地址和端口转换

Firewall
→ 根据策略和连接状态允许或阻止流量
```

NAT 产生的常见入站限制有一定保护效果，但 NAT 本身不等于安全策略，也不能替代防火墙。

## 6. Port Forwarding、UPnP 与 PCP

静态 Port Forwarding 明确配置：

```text
203.0.113.5:5000/TCP
→ 192.168.1.10:5000/TCP
```

于是 NAT 对指定入站 Endpoint 有了稳定规则。设备也可能通过 UPnP IGD、NAT-PMP 或 PCP 请求网关创建 Mapping。

这些方法都有安全边界：

```text
谁有权创建 Mapping？
Mapping 保留多久？
外部端口是否固定？
是否同时更新 Firewall？
应用是否验证远端身份？
```

开放端口只是让流量能到达服务，不能替代认证、加密、更新和访问控制。

## 7. CGNAT：不止一层 NAT

家庭网络可能是：

```text
Host
192.168.1.10
   ↓ Home NAT
100.64.1.20
   ↓ Carrier-Grade NAT
203.0.113.10
   ↓
Internet
```

`100.64.0.0/10` 是 Shared Address Space，不属于 RFC 1918，但常用于运营商 CGNAT 内部。

用户可以管理 Home Router，却通常无法在运营商 CGNAT 上配置 Port Forwarding。因此只开放家庭路由器端口仍可能无法从 Internet 建立入站连接。

STUN 的价值之一是：无论中间有一层还是多层 NAT，它都可以报告 STUN Server 最终观察到的 Source Transport Address。

## 8. NAT State 会过期

动态 Mapping 和 Filtering State 通常有 Idle Timeout：

```text
一段时间没有流量
→ NAT State 过期
→ 原来的 Public Endpoint 不再有效
```

UDP 没有连接关闭握手，NAT 尤其依赖超时回收 UDP 状态。P2P 应用常发送 Consent、Keepalive 或业务 Packet 维持路径，但间隔必须结合协议和网络行为设计。

过于频繁会浪费电量和带宽；过于稀疏则可能让 Mapping 在两次发送之间消失。

## 9. IPv6 为什么没有立即取代 IPv4

IPv6 提供 `2^128` 地址空间，终端通常不需要为了节省地址而使用传统 IPv4 NAT。但 IPv6 的全球迁移必须兼容大量 IPv4-only 网络、设备、应用和运营系统。

常见过渡方式包括：

```text
Dual Stack
NAT64 / DNS64
Various IPv4-over-IPv6 or IPv6-over-IPv4 mechanisms
```

IPv6 全局地址也不表示“外部默认可以随意连接”。Stateful Firewall 仍可阻止未经允许的入站连接。公网可路由地址与安全策略是两个问题。

## 10. Tunnel：内层数据放进外层通信

Tunnel 的抽象是：

```text
Inner Packet / Frame
   ↓ encapsulate
Outer Header + Tunnel Payload
   ↓ transport through Underlay
Tunnel Endpoint
   ↓ decapsulate
Inner Packet / Frame continues
```

中间 Underlay Router 根据 Outer Header 转发，不需要理解 Inner Destination。

Tunnel 不一定加密。例如 GRE 可以封装但不天然提供 VPN 式机密性。VPN 通常在 Tunnel 基础上再提供认证、完整性和加密，但具体安全能力取决于协议与配置。

## 11. TUN 与 TAP

Virtual Network Interface 是操作系统的网络接口抽象，不要求背后存在真实网线或无线电。

```text
Physical NIC
OS → Driver → Hardware → Cable / Radio

TUN
OS → Virtual L3 Interface → VPN Program

TAP
OS → Virtual L2 Interface → VPN / Bridge Program
```

TUN 交付：

```text
IPv4 / IPv6 Packet
```

TAP 交付：

```text
Ethernet Frame，包括 Source/Destination MAC 和 EtherType
```

TUN 本身不是 Router，也不自动接管所有流量。Route、Policy Routing 和 VPN Client 决定哪些 Packet 被送入它。

## 12. VPN 为什么可能改变网站看到的出口 IP

典型 Consumer VPN：

```text
Client
  ↓ Inner Packet enters TUN
Encrypted Outer Flow
  ↓
VPN Gateway
  ↓ decapsulate and usually route/NAT onward
Website
```

网站看到的 Source 通常是 VPN Gateway 或其出口地址，因为最终外向连接从该网络出口继续发送。

但不是 TUN 单独“把公网 IP 改掉了”。完整因果链是：

```text
Route selects TUN
→ VPN Client encapsulates
→ VPN Gateway decapsulates
→ Gateway routes and often SNATs toward Internet
```

Site-to-Site VPN 也可能在两个私有网段之间纯路由而不做 Internet Exit NAT，所以“VPN 必然改变公网出口”也不是通用定义。

本地 ISP 仍能看到 Client 正在与 VPN Server 通信，以及 Outer Flow 的地址、时间、大小和协议特征。加密隐藏 Inner Content，不自动隐藏 VPN Server 的存在；网络也可能基于 IP、Port 或流量特征阻断 Tunnel。

## 13. Proxy 与 VPN 的数据模型不同

典型 Proxy 建立两个逻辑连接：

```text
Client ── Connection 1 ──> Proxy
Proxy  ── Connection 2 ──> Target
```

典型 TUN VPN 则封装被路由选入的 Inner Packet：

```text
Inner IP Packet
→ encrypted/encapsulated into Outer Flow
→ VPN Gateway
```

因此普通 HTTP/SOCKS Proxy 不是“外层 Proxy IP Header 里面原样装着目标 IP Packet”。它接收代理协议或 Byte Stream，再自己建立另一条连接。两种模型都能改变实际网络路径，但机制不同。

## 14. P2P 不等于“完全没有服务器”

很多 P2P 系统把 Control Plane 与 Data Plane 分开：

```text
Control Plane
→ 登录、发现 Peer、认证、交换 Candidate、协商会话

Data Plane
→ 优先 Peer-to-Peer；失败时可能使用 Relay
```

视频会议、游戏和远程连接通常仍依赖 Signaling Server。ICE 不规定应用必须使用哪种 Signaling Protocol；候选和凭据可以通过应用自己的安全信令交换。

所以更准确的描述是：

> 服务器帮助双方发现和协商，媒体或业务数据尽量直接传输，不能直连时再走中继。

## 15. Public IP 与 Public Endpoint

```text
203.0.113.10
```

是一个 IP Address。

```text
203.0.113.10:62001/UDP
```

才是一个 UDP Transport Endpoint。NAT Traversal 关心的是 IP、Port 和 Transport Protocol 的组合，而不是只有公网 IP。

同一个 NAT Public IP 可以同时服务许多 Mapping：

```text
203.0.113.10:62001/UDP → Peer A
203.0.113.10:62002/UDP → Peer B
203.0.113.10:62003/TCP → Another Flow
```

## 16. STUN：询问“从这个观察点看我是谁”

STUN 是 Session Traversal Utilities for NAT。客户端向可达的 STUN Server 发送 Binding Request，Server 把它观察到的 Source Transport Address 返回给客户端。

```text
Peer Local Endpoint
192.168.1.10:50000/UDP
   ↓ NAT(s)
STUN Server observes
203.0.113.10:62001/UDP
```

这个地址在 ICE 中通常形成 Server-Reflexive Candidate。

需要注意：

```text
STUN 不自动建立完整 P2P 会话
STUN 不负责应用信令
STUN 通常不搬运后续媒体数据
STUN 结果不保证对另一个 Remote Endpoint 仍使用相同 Mapping
STUN 结果也不保证 Filtering 允许目标 Peer 进入
```

没有全球唯一 STUN Server。服务提供商可以部署自己的 Server，也存在公共服务。生产系统必须考虑可用性、认证需求、隐私、地域与滥用控制。

## 17. 为什么某些 Mapping 更利于打洞

假设 A 的同一个 Local UDP Endpoint：

```text
192.168.1.10:50000
```

访问 STUN Server 时得到：

```text
203.0.113.10:62001
```

如果访问 Peer B 时 NAT 仍复用：

```text
203.0.113.10:62001
```

那么 A 可以把 STUN Candidate 告诉 B。

如果 NAT 对不同 Remote Endpoint 分配不同映射：

```text
to STUN → 203.0.113.10:62001
to Peer B → 203.0.113.10:63125
```

B 手里的 `62001` 就可能无法到达 A 与 B 实际通信所用的 Mapping。这是 Address-and-Port-Dependent Mapping 让打洞困难的核心之一。

但能否连通还取决于两端 Filtering、Firewall、协议、时序和 Mapping Lifetime，不能只根据外部端口是否变化做绝对判断。

## 18. UDP Hole Punching 时间线

假设：

```text
Peer A Local = 192.168.1.10:50000/UDP
Peer A Reflexive Candidate = 203.0.113.1:61000/UDP

Peer B Local = 192.168.2.20:50000/UDP
Peer B Reflexive Candidate = 198.51.100.2:62000/UDP
```

### 第一步：双方连接 Signaling Service

```text
A → Signaling Server
B → Signaling Server
```

完成身份确认、会话协商和 Candidate 交换。Signaling Server 不等同于 STUN 或 TURN，虽然同一服务商可以部署它们。

### 第二步：收集候选地址

双方可能拥有：

```text
Host Candidate
Server-Reflexive Candidate from STUN
Relayed Candidate from TURN
```

### 第三步：交换 Candidate

A 得知 B 的候选，B 得知 A 的候选。这些信息必须通过受保护的 Signaling Channel 交换，否则攻击者可能注入目标地址或劫持协商。

### 第四步：双方进行连通性检查

A 向 B 的候选发送，B 也向 A 的候选发送：

```text
A → B Candidate
B → A Candidate
```

最初的 Packet 可能被 Filtering 丢弃。但双方的主动外发会建立或刷新各自 NAT/Firewall State，后续匹配流量就可能被视为允许的返回或已授权通信。

双方不要求在同一个瞬间发送。真正需要的是：A 与 B 创建的 Mapping / Filtering State 在有效期内发生重叠，并且检查包会在短时间内重试。常见时间线可能是：

```text
t0  A → B：B 侧状态尚未建立，首包被丢弃
t1  B → A：B 已建立外发状态，A 侧也已有状态
t2  A → B：重试成功
t3  B ↔ A：双向检查完成
```

因此“同时发包”是便于理解的直觉，不是要求两台机器时钟精确同步。

### 第五步：确认并选定路径

当 Candidate Pair 的双向检查成功并被 ICE 选定后，Data Plane 可以直接使用这条路径：

```text
A ←──────── direct UDP path ────────→ B
```

所谓“打洞”不是修改远程 NAT 配置，而是双方通过主动发送建立临时 Mapping 和 Filtering State。

## 19. 为什么 UDP Hole Punching 可能失败

常见原因包括：

```text
Address-and-Port-Dependent Mapping
严格 Filtering 或 Enterprise Firewall
UDP 被阻止
双方 Candidate 交换或时序失败
Mapping 在检查完成前过期
多层 NAT 的组合行为
只支持 IPv4 的一端与只支持 IPv6 的另一端
Peer 位于不允许 Hairpinning 的同一 NAT 后
运营商或网络策略限制
```

Hairpinning 指同一 NAT 后的内部设备能否通过 NAT 的外部地址互相通信。若不支持，两个看起来拥有同一公网 IP 的 Peer 可能需要优先尝试 Host Candidate 或其他本地路径。

## 20. TCP Hole Punching 为什么更复杂

TCP 同样可能利用 Simultaneous Open 等机制进行穿透，但比 UDP 更依赖：

```text
两端 TCP 状态机与 API 行为
SYN 的精确时序
NAT 对 Outbound SYN 和 Inbound SYN 的处理
Firewall Policy
端口保持和 Mapping Behavior
```

许多 NAT、Firewall 和应用 API 对这种模式支持不一致。因此实时 P2P Connectivity 通常优先尝试 UDP，再在应用协议上提供可靠性、安全和拥塞控制，或在失败时使用 Relay。不能假设所有网络都支持 TCP 打洞。

## 21. TURN：Relay 是真实的数据路径

TURN 是 Traversal Using Relays around NAT。Client 向 TURN Server 申请 Allocation，获得一个 Relayed Transport Address：

```text
Peer A
  ↓ TURN Client-to-Server Transport
TURN Relay Address
  ↓ relayed Peer Traffic
Peer B
```

TURN Server 不只是“告诉地址”，而是接收并重新发送实际 Data Plane Traffic。它通常还维护 Allocation、Permission、Channel Binding 和 Lifetime。

TURN 使用凭据保护 Allocation 等操作，但这不自动等于 Peer A 与 Peer B 之间的业务 Payload 已经端到端加密。WebRTC 等系统会另外使用 DTLS、SRTP 等机制保护 Peer Data；其他应用也必须明确自己的端到端安全层。不能因为流量经过 TURN 就默认 Relay 看不到 Payload。

TURN 适用于：

```text
直接 Candidate Pair 全部失败
UDP 被阻止而可使用其他 TURN Transport
Enterprise Policy 不允许 Peer-to-Peer
NAT / Firewall 行为不利于直连
应用主动要求隐藏 Peer Address 或统一路径
```

## 22. TURN 为什么成本高

直接 P2P：

```text
A =============================> B
```

服务端只承担 Signaling 和辅助检查。

TURN：

```text
A =====> TURN Server =====> B
```

Relay 对每个方向都要接收并发送媒体或业务数据，消耗：

```text
Server ingress and egress bandwidth
CPU / memory / socket state
公网地址与端口资源
跨地域流量费用
运维和抗滥用能力
```

它还增加一个中继路径，延迟和抖动通常取决于 TURN Server 的位置与负载。因此系统往往优先直接路径，同时保留 TURN 保障连接成功率。

## 23. ICE：不只是“STUN 优先、TURN 兜底”

ICE 是 Interactive Connectivity Establishment。它组织完整的 Connectivity Establishment 过程：

```text
Gather Candidates
→ Exchange Candidates through Signaling
→ Form Candidate Pairs
→ Prioritize Pairs
→ Perform STUN Connectivity Checks
→ Discover Peer-Reflexive Candidates if applicable
→ Nominate a working Pair
→ Use the selected Pair
```

选定路径之后，具体应用还可能使用 STUN Keepalive、ICE Restart 或 Consent Freshness 等机制维持 NAT State、确认对端仍同意接收并应对路径变化。这些后续机制与使用场景有关，不应全部混成最初 Candidate Selection 的同一步。

常见 Candidate 类型：

```text
Host Candidate
→ 本地接口地址

Server-Reflexive Candidate
→ STUN 观察到的 NAT 映射地址

Peer-Reflexive Candidate
→ 连通性检查过程中发现的映射地址

Relayed Candidate
→ TURN Allocation 提供的中继地址
```

ICE 会综合 Candidate 类型、本地优先级、网络成本和实现策略形成优先级，不应把它简化成固定的三步串行按钮。应用常并行收集和检查候选，以更快建立连接。

## 24. STUN、TURN、ICE 与 Signaling 的关系

```text
Signaling Service
→ 让 Peer 交换 SDP / Candidate / Credentials / Session State

STUN Server
→ 返回观察到的地址，也用于 ICE Connectivity Check

TURN Server
→ 分配 Relay Candidate 并搬运数据

ICE Agent
→ 在两个 Peer 上运行，组织候选和检查流程
```

关系不是简单的：

```text
ICE = STUN + TURN Server
```

更准确是：ICE 使用 STUN Protocol 进行检查，并可使用通过 TURN 获得的 Relayed Candidate；应用仍需自己的 Signaling 机制交换信息。

## 25. VPN 与 NAT Traversal 的关系

VPN Client 通常主动连接 VPN Server，因此外层 Tunnel Flow 可以利用 NAT 创建的出站 Mapping：

```text
Client behind NAT
→ outbound VPN transport
→ NAT Mapping
→ VPN Server
```

这使远端经 Tunnel 返回的数据被视为对应外层 Flow 的返回流量。VPN 还可能使用 Keepalive 保持 NAT State。

Overlay VPN 产品也可能尝试 Peer-to-Peer Traversal：

```text
先通过 Coordination Server 发现 Peer
→ 尝试直接 UDP path
→ 失败则使用 Relay
```

因此 VPN、STUN-like discovery、Hole Punching 和 Relay 可以出现在同一个产品中，但它们仍是不同职责。

## 26. P2P 安全边界

建立直连只解决 Connectivity，不自动解决安全：

```text
对端是否真是预期 Peer？
Candidate 是否被恶意替换？
媒体和数据是否端到端加密？
是否防止重放和降级？
是否限制可访问的本地服务？
是否暴露了不必要的 IP Metadata？
```

生产系统应在 Signaling 和 Data Plane 上进行身份认证、密钥协商和完整性保护。不要因为 Packet 成功穿过 NAT，就把来源当成可信。

## 27. 一套排障证据链

面对“P2P 只能走 Relay”或“外网连不到家中服务”，依次确认：

### 地址与 NAT 层次

```text
Local Address 是否 RFC 1918？
WAN Address 是否落在 100.64.0.0/10 或另一个私有范围？
是否存在 CGNAT？
```

### Mapping 与静态配置

```text
Port Forwarding 是否指向正确 Internal Endpoint？
Protocol 是 TCP 还是 UDP？
服务是否真的监听？
Firewall 是否允许？
```

### Candidate

```text
Host / Server-Reflexive / Relay Candidate 是否收集成功？
候选地址、协议、优先级和 Foundation 是否合理？
Signaling 是否把 Candidate 完整送到对端？
```

### Connectivity Check

```text
哪些 Candidate Pair 成功？
失败是超时、认证错误还是被明确拒绝？
UDP 是否被网络阻止？
NAT State 是否过早过期？
```

### Selected Path

```text
最终是 Host、Server-Reflexive 还是 Relay Pair？
RTT、丢包、抖动是否满足业务？
连接后是否因 Mapping Timeout 失效？
```

仅知道“STUN 成功”不能证明 Direct P2P 一定成功；仅知道“TURN 可用”也不能证明系统会优先选择它。

## 28. 本章核心模型

```text
NAT Mapping
→ Internal Endpoint 与 External Endpoint 的转换关系

NAT / Firewall Filtering
→ 哪些 Remote Endpoint 的入站 Packet 被允许

STUN
→ 从特定观察点发现 Server-Reflexive Endpoint

UDP Hole Punching
→ 双方主动发送，尝试建立可双向通过的临时状态

TURN
→ 分配 Relay Endpoint，服务器进入 Data Plane

ICE
→ 收集、检查、排序并选定 Candidate Pair

VPN Tunnel
→ Inner Traffic 经 Outer Flow 到 Tunnel Endpoint
```

需要记住：

1. NAT/PAT 不只是“私有 IP 换公网 IP”，还会维护协议与端口相关的转换状态。
2. Mapping Behavior 与 Filtering Behavior 是两个独立维度。
3. NAT 不等于 Firewall；公网可路由地址也不等于允许入站。
4. CGNAT 会让用户无法直接控制最外层 Port Mapping。
5. STUN 返回的是某次路径和观察点看到的 Public Transport Endpoint，不是永久保证。
6. Hole Punching 利用双方主动外发形成临时 NAT/Firewall State，而不是修改远端网关配置。
7. TURN 实际中继 Data Plane，因此消耗服务器带宽并通常增加路径长度。
8. TURN 本身不自动提供 Peer 间端到端 Payload 加密，应用仍需自己的安全协议。
9. ICE 包含 Candidate Gathering、Pairing、Connectivity Check 和 Nomination，不只是“先 STUN 后 TURN”。
10. P2P 通常仍依赖 Signaling Control Plane。
11. Tunnel 不一定加密；VPN 的安全能力取决于具体协议和配置。
12. TUN/TAP 是 Virtual Interface，不是 Router 本身。
13. Consumer VPN 改变出口通常是 Gateway 解封装后继续路由并进行 SNAT 的结果。
14. IPv6 减少地址共享 NAT 的必要性，但 Stateful Firewall 仍然重要。
15. Connectivity 成功不代表对端可信，P2P 仍需认证和加密。

## 思考题

1. Public IP 与 Public Transport Endpoint 有什么区别？
2. 多台主机同时访问同一个 TCP 443，NAT 为什么能区分回包？
3. NAT Mapping 与 Filtering 分别解决什么问题？
4. 为什么 Port Forwarding 配在家庭路由器上，经过 CGNAT 时仍可能无效？
5. NAT 为什么不能替代防火墙？
6. TUN 与 TAP 分别向软件交付什么？TUN 为什么不是 Router？
7. Consumer VPN 改变网站所见 Source IP 的完整因果链是什么？
8. STUN 返回的地址为什么不一定能直接供另一个 Peer 使用？
9. UDP Hole Punching 到底在 NAT 上建立了什么？
10. Address-and-Port-Dependent Mapping 为什么让打洞更困难？
11. TURN 为什么比只提供 Signaling 或 STUN 更消耗服务器资源？
12. ICE 中 Host、Server-Reflexive、Peer-Reflexive 和 Relayed Candidate 有什么区别？
13. 为什么 P2P 已经建立后仍可能需要 Keepalive 或 Consent Check？
14. 为什么直连成功不等于通信安全？

下一章将深入学习 **DNS**：Stub Resolver、Recursive Resolver 与 Authoritative Server 如何协作，缓存和多个 A/AAAA Record 如何影响连接，以及 Proxy、VPN 和 DoH 如何改变名称解析路径。

## 延伸阅读

- [RFC 1918：Address Allocation for Private Internets](https://www.rfc-editor.org/rfc/rfc1918)
- [RFC 6598：Shared Address Space for CGN](https://www.rfc-editor.org/rfc/rfc6598)
- [RFC 4787：NAT Behavioral Requirements for UDP](https://www.rfc-editor.org/rfc/rfc4787)
- [RFC 5382：NAT Behavioral Requirements for TCP](https://www.rfc-editor.org/rfc/rfc5382)
- [RFC 8489：Session Traversal Utilities for NAT（STUN）](https://www.rfc-editor.org/rfc/rfc8489)
- [RFC 8656：Traversal Using Relays around NAT（TURN）](https://www.rfc-editor.org/rfc/rfc8656)
- [RFC 8445：Interactive Connectivity Establishment（ICE）](https://www.rfc-editor.org/rfc/rfc8445)

---

## 系列导航

- [学习清单与完整目录](/notes/computer-net/00-learning-roadmap/)
- [上一章：HTTP、TLS、Proxy、VPN 与抓包边界](/notes/computer-net/10-http-tls-proxy-vpn/)
- [下一章：DNS 解析链、缓存与故障诊断](/notes/computer-net/12-dns-resolution-cache/)
