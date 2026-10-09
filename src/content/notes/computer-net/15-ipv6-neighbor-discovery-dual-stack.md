---
title: "IPv6 地址、邻居发现与双栈排障"
description: "掌握 IPv6 地址作用域、NDP、SLAAC、路由与 MTU，并定位 IPv4/IPv6 双栈路径差异。"
date: 2026-10-08
tags: ["计算机网络","IPv6","双栈"]
---

IPv6 不只是“把 IPv4 地址从 32 bit 扩成 128 bit”。地址长度变化只是表面，真正影响配置和排障的是：

```text
一块接口通常同时拥有多个 IPv6 地址
Link-local 地址是正常工作的基础组件
ARP 被 ICMPv6 Neighbor Discovery 取代
默认路由通常来自 Router Advertisement
路由器不再替经过它的 Packet 做分片
IPv4 与 IPv6 经常以 Dual Stack 同时存在
```

因此，看到一个 `fe80::...%10` 时，不应只问“它是不是公网 IP”，而要先问：

```text
它属于什么 Scope？
在哪个 Interface 上？
目标是同链路还是跨 Router？
应用最终选择了 A 还是 AAAA？
```

---

## 1. 为什么需要 IPv6

IPv4 地址只有 32 bit，共约 43 亿个可能值，且其中还有保留和特殊用途空间。NAT 缓解了公网地址短缺，却也引入了状态映射、端口复用和入站连接困难。

IPv6 使用 128-bit 地址空间，主要目标包括：

- 提供极大的地址空间；
- 让网络能大规模地进行层次化寻址与路由；
- 支持更自然的端到端可达模型；
- 通过 SLAAC、NDP 等机制重新设计主机配置和邻居发现。

这不代表 IPv6 自动实现安全、隐私或端到端业务可达。Firewall、ACL、身份认证和应用加密仍然必需。

## 2. IPv6 地址如何书写

IPv6 地址是 128 bit，通常写成八组十六进制，每组 16 bit：

```text
2001:0db8:0000:0000:0212:34ff:fe56:789a
```

每个十六进制字符表示 4 bit，所以：

```text
8 groups × 4 hex digits × 4 bit = 128 bit
```

### 2.1 省略每组开头的零

```text
2001:0db8:0000:0000:0212:34ff:fe56:789a
↓
2001:db8:0:0:212:34ff:fe56:789a
```

只能省略一组内部的**前导零**，不能删除有意义的尾部零。

### 2.2 用 `::` 压缩连续的全零组

```text
2001:db8:0:0:212:34ff:fe56:789a
↓
2001:db8::212:34ff:fe56:789a
```

一个地址中最多只能出现一次 `::`，否则无法判断每处分别代表多少个零组。

规范化显示通常压缩最长的一段连续零组；长度相同则选最左边的一段。解析时不应依赖用户一定采用同一种大小写或压缩形式。

### 2.3 展开地址

例如：

```text
2001:db8::1
```

已写出三组：`2001`、`db8`、`1`，所以 `::` 代表五组 `0000`：

```text
2001:0db8:0000:0000:0000:0000:0000:0001
```

`2001:db8::/32` 是文档示例前缀，不应当成真实公网地址部署。

## 3. 特殊地址与 Scope

### 3.1 Unspecified：`::`

```text
::
```

表示“尚未指定的地址”，作用类似 IPv4 的 `0.0.0.0` 在某些语境中的用途。它不能作为普通通信的目标主机地址。

### 3.2 Loopback：`::1`

```text
::1
```

表示本机 IPv6 协议栈，类似 IPv4 的 `127.0.0.1`。它不会离开本机。

### 3.3 Link-local：`fe80::/10`

Link-local 地址只在当前链路有效，通常自动生成。它不是“没有公有 IPv6 时的备用地址”：启用 IPv6 的接口通常无论是否已有 Global 地址，都保留 Link-local；同一接口可以同时拥有两者。它承担很多基础工作，例如：

```text
Neighbor Discovery
Router Solicitation / Advertisement
同一链路内通信
作为某些 IPv6 Route 的 Next Hop
```

它不能被普通 Router 转发到另一个链路。不同接口上可以同时出现相同的 Link-local 地址，因此只写地址可能无法确定出站接口。

