---
title: "路由表与最长前缀匹配"
description: "通过最长前缀匹配、下一跳和 Metric 理解路由选择，以及双网卡、VPN 与地址重叠的排查。"
date: 2026-10-07
tags: ["计算机网络", "路由", "Windows"]
---

前面建立过一个便于入门的模型：

```text
目标在同一子网
→ 直接发送

目标不在同一子网
→ 交给默认网关
```

这个模型没有错，但它省略了操作系统真正执行的核心步骤：

> 给定一个目标 IP，查询路由表，选择最合适的出口接口和下一跳。

当电脑同时连接公司网络、设备网络、Wi-Fi、VPN、TUN 和虚拟机网络时，所有流量走向都建立在这个过程之上。

## 1. Routing Table：路由表解决什么问题

路由表是一组关于“哪些目标应该怎么走”的规则。

给定：

```text
Destination IP = 8.8.8.8
```

路由查询主要回答：

```text
从哪个 Interface 发出？
下一跳 Next Hop 是谁？
```

然后才轮到后续步骤：

```text
Destination IP
      ↓
Routing Table
      ↓
选择 Interface + Next Hop
      ↓
解析本地下一跳的链路层地址
      ↓
创建链路层帧
      ↓
发送
```

对于普通 Ethernet IPv4 网络，“解析下一跳的链路层地址”通常就是 ARP。

## 2. 一条路由包含什么

一条 IPv4 路由通常包含：

```text
Destination Prefix  目标前缀
Next Hop            下一跳
Interface           出口接口
Metric              成本
```

例如：

```text
Destination Prefix   Next Hop   Interface   Route Metric
10.4.0.0/21          On-link    WLAN        256
0.0.0.0/0            10.4.0.1   WLAN        0
```

可以先理解成：

```text
10.4.0.0/21
→ 这个目标范围直接连接在 WLAN 上

0.0.0.0/0
→ 没有更具体路线时，经 WLAN 交给 10.4.0.1
```

路由表描述的目标是网络前缀，不是只有单个 IP。一个 `/32` 前缀才只匹配一个 IPv4 地址。

## 3. 路由前缀如何匹配目标

路由前缀与子网写法相同。例如：

```text
10.4.0.0/21
```

表示所有前 21 bit 与 `10.4.0.0` 相同的目标地址，即：

```text
10.4.0.0 ～ 10.4.7.255
```

判断某个目标是否匹配这条路由，本质上仍然是比较前缀位。

```text
10.4.5.20
→ 匹配 10.4.0.0/21

10.4.9.20
→ 不匹配 10.4.0.0/21
```

## 4. `0.0.0.0/0`：默认路由

`/0` 表示没有任何前缀位需要匹配，因此每个 IPv4 地址都能匹配：

```text
1.1.1.1
8.8.8.8
10.20.30.40
192.168.1.1
```

都属于：

```text
0.0.0.0/0
```

所以它适合作为兜底规则，称为 Default Route（默认路由）：

```text
0.0.0.0/0
→ Next Hop = 10.4.0.1
→ Interface = WLAN
```

“默认网关 `10.4.0.1`”从路由角度看，就是这条默认路由所指定的下一跳。

默认网关不是另一套独立于路由表的机制，也不等于 NAT 或 Internet 出口。

## 5. On-link：不经过 IP 下一跳路由器

Windows 的 `route print` 经常显示：

```text
On-link
```

它表示目标前缀通过指定接口直接可达，不需要先交给另一个 IP 路由器。

例如接口配置为：

```text
10.4.6.6/21
```

系统通常会生成直连路由：

```text
10.4.0.0/21 → On-link via WLAN
```

访问 `10.4.5.20` 时：

```text
查路由表
→ 匹配 10.4.0.0/21
→ On-link
→ 从 WLAN 直接解析 10.4.5.20 的邻居地址
```

在 Ethernet IPv4 网络中，这通常意味着直接 ARP 查询目标 `10.4.5.20`，而不是查询默认网关。

“On-link”是三层路由结果，不保证两台设备之间没有交换机、AP 或其他二层设备；它只表示不需要指定另一个 IP 下一跳。

在 PowerShell 的 `Get-NetRoute` 输出中，直连 IPv4 路由的 `NextHop` 通常显示为：

```text
0.0.0.0
```

## 6. Longest Prefix Match：最长前缀匹配

一个目标 IP 往往同时匹配多条路由。

假设路由表中有：

```text
10.4.0.0/21 → On-link
10.0.0.0/8  → Gateway A
0.0.0.0/0   → Gateway B
```

访问：

```text
10.4.5.20
```

它同时匹配：

