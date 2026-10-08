---
title: "Overlay 网络、控制面与数据面"
description: "区分 Underlay、Overlay、控制面与数据面，理解虚拟地址、隧道、直连、中继与分层排障。"
date: 2026-10-08
tags: ["计算机网络","Overlay","VPN"]
---

前面已经掌握：

```text
IP Routing
Virtual Interface
Tunnel
Encryption
NAT Traversal
P2P / Relay
```

Overlay Network 把这些机制组合起来，在已有网络上构造新的逻辑拓扑：

```text
Application sees:
Overlay Node A ───────── Overlay Node B

Actual transport:
A → Local NAT → Internet Underlay → NAT / Relay → B
```

最核心的抽象是：

> 应用使用稳定的 Overlay Address 或服务身份；Overlay 系统负责把它映射到当前可用的 Underlay Path。

## 1. Underlay 与 Overlay

### Underlay

承载真实 Packet 的现有网络：

```text
Home Wi-Fi
Office Ethernet
ISP
Public Internet
Cloud VPC
Physical Router and Firewall
```

它提供到 Peer Endpoint、Gateway 或 Relay 的基础 IP Connectivity。

### Overlay

在 Underlay 上建立的逻辑地址、拓扑、路由和安全策略：

```text
Virtual IP / MAC
Virtual Prefix and Route
Tunnel or Encapsulation
Peer Identity and Keys
Access Policy
Service Discovery / DNS
```

Overlay 不能脱离 Underlay 工作。Underlay DNS、路由、MTU、NAT 或 Firewall 故障，都可能使 Overlay 建立失败。

## 2. Overlay 不等于 VPN，也不必加密

Overlay 是“在现有网络上构建逻辑网络”的广义概念。它可以是：

```text
加密的 Remote-Access VPN
Peer-to-Peer Mesh VPN
VXLAN Data Center Fabric
Cloud VPC Overlay
L2 Virtual Ethernet
L3 Virtual Routed Network
Service Mesh（使用不同抽象）
```

有些 Overlay 提供加密、身份认证和 ACL，有些只做 Encapsulation 与逻辑隔离。Tunnel 也不自动等于安全 VPN。

因此判断安全性必须问：

```text
谁认证 Peer？
密钥如何分发和轮换？
Inner Payload 是否端到端加密？
Relay 能否解密？
Policy 在哪里执行？
```

## 3. Virtual Address 与 Physical/Underlay Address

假设：

```text
Node A Underlay Address = 192.168.1.10 behind NAT
Node A Overlay Address  = 100.100.0.1

Node B Underlay Endpoint = 203.0.113.20:41641/UDP
Node B Overlay Address   = 100.100.0.2
```

应用访问：

```text
100.100.0.2
```

Route 将该 Prefix 送入 Virtual Interface。Overlay Agent 根据 Peer State 选择：

```text
Direct LAN Endpoint
Direct Public/NAT Endpoint
Peer Relay
Provider Relay
```

Virtual Interface 自身通常只负责把 Packet 交给处理程序。真正维护“Overlay Address 属于哪个 Peer、Peer 当前有哪些 Endpoint”的是 Overlay Agent、路由和控制状态，不是 TUN 设备内部的一张神秘永久映射表。

## 4. Inner Packet 与 Outer Packet

P2P 直连时：

```text
Inner IP Packet
Src = 100.100.0.1
Dst = 100.100.0.2

Outer Packet
Src = A current Underlay/NAT Endpoint
Dst = B current Underlay/NAT Endpoint
Payload = encrypted/encapsulated Inner Packet
```

经过 Relay 时：

```text
Outer Destination = Relay Endpoint
Protected Payload still targets Overlay Peer B
Inner IP Destination remains 100.100.0.2
```

所以问题“Internet 上实际 Destination 是虚拟 IP、Peer Public IP 还是 Relay IP”必须分层回答：

```text
Inner Destination
→ Overlay logical destination

Outer Destination
→ 当前 Underlay next tunnel endpoint or relay
```

## 5. Route 如何把 Packet 送入 Overlay

安装 Overlay Client 后，系统可能出现：

```text
100.100.0.0/16 → Virtual Interface
```

应用发送到 `100.100.0.2`：

```text
Application
→ OS Route Lookup
→ Virtual Interface
→ Overlay Agent
→ Encrypt / Encapsulate
→ Underlay Route Lookup for Peer or Relay
→ Physical Interface
```

