---
title: "Ethernet Frame、广播域与交换机"
description: "从 Ethernet 帧和封装理解交换机转发、MAC 学习、广播域、VLAN 与二层环路。"
date: 2026-10-07
tags: ["计算机网络", "Ethernet", "交换机"]
---

前两章分别回答了：

```text
子网与路由
→ 目标在本地还是远端？下一跳是谁？

ARP
→ 本地下一跳的 MAC 地址是什么？
```

现在继续向下看：获得下一跳 MAC 后，数据如何装进 Ethernet Frame，交换机又如何把帧送到正确端口？

## 1. Encapsulation：封装

网络中的每一层都只处理自己负责的信息，并把上一层交下来的内容当作 Payload（载荷）。这个过程称为封装：

```text
Application Data
      ↓
TCP Segment / UDP Datagram
      ↓
IP Packet
      ↓
Ethernet Frame
      ↓
Bits on the medium
```

可以把它想成逐层套信封：

```text
Ethernet Frame
┌──────────────────────────────────┐
│ Ethernet Header                  │
│                                  │
│   IP Packet                      │
│   ┌──────────────────────────┐   │
│   │ IP Header                │   │
│   │                          │   │
│   │   TCP / UDP / ICMP ...  │   │
│   └──────────────────────────┘   │
│                                  │
│ FCS                              │
└──────────────────────────────────┘
```

接收方则按相反方向逐层拆开，这称为解封装（Decapsulation）。

## 2. Ethernet Frame 的主要字段

局域网中最常见的是 Ethernet II 帧。先关注以下字段：

```text
┌─────────────────┬────────────┬───────────┬─────────┬─────┐
│ Destination MAC │ Source MAC │ EtherType │ Payload │ FCS │
│     6 byte      │   6 byte   │  2 byte   │         │ 4 B │
└─────────────────┴────────────┴───────────┴─────────┴─────┘
```

各字段回答的问题是：

```text
Destination MAC
→ 当前链路上要交给谁？

Source MAC
→ 当前链路上是谁发来的？

EtherType
→ Payload 中封装的上层协议是什么？

Payload
→ 实际承载的上层数据，例如 IP Packet 或 ARP Message

FCS
→ 用于检测帧在传输中是否发生比特错误
```

完整线上格式还涉及 Preamble、SFD、可选的 802.1Q VLAN Tag 等字段；现阶段先抓住上面五项即可。

## 3. EtherType：里面装的是什么

EtherType 告诉接收方应该把 Payload 交给哪个上层协议处理。常见值包括：

```text
0x0800 → IPv4
0x0806 → ARP
0x86DD → IPv6
```

例如：

```text
EtherType = 0x0800
```

表示这个 Ethernet Frame 的 Payload 是 IPv4 Packet。

Ethernet 并不需要理解更深层的 TCP、DNS、HTTP 或某个网站域名。它只需要依据当前层的字段完成一段链路上的传输。

## 4. Payload、MTU 与帧长度

普通 Ethernet 常见的 IP MTU 是：

```text
1500 byte
```

它表示一个 Ethernet Payload 通常最多承载 1500 byte 的三层数据。Ethernet Payload 小于 46 byte 时，发送方会添加 Padding（填充），使从 Destination MAC 到 FCS 的帧长度至少达到 64 byte。

常见无 VLAN Ethernet II 帧从 Destination MAC 到 FCS 的长度范围是：

```text
64 ～ 1518 byte
```

带 802.1Q VLAN Tag 时，常见上限会增加 4 byte。Preamble、SFD 和帧间间隔不计入这里的常规帧长度。

抓包软件经常看不到 Preamble 和 SFD，也可能看不到 FCS，因为网卡硬件可能在数据交给操作系统之前已经处理或移除了这些内容。

## 5. FCS 能做什么

FCS 是 **Frame Check Sequence（帧校验序列）**。发送端根据帧内容计算校验值，接收端重新计算并比较。