```text
10.4.0.0/21
10.0.0.0/8
0.0.0.0/0
```

系统优先选择：

```text
10.4.0.0/21
```

因为 `/21` 比 `/8` 和 `/0` 更具体。这条规则称为 **Longest Prefix Match（最长前缀匹配）**。

```text
/32 比 /24 具体
/24 比 /16 具体
/16 比 /8 具体
/8  比 /0 具体
```

前缀越长，能够匹配的地址范围越小，规则也就越具体。

## 7. 路由表不是“第一条匹配就使用”

不要把路由选择理解成按屏幕显示顺序从上向下寻找第一条匹配规则。

例如：

```text
10.0.0.0/8
10.4.0.0/16
10.4.5.0/24
0.0.0.0/0
```

目标是：

```text
10.4.5.100
```

四条路由都能匹配，但系统选择：

```text
10.4.5.0/24
```

因为它拥有最长前缀。路由在命令输出中排在第几行，不是选择它的根本原因。

可以把目标范围类比成地址层级：

```text
中国
中国・上海
中国・上海・浦东
中国・上海・浦东・某条路
```

它们都可能描述同一个位置，但最具体的地址提供最精确的路线。

## 8. Metric 何时参与选择

最长前缀匹配优先于 Metric。

假设目标同时匹配：

```text
10.4.0.0/16 → Metric 100
0.0.0.0/0   → Metric 1
```

即使 `/16` 的 Metric 更大，访问 `10.4.5.20` 时仍优先选择 `/16`，因为它的前缀更长。

只有候选路由的前缀长度相同时，才进一步比较成本：

```text
先比较 Prefix Length
        ↓
前缀相同时比较 Metric
        ↓
成本更低的路由优先
```

Metric 可以理解为路由成本或偏好值，而不是带宽、延迟或跳数的实时测量结果。它可能由系统自动计算，也可能由管理员或软件配置。

## 9. Windows 的总 Metric

Windows 中需要区分：

```text
RouteMetric
InterfaceMetric
```

选择相同前缀长度的路由时，Windows 使用的总成本是：

```text
Effective Metric = RouteMetric + InterfaceMetric
```

例如：

```text
Route A:
Prefix          = 0.0.0.0/0
RouteMetric     = 5
InterfaceMetric = 25
Total           = 30

Route B:
Prefix          = 0.0.0.0/0
RouteMetric     = 10
InterfaceMetric = 5
Total           = 15
```

两个前缀同为 `/0`，因此 Route B 通常更优先。

只看 `Get-NetRoute` 的 `RouteMetric` 可能得出错误结论，还应结合：

```powershell
Get-NetIPInterface -AddressFamily IPv4
```

查看 `InterfaceMetric`。Windows 默认可根据链路特征自动设置接口 Metric，也允许显式配置。

## 10. 一次完整的路由选择示例

假设有以下路由：

| Destination Prefix | Next Hop | Interface | 总 Metric |
| --- | --- | --- | ---: |
| `10.4.5.0/24` | Gateway C | Ethernet | 50 |
| `10.4.0.0/16` | Gateway B | VPN | 10 |
| `10.0.0.0/8` | Gateway A | WLAN | 5 |
| `0.0.0.0/0` | Gateway D | WLAN | 1 |

访问：

```text
10.4.5.100
```

选择过程是：

```text
匹配 /24、/16、/8、/0
        ↓
最长前缀是 /24
        ↓
选择 Gateway C
```

这里不会因为默认路由的 Metric 最小而选择 Gateway D。前缀长度的比较发生在 Metric 之前。

访问：

```text
10.9.1.1
```

只能匹配 `/8` 和 `/0`，因此选择 Gateway A。

访问：

```text
8.8.8.8
```

这里只匹配 `/0`，因此选择 Gateway D。

## 11. 路由选择之后发生什么

路由表返回的不是最终 MAC 地址，而是：

```text
出口 Interface
+
IP Next Hop
```

接下来的处理取决于路由类型。

### 直连路由

```text
Destination = 10.4.5.20
Route       = 10.4.0.0/21 On-link
```

在 Ethernet IPv4 网络中：

```text
ARP 查询 10.4.5.20 的 MAC
```

### 经网关路由

```text
Destination = 8.8.8.8
Route       = 0.0.0.0/0 via 10.4.0.1
```

在 Ethernet IPv4 网络中：

```text
ARP 查询 10.4.0.1 的 MAC
```

无论哪种情况，ARP 都不会替代路由判断。正确顺序是：

```text
路由决定下一跳
        ↓
ARP 解析这个本地下一跳
```

## 12. 路由表中为何有很多自动生成的条目