这里实际发生两次不同目标的路由决策：

```text
Inner Route
→ 选择 Overlay Virtual Interface

Outer Route
→ 选择通往 Peer/Relay 的 Physical Underlay Path
```

Outer Endpoint 必须避免再次被导入自己的 Tunnel，否则会形成 Routing Loop。VPN Client 通常为 Server/Peer Endpoint 保留 Underlay Route，或使用策略路由、Socket Binding 等机制。

## 6. Full Tunnel、Split Tunnel 与 Exit Node

### Split Tunnel

只让指定 Overlay Prefix 进入 Tunnel：

```text
100.100.0.0/16 → Overlay
0.0.0.0/0      → Local Internet Gateway
```

### Full Tunnel / Exit Routing

让普通 Internet Destination 也进入 Overlay，并由远端 Exit Gateway 转发：

```text
0.0.0.0/0 → Overlay Exit Node
```

有些实现使用两个更具体的 Route 覆盖 IPv4：

```text
0.0.0.0/1
128.0.0.0/1
```

由于 `/1` 比原 `/0` 更具体，它们合起来覆盖全部 IPv4，同时保留原 Default Route 供 Outer Tunnel 使用。它只是常见实现技巧，不是 VPN 定义。

即使存在 Overlay Default Route，仍服从 Longest Prefix Match：

```text
192.168.0.0/24 → Local Ethernet
0.0.0.0/0      → Overlay
```

访问 `192.168.0.253` 会优先匹配 `/24`，除非产品策略另有处理。

## 7. Control Plane 与 Data Plane

### Control Plane

常见职责：

```text
Node enrollment and identity
Public key distribution
Overlay IP allocation
Peer discovery and endpoint information
Route advertisement
Access policy distribution
DNS / service configuration
Relay discovery
NAT traversal coordination
```

### Data Plane

常见职责：

```text
Capture Inner Packet
Enforce local forwarding policy
Encrypt / decrypt
Encapsulate / decapsulate
Direct Peer transport
Relay transport fallback
Forward Packet to OS or subnet
```

Control Plane 决定“谁可以和谁通信、有哪些路径和 Route”；Data Plane 实际搬运 Packet。

不同系统在控制面不可用时的表现不同：已有连接是否继续、缓存策略可用多久、能否建立新 Peer，都必须看具体产品设计。

## 8. Control Plane 不应成为业务数据明文中转站

现代 Mesh Overlay 常把 Coordination 与 Data Relay 分离：

```text
Coordination Service
→ 身份、密钥公钥、策略、Peer Endpoint 信息

Direct/Relay Data Path
→ 加密后的 Peer Payload
```

但这不是 Overlay 的天然保证。设计评审必须确认：

```text
Control Service 得到哪些密钥？
Relay 看到明文还是 Ciphertext？
策略与密钥是否可被管理员更改？
Endpoint compromise 会暴露什么？
```

## 9. Mesh、Hub-and-Spoke 与 Partial Mesh

Overlay 拓扑可以是：

### Hub-and-Spoke

```text
Client A ─┐
Client B ─┼─ Hub / Gateway
Client C ─┘
```

优点是集中策略和路由简单，缺点是 Hub 带宽、延迟和可用性压力。

### Full Mesh

```text
A ↔ B
A ↔ C
B ↔ C
```

直接路径多，但 Peer State 和密钥/路径规模可能随节点数量增加。

### Partial Mesh

只在需要通信的节点间建立 Path，其他流量通过 Router、Gateway 或 Relay。

“Overlay = Full Mesh”与“传统 VPN = 一定中心化”都过于绝对。具体拓扑由产品和策略决定。

## 10. L3 Overlay 与 L2 Overlay

### L3 Overlay

向 OS 提供 IP Packet 语义：

```text
Route Prefix → TUN / Virtual L3 Interface
```

广播域小、扩展性通常更好，适合 Routed Connectivity。

### L2 Overlay

向 OS 提供 Ethernet-like Network：

```text
Virtual MAC
ARP / NDP
Broadcast / Multicast
Ethernet Frame forwarding
```

它更像“同一个虚拟交换机”，便于承载要求二层邻接的协议，但 Broadcast、Unknown Unicast 和 Multicast 跨 WAN 复制会带来规模和带宽成本。