Windows 中常见：

```text
fe80::1234:5678:9abc:def0%10
```

这里：

```text
fe80::1234:5678:9abc:def0 = IPv6 地址
%10                         = Zone/Scope Identifier
```

`%10` 不是 IPv6 地址的 128 bit 内容。它通常用来选择本机的接口或作用域；在 Windows 上常对应 Interface Index，但应通过系统命令核对，而不是只凭数字猜测：

```powershell
Get-NetIPInterface -AddressFamily IPv6
```

访问 Link-local 目标时可能必须携带 Zone ID：

```powershell
ping -6 fe80::1234:5678:9abc:def0%10
```

### 3.4 Global Unicast

Global Unicast 用于跨网络路由，概念上接近 IPv4 公网单播地址。当前全球单播分配主要位于：

```text
2000::/3
```

但判断一个地址的实际可达性不能只看前缀，还要看 Route、Firewall、运营商和对端服务。

### 3.5 Unique Local Address：`fc00::/7`

ULA 用于站点或组织内部。实际自行生成的本地地址通常来自：

```text
fd00::/8
```

它常被类比为 IPv4 Private Address，但二者机制和使用习惯并不完全等价。ULA 默认不在全球 Internet 路由，设计时还强调随机生成 Global ID，以降低不同网络合并时的冲突概率。

### 3.6 Multicast：`ff00::/8`

IPv6 没有 IPv4 意义上的 Broadcast，很多一对多发现改用 Multicast。Multicast 地址还包含 Scope，用来限制传播范围。

例如 NDP 通常利用 Solicited-node Multicast，只把请求发给可能拥有目标地址的节点集合，而不是广播给链路上的所有主机。

## 4. 一块 Interface 可以同时有多个 IPv6 地址

在 IPv4 入门阶段，人们容易形成：

```text
一块网卡 = 一个 IP
```

这个模型本来就不严格，在 IPv6 中更明显。一块接口可能同时拥有：

```text
Link-local Address
Global Unicast Address
Temporary Global Address
ULA
其他手工或自动配置地址
```

系统发送 Packet 时会根据 Destination、Route 和 Source Address Selection 规则选择合适的源地址。不能随便挑列表中的任意 IPv6 地址作为源地址。

Temporary Address 常用于减少长期稳定 Interface Identifier 带来的跨网络跟踪风险；它不会替代应用层身份认证，也不意味着绝对匿名。

## 5. Prefix Length 与 `/64`

IPv6 使用 Prefix Length，而不是点分十进制 Subnet Mask：

```text
2001:db8:1234:5678::/64
```

表示前 64 bit 是 Network Prefix，后 64 bit 是 Interface Identifier 空间。

正常以太网 LAN 中，使用 SLAAC 的 Prefix 通常是 `/64`。这是 IPv6 自动配置及相关机制的重要假设，不应随意把 `/120` 当成 IPv4 式“小子网”分给普通终端 LAN。

但也不要把这句话误记成：

> 所有 IPv6 Link 在任何场景下都只能是 `/64`。

点到点链路、Loopback、路由汇总等场景可以使用其他 Prefix Length。判断时必须结合链路类型和协议要求。

## 6. IPv6 基本 Header 与 IPv4 的区别

IPv6 基本 Header 固定为 40 bytes，主要字段包括：

```text
Version
Traffic Class
Flow Label
Payload Length
Next Header
Hop Limit
Source Address
Destination Address
```

### Hop Limit 不是 TLS

IPv4 中限制转发跳数的字段叫 TTL；IPv6 对应字段叫 Hop Limit：

```text
IPv4: TTL
IPv6: Hop Limit
TLS : Transport Layer Security，加密协议
```

Router 每转发一次就将 Hop Limit 减 1，减到 0 时丢弃 Packet，并通常返回 ICMPv6 Time Exceeded。

### Next Header

Next Header 指示后续内容可能是：

```text
TCP
UDP
ICMPv6
IPv6 Extension Header
```

IPv6 把部分可选功能移到 Extension Header 链中，使基本 Header 更固定。入门阶段先会识别即可，不必马上背完所有扩展头。

### 没有 Header Checksum

IPv6 基本 Header 没有 IPv4 Header Checksum。链路层校验、传输层校验以及每跳都要修改 Hop Limit 的现实共同影响了这一设计。

