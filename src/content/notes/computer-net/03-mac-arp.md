---
title: "MAC 与 ARP：数据如何真正到达下一跳"
description: "理解 MAC 地址、ARP 与邻居缓存，追踪同一子网和跨子网通信中数据到达下一跳的过程。"
date: 2026-10-07
tags: ["计算机网络", "MAC", "ARP"]
---

上一章已经解决了一个三层问题：主机可以根据 IP 地址、子网前缀和路由，判断目标位于本地子网还是其他网络。

假设本机配置为：

```text
IPv4 Address    10.4.6.6
Prefix Length   /21
Default Gateway 10.4.0.1
```

现在要访问：

```text
8.8.8.8
```

操作系统判断 `8.8.8.8` 不属于本地的 `10.4.0.0/21`，因此选择默认网关 `10.4.0.1` 作为下一跳。

但这又带来一个新问题：

> 已经知道下一跳的 IPv4 地址是 `10.4.0.1`，数据在本地链路上究竟应该交给哪个网络接口？

这正是 MAC 地址和 ARP 要解决的问题。

## 1. MAC Address：链路层地址

MAC 地址可以先理解为网络接口在局部二层网络中的地址。常见写法是：

```text
3C-52-82-11-AB-CD
```

或者：

```text
3c:52:82:11:ab:cd
```

常见的 Ethernet MAC 地址长度是 48 bit，也就是 6 byte。

MAC 地址和 IP 地址承担不同职责：

```text
IP Address
→ 用于逻辑寻址和跨网络路由

MAC Address
→ 用于当前二层链路中的交付
```

不要把 MAC 地址简单理解成设备永远不变的“身份证”。它可以由软件修改，也可能来自虚拟网卡；手机和电脑还可能为了隐私对不同 Wi-Fi 网络使用随机 MAC 地址。

现阶段最重要的是：

> 在常见局域网中，主机要把数据交给同一链路上的下一跳，需要知道对应的链路层地址。

## 2. IP 与 MAC 位于不同层次

假设默认网关拥有：

```text
IPv4 Address: 10.4.0.1
MAC Address:  AA-BB-CC-DD-EE-FF
```

本机在发送数据前，需要获得下面的映射：

```text
10.4.0.1
    ↓
AA-BB-CC-DD-EE-FF
```

其中：

- IP 层负责选择目标网络和下一跳 IP。
- 链路层负责把这一跳的数据交给相应接口。
- ARP 负责在 IPv4 局域网中建立下一跳 IPv4 地址与 MAC 地址的对应关系。

可以先把它记成：

```text
IP 与路由决定“最终去哪里，以及下一跳是谁”
MAC 标识“当前这一跳要交给谁”
```

## 3. ARP 是什么

ARP 是 **Address Resolution Protocol（地址解析协议）**。

它解决的问题是：

> 已知本地链路中某个下一跳的 IPv4 地址，如何找到对应的 MAC 地址？

例如本机准备把数据交给默认网关：

```text
Next-hop IPv4: 10.4.0.1
MAC Address:   未知
```

本机会发送 ARP Request，大意是：

```text
Who has 10.4.0.1?
Tell 10.4.6.6.
```

也就是：

> 谁拥有 `10.4.0.1`？请把你的 MAC 地址告诉 `10.4.6.6`。

ARP 用于 IPv4。IPv6 不使用 ARP，而使用 Neighbor Discovery Protocol（NDP）；这个区别留到 IPv6 章节再展开。

## 4. ARP Request 为什么需要广播

本机发送 ARP Request 的原因，正是它还不知道目标 MAC 地址，因此无法把请求精确地单播给目标接口。

ARP Request 通常放在一个二层广播帧中，目的 MAC 是：

```text
FF-FF-FF-FF-FF-FF
```

意思是让当前广播域中的相关接口都接收这个帧：

```text
                 PC-B
                   ↑
                   │
发送方 ───────→ Switch ───────→ Gateway
                   │
                   ↓
                 PC-C
```

这些设备都会看到问题：

```text
Who has 10.4.0.1?
```

但通常只有拥有 `10.4.0.1` 的接口才会作出 ARP Reply。

路由器一般不会把这种二层广播转发到另一个网络，因此 ARP 的作用范围局限在当前二层广播域中。

## 5. ARP Reply 与邻居缓存

拥有目标 IPv4 地址的设备通常会单播回复：

```text
10.4.0.1 is at AA-BB-CC-DD-EE-FF
```

本机由此获得映射：

```text
10.4.0.1 → AA-BB-CC-DD-EE-FF
```

操作系统会暂时缓存这个结果，避免每发送一个数据包都重新广播 ARP Request。这个缓存通常称为：

```text
ARP Cache
Neighbor Cache
```

动态条目并非永久存在。它们有状态和老化时间，过期或无法继续确认可达时，系统会重新解析或探测。