TUN/TAP 定义来自交付对象：

```text
TUN → IP Packet → L3
TAP → Ethernet Frame → L2
```

不是因为某接口“修改了 Route”才被定义为 L3。

## 11. Overlay Address 是身份，还是位置

可以用下面的直觉入门：

```text
Underlay Endpoint
→ 节点当前从哪里可达，可能随 Wi-Fi、移动网络和 NAT 改变

Overlay Address / Node Identity
→ 在逻辑网络中较稳定地标识节点
```

但 Virtual IP 仍然是一个可路由 Locator，也不一定是密码学身份。可靠的 Identity 通常还来自：

```text
Public Key
Certificate
Device registration
User / workload identity
```

访问控制不应仅凭“对方使用某个虚拟 IP”就认定身份，除非系统保证地址分配与认证绑定。

## 12. NAT Traversal 与 Relay

Overlay Agent 可尝试：

```text
LAN direct path
Public IPv6 direct path
UDP Hole Punching through NAT
Port Mapping Protocol
Peer Relay
Provider Relay
```

Direct Path 通常：

```text
跳数更少
延迟更低
中心带宽成本更低
```

Relay 提高可达性，但不应默认 Relay 可读取明文。是否端到端加密取决于 Overlay Protocol；有些系统让 Relay 只转发已加密 Packet。

路径不是永远固定。节点切换网络、NAT State 过期或移动网络变化后，系统可能重新发现 Endpoint、迁移 Direct Path 或暂时退回 Relay。

## 13. Subnet Router

不是所有目标都安装 Overlay Agent。Subnet Router 可以宣告一个 Underlay Prefix：

```text
Site B router advertises 10.20.0.0/16
```

其他 Overlay Node 获得 Route：

```text
10.20.0.0/16 → Overlay → Site B Subnet Router
```

路径：

```text
Overlay Client
→ Encrypted Overlay
→ Subnet Router
→ Site B LAN Host
```

需要考虑：

```text
Forwarding enabled?
Return Route exists?
Does Router SNAT traffic?
LAN Firewall allows it?
Overlapping Prefixes?
Which node may advertise/accept route?
```

## 14. Exit Node / Internet Gateway

Exit Node 宣告 Default Route，让其他节点把 Internet Flow 经 Overlay 发送给它：

```text
Client Inner Packet to Internet
→ Overlay Exit Node
→ Decapsulate
→ Route / SNAT to Internet
```

Website 通常看到 Exit Node 的公网出口。Exit Node 可以观察解封装后的 IP/Transport Metadata；端到端 HTTPS 仍然保持 TLS 密文，除非另有 TLS Interception。

Exit Node 不是普通 Peer Relay：

```text
Peer Relay
→ 帮两个 Overlay Peer 转发已保护的 Overlay Data

Exit Node
→ 解封装 Inner Packet，并把它路由到普通 Internet
```

## 15. 地址空间冲突

Overlay Prefix 可能与本地 LAN、公司网或其他 VPN 重叠：

```text
Overlay advertises 10.0.0.0/8
Local company LAN also uses 10.0.0.0/8
```

系统只能根据 Route、Metric 和 Policy 选择路径，不能凭同一个 Destination 知道用户意图。冲突可能导致：

```text
本地设备不可达
Overlay Site 不可达
流量错误进入 VPN
DNS 返回无法匹配正确网络的私有地址
```

`100.64.0.0/10` 是 Shared Address Space，部分 Overlay 产品从中分配虚拟地址。它不是普通 RFC 1918，也不是可在公共 Internet 全局路由的地址；若 ISP CGNAT、本地环境和 Overlay 同时使用，仍需产品做隔离或规避冲突。

## 16. MTU 与封装开销

Overlay 在 Inner Packet 外增加：

```text
Outer IP Header
UDP/TCP Header
Tunnel Header
Encryption Authentication Data
```

因此可承载的 Inner MTU 通常小于 Physical Link MTU。配置不当可能导致：

```text
大 Packet 黑洞
Fragmentation
IPv6 Packet Too Big 缺失
TCP 连接建立但大响应卡住
性能下降
```

排障时检查：

```text
Virtual Interface MTU
Underlay Path MTU
ICMP / ICMPv6 Packet Too Big
TCP MSS
是否发生 Fragmentation
```

MSS Clamping 可以帮助 TCP，但不能修复所有 UDP 或非 TCP 流量。