```text
校验一致
→ 帧在传输中未检测到这类比特错误

校验不一致
→ 帧通常被网卡或交换机丢弃
```

FCS 用于错误检测，不负责修复数据，也不提供 TCP 那样的重传与可靠交付能力。

## 6. 单播、广播与组播 MAC

根据目的 MAC，Ethernet Frame 可以分为：

```text
Unicast
→ 发给一个具体接口

Broadcast
→ 发给当前广播域内所有相关接口

Multicast
→ 发给加入某个组的一组接口
```

广播 MAC 固定为：

```text
FF:FF:FF:FF:FF:FF
```

ARP Request 就是典型的 Ethernet 广播帧。

## 7. 二层交换机主要依据 MAC 工作

典型二层交换机转发 Ethernet Frame 时，主要查看：

```text
Destination MAC
Source MAC
所属 VLAN
```

它通常不需要根据 IP 地址决定普通二层帧从哪个端口转发。可以先建立以下简化模型：

```text
Router
→ 根据三层地址和路由表选择路径

Layer 2 Switch
→ 根据二层 MAC 表转发帧
```

现实中也有三层交换机、ACL、流量分析等功能，它们可能检查 IP 或更深层字段；这不改变普通二层交换转发的基本原理。

## 8. MAC Address Table

交换机内部维护 MAC Address Table，也叫转发表或 Forwarding Database（FDB）。

假设端口连接如下：

```text
Port 1 → PC-A
Port 2 → PC-B
Port 3 → PC-C
Port 4 → Router
```

交换机学到的表可能是：

```text
VLAN    MAC Address             Port
10      AA-AA-AA-AA-AA-AA       1
10      BB-BB-BB-BB-BB-BB       2
10      CC-CC-CC-CC-CC-CC       3
10      DD-DD-DD-DD-DD-DD       4
```

收到下面的帧时：

```text
Dst MAC = BB-BB-BB-BB-BB-BB
```

交换机查询表后得到：

```text
BB-BB-BB-BB-BB-BB → Port 2
```

于是只从 Port 2 转发，而不必复制给所有端口。

MAC 表按 VLAN 区分。同一个 MAC 地址理论上可以在不同 VLAN 中拥有各自的转发表项。

## 9. MAC Learning：交换机如何学习

交换机通过观察收到帧的 **Source MAC** 学习设备位置。

例如 Port 1 收到：

```text
Src MAC = AA-AA-AA-AA-AA-AA
Dst MAC = BB-BB-BB-BB-BB-BB
```

交换机先记录：

```text
AA-AA-AA-AA-AA-AA → Port 1
```

这个过程不是主动询问“AA 在哪里”，而是根据事实推断：

> 既然带有源 MAC AA 的帧从 Port 1 进入，那么要去往 AA 的帧应从 Port 1 发出。

动态 MAC 条目会老化。如果设备移到其他端口，交换机可以在后续收到新帧时更新记录。

## 10. 交换机处理帧的基本流程

交换机收到一个正常帧后，可以把核心流程简化为：

```text
Frame 从某端口进入
        ↓
检查帧是否有效
        ↓
用 Source MAC 学习来源端口
        ↓
查询 Destination MAC
        ↓
┌──────────────┬───────────────┬──────────────┐
│ 已知单播     │ 未知单播      │ 广播/相关组播 │
│              │               │              │
│ 发往已知端口 │ 在 VLAN 内泛洪 │ 在范围内泛洪  │
└──────────────┴───────────────┴──────────────┘
```

如果目的 MAC 已知且对应端口就是帧的入端口，交换机通常会过滤该帧，不再从同一端口发回去。

## 11. Unknown Unicast Flooding：泛洪

假设 MAC 表目前只有：

```text
AA-AA-AA-AA-AA-AA → Port 1
```

PC-A 发送：

```text
Src MAC = AA-AA-AA-AA-AA-AA
Dst MAC = BB-BB-BB-BB-BB-BB
```