## 6. 在 Windows 中查看 ARP 与邻居表

传统命令是：

```powershell
arp -a
```

输出可能类似：

```text
Interface: 10.4.6.6

Internet Address      Physical Address      Type
10.4.0.1              aa-bb-cc-dd-ee-ff     dynamic
10.4.6.20             11-22-33-44-55-66     dynamic
```

其中：

```text
Internet Address → IPv4 地址
Physical Address → MAC 地址
Type             → 动态或静态条目
```

PowerShell 还可以使用：

```powershell
Get-NetNeighbor -AddressFamily IPv4
```

它除了地址映射，还会显示接口和邻居状态。多网卡环境中要特别关注 `InterfaceAlias` 或 `InterfaceIndex`，因为邻居条目属于具体接口，而不是整台电脑共用一张没有边界的表。

## 7. ARP 为什么不查询远端服务器的 MAC

访问 `8.8.8.8` 时，本机不会广播询问：

```text
Who has 8.8.8.8?
```

因为子网与路由判断已经表明 `8.8.8.8` 不在本地链路上。即使远端服务器拥有 MAC 地址，它的链路层地址也只在它所在的局部链路中有意义，无法直接用于本机局域网的交付。

本机真正需要解析的是当前下一跳：

```text
最终目标 IP：8.8.8.8
当前下一跳：  10.4.0.1
需要 ARP：    10.4.0.1 → Gateway MAC
```

因此：

> ARP 解析的是本地下一跳，而不一定是 IP 数据包的最终目的地。

## 8. 一个数据单元中为何有两种目的地址

以有线 Ethernet 为例，本机向 `8.8.8.8` 发送数据时，外层帧和内层 IP 数据包拥有不同层次的地址：

```text
Ethernet Frame
┌────────────────────────────────┐
│ Src MAC = 本机接口 MAC          │
│ Dst MAC = 默认网关 MAC          │
│                                │
│   IP Packet                    │
│   ┌────────────────────────┐   │
│   │ Src IP = 10.4.6.6      │   │
│   │ Dst IP = 8.8.8.8       │   │
│   └────────────────────────┘   │
└────────────────────────────────┘
```

两种目的地址分别回答：

```text
Destination IP
→ 这个 IP 数据包最终要到哪里？

Destination MAC
→ 当前链路上的这一跳要交给谁？
```

所以访问 Internet 时，并不是把 IP 数据包的目的 IP 改成网关 IP。目的 IP 仍然是 `8.8.8.8`，只是当前链路上的帧要先交给网关。

可以把它类比成：

> 信件上写着最终收件人的地址，但寄件人先把信交给本地负责下一段运输的人。

## 9. Wi-Fi 场景中的必要说明

前面的帧图使用 Ethernet，是为了清楚展示二层封装。Wi-Fi 在无线介质上传输的是 IEEE 802.11 帧，并不等同于网线中的 Ethernet Frame。

在常见基础设施模式下，无线客户端会先把 802.11 帧发送给 AP，帧中可能同时涉及 AP/BSSID、发送方以及最终二层目的接口等多个地址字段。AP 再把流量桥接到局域网。

```text
无线客户端
   ↓ 802.11
Wi-Fi AP
   ↓ Ethernet 或其他局域网链路
默认网关
```

虽然具体帧格式不同，但本章主线不变：

1. IP 层选择本地目标或下一跳。
2. IPv4 使用 ARP 解析本地邻居的 MAC 地址。
3. 链路层负责把数据送过当前这一段链路。

因此抓包时需要注意抓包位置：在电脑、AP 的无线侧或交换机侧抓包，看到的二层头部可能不同。

## 10. 路由器收到帧后做什么

以 Ethernet 链路为例，默认网关收到目的 MAC 为自己的帧后，会进行以下处理：

```text
接收当前链路的 Frame
        ↓
去掉当前链路层封装
        ↓
检查 IP Packet 的 Destination IP
        ↓
查询路由表并选择下一跳和出口接口
        ↓
为下一段链路创建新的链路层封装
        ↓
发送给下一跳
```

假设下一段仍然是 Ethernet：

```text
第一跳：
本机 MAC → 默认网关 MAC

第二跳：
路由器出口 MAC → 上游下一跳 MAC

第三跳：
Router A MAC → Router B MAC
```

因此，二层地址通常会随每一段链路改变。

在没有 NAT 等地址转换时，IP 数据包中的源 IP 和目的 IP 通常保持：

```text
10.4.6.6 → 8.8.8.8
```

路由器仍会修改 IP 头中的某些字段，例如将 TTL 减 1，并相应更新校验信息。以后学习 NAT 时还会看到源 IP 或目的 IP 被修改的情况。

## 11. Switch：交换机如何转发帧