## 17. DNS 与 Service Discovery

Overlay 通常还要解决“怎样找到虚拟地址”：

```text
Stable DNS Name → Overlay IP
Split DNS for internal domain
Search suffix
Service registry
Subnet route name resolution
```

如果 DNS 返回 Underlay Private IP，而 Route 只覆盖 Overlay IP，连接可能失败；反之亦然。Overlay 排障不能只检查 Tunnel，还要确认应用取得的名称答案是否属于正确地址空间。

## 18. Policy 与 Microsegmentation

“加入同一 Overlay”不应自动等于彼此完全互通。策略可以基于：

```text
Node / User / Workload Identity
Source and Destination Group
Protocol and Port
Route advertisement
Device posture
Environment tags
```

Policy 可能在每个 Endpoint 分布式执行，也可能由 Gateway 集中执行。Packet 被 Overlay Policy Drop 时，Underlay Ping 或 Direct UDP Path 仍可能正常，因此要区分：

```text
Underlay Connectivity
Tunnel Connectivity
Overlay Route
Overlay Authorization
Destination Service Firewall
```

## 19. Tailscale 作为 L3 Mesh Overlay 示例

根据当前官方架构说明，Tailscale 将协调控制面与设备上的数据面分离：控制面分发节点、密钥公钥、策略和 Endpoint 信息；数据面使用 WireGuard 保护节点间流量。节点优先尝试 Direct Connection，不能直连时可使用 Peer Relay 或 DERP Relay；DERP 转发已加密的 WireGuard Packet，不能解密业务内容。

简化路径：

```text
Application → Tailscale IP
→ Virtual Interface / Local Data Plane
→ Direct encrypted Peer Path
   or encrypted Relay Path
→ Remote Peer
```

产品行为会演进，排障时应以安装版本和当前官方文档为准，不能把 DERP、地址范围或路径优先级当作所有 Overlay 的统一规则。

## 20. ZeroTier 作为 Virtual Ethernet Overlay 示例

根据当前官方设计说明，ZeroTier 提供加密的 Peer-to-Peer 基础传输，并在其上模拟 Ethernet-like Virtual Network；网络控制器负责成员授权和网络配置，节点尽量建立 Direct Path，受限时可以 Relay。

因此加入同一 Virtual Network 后，操作系统可把它看作一张 Virtual Ethernet Port，承载 ARP、NDP、IP、Multicast 等二层/三层行为。它与纯 L3 TUN Overlay 的体验不同，也意味着需要关注 Broadcast/Multicast 和 Bridge Policy。

产品的具体身份格式、根节点、Relay 和 Controller 实现会变化，应以官方版本文档为准。

## 21. Overlay 与传统 VPN 的比较边界

下面只是常见倾向，不是定义：

| 维度 | 传统 Remote-Access VPN 常见形态 | Mesh Overlay 常见形态 |
| --- | --- | --- |
| 拓扑 | Client → Concentrator | Direct Peer + Relay Fallback |
| 地址 | 进入企业 Prefix | 稳定 per-node Virtual Address |
| Control | Gateway / VPN Controller | Identity、Policy、Peer Coordination |
| Data | 常集中经 Gateway | 常优先分布式 Direct Path |
| Internet Exit | 常由企业 Gateway | 可选 Exit Node |

传统 VPN 也能做 Mesh，Overlay 也能 Hub-and-Spoke。比较应基于实际拓扑和数据路径，而不是产品标签。

## 22. Overlay 排障阶梯

### Underlay

```text
Physical Interface 有地址吗？
能否访问 Control / Peer / Relay Endpoint？
UDP 是否被阻止？
DNS 是否正常？
```

### Virtual Interface and Route

```text
Virtual Adapter 是否 Up？
Overlay IP 是否正确？
目标 Prefix 是否指向它？
是否与 LAN/VPN Prefix 冲突？
```

### Control State

```text
Node 是否已注册和授权？
是否取得 Peer、Key、Route 与 Policy？
System Clock 是否影响认证？
```

### Data Path

```text
Direct or Relay？
Outer Endpoint 是谁？
Handshake / Key 是否有效？
MTU 是否正确？
```

### Policy and Service

```text
Overlay ACL 是否允许？
Remote Host Firewall 是否允许？
Service 是否监听 Overlay Address / Port？
DNS 是否返回 Overlay Address？
```