## 7. Fragmentation 与 Path MTU Discovery

IPv4 Router 在一定条件下可以替转发中的 Datagram 分片；IPv6 Router 不会对经过的 Packet 进行分片。

当 Packet 对后续链路过大时，Router 应返回：

```text
ICMPv6 Packet Too Big
```

发送端据此降低大小；若确需 IPv6 Fragment Header，也由源节点负责生成。因此 ICMPv6 不只是“给 ping 用”，它直接关系到 Path MTU Discovery。

若 Firewall 粗暴地屏蔽必要 ICMPv6，可能出现：

```text
小 Packet 正常
大 Packet 卡住
TCP 握手成功
传输较大内容失败
```

这与 Overlay Tunnel 的 MTU 问题也会叠加。

## 8. SLAAC：主机如何自动获得地址

SLAAC 是 Stateless Address Autoconfiguration。一个简化流程是：

```text
Host 生成 Link-local Address
        ↓
执行 Duplicate Address Detection
        ↓
发送 Router Solicitation（可选，用于主动询问）
        ↓
Router Advertisement 提供 Prefix、Default Router 等信息
        ↓
Host 形成 Global/ULA Address
        ↓
再次进行 Duplicate Address Detection
```

### RA 能提供什么

Router Advertisement 可以携带或表达：

- Router Lifetime，用于形成或维护 Default Route；
- Prefix Information；
- Prefix 是否可用于 SLAAC；
- 是否建议配合 DHCPv6 获取其他配置；
- MTU；
- 某些网络中的 DNS 信息，例如 RDNSS 选项。

一个重要区别是：

```text
IPv4 DHCP 常同时给 Address、Gateway、DNS
IPv6 Default Router 通常由 RA 学到，而不是由 DHCPv6 下发
```

### DHCPv6 仍然可以存在

SLAAC 不应简单定义为 IPv4 DHCP 的替代品。它让主机依据 RA 中允许自动配置的 Prefix 构造地址，不需要地址服务器逐个维护租约；SLAAC 与 DHCPv6 可以组合，包括同时获得不同来源的地址。Default Router 发现仍主要依赖 RA。

IPv6 网络可以采用：

```text
纯 SLAAC
SLAAC + Stateless DHCPv6
Stateful DHCPv6 + RA
静态配置
```

即使使用 Stateful DHCPv6 分配地址，主机通常仍依赖 RA 发现 Default Router。DNS 可以来自 RA 的 RDNSS，也可以来自 DHCPv6；实际支持取决于网络和操作系统。

## 9. DAD：避免地址重复

Duplicate Address Detection 用于确认一个准备启用的地址是否已经被同链路其他节点使用。

主机会针对待检测地址发送 Neighbor Solicitation，并观察是否出现冲突响应。检测期间地址还不能按普通已分配地址使用。

DAD 降低意外冲突风险，但它不是强身份认证机制，也不能抵御所有恶意节点。

## 10. NDP：IPv6 为什么不用 ARP

IPv4 在 Ethernet 上常用 ARP：

```text
Next-hop IPv4
→ Next-hop MAC
```

IPv6 使用 Neighbor Discovery Protocol。NDP 建立在 ICMPv6 上，主要消息包括：

| ICMPv6 消息 | 主要作用 |
| --- | --- |
| Router Solicitation（RS） | 主机主动询问 Router |
| Router Advertisement（RA） | Router 公告 Prefix、Default Router 等信息 |
| Neighbor Solicitation（NS） | 地址解析、可达性检测、DAD |
| Neighbor Advertisement（NA） | 回答 NS 或通告邻居信息变化 |
| Redirect | 告知更合适的 First Hop |

同链路发送仍遵循熟悉的模型：

```text
Destination 在 On-link Prefix
→ 直接解析 Destination 的 Link-layer Address

Destination 不在 On-link Prefix
→ 选择 Default Router
→ 解析 Router 的 Link-layer Address
```

变化只在于解析机制从 ARP 换成 NDP，底层的“IP 看最终目标，二层地址看当前一跳”仍成立。

### NDP 不只是 ARP 替代品

ARP 主要负责 IPv4 到 MAC 的映射；NDP 还组合了：