配置一个 IPv4 接口后，Windows 通常会自动生成多种路由，例如：

```text
接口所在子网的直连路由
本机地址对应的 /32 路由
回环网络路由
广播或组播相关路由
默认网关对应的默认路由
```

所以 `route print` 的输出不会只有“本地子网”和“默认路由”两行。

例如本机地址：

```text
10.4.6.6/32 → On-link
```

只匹配本机这个单独地址；而：

```text
10.4.0.0/21 → On-link
```

匹配整个直连子网。

看到多条 On-link 路由并不表示网络一定配置重复，需要结合前缀、接口和用途判断。

## 13. 双网卡为什么可能“抢路由”

假设 Ethernet 和 WLAN 都获得了默认路由：

```text
0.0.0.0/0 → Ethernet Gateway → 总 Metric 10
0.0.0.0/0 → WLAN Gateway     → 总 Metric 25
```

访问 `8.8.8.8` 时，两条前缀同为 `/0`，Windows 通常选择总 Metric 较小的 Ethernet 路由。

如果 Ethernet 连接的网络并没有可用的外部出口，就可能出现：

> Wi-Fi 本来能够访问 Internet，插上设备网线后外网反而失败。

问题不一定出在 Wi-Fi，而可能是新增接口带来的默认路由拥有更低成本。

## 14. 工业现场常见的双网卡设计

假设电脑同时连接办公网络和控制器网络：

```text
WLAN:
10.4.6.6/21
Default Gateway = 10.4.0.1

Ethernet:
192.168.0.10/24
Default Gateway = 无

Controller:
192.168.0.253
```

路由表可以形成清晰分工：

```text
10.4.0.0/21    → On-link via WLAN
192.168.0.0/24 → On-link via Ethernet
0.0.0.0/0      → 10.4.0.1 via WLAN
```

访问控制器时：

```text
192.168.0.253
→ 匹配 192.168.0.0/24
→ Ethernet
```

访问普通外部地址时：

```text
没有更具体路由
→ 匹配 0.0.0.0/0
→ WLAN Gateway
```

这种设计让设备流量与办公网络流量互不争抢默认路由。

## 15. 为什么设备专用网卡通常不配默认网关

如果设备专用 Ethernet 只需要访问本地的 `192.168.0.0/24`，直连路由已经足够：

```text
192.168.0.0/24 → On-link via Ethernet
```

若又配置：

```text
Default Gateway = 192.168.0.1
```

系统可能增加第二条默认路由：

```text
0.0.0.0/0 → 192.168.0.1 via Ethernet
```

它可能与办公网或 Wi-Fi 的默认路由竞争。

因此一个实用原则是：

> 如果专用网卡只连接本地设备网段，不需要通过该网络访问其他网段，通常不要为它配置默认网关。

这不是“第二张网卡永远不能配网关”。如果设备网络后方确实还有其他子网，应根据拓扑配置明确的静态路由，或在设计要求下配置相应网关。

## 16. 多个远端设备网段如何处理

假设工业 Ethernet 本地是：

```text
192.168.0.10/24
```

它还需要通过设备侧路由器 `192.168.0.1` 访问：

```text
172.20.0.0/16
```

不一定要给设备网卡增加默认路由，可以只增加一条更具体的路线：

```text
172.20.0.0/16
→ Next Hop 192.168.0.1
→ Ethernet
```

这样：

```text
172.20.x.x → 设备侧路由器
其他外部目标 → 原有办公网默认路由
```

更具体的路由通常比增加第二个默认网关更清晰，也更不容易影响无关流量。

## 17. VPN 与 TUN 如何改变流量方向

VPN 客户端常创建虚拟接口并添加或修改路由：

```text
Application
    ↓
Routing Table
    ↓
TUN / VPN Interface
    ↓
VPN Client 封装与加密
    ↓
物理网络
    ↓
VPN Server
```

所谓“VPN 接管流量”，常见实现基础是：

```text
创建虚拟网络接口
+
安装更合适的路由
```

但具体 VPN 也可能使用策略路由、过滤平台、代理规则或其他机制，不能把所有 VPN 实现都简化成只修改一条默认路由。

## 18. VPN 不一定直接替换 `/0`

VPN 可以安装新的默认路由：

```text
0.0.0.0/0 → TUN
```

也常使用两条更具体的路由覆盖整个 IPv4 地址空间：

```text
0.0.0.0/1   → TUN
128.0.0.0/1 → TUN
```

这两条 `/1` 合起来覆盖所有 IPv4 地址，并且都比原来的 `/0` 更具体，所以根据最长前缀匹配优先进入 TUN，而不必删除原默认路由。