交换机还不知道 BB 在哪个端口，于是进行 Unknown Unicast Flooding（未知单播泛洪）：

```text
                 → Port 2
Port 1 → Switch  → Port 3
                 → Port 4
```

泛洪范围限于同一 VLAN 中除入端口外的相关端口。

PC-B 收到后发现目的 MAC 是自己，于是继续处理。其他终端发现目的 MAC 不属于自己，通常丢弃该帧。

当 PC-B 回复时，交换机从回复的源 MAC 学到：

```text
BB-BB-BB-BB-BB-BB → Port 2
```

此后的已知单播便可以只从 Port 2 转发。

## 12. 广播与未知单播不是一回事

两者都会导致交换机向多个端口复制帧，但原因不同。

### 广播

发送方明确指定：

```text
Dst MAC = FF:FF:FF:FF:FF:FF
```

含义是：

> 当前广播域中的相关设备都接收。

### 未知单播

发送方指定了一个具体的单播 MAC：

```text
Dst MAC = BB-BB-BB-BB-BB-BB
```

只是交换机暂时不知道它对应哪个端口，所以临时进行泛洪。

```text
Broadcast
→ 目的本来就是整个广播域

Unknown Unicast Flooding
→ 目的只有一个，但交换机还不知道它的位置
```

## 13. Broadcast Domain：广播域

广播域可以先定义为：

> 一个二层广播帧能够传播到的二层范围。

简单网络中：

```text
PC-A ─┐
PC-B ─┼── Switch
PC-C ─┘
```

若这些端口属于同一 VLAN，它们位于同一个广播域。PC-A 发送广播时，PC-B 和 PC-C 都可能收到。

广播域并不是“所有联网设备”，更不是整个 Internet。它具有明确的二层边界。

## 14. 路由器为什么隔离广播域

加入路由器后：

```text
PC-A ─┐                            ┌─ PC-D
PC-B ─┼─ Switch A ─ Router ─ Switch B
PC-C ─┘                            └─ PC-E
```

PC-A 发送的 Ethernet 广播可以在左侧广播域中传播，但路由器通常不会把这个二层广播帧原样转发到右侧。

```text
Switch A 一侧
→ 一个二层广播域

Switch B 一侧
→ 另一个二层广播域
```

路由器终止当前链路层封装，根据 IP 层信息作出路由决定，再为另一侧链路创建新的帧。两侧可以使用不同的 MAC 地址、不同的二层技术和各自独立的 ARP 过程。

如果路由器无条件把二层广播传播到所有远端网络，广播流量会无限扩大。因此隔离二层广播是可扩展网络的重要基础。

## 15. VLAN：一台交换机也能划分广播域

不能简单地把“一台物理交换机”当成“一个广播域”。VLAN 可以在同一台或多台交换机上划分多个彼此隔离的逻辑二层网络。

```text
同一台 Switch
├── VLAN 10 → Broadcast Domain A
└── VLAN 20 → Broadcast Domain B
```

VLAN 10 的广播不会普通地进入 VLAN 20。两个 VLAN 之间若要通信，通常需要路由器或三层交换功能进行三层转发。

所以更准确的关系是：

```text
一个 VLAN
≈ 一个二层广播域
```

多个交换机也可以通过 Trunk 承载同一 VLAN，使一个广播域跨越多台物理交换机。VLAN 的配置细节以后单独展开。

## 16. IP 子网与广播域的关系

在常见、设计规范的网络中，通常会让：

```text
一个 IP 子网
≈ 一个 VLAN
≈ 一个二层广播域
```

例如：

```text
10.4.0.0/21
```

可能对应某个 VLAN 和广播域，其中的主机通过 ARP、MAC 和交换机直接通信。

但这不是数学上必然的一一对应关系。错误配置、二层延伸、Proxy ARP 或特殊网络设计都可能打破这种直观对应。入门阶段应把它当作常见设计模型，而不是不可违反的协议定律。