```text
Router Discovery
Prefix Discovery
Address Resolution
Neighbor Unreachability Detection
Duplicate Address Detection
Redirect
```

所以把 NDP 仅仅叫作“IPv6 ARP”有助于入门类比，却不完整。

## 11. ICMPv6 是 IPv6 正常工作的关键部分

ICMPv6 承担：

```text
错误报告
Echo Request / Reply
NDP
Router Discovery
Path MTU Discovery
```

正确的安全策略应按类型和方向允许必要 ICMPv6，而不是笼统地“全部禁掉”。否则可能破坏地址配置、邻居发现、错误反馈和 MTU 探测。

## 12. IPv6 与 NAT

IPv6 的巨大地址空间通常消除了为“节省公网地址”而部署传统 NAPT/PAT 的必要性。内部设备可以拥有 Global Unicast 地址，并由 Stateful Firewall 决定哪些入站连接允许通过。

必须分清：

```text
NAT
= 地址/端口翻译

Firewall
= 按状态和规则允许或拒绝流量
```

没有 NAT 不等于没有边界保护。

IPv6 世界仍存在 NAT66、NPTv6、NAT64 等机制，但它们解决的是特定问题，不能推出“IPv6 和 IPv4 一样必须靠 NAT 才安全”。

## 13. Dual Stack 与 DNS

现实网络常同时运行：

```text
IPv4 + IPv6 = Dual Stack
```

DNS 中：

```text
A Record    → IPv4 Address
AAAA Record → IPv6 Address
```

A 与 AAAA 分别是 IPv4 和 IPv6 地址记录，不是专为 Dual Stack 设计的；单栈环境也会使用对应记录。应用解析同一域名后可能同时获得 A 和 AAAA。现代连接算法通常不会机械地永远先等某一种地址失败才尝试另一种，而会以类似 Happy Eyeballs 的策略竞争或错开发起 IPv6/IPv4 连接，以减少单栈路径异常造成的等待。

因此：

```text
AAAA 能解析出来
≠ IPv6 Path 一定正常

Browser 能快速打开
≠ Browser 一定只使用 IPv6
```

浏览器可能已回退到 IPv4。排障时要分别测试两条路径。

## 14. IPv4-only 与 IPv6-only 如何互通

地址族不同的端点不能仅靠普通 Routing 直接通信。常见过渡或翻译机制包括：

```text
Dual Stack
Configured/Automatic Tunnel
NAT64 + DNS64
464XLAT
Application Proxy
```

NAT64 与 DNS64 的简化模型：

```text
IPv6-only Client
   ↓ 查询只有 A 的目标
DNS64 合成带特殊 Prefix 的 AAAA
   ↓
NAT64 Gateway 翻译 IPv6 ↔ IPv4
   ↓
IPv4-only Server
```

这类合成 AAAA 不等于服务器原生拥有 IPv6 地址。看到地址时还要判断它是否来自翻译 Prefix。

## 15. IPv6 Literal、Port 与 Zone ID

IPv6 地址中本身已有冒号，地址与 Port 组合时必须加方括号：

```text
[2001:db8::10]:443
```

否则无法区分地址中的冒号与端口分隔符。

URL 也采用方括号：

```text
https://[2001:db8::10]/
```

Link-local Zone ID 在命令行和 URI 中的表示细节不完全相同；URI 中百分号通常需要按 URI 规则编码。不要把某个工具接受的 `%10` 写法盲目复制到所有 API 或配置文件。

## 16. Windows 上如何观察 IPv6

### 查看地址、Gateway 和 DNS

```powershell
ipconfig /all
Get-NetIPConfiguration
Get-NetIPAddress -AddressFamily IPv6
```

观察：

```text
InterfaceAlias / InterfaceIndex
IPAddress
PrefixLength
AddressState
PrefixOrigin / SuffixOrigin
Default Gateway
DNS Server
```

### 查看接口

```powershell
Get-NetIPInterface -AddressFamily IPv6
```

这一步能把 `%10` 之类 Zone ID 与 Interface Index 联系起来。

### 查看 Route

```powershell
Get-NetRoute -AddressFamily IPv6 |
  Sort-Object DestinationPrefix, RouteMetric
```

重点观察：