VPN 服务器本身的公网 IP 通常还需要一条经物理网卡直达的更具体路由，否则承载隧道的外层连接也可能被再次送入隧道，形成递归问题。

## 19. Full Tunnel 与 Split Tunnel

Full Tunnel（全隧道）通常让大部分或全部目标流量进入 VPN：

```text
多数目标
→ VPN / TUN
```

Split Tunnel（分流隧道）只让指定目标进入 VPN，其他流量保持直连：

```text
指定公司网段 → VPN
本地设备网段 → Ethernet Direct
普通 Internet → WLAN Direct
```

从路由角度看，分流可以通过安装一组目标前缀完成。例如：

```text
10.20.0.0/16 → TUN
0.0.0.0/0    → WLAN Gateway
```

不过现代代理或 VPN 软件还可能按域名、进程、端口或应用层规则分流，这些条件已经超出普通 IP 路由表本身的能力。

## 20. 为什么 VPN 会导致公司内网失效

假设公司服务器是：

```text
10.20.30.40
```

原本存在：

```text
10.0.0.0/8 → Company Gateway
```

VPN 又添加：

```text
10.20.0.0/16 → TUN
```

访问 `10.20.30.40` 时，两条都能匹配，但 `/16` 比 `/8` 更具体，所以流量进入 TUN。

即使两边都使用 `/8`，VPN 路由也可能因总 Metric 更小而获选。

这类现象常见原因包括：

```text
地址空间重叠
更具体的 VPN 路由
相同前缀下 VPN Metric 更低
VPN 客户端的额外过滤或安全策略
```

所以“开 VPN 后公司内网打不开”不一定表示公司服务器故障，应先检查实际获选路线。

## 21. 地址重叠为什么棘手

私有地址会被大量网络重复使用。例如家庭、公司和 VPN 对端都可能使用：

```text
192.168.1.0/24
```

假设本地打印机和 VPN 远端服务器恰好都使用 `192.168.1.50`。目标 IP 完全相同，仅靠普通目的地址路由无法同时表达“这次想访问本地打印机”和“这次想访问远端服务器”。

这可能需要：

```text
重新规划地址
NAT
策略路由
应用代理
选择不同的 VPN 地址池
```

单纯调整 Metric 只能在两条路线中选一条，不能让同一个目标 IP 自动代表两个不同设备。

## 22. 路由是逐跳决定的

本机通常不需要知道数据穿过 Internet 的完整路径，只需要确定本地下一跳：

```text
你的电脑
   ↓ Next Hop = Gateway A
Gateway A
   ↓ Next Hop = Router B
Router B
   ↓ Next Hop = Router C
Router C
   ↓
目标网络
```

每台三层设备都根据目标 IP 查询自己的路由表并选择下一跳。

```text
本机的路由表
≠
Internet 全程路线图
```

这种逐跳决策使每台路由器只需维护对自己有用的路径信息，而不必让每台终端掌握完整物理路径。

## 23. `tracert` 与逐跳路径

Windows 可以执行：

```powershell
tracert 8.8.8.8
```

输出中的：

```text
Hop 1
Hop 2
Hop 3
...
```

反映探测流量沿途经过或收到响应的三层节点。它可以帮助观察逐跳路径，但显示的结果不一定完整或固定：

- 某些路由器不响应探测，所以可能显示 `*`。
- 往返路径可能不同。
- 负载均衡可能让不同探测包走不同路径。
- 节点显示的地址是返回响应所使用的地址，不一定直观代表整台设备。

`tracert` 如何利用 TTL 和 ICMP 得到这些结果，将在下一章展开。

## 24. 在 Windows 中查看路由表

### `route print`

只查看 IPv4 路由：

```powershell
route print -4
```

重点字段是：

```text
Network Destination
Netmask
Gateway
Interface
Metric
```

例如：

```text
Network Destination  Netmask         Gateway   Interface  Metric
0.0.0.0              0.0.0.0        10.4.0.1  10.4.6.6   25
10.4.0.0             255.255.248.0  On-link   10.4.6.6   281
```

第一条是默认路由，第二条是 `10.4.0.0/21` 的直连路由。

### `Get-NetRoute`

```powershell
Get-NetRoute -AddressFamily IPv4
```

重点关注：

```text
DestinationPrefix
NextHop
InterfaceAlias / InterfaceIndex
RouteMetric
InterfaceMetric
```

可以只看默认路由：

```powershell
Get-NetRoute -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0"
```

### `Get-NetIPInterface`

```powershell
Get-NetIPInterface -AddressFamily IPv4
```