## 17. IP Broadcast 与 Ethernet Broadcast

上一章看到的：

```text
10.4.7.255
```

是 `10.4.0.0/21` 的 IPv4 定向广播地址，属于三层概念。

本章看到的：

```text
FF:FF:FF:FF:FF:FF
```

是 Ethernet 广播 MAC，属于二层概念。

两者可能同时出现。例如，本子网中的 IPv4 广播包通常会封装在目的 MAC 为全 `FF` 的 Ethernet Frame 中：

```text
Ethernet:
Dst MAC = FF:FF:FF:FF:FF:FF

IPv4:
Dst IP = 10.4.7.255
```

但它们不是同一个地址：

```text
IPv4 Broadcast Address
→ 三层目标地址

Ethernet Broadcast MAC
→ 当前二层广播交付地址
```

此外，IPv4 还有 `255.255.255.255` 这种受限广播地址。路由器通常不会转发受限广播；定向广播是否转发也通常受到严格限制。

## 18. 一次完整 ARP 的帧视角

假设：

```text
PC
IP  = 10.4.6.6
MAC = AA-AA-AA-AA-AA-AA

Gateway
IP  = 10.4.0.1
MAC = GG-GG-GG-GG-GG-GG
```

PC 最初不知道网关 MAC。

### ARP Request

```text
Ethernet Header:
Src MAC   = AA-AA-AA-AA-AA-AA
Dst MAC   = FF-FF-FF-FF-FF-FF
EtherType = 0x0806

ARP Payload:
Sender IP  = 10.4.6.6
Sender MAC = AA-AA-AA-AA-AA-AA
Target IP  = 10.4.0.1
Target MAC = 未知
```

交换机在当前 VLAN 内广播这个帧。

### ARP Reply

```text
Ethernet Header:
Src MAC   = GG-GG-GG-GG-GG-GG
Dst MAC   = AA-AA-AA-AA-AA-AA
EtherType = 0x0806

ARP Payload:
Sender IP  = 10.4.0.1
Sender MAC = GG-GG-GG-GG-GG-GG
Target IP  = 10.4.6.6
Target MAC = AA-AA-AA-AA-AA-AA
```

PC 随后缓存：

```text
10.4.0.1 → GG-GG-GG-GG-GG-GG
```

### 真正发送 IPv4 Packet

```text
Ethernet Header:
Src MAC   = AA-AA-AA-AA-AA-AA
Dst MAC   = GG-GG-GG-GG-GG-GG
EtherType = 0x0800

IPv4 Header:
Src IP    = 10.4.6.6
Dst IP    = 8.8.8.8
```

这里再次体现：

```text
IP Destination
→ 最终目的地 8.8.8.8

Route / Next Hop
→ 当前应交给 10.4.0.1

ARP
→ 解析出 10.4.0.1 的 MAC

Switch
→ 根据该 MAC 找到出口端口
```

## 19. Wi-Fi 不直接使用 Ethernet 空中帧

本章以 Ethernet 为中心。使用 Wi-Fi 时，无线链路上传输的是 802.11 Frame，其地址字段和链路行为比 Ethernet 更复杂。

```text
无线客户端
   ↓ 802.11 Frame
Access Point
   ↓ 桥接
有线 Ethernet LAN
```

AP 常把无线侧与有线侧桥接在同一个二层广播域中。因此 ARP 广播可以跨过 AP 到达局域网中的网关，但无线侧与有线侧看到的帧头并不完全相同。

这也解释了为什么在无线网卡、AP 或交换机镜像端口上抓取同一流量，看到的二层信息可能不同。

## 20. 交换网络中的环路

广播和未知单播会被交换机泛洪。如果二层网络中存在环路，而又没有控制机制，帧可能在交换机之间不断复制和循环，形成 Broadcast Storm（广播风暴）。

```text
Switch A ─── Switch B
   │             │
   └── Switch C ─┘
```

Ethernet Frame 本身没有像 IPv4 TTL 那样每经过一跳就递减的字段，因此二层环路尤其危险。