```text
::/0          Default Route
fe80::/64     Link-local On-link Route（具体表现视系统而定）
DestinationPrefix
NextHop
InterfaceIndex
RouteMetric
```

与 IPv4 一样，先做 Longest Prefix Match，再按系统规则在可用 Route 中选择。

### 查看 Neighbor Cache

```powershell
Get-NetNeighbor -AddressFamily IPv6
```

这相当于观察 NDP 学到的邻居状态，不要仍只盯着 `arp -a`。

### 分别检查 A 与 AAAA

```powershell
Resolve-DnsName example.com -Type A
Resolve-DnsName example.com -Type AAAA
```

### 强制测试 IPv6

```powershell
ping -6 example.com
tracert -6 example.com
```

这些命令分别观察 ICMPv6 Echo 和逐跳 Hop Limit/Time Exceeded 行为。目标或中间网络不回应 ICMPv6，并不自动等于所有 TCP/UDP 业务都不可达。

## 17. Wireshark 观察 IPv6

常用 Display Filter：

```wireshark
ipv6
```

```wireshark
icmpv6
```

```wireshark
ipv6.addr == 2001:db8::10
```

```wireshark
icmpv6.type == 133 || icmpv6.type == 134
```

最后一条用于观察 RS/RA。还可以对照：

```text
RS: Host 主动找 Router
RA: Router 公告自身和 Prefix
NS/NA: Neighbor Resolution、DAD 或可达性维护
```

抓到 NDP 后仍要看 Capture Interface。Link-local Multicast 不会穿过 Router，换一个接口抓包可能完全看不到同一组消息。

## 18. Dual Stack 排障顺序

当“域名能解析，但连接偶尔慢或失败”时，不要只跑一次 `ping`。建议拆开：

```text
1. DNS 是否同时返回 A / AAAA？
2. 本机是否有可用 IPv6 Address？AddressState 是否正常？
3. 是否有 ::/0 或目标更具体的 IPv6 Route？
4. Default Router 的 Link-local Next Hop 是否能通过 NDP 解析？
5. ping -6 / tracert -6 的结果如何？
6. 目标 Port 的 IPv6 连接是否成功？
7. IPv4 是否正常，应用是否发生快速回退？
8. Wireshark 中是 DNS、NDP、ICMPv6、TCP 还是 TLS 阶段失败？
```

常见现象及方向：

| 现象 | 优先检查 |
| --- | --- |
| 只有 `fe80::`，没有 Global/ULA | RA、Prefix、网络是否提供 IPv6 |
| 有地址但没有 `::/0` | RA、Router Lifetime、接口策略 |
| 有 Route，Next Hop 一直解析失败 | NDP、VLAN/Wi-Fi 隔离、ICMPv6 Firewall |
| IPv6 小包通、大流量卡住 | ICMPv6 Packet Too Big、PMTUD、Tunnel MTU |
| AAAA 存在但连接慢，IPv4 正常 | IPv6 Route/Firewall/回程，Happy Eyeballs 行为 |
| Link-local 地址报无效或不可达 | 是否缺少或选错 Zone ID |
| `ping -6` 不通但网页正常 | ICMPv6 Echo 策略、网页是否回退 IPv4、TCP 是否另有结果 |

## 19. IPv6 与 Overlay 的联系

前一章的 Inner/Outer 模型在 IPv6 中仍然成立：

```text
Inner IPv6 Packet
→ Overlay Agent
→ Outer IPv4 or IPv6 UDP Flow
```

也可能反过来：

```text
Inner IPv4 Packet
→ Overlay Agent
→ Outer IPv6 UDP Flow
```

所以“应用访问的是 IPv6”不代表 Physical Interface 上一定看到原始 IPv6 Destination。抓包时仍要区分 Virtual Interface 与 Physical Interface。

IPv6 也不会自动消除 NAT Traversal：如果 Outer Path 仍走 IPv4 NAT，Overlay 仍要处理 IPv4 Mapping、Hole Punching 或 Relay。

## 20. 本章核心模型

```text
Application asks for a hostname
        ↓
DNS returns A and/or AAAA
        ↓
Address selection + connection strategy
        ↓
IPv6 Route lookup
        ↓
On-link Destination ?
   ├─ Yes → NDP resolves Destination Link-layer Address
   └─ No  → NDP resolves Default Router Link-layer Address
        ↓
Ethernet/Wi-Fi carries IPv6 Packet to current hop
        ↓
Routers decrement Hop Limit and forward
        ↓
TCP/UDP/ICMPv6 and Application Protocol
```