用它查看接口状态和 `InterfaceMetric`，再与路由的 `RouteMetric` 一起分析。

### `Find-NetRoute`

要让 Windows 直接显示某个目标的最佳路线，可以使用：

```powershell
Find-NetRoute -RemoteIPAddress 8.8.8.8
```

它可以帮助确认获选的本地源地址、接口、下一跳和路由，而不必只靠肉眼浏览整张表。

## 25. 一套只读排查流程

当流量疑似走错接口时，可以依次执行：

```powershell
Get-NetIPConfiguration
Get-NetIPInterface -AddressFamily IPv4
Get-NetRoute -AddressFamily IPv4
Find-NetRoute -RemoteIPAddress 8.8.8.8
Get-NetNeighbor -AddressFamily IPv4
tracert 8.8.8.8
```

分别回答：

```text
接口有哪些地址和网关？
接口 Metric 是多少？
有哪些目标前缀和下一跳？
指定目标实际选中了哪条路线？
下一跳是否已经解析为邻居地址？
探测流量经过了哪些三层节点？
```

先观察再修改。特别是在远程连接、VPN 或生产设备网络上，不要在没有确认影响范围时删除默认路由或批量清空路由表。

## 26. 本章核心模型

```text
Destination IP
      ↓
查找所有匹配的 Route
      ↓
选择最长 Prefix
      ↓
前缀相同？
      ↓
比较 RouteMetric + InterfaceMetric
      ↓
得到 Interface + Next Hop
      ↓
下一跳是否 On-link？
   ┌───────────────┴───────────────┐
   │                               │
  是                               否
   │                               │
解析最终目标的邻居地址       解析网关的邻居地址
   │                               │
   └───────────────┬───────────────┘
                   ↓
              链路层发送
```

需要记住：

1. 路由表根据目标 IP 选择出口接口与下一跳。
2. `0.0.0.0/0` 匹配所有 IPv4 地址，是默认路由。
3. On-link 表示不需要另一个 IP 下一跳，不表示中间没有二层设备。
4. 路由选择先比较前缀长度，最长者优先。
5. Windows 在相同前缀下比较 `RouteMetric + InterfaceMetric` 的总成本。
6. ARP 在路由选择之后解析本地下一跳，不负责选择路线。
7. 双网卡、VPN 与 TUN 问题经常表现为更具体路由或更低 Metric 抢走流量。
8. 专用设备网卡若只访问直连子网，通常不需要默认网关。
9. 路由是逐跳决定的，本机不需要知道完整的端到端物理路径。

## 思考题

1. 路由表中同时存在 `10.0.0.0/8`、`10.4.0.0/16`、`10.4.5.0/24` 和 `0.0.0.0/0`，访问 `10.4.5.100` 会选择哪条？
2. 使用同一张路由表访问 `10.9.1.1` 和 `8.8.8.8`，分别会选择哪条？
3. `/24` 路由的 Metric 为 100，而 `/0` 路由的 Metric 为 1，目标同时匹配两者时为什么仍选择 `/24`？
4. 两条 `/0` 路由的 `RouteMetric` 分别为 5 和 10，为什么还不能只凭这两个数字判断最终选择？
5. 为什么只连接本地控制器的第二张网卡通常不建议配置默认网关？
6. 如果设备侧路由器后还有一个远端子网，怎样避免添加第二个默认网关？
7. VPN 使用 `0.0.0.0/1` 和 `128.0.0.0/1` 有什么效果？为什么它们能优先于原 `/0`？
8. 开启 VPN 后公司内网失败，应该从哪些路由因素开始排查？
9. 两个不同网络存在完全相同的目标 IP 时，为什么只调整 Metric 无法同时访问两者？

下一章将学习 [06 ICMP、ping 与 tracert](/notes/computer-net/06-icmp-ping-tracert/)，把“本地是否可达、远端是否可达、域名是否可解析、服务是否可连接”这些常见排障问题分层拆开。

## 延伸阅读

- [Get-NetRoute（Microsoft Learn）](https://learn.microsoft.com/en-us/powershell/module/nettcpip/get-netroute)
- [Configure the Order of Network Interfaces（Microsoft Learn）](https://learn.microsoft.com/en-us/windows-server/networking/technologies/network-subsystem/net-sub-interface-metric)

---

## 系列导航

- [学习清单与完整目录](/notes/computer-net/00-learning-roadmap/)
- [上一章：Ethernet Frame、广播域与交换机](/notes/computer-net/04-ethernet-switches/)
- [下一章：ICMP、ping 与 tracert：一次测试究竟证明了什么](/notes/computer-net/06-icmp-ping-tracert/)