## 23. 抓包 Overlay

至少考虑两个接口：

```text
Virtual Interface
→ Inner Overlay IP Packet

Physical Interface
→ Outer Direct or Relay Flow
```

如果应用 `ping OverlayIP`：

```text
Virtual Capture
→ 可能看到 ICMP to Overlay Destination

Physical Capture
→ 可能只看到 encrypted UDP to Peer/Relay
```

不能因为 Physical NIC 没看到 Overlay Destination IP 就说 Packet 没发送；它可能已经被封装和加密。

## 24. 本章核心模型

```text
Application
   ↓ Overlay Destination
Inner Route
   ↓ Virtual Interface
Overlay Agent
   ↓ policy + peer lookup + encryption
Outer Route
   ↓ Direct Peer or Relay over Underlay
Remote Overlay Agent
   ↓ decrypt + deliver Inner Packet
Application / Routed Subnet
```

需要记住：

1. Underlay 提供真实可达路径，Overlay 在其上构造逻辑地址和拓扑。
2. Overlay 不等于 VPN，也不天然保证加密。
3. Inner Destination 是逻辑目标，Outer Destination 是当前 Peer、Gateway 或 Relay Endpoint。
4. TUN 只按 IP Packet 语义交付；Peer Mapping 由 Overlay Agent 和控制状态维护。
5. Control Plane 管身份、策略、Route 和 Peer 信息；Data Plane 实际搬运 Packet。
6. Overlay 可以 Hub-and-Spoke、Mesh 或 Partial Mesh，也可以是 L2 或 L3。
7. Direct Path 与 Relay Path 都可能存在，路径会随网络变化迁移。
8. Subnet Router、Exit Node 与 Peer Relay 承担不同职责。
9. Longest Prefix Match 仍适用于 Overlay Route，Default Route 不会无视更具体路由。
10. Address Overlap、MTU、DNS 和 ACL 是 Overlay 常见故障点。
11. Virtual IP 可提供稳定 Locator，但真正身份通常还依赖密钥、证书或注册。
12. 抓包要同时区分 Virtual Interface 的 Inner Packet 和 Physical Interface 的 Outer Flow。

## 思考题

1. Underlay 与 Overlay 分别提供什么？Overlay 能脱离 Underlay 吗？
2. 为什么 `ping OverlayIP` 不需要应用知道 Peer 当前公网 Endpoint？
3. Direct Path 与 Relay Path 中，Inner 和 Outer Destination 分别是什么？
4. 为什么 Virtual Interface 本身不是维护 Peer Endpoint 的完整控制器？
5. Control Plane 与 Data Plane 各自负责什么？
6. L2 Overlay 与 L3 Overlay 在广播、ARP/NDP 和扩展性上有什么区别？
7. 为什么 `/1 + /1` 可以覆盖原 IPv4 Default Route，又仍需保留 Underlay Path？
8. Subnet Router、Exit Node 与 Relay 有什么区别？
9. Overlay Prefix 与本地 LAN 重叠时会发生什么？
10. 为什么 Tunnel MTU 问题可能表现为“小包通、大包不通”？
11. Tailscale 与 ZeroTier 为什么只能作为不同 Overlay 形态的实例，而不是 Overlay 定义？
12. 为什么加入同一 Overlay 不应自动代表所有节点互相信任？

下一章将学习 **IPv6**：128-bit 地址、Link-local、SLAAC、Neighbor Discovery、ICMPv6 和 Dual Stack 如何改变地址配置与排障方法。

## 延伸阅读

- [Tailscale：Control and data planes](https://tailscale.com/docs/concepts/control-data-planes)
- [Tailscale：DERP servers](https://tailscale.com/docs/reference/derp-servers)
- [ZeroTier：The Protocol](https://docs.zerotier.com/protocol/)
- [RFC 7348：Virtual eXtensible Local Area Network（VXLAN）](https://www.rfc-editor.org/rfc/rfc7348)

---

## 系列导航

- [学习清单与完整目录](/notes/computer-net/00-learning-roadmap/)
- [上一章：Wireshark 综合实战：从 Packet 还原故障层次](/notes/computer-net/13-wireshark-practice/)
- [下一章：IPv6：地址、邻居发现与双栈排障](/notes/computer-net/15-ipv6-neighbor-discovery-dual-stack/)