实际网络会使用 Spanning Tree Protocol（STP）或其他机制阻止无控制的二层环路。本章只需知道它解决的问题，后续再学习具体算法。

## 21. 使用 Wireshark 观察 Ethernet

抓取实际网络接口流量后，可以使用这些显示过滤器：

```text
eth
```

显示包含 Ethernet 头的帧。

```text
eth.addr == aa:bb:cc:dd:ee:ff
```

查看源或目的包含指定 MAC 的帧。

```text
eth.dst == ff:ff:ff:ff:ff:ff
```

查看 Ethernet 广播帧。

```text
eth.type == 0x0806
```

查看 EtherType 为 ARP 的帧；直接使用 `arp` 通常更方便。

点开一个帧时，按照封装层次展开：

```text
Frame
└── Ethernet II
    ├── Destination
    ├── Source
    ├── Type
    └── Internet Protocol / ARP
```

若抓包结果没有 Ethernet II 层，先确认所选接口及其链路类型；例如 Wi-Fi 的监控模式抓包可能直接显示 802.11。

## 22. 本章核心模型

```text
Host 已经通过路由选择确定下一跳
                ↓
ARP 获得下一跳 MAC
                ↓
创建 Ethernet Frame
                ↓
┌─────────────────────────────────┐
│ Dst MAC | Src MAC | Type | Data │
└─────────────────────────────────┘
                ↓
Switch 从 Source MAC 学习入端口
                ↓
Switch 查询 Destination MAC
                ↓
┌──────────────┬──────────────┬─────────────┐
│ 已知单播     │ 未知单播     │ 广播        │
│ 定向转发     │ VLAN 内泛洪  │ VLAN 内泛洪 │
└──────────────┴──────────────┴─────────────┘
                ↓
当前下一跳收到 Frame
```

需要记住：

1. 封装是把上一层的数据作为下一层 Payload 的过程。
2. Ethernet Frame 使用 MAC 地址完成当前链路上的交付。
3. EtherType 标识 Payload 中封装的上层协议。
4. 二层交换机通过源 MAC 学习端口，通过目的 MAC 查表转发。
5. 广播和未知单播都可能泛洪，但含义不同。
6. 广播域是二层广播能够传播的范围，通常由 VLAN 和路由边界划分。
7. 路由器不会普通地转发 Ethernet 广播帧。
8. IP 广播地址与 Ethernet 广播 MAC 属于不同层。
9. IP 和路由决定下一跳，MAC 只标识当前链路的交付对象。

## 思考题

1. Ethernet Frame 中 Destination MAC、Source MAC、EtherType 和 FCS 分别解决什么问题？
2. 为什么典型二层交换机转发普通帧时不需要知道目标 IP？
3. 交换机为什么通过 Source MAC 学习，而不是通过 Destination MAC 学习？
4. 已知单播、未知单播和广播分别会怎样转发？
5. ARP Request 的 Destination MAC 和 EtherType 分别是什么？
6. 为什么路由器两侧通常属于不同广播域？
7. `10.4.7.255` 与 `FF:FF:FF:FF:FF:FF` 有什么区别？
8. 为什么说“一个 IP 子网约等于一个广播域”只是常见设计模型，而不是绝对定律？
9. 为什么二层环路可能比想象中危险？

下一章将学习 [05 路由表与最长前缀匹配](/notes/computer-net/05-routing-longest-prefix/)：当电脑同时拥有 Ethernet、Wi-Fi、VPN、TUN 和虚拟机接口时，操作系统究竟如何选择出口接口与下一跳。

---

## 系列导航

- [学习清单与完整目录](/notes/computer-net/00-learning-roadmap/)
- [上一章：MAC 与 ARP：数据如何真正到达下一跳](/notes/computer-net/03-mac-arp/)
- [下一章：路由表与最长前缀匹配](/notes/computer-net/05-routing-longest-prefix/)