需要记住：

1. IPv6 是 128-bit 地址体系，不只是“更长的 IPv4”。
2. `::` 只能在一个地址中出现一次；`::1` 是 Loopback，`::` 是 Unspecified。
3. Link-local `fe80::/10` 只在当前链路有效，Zone ID 用于区分本机作用域/接口。
4. 一块接口通常同时拥有多个 IPv6 地址，系统会做源地址选择。
5. 普通 SLAAC LAN 通常使用 `/64`，但并非所有 IPv6 Prefix 在所有用途下都只能是 `/64`。
6. IPv6 用 Hop Limit 对应 IPv4 TTL；TLS 是完全不同的加密协议。
7. IPv6 Router 不替途经 Packet 分片，ICMPv6 Packet Too Big 对 PMTUD 很关键。
8. SLAAC 主要依赖 RA；IPv6 Default Router 通常不是 DHCPv6 下发的。
9. NDP 建立在 ICMPv6 上，不只替代 ARP，还负责 Router/Prefix/Neighbor Discovery 等。
10. IPv6 没有 Broadcast，许多发现机制使用有 Scope 的 Multicast。
11. IPv6 通常不需要为节省地址而做传统 NAT，但 Firewall 仍然必需。
12. Dual Stack 要分别验证 IPv4 和 IPv6，应用可能通过 Happy Eyeballs 回退。

## 思考题

1. 为什么 `fe80::1` 在两块接口上可以同时存在，而通信时需要 Zone ID？
2. `::`、`::1` 与 `2001:db8::1` 分别是什么？
3. 为什么 `[2001:db8::10]:443` 必须加方括号？
4. SLAAC、RA 和 DHCPv6 各自可能承担什么职责？Default Router 通常从哪里来？
5. NDP 为什么不能只理解成“IPv6 版 ARP”？
6. IPv6 为什么没有 ARP Broadcast，NS 通常发往哪里？
7. 为什么屏蔽全部 ICMPv6 可能导致 TCP 小包通、大包不通？
8. IPv6 没有传统 NAT 时，为什么仍需要 Stateful Firewall？
9. 域名同时有 A 和 AAAA 时，网页成功能否证明 IPv6 正常？
10. 一块接口为什么会同时出现 Link-local、Global 和 Temporary 地址？
11. `/64` 对普通 SLAAC LAN 为什么重要？它是否适用于所有 IPv6 Route？
12. Overlay 的 Inner Address 与 Outer Address 可以使用不同 IP 版本吗？

下一章进入 [TCP 流量控制、拥塞控制与背压](/notes/computer-net/16-tcp-flow-congestion-backpressure/)，再学习 [SSH Tunnel](/notes/computer-net/17-ssh-tunnels-forwarding/)，最后按学习清单完成综合实验。

## 延伸阅读

- [RFC 4007：IPv6 Scoped Address Architecture](https://www.rfc-editor.org/rfc/rfc4007)
- [RFC 4291：IP Version 6 Addressing Architecture](https://www.rfc-editor.org/rfc/rfc4291)
- [RFC 4861：Neighbor Discovery for IP version 6](https://www.rfc-editor.org/rfc/rfc4861)
- [RFC 4862：IPv6 Stateless Address Autoconfiguration](https://www.rfc-editor.org/rfc/rfc4862)
- [RFC 8200：Internet Protocol, Version 6 Specification](https://www.rfc-editor.org/rfc/rfc8200)
- [RFC 6724：Default Address Selection for IPv6](https://www.rfc-editor.org/rfc/rfc6724)
- [RFC 8305：Happy Eyeballs Version 2](https://www.rfc-editor.org/rfc/rfc8305)

---

## 系列导航

- [学习清单与完整目录](/notes/computer-net/00-learning-roadmap/)
- [上一章：Overlay Network：Underlay 之上的逻辑网络](/notes/computer-net/14-overlay-control-data-planes/)
- [下一章：TCP 流量控制、拥塞控制与背压](/notes/computer-net/16-tcp-flow-congestion-backpressure/)