交换机主要根据目的 MAC 地址转发 Ethernet Frame。它内部维护一张 MAC Address Table，也叫转发表：

```text
MAC Address             Port
AA-AA-AA-AA-AA-AA       1
BB-BB-BB-BB-BB-BB       3
CC-CC-CC-CC-CC-CC       8
```

如果交换机已知：

```text
Gateway MAC → Port 12
```

那么收到目的 MAC 为 Gateway MAC 的帧时，就可以把它转发到 Port 12。

可以把当前涉及的职责分开：

```text
Host 的路由选择
→ 确定出口接口和 IP 下一跳

ARP
→ 将本地下一跳 IPv4 解析为 MAC

Switch
→ 根据目的 MAC 将帧转发到相应端口
```

## 12. 交换机如何学习 MAC 地址

交换机主要通过观察收到帧的**源 MAC 地址**进行学习。

例如交换机从 Port 3 收到：

```text
Src MAC = BB-BB-BB-BB-BB-BB
```

它便可以记录：

```text
BB-BB-BB-BB-BB-BB → Port 3
```

以后再收到目的 MAC 为该地址的帧时，交换机就知道应该从 Port 3 转发。

MAC 表中的动态条目也会老化。如果某个设备换了端口，交换机可以通过后续收到的新帧重新学习位置。

## 13. 广播与未知单播泛洪

交换机可能在两种容易混淆的情况下，把帧转发到多个相关端口。

### 广播帧

ARP Request 本身通常是广播帧：

```text
Dst MAC = FF-FF-FF-FF-FF-FF
```

交换机会在所属 VLAN 或广播域内将它转发到除入端口外的其他相关端口。

### 未知单播

普通帧也可能拥有某个具体的单播目的 MAC，但交换机暂时没有对应的 MAC 表条目：

```text
Dst MAC = 某个具体地址
MAC Table = 暂无该地址
```

此时交换机通常也会在所属二层范围内进行泛洪（Flood），直到通过后续流量学到目标所在端口。

两者都会出现“一份帧被发到多个端口”，但原因不同：

```text
广播帧
→ 发送方本来就要通知整个广播域

未知单播泛洪
→ 发送方指定了单播目标，但交换机暂时不知道目标在哪个端口
```

## 14. 同一子网通信的完整过程

假设：

```text
Host A: 10.4.6.6/21
Host B: 10.4.5.20/21
```

A 要向 B 发送数据。

### 第一步：判断目标位置

```text
10.4.6.6/21  → 10.4.0.0/21
10.4.5.20/21 → 10.4.0.0/21
```

A 把 B 视为本地子网中的目标。

### 第二步：查询邻居缓存

```text
是否已有 10.4.5.20 → MAC 的有效条目？
```

若已有，便可直接使用；若没有，则需要 ARP。

### 第三步：发送 ARP Request

```text
Who has 10.4.5.20?
Tell 10.4.6.6.
```

### 第四步：B 返回 ARP Reply

```text
10.4.5.20 is at BB-BB-BB-BB-BB-BB
```

### 第五步：A 发送数据

以 Ethernet 为例：

```text
Dst MAC = Host B MAC
Dst IP  = 10.4.5.20
```

### 第六步：交换机完成转发

```text
Host A
  ↓
Switch 根据 B 的 MAC 转发
  ↓
Host B
```

这个正常直连过程不需要经过默认网关。

## 15. 跨子网通信的完整过程

现在让 `10.4.6.6/21` 访问：

```text
8.8.8.8
```

### 第一步：路由选择

系统发现目标不属于本地的 `10.4.0.0/21`，并选择默认路由：

```text
Next Hop = 10.4.0.1
```

### 第二步：解析下一跳

系统查询邻居缓存；若没有有效条目，则执行：

```text
ARP: 10.4.0.1 → Gateway MAC
```

### 第三步：封装并发送

以 Ethernet 为例：

```text
Link Layer:
Dst MAC = Gateway MAC

IP Layer:
Dst IP  = 8.8.8.8
```

### 第四步：网关继续路由

网关接收当前帧、取出 IP 数据包、查询路由表，然后在下一段链路中重新封装并发送。

整个过程的关键对照是：

```text
当前二层目标：默认网关
最终三层目标：8.8.8.8
```

## 16. ARP 的作用边界

本章先使用最常见的正常场景建立模型：

```text
ARP = 本地 IPv4 邻居地址解析
```

需要同时知道它的边界：

- ARP 不负责决定下一跳；路由选择先决定下一跳。
- ARP 不负责把帧转发到交换机端口；这是交换机的职责。
- ARP 请求通常不会穿过路由器，因此不能直接解析远端主机的 MAC。
- ARP 没有认证机制，错误或恶意的 ARP 信息可能导致 ARP 欺骗；安全章节再展开。
- Proxy ARP 等机制会让路由器代替其他地址回应 ARP，属于扩展场景，不改变先掌握正常流程的必要性。

## 17. 动手观察一次 ARP

### 只查看，不修改缓存

先查看当前邻居表：

```powershell
arp -a
```

或者：

```powershell
Get-NetNeighbor -AddressFamily IPv4
```

找到默认网关地址，例如：

```text
10.4.0.1 → 某个 MAC 地址
```

如果存在动态条目，说明系统近期已经解析或使用过这个邻居。

### 可选：只删除网关对应的动态条目

为了观察重新解析过程，可以在管理员 PowerShell 中针对指定接口删除单个邻居条目。先确认接口名称：

```powershell
Get-NetIPConfiguration
```

再执行类似：

```powershell
Remove-NetNeighbor -InterfaceAlias "WLAN" -IPAddress "10.4.0.1" -Confirm
```

这个操作会修改邻居缓存，并可能短暂影响正在使用该邻居的通信；不要在远程连接依赖该网关时随意执行。只为学习观察时，也可以等待动态条目自然老化，不必清除缓存。

随后：

```powershell
ping 10.4.0.1
Get-NetNeighbor -AddressFamily IPv4
```

系统为了向网关发送数据，通常会重新解析并建立邻居条目。

## 18. 使用 Wireshark 观察 ARP

在 Wireshark 中选择实际承载流量的接口，并使用显示过滤器：

```text
arp
```

触发一次新的邻居解析后，可能看到：

```text
ARP Request
Who has 10.4.0.1? Tell 10.4.6.6

ARP Reply
10.4.0.1 is at xx:xx:xx:xx:xx:xx
```

观察时重点比较：

```text
Ethernet Destination
ARP Sender IP / MAC
ARP Target IP / MAC
Request 与 Reply 是否广播
```

若没有看到 ARP Request，常见原因是邻居缓存中已经存在有效条目，或者选择了错误的抓包接口。

## 19. 本章核心模型

```text
应用程序产生数据
        ↓
IP 层查询路由
        ↓
确定出口接口与下一跳 IPv4
        ↓
下一跳位于本地链路
        ↓
邻居缓存中有 MAC 吗？
   ┌──────────┴──────────┐
   │                     │
  有                    没有
   │                     │
复用条目             ARP Request
   │                     │
   │                  ARP Reply
   └──────────┬──────────┘
              ↓
       创建链路层帧
              ↓
       Switch / Wi-Fi AP
              ↓
          当前下一跳
```

将前三章串起来：

```text
Subnet / Prefix
→ 帮助形成直连网络范围

Routing
→ 选择出口接口与下一跳

ARP
→ 将本地下一跳 IPv4 解析为 MAC

Switch
→ 根据 MAC 转发 Ethernet Frame

Router
→ 取出 IP Packet，选择后续路径并重新封装
```

需要记住：

1. MAC 地址用于局部二层链路，IP 地址用于逻辑寻址和路由。
2. ARP 根据本地下一跳的 IPv4 地址解析 MAC 地址。
3. ARP Request 通常广播，ARP Reply 通常单播。
4. 访问远端 IP 时，本机解析的是网关等下一跳的 MAC，而不是远端服务器的 MAC。
5. 二层地址通常逐跳变化；在没有 NAT 时，源和目的 IP 通常保持不变。
6. 交换机根据源 MAC 学习端口，根据目的 MAC 转发帧。
7. 广播与未知单播泛洪都会到达多个端口，但原因不同。

## 思考题

1. 访问 `8.8.8.8` 时，为什么本机不需要知道 `8.8.8.8` 的 MAC 地址？
2. 访问 `8.8.8.8` 时，IP 层的 Destination IP 是谁？当前链路层的目的地址又是谁的？
3. ARP Request 为什么通常使用广播？ARP Reply 为什么通常可以单播？
4. ARP 解决的是 `IP → MAC`，还是 `MAC → IP`？它会先于还是后于路由选择？
5. 同一子网内 Host A 访问 Host B 时，默认网关是否参与正常的数据转发？
6. 为什么 MAC 地址通常随链路逐跳变化，而 Destination IP 通常不会？
7. ARP 广播和未知单播泛洪有什么区别？
8. 为什么在 Wi-Fi 接口抓包时，看到的二层地址结构可能比 Ethernet 更复杂？

下一章将继续学习 [Ethernet Frame、广播域与交换机](/notes/computer-net/04-ethernet-switches/)，再进入 **路由表与最长前缀匹配**。

---

## 系列导航

- [学习清单与完整目录](/notes/computer-net/00-learning-roadmap/)
- [上一章：IPv4 与子网：主机如何判断目标在哪里](/notes/computer-net/02-ipv4-subnets/)
- [下一章：Ethernet Frame、广播域与交换机](/notes/computer-net/04-ethernet-switches/)
