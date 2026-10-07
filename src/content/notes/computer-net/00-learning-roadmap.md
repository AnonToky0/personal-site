---
title: "计算机网络学习清单"
description: "从网络基础到代理、VPN、抓包和 P2P 的完整学习路线，包含阶段清单、实践实验与完成标准。"
date: 2026-10-07
tags: ["计算机网络", "学习路线"]
---

## 学习目标

学完之后，应该能够自己解释并排查这些问题：

* 为什么 `ping 8.8.8.8` 通，但 `ping google.com` 不通？
* 为什么浏览器能访问 Google，但 PowerShell / Git / curl 不行？
* DNS 到底是谁在解析？
* 一个数据包从电脑发出去，会经过哪些设备？
* 默认网关到底是什么？
* TCP、UDP、ICMP 分别干什么？
* NAT 为什么存在？
* HTTP Proxy、SOCKS5、VPN、TUN 有什么区别？
* “全局代理”和“规则代理”到底全局在哪里？
* 什么叫隧穿？
* VPN 为什么本质上也是一种隧道？
* SSH Tunnel 是怎么回事？
* P2P 为什么经常需要“打洞”？
* NAT 穿透、STUN、TURN、ICE 分别是什么？
* 怎么用 Wireshark 看懂一次真实网络请求？

## 当前详解文档

这份清单是学习路线和能力检查表，不用复选框代替真实理解。当前已经形成的详解按下面的顺序阅读：

1. [网络整体模型](/notes/computer-net/01-network-model/)
2. [IPv4 和子网](/notes/computer-net/02-ipv4-subnets/)
3. [MAC 和 ARP](/notes/computer-net/03-mac-arp/)
4. [Ethernet 和交换机](/notes/computer-net/04-ethernet-switches/)
5. [路由表与最长前缀匹配](/notes/computer-net/05-routing-longest-prefix/)
6. [ICMP、ping 和 tracert](/notes/computer-net/06-icmp-ping-tracert/)
7. [TCP、UDP、端口与 Socket](/notes/computer-net/07-tcp-udp-sockets/)
8. [TCP 消息边界与应用层协议设计](/notes/computer-net/08-tcp-framing-protocols/)
9. [Socket 编程模型与连接生命周期](/notes/computer-net/09-socket-lifecycle/)
10. [HTTP、TLS、Proxy、VPN 与抓包边界](/notes/computer-net/10-http-tls-proxy-vpn/)
11. [NAT、Tunnel 与 P2P 穿透](/notes/computer-net/11-nat-tunnels-p2p/)

章节编号表示知识依赖顺序，不表示只需背诵一次。后续章节会继续复用前面的封装、下一跳、路由与分层排障模型。

---

## 第一阶段：先建立网络整体模型

这是最重要的一层。

### 1. 网络到底是什么

* [ ] 理解“主机 / Host”
* [ ] 理解“网络接口 / Network Interface”
* [ ] 理解“交换机 / Switch”
* [ ] 理解“路由器 / Router”
* [ ] 理解“互联网 / Internet”
* [ ] 理解客户端 Client 和服务器 Server
* [ ] 理解局域网 LAN
* [ ] 理解广域网 WAN

先形成这个模型：

```text
你的程序
   ↓
操作系统网络栈
   ↓
网卡
   ↓
交换机 / Wi-Fi AP
   ↓
默认网关
   ↓
路由器
   ↓
运营商 / 公司网络
   ↓
Internet
   ↓
目标服务器
```

#### 实践

Windows：

```powershell
ipconfig
```

能看懂：

```text
IPv4 Address
Subnet Mask
Default Gateway
DNS Server
```

然后执行：

```powershell
Get-NetAdapter
Get-NetIPConfiguration
```

目标：

看到电脑上的某个 IP 地址时，知道：

> 这是哪个网卡的地址？

而不是把“电脑 IP”当成电脑只有一个固定 IP。

---

## 第二阶段：IP 地址和子网

这是后面路由、VPN、P2P 的基础。

### 2. IPv4

* [ ] IPv4 是 32 bit
* [ ] 点分十进制表示法
* [ ] 私有地址和公网地址
* [ ] 回环地址 `127.0.0.1`
* [ ] `0.0.0.0`
* [ ] 广播地址
* [ ] APIPA `169.254.x.x`

重点记住私有地址：

```text
10.0.0.0/8

172.16.0.0/12

192.168.0.0/16
```

例如：

```text
10.4.6.6
```

属于私有地址。

它不能直接在公网 Internet 上路由。

---

### 3. 子网掩码和 CIDR

必须真正搞懂，不要死记。

* [ ] 子网掩码是什么
* [ ] 网络号是什么
* [ ] 主机号是什么
* [ ] CIDR 是什么
* [ ] `/24`
* [ ] `/16`
* [ ] `/8`
* [ ] `/21`
* [ ] 如何判断两个 IP 是否在同一子网

例如：

```text
IP:
10.4.6.6

Mask:
255.255.248.0

CIDR:
/21
```

理解：

```text
10.4.0.0/21
```

覆盖哪些地址。

#### 实践

自己算：

```text
192.168.1.10/24
192.168.1.200/24

是否同网段？
```

再算：

```text
10.4.6.6/21
10.4.0.1/21
```

为什么它们可以直接通信？

---

## 第三阶段：二层网络——MAC、ARP、交换机

这里开始理解：

> 我明明只有目标 IP，电脑怎么知道数据应该发给谁？

### 4. MAC Address

* [ ] MAC 地址是什么
* [ ] IP 地址和 MAC 地址区别
* [ ] 网卡为什么需要 MAC
* [ ] MAC 地址主要在哪个范围有效

理解：

```text
IP：逻辑地址

MAC：链路层地址
```

---

### 5. ARP

重点理解：

```text
我知道：
10.4.0.1

但是不知道：
10.4.0.1 对应哪个 MAC
```

于是：

```text
ARP:
Who has 10.4.0.1?
```

对方回复：

```text
10.4.0.1 is at XX-XX-XX-XX-XX-XX
```

#### 实践

```powershell
arp -a
```

然后：

```powershell
ping 默认网关
arp -a
```

观察 ARP 表发生什么变化。

---

## 第四阶段：路由——数据到底往哪走

这是排障核心。

### 6. 默认网关

必须真正理解：

> 默认网关不是“Internet”。

它的含义是：

```text
如果目标 IP 不在我的本地网络里，
而我又没有更具体的路线，
就把包交给这个设备。
```

---

### 7. 路由表

学习：

* [ ] Destination
* [ ] Netmask / Prefix
* [ ] Gateway
* [ ] Interface
* [ ] Metric
* [ ] 最长前缀匹配

Windows：

```powershell
route print
```

以及：

```powershell
Get-NetRoute
```

重点找：

```text
0.0.0.0/0
```

理解它表示：

```text
默认路由
```

#### 实践

思考：

```text
目标：10.4.0.50

目标：8.8.8.8
```

电脑为什么可能选择不同路线？

---

### 8. traceroute / tracert

Windows：

```powershell
tracert 8.8.8.8
```

学习：

* [ ] TTL
* [ ] 明确 TTL 属于 IPv4 Header，而不属于 ICMP
* [ ] Hop
* [ ] Router
* [ ] 明确各轮探测的最终 Destination IP 不变，变化的是初始 TTL
* [ ] 区分最终 IP 目标与当前链路上的下一跳
* [ ] 为什么会出现 `* * *`
* [ ] 为什么某一跳不响应不代表后面不通

理解：

```text
PC
 ↓
Gateway
 ↓
Router A
 ↓
Router B
 ↓
ISP
 ↓
Internet
```

---

## 第五阶段：网络协议基础

### 9. TCP/IP 分层模型

推荐先学 TCP/IP 模型，再了解 OSI。

重点：

```text
Application
Transport
Internet
Link
```

对应：

```text
HTTP / DNS / SSH
      ↓
TCP / UDP
      ↓
IP
      ↓
Ethernet / Wi-Fi
```

之后再学习 OSI 七层：

```text
Application
Presentation
Session
Transport
Network
Data Link
Physical
```

不用一开始疯狂背七层。

---

## 第六阶段：ICMP 与 IP 层诊断

这部分直接解释你之前的 ping 问题。

### 10. ICMP

学习：

* [ ] ICMP 是什么
* [ ] Echo Request
* [ ] Echo Reply
* [ ] Destination Unreachable
* [ ] TTL Exceeded

`ping`：

```text
ICMP Echo Request
         ↓
ICMP Echo Reply
```

所以：

```text
ping 不通
```

不能等价于：

```text
网站不能访问
```

---

## 第七阶段：TCP、UDP、端口和 Socket

### 11. TCP

重点理解：

* [ ] Connection
* [ ] 三次握手
* [ ] 四次挥手
* [ ] Sequence Number
* [ ] ACK
* [ ] SYN 和 FIN 各占用一个 Sequence Number，纯 ACK 不占用
* [ ] ACK Number 表示下一期待的序列号，而不是应用处理结果
* [ ] 重传
* [ ] 流量控制
* [ ] 拥塞控制
* [ ] Port
* [ ] TCP 是字节流，不保留应用消息边界
* [ ] 半包、一次读取多条消息与应用层 Framing
* [ ] `PSH, ACK` 不等于一条完整应用消息，判断数据应看 TCP Payload
* [ ] 区分 `send()` 成功、TCP ACK、应用回复与业务成功

三次握手：

```text
Client                 Server

SYN        -------->

           <--------   SYN + ACK

ACK        -------->
```

---

### 12. UDP

理解：

* [ ] 无连接
* [ ] Datagram
* [ ] 不保证可靠
* [ ] 保留 Datagram 边界
* [ ] 可能丢失、乱序或重复
* [ ] 没有 TCP 的按序等待，但不能笼统等同于“延迟一定更小”
* [ ] DNS 经常使用 UDP
* [ ] 实时通信经常使用 UDP
* [ ] 实时与安全控制仍需应用层序号、超时、限速和 Fail-safe 设计

重点比较：

```text
TCP
可靠、有连接

UDP
简单、无连接
```

不要简单记成：

```text
TCP 慢
UDP 快
```

这种说法太粗糙。

### 13. Port

学习：

```text
IP
```

参与把 Packet 送到目标主机或接口地址。

```text
Port
```

让操作系统进行传输层分用。端口通常由程序创建的 Socket 使用，但不能把端口号简单等同于程序身份。

例如：

```text
142.x.x.x:443
```

意味着：

```text
服务器 IP
+
TCP 443
```

常见端口：

```text
22    SSH
53    DNS
80    HTTP
443   HTTPS
```

---

### 14. Socket

理解：

```text
Socket Address ≈ IP + Port

Socket = 操作系统提供给应用的通信对象

TCP Connection = Local IP/Port + Remote IP/Port
```

实践：

```powershell
netstat -ano
```

或者：

```powershell
Get-NetTCPConnection
```

观察：

```text
LocalAddress
LocalPort
RemoteAddress
RemotePort
State
PID
```

然后：

```powershell
tasklist
```

找到对应进程。

#### 应用层 Framing

TCP 是 Byte Stream，不保留应用消息边界。进一步掌握：

* [ ] 区分 `Send()`、TCP Segment、`Read()` 和应用消息边界
* [ ] 理解所谓粘包、半包并不是 TCP 传输错误
* [ ] 固定长度、分隔符与长度前缀三类 Framing
* [ ] Length 的定义、Endianness、最大值和整数溢出检查
* [ ] 文本字符数与编码后 byte 数的区别
* [ ] 流式 Buffer 能一次提取零条、一条或多条 Frame
* [ ] TCP Sequence Number 与应用 RequestId 的区别
* [ ] Timeout、迟到 Response、幂等与业务重试
* [ ] `TCP_NODELAY` 不能解决消息边界问题

#### Socket I/O 与连接生命周期

* [ ] 阻塞、非阻塞与异步 I/O 的区别
* [ ] `Receive() > 0`、`Receive() == 0` 与 Socket Error
* [ ] TCP 可以先交付正确字节前缀再报连接错误，应用必须识别未完成 Frame
* [ ] TCP RTO、Receive Timeout、Frame Timeout 与 Request Timeout
* [ ] TCP Keepalive 与应用 Heartbeat 的层次区别
* [ ] 一个连接使用统一 Receive Loop 和 Frame Decoder
* [ ] Pending Request Table、Deadline、取消和迟到 Response
* [ ] `Connected`、TCP Connected 与协议 Ready 的区别
* [ ] Reconnect State Machine、Generation、Backoff 与 Jitter
* [ ] 断线后清理半帧、Pending Request 和旧 Session
* [ ] 有副作用命令的幂等、去重和安全重试
* [ ] Bounded Send Queue 与 Backpressure

---

## 第八阶段：DNS

这是非常重要的一章。

### 15. 域名和 IP

理解：

```text
www.google.com
```

不是网络真正发送数据的位置。

必须先变成：

```text
IP Address
```

---

### 16. DNS 查询流程

大致理解：

```text
Application
 ↓
OS DNS Cache
 ↓
Configured DNS Server
 ↓
Recursive Resolver
 ↓
Root
 ↓
TLD
 ↓
Authoritative DNS
```

学习：

* [ ] Recursive DNS
* [ ] Authoritative DNS
* [ ] DNS Cache
* [ ] TTL
* [ ] A
* [ ] AAAA
* [ ] CNAME
* [ ] NS
* [ ] MX

---

### 17. DNS 实践

Windows：

```powershell
nslookup google.com
```

指定服务器：

```powershell
nslookup google.com 8.8.8.8
```

查看缓存：

```powershell
ipconfig /displaydns
```

清缓存：

```powershell
ipconfig /flushdns
```

重点理解：

```text
ping google.com
```

实际上至少发生：

```text
DNS
 ↓
得到 IP
 ↓
ICMP
```

所以失败可能发生在不同阶段。

---

## 第九阶段：HTTP、HTTPS 和 TLS

这是浏览器、API、GitHub、ChatGPT 等工具的基础。

### 18. HTTP

学习：

* [ ] Request
* [ ] Response
* [ ] GET
* [ ] POST
* [ ] Header
* [ ] Body
* [ ] Status Code

实践：

```powershell
curl.exe -v https://example.com
```

以及：

```powershell
curl.exe -I https://example.com
```

---

### 19. HTTPS / TLS

先掌握概念：

```text
HTTP
 ↓
TLS
 ↓
TCP
 ↓
IP
```

学习：

* [ ] TLS 是什么
* [ ] Certificate
* [ ] CA
* [ ] Public Key
* [ ] Private Key
* [ ] 对称加密
* [ ] 非对称加密
* [ ] TLS 握手
* [ ] TLS 的机密性、完整性与身份认证目标
* [ ] TLS Endpoint、CONNECT Tunnel 与 TLS Interception 的区别
* [ ] HTTP/3 使用 QUIC/UDP，不依赖 TCP

不用一开始研究密码学数学。

---

## 第十阶段：网络排障方法论

这一章直接做成肌肉记忆。

### 20. 从近到远排查

遇到：

```text
访问不了 xxx.com
```

依次检查：

```text
应用
 ↓
DNS
 ↓
本机网络
 ↓
网关
 ↓
Internet
 ↓
目标服务器
```

---

### 21. 基础工具

必须熟悉：

```powershell
ipconfig
ipconfig /all

ping

tracert

nslookup

curl.exe

arp -a

route print

netstat -ano

Get-NetAdapter
Get-NetIPConfiguration
Get-NetRoute
Get-NetTCPConnection

Test-NetConnection
```

例如：

```powershell
Test-NetConnection google.com -Port 443
```

它比单纯：

```powershell
ping google.com
```

更适合测试：

> HTTPS 服务到底能不能连接。

---

### 22. 推荐固定排障套路

遇到网络故障：

```text
① 网卡是否工作？
② 有没有 IP？
③ 子网掩码是否正确？
④ 默认网关是什么？
⑤ 网关能 ping 吗？
⑥ 公网 IP 能访问吗？
⑦ DNS 能解析吗？
⑧ 目标 TCP Port 能连接吗？
⑨ HTTP/HTTPS 是否成功？
⑩ 有没有 Proxy / VPN / Firewall？
⑪ 路由表是否异常？
⑫ 抓包确认
```

---

## 第十一阶段：NAT

这是理解 VPN 和 P2P 的关键。

### 23. 为什么需要 NAT

家里可能有：

```text
192.168.1.10
192.168.1.11
192.168.1.12
```

但 Internet 上通常只有一个公网 IP。

路由器进行：

```text
Private IP
      ↓
NAT
      ↓
Public IP
```

---

### 24. NAT/PAT

例如：

```text
192.168.1.10:50000
       ↓
203.0.113.10:40001
```

另一台：

```text
192.168.1.11:50000
       ↓
203.0.113.10:40002
```

学习：

* [ ] SNAT
* [ ] DNAT
* [ ] PAT
* [ ] Port Forwarding
* [ ] NAT Mapping 与 Filtering 是两个独立维度
* [ ] NAT 与 Stateful Firewall 的区别
* [ ] CGNAT 与 `100.64.0.0/10` Shared Address Space
* [ ] 动态 Mapping 的 Idle Timeout

实践：

查看自己公网 IP 和：

```powershell
ipconfig
```

显示的内网 IP 为什么不同。

---

## 第十二阶段：Firewall

### 25. 防火墙

学习：

防火墙可以根据：

```text
Source IP
Destination IP
Protocol
Source Port
Destination Port
Connection State
```

决定：

```text
Allow
Drop
Reject
```

理解：

```text
ping 被禁止
```

和：

```text
TCP 443 被禁止
```

完全是两回事。

---

## 第十三阶段：Proxy

这是你最近遇到问题的核心。

### 26. 什么是代理

普通 HTTP Proxy：

```text
Application
     ↓
Proxy
     ↓
Server
```

原本：

```text
你 → Google
```

变成：

```text
你 → Proxy → Google
```

进一步区分：

* [ ] Plain HTTP Forward Proxy
* [ ] HTTPS over HTTP CONNECT
* [ ] SOCKS 是应用层代理协议，不是 TCP/IP 的传输层协议
* [ ] Proxy 端解析与本机解析对 DNS 路径的影响
* [ ] `200 Connection Established` 与 Origin `200 OK` 的区别

---

### 27. HTTP Proxy

理解：

```text
127.0.0.1:7890
```

意味着：

> 本机有一个程序正在监听 7890 端口，应用把 HTTP/HTTPS 请求交给它。

实践：

```powershell
curl.exe -x http://127.0.0.1:7890 https://example.com
```

---

### 28. SOCKS5

学习 SOCKS 与 HTTP Proxy 区别。

大致理解：

```text
HTTP Proxy
更懂 HTTP

SOCKS5
更通用，更像转发 TCP/UDP
```

重点理解：

```text
socks5://127.0.0.1:7891
```

---

### 29. 系统代理

Windows 系统代理本质上是：

> 告诉支持它的应用程序，请使用这个 Proxy。

它并不是：

> 强制拦截操作系统里的所有数据包。

因此：

```text
Chrome        ✅
Edge          ✅

curl          不一定
Git           不一定
ping          ❌
nslookup      ❌
```

这点必须牢记。

---

### 30. 环境变量代理

学习：

```text
HTTP_PROXY
HTTPS_PROXY
ALL_PROXY
NO_PROXY
```

PowerShell：

```powershell
$env:HTTP_PROXY="http://127.0.0.1:7890"
$env:HTTPS_PROXY="http://127.0.0.1:7890"
```

很多 CLI 软件会读取这些。

---

## 第十四阶段：VPN 和 TUN

### 31. Proxy vs VPN

Proxy 更像：

```text
Application
 ↓
Proxy
```

VPN/TUN 更像：

```text
Application
 ↓
OS Network Stack
 ↓
Virtual Network Adapter
 ↓
VPN
```

因此 VPN 可以接管更多类型的流量。

但必须理解：

* [ ] Full Tunnel 与 Split Tunnel
* [ ] Inner Packet 与 Outer Packet
* [ ] VPN 不会自动解密端到端 HTTPS
* [ ] TUN 接管路由选入的 IP Packet，不等于必然接管所有程序和流量

---

### 32. TUN / TAP

学习：

* [ ] Virtual Network Adapter
* [ ] TUN
* [ ] TAP
* [ ] TUN/TAP 是 Virtual Interface，不是 Router 本身

简单理解：

```text
TUN
处理 IP 层数据包

TAP
处理 Ethernet 帧
```

现代代理软件普遍更常见：

```text
TUN Mode
```

---

### 33. 为什么 TUN 能让“不支持代理的软件”走代理

普通 Proxy：

```text
App
 ↓
App 必须主动连 Proxy
```

TUN：

```text
App
 ↓
正常发 IP Packet
 ↓
OS Route
 ↓
TUN
 ↓
Proxy Core
```

应用甚至可能完全不知道代理存在。

---

## 第十五阶段：隧穿 Tunnel

这一章很重要。

### 34. Tunnel 的核心概念

一句话：

> 把一种网络数据封装进另一种网络连接里传输。

例如：

```text
原始 Packet
     ↓
封装
     ↓
另一种 Packet
     ↓
Internet
     ↓
解封装
```

这就是：

```text
Encapsulation
```

---

### 35. 常见 Tunnel

了解：

```text
GRE Tunnel
IPsec
WireGuard
OpenVPN
SSH Tunnel
VXLAN
```

不用全部深入。

---

### 36. SSH Tunnel

重点学，因为开发中特别实用。

Local Forward：

```text
localhost:8080
     ↓
SSH
     ↓
Remote Server
     ↓
Target
```

例如：

```bash
ssh -L 8080:internal-server:80 user@jump-server
```

理解：

```text
Local Port Forwarding
Remote Port Forwarding
Dynamic Port Forwarding
```

---

### 37. SSH SOCKS

```bash
ssh -D 1080 user@server
```

这会建立：

```text
localhost:1080
```

SOCKS Proxy。

非常适合理解：

```text
Proxy
+
Tunnel
```

之间的关系。

---

## 第十六阶段：VPN 本质

学到这里重新看 VPN。

### 38. VPN = Virtual Private Network

VPN 通常做几件事情：

```text
建立虚拟网络接口
+
建立加密隧道
+
修改路由
+
通过远程服务器转发流量
```

例如：

```text
Application
 ↓
IP Packet
 ↓
TUN
 ↓
Encrypt
 ↓
UDP
 ↓
Internet
 ↓
VPN Server
 ↓
Decrypt
 ↓
Internet
```

这就是典型隧穿。

---

## 第十七阶段：代理规则和分流

### 39. Rule Based Routing

现代代理软件通常不会：

```text
所有东西全部代理
```

而会根据规则：

```text
公司内网 → DIRECT

国内网站 → DIRECT

Google → PROXY

GitHub → PROXY
```

学习概念：

```text
DIRECT
PROXY
MATCH
DOMAIN
IP-CIDR
GEOIP
```

---

### 40. DNS 与代理

非常重要。

需要理解：

```text
DNS 查询走哪里？
```

和：

```text
解析后的 TCP 流量走哪里？
```

是两个问题。

可能出现：

```text
Web Traffic → Proxy
DNS         → Local Network
```

于是：

```text
浏览器能用
nslookup 异常
```

学习：

* [ ] DNS Leak
* [ ] Fake-IP
* [ ] DNS Hijacking
* [ ] DNS Proxy
* [ ] DoH
* [ ] DoT

---

## 第十八阶段：抓包

学网络不抓包，永远隔一层。

推荐：

```text
Wireshark
```

### 41. Wireshark 基础

学会过滤：

```text
icmp
```

```text
dns
```

```text
tcp
```

```text
udp
```

```text
http
```

```text
tls
```

```text
ip.addr == 8.8.8.8
```

理解观察边界：

* [ ] Wireshark 通常是旁路观察者，不是 Proxy
* [ ] 抓到 TLS Ciphertext 不等于能看到 HTTP 明文
* [ ] TLS Key Log 解密与 TLS Interception Proxy 的区别
* [ ] 抓包接口和网卡 Offload 会影响看到的封装

---

### 42. 第一个抓包实验

打开 Wireshark。

然后：

```powershell
ping 8.8.8.8
```

观察：

```text
ICMP Echo Request
ICMP Echo Reply
```

---

### 43. DNS 实验

运行：

```powershell
nslookup example.com
```

Wireshark：

```text
dns
```

观察：

```text
Query
Response
A Record
AAAA Record
```

---

### 44. TCP 实验

运行：

```powershell
curl.exe https://example.com
```

过滤：

```text
tcp
```

找到：

```text
SYN
SYN ACK
ACK
```

亲眼看到 TCP 三次握手。

---

## 第十九阶段：P2P

前面的 NAT、UDP、Tunnel 学完再进 P2P。

### 45. P2P 基础

普通 Client/Server：

```text
A
 ↓
Server
 ↑
B
```

P2P：

```text
A ←────→ B
```

Peer 同时可以是：

```text
Client
+
Server
```

---

### 46. P2P 最大的问题：NAT

比如：

```text
Peer A
192.168.1.10
     ↓
NAT A
     ↓
Internet
     ↓
NAT B
     ↓
192.168.50.20
Peer B
```

A 和 B 都没有直接公网地址。

于是：

```text
A 怎么直接连接 B？
```

这就是 NAT Traversal 问题。

---

## 第二十阶段：NAT Traversal / 打洞

### 47. Hole Punching

重点学习：

```text
UDP Hole Punching
```

基本思路：

```text
       Rendezvous Server
          ↑        ↑
          A        B
```

服务器先告诉双方：

```text
A 的公网 IP:Port
B 的公网 IP:Port
```

然后：

```text
A → B
B → A
```

双方 NAT 都建立映射。

最终：

```text
A ←──── P2P ────→ B
```

服务器退出数据传输路径。

进一步理解：

* [ ] 双方主动发送建立或刷新临时 Mapping / Filtering State
* [ ] Mapping 行为、Filtering、Firewall、时序和 Lifetime 都会影响成功率
* [ ] TCP Hole Punching 通常比 UDP 更依赖实现与时序

---

## 第二十一阶段：STUN / TURN / ICE

WebRTC、语音视频、远程连接都非常重要。

### 48. STUN

作用大致是：

> 告诉我，我从 Internet 看起来是什么 IP 和 Port？

```text
Peer
 ↓
STUN Server
 ↓
Your public mapping:
203.x.x.x:50001
```

需要明确：

* [ ] 得到的是 Public Transport Endpoint，不只是 Public IP
* [ ] ICE 中通常称为 Server-Reflexive Candidate
* [ ] 对 STUN Server 有效的 Mapping 不保证对另一个 Peer 仍相同
* [ ] STUN 不负责 Signaling，也通常不搬运后续业务数据

---

### 49. TURN

如果 P2P 打洞失败：

```text
A
 ↓
TURN Server
 ↓
B
```

流量由服务器中继。

优点：

```text
成功率高
```

缺点：

```text
服务器带宽成本高
延迟高
```

* [ ] TURN Allocation 与 Relayed Candidate
* [ ] TURN Server 进入 Data Plane，承担双向中继带宽
* [ ] TURN 不自动提供 Peer 间端到端 Payload 加密

---

### 50. ICE

ICE 可以理解成：

> 帮我从多个连接候选方案里选最好的。

候选可能有：

```text
Local
STUN
TURN
```

优先：

```text
直接 P2P
```

实在不行：

```text
TURN Relay
```

所以：

```text
ICE
 ├── STUN
 └── TURN
```

这个关系非常值得掌握。

还应掌握：

* [ ] Host、Server-Reflexive、Peer-Reflexive、Relayed Candidate
* [ ] Candidate Pair、Connectivity Check 与 Nomination
* [ ] ICE 使用 STUN Protocol，但不等于简单的 `STUN + TURN`
* [ ] Signaling 由应用另行提供

---

## 第二十二阶段：常见 P2P 应用

了解原理即可：

* [ ] BitTorrent
* [ ] WebRTC
* [ ] 游戏联机
* [ ] 语音/视频
* [ ] 远程桌面
* [ ] Tailscale
* [ ] ZeroTier

特别推荐研究：

```text
Tailscale
```

因为它把很多东西串在一起：

```text
WireGuard
NAT Traversal
STUN
Relay
P2P
Overlay Network
```

非常适合当网络进阶案例。

---

## 第二十三阶段：Overlay Network

理解：

真实网络：

```text
Physical / Underlay Network
```

上面再构建：

```text
Virtual / Overlay Network
```

例如：

```text
Machine A
10.0.0.1

Machine B
10.0.0.2
```

实际上两台电脑可能相隔几千公里。

中间：

```text
Internet
+
Tunnel
```

但是应用感觉：

```text
它们好像在一个 LAN。
```

这就是很多：

```text
VPN
ZeroTier
Tailscale
VXLAN
```

背后的核心思想。

---

## 第二十四阶段：IPv6

基础网络掌握之后再学。

### 51. IPv6

学习：

* [ ] 为什么需要 IPv6
* [ ] 128-bit address
* [ ] Link-local
* [ ] Global address
* [ ] `::1`
* [ ] SLAAC
* [ ] Neighbor Discovery
* [ ] IPv6 为什么通常不需要传统 NAT

不用一开始深入各种 IPv6 扩展头。

---

## 第二十五阶段：最终综合实验

最后给自己做一个完整网络实验。

### 实验 A：访问一个网站

执行：

```powershell
nslookup example.com

tracert example.com

Test-NetConnection example.com -Port 443

curl.exe -v https://example.com
```

解释完整链路：

```text
DNS
 ↓
IP
 ↓
Route
 ↓
TCP
 ↓
TLS
 ↓
HTTP
```

---

### 实验 B：开代理前后比较

分别执行：

```powershell
curl.exe https://example.com
```

和：

```powershell
curl.exe -x http://127.0.0.1:7890 https://example.com
```

Wireshark 抓包。

理解：

```text
Direct
```

和：

```text
Proxy
```

网络连接目标为什么不同。

---

### 实验 C：观察路由

执行：

```powershell
route print
```

然后打开 TUN/VPN。

再次：

```powershell
route print
```

比较差异。

重点寻找：

```text
0.0.0.0/0
```

以及 VPN 创建的虚拟网卡。

---

### 实验 D：建立自己的 Tunnel

找一台 Linux 服务器。

执行：

```bash
ssh -D 1080 user@server
```

然后：

```powershell
curl.exe --proxy socks5h://127.0.0.1:1080 https://example.com
```

这一个实验会一次串起：

```text
Socket
TCP
SSH
Encryption
Tunnel
SOCKS
DNS
Proxy
Routing
```

---

### 实验 E：观察 P2P

研究 WebRTC：

```text
Peer A
Peer B
STUN
TURN
ICE
```

然后用浏览器 WebRTC demo 观察：

```text
ICE Candidate
Host Candidate
Server Reflexive Candidate
Relay Candidate
```

如果能解释这些，就已经进入网络工程的进阶区域了。

---

## 推荐学习顺序

严格按这个顺序：

```text
① 网络整体模型 / TCP-IP 封装
        ↓
② IPv4 / Subnet
        ↓
③ Ethernet / MAC / ARP / Switch
        ↓
④ Gateway / Routing
        ↓
⑤ ICMP / ping / tracert
        ↓
⑥ TCP / UDP / Port / Socket / Framing / Connection Lifecycle
        ↓
⑦ DNS
        ↓
⑧ HTTP / HTTPS / TLS
        ↓
⑨ NAT / Firewall
        ↓
⑩ Network Troubleshooting
        ↓
⑪ Proxy / SOCKS
        ↓
⑫ VPN / TUN
        ↓
⑬ Tunnel
        ↓
⑭ Wireshark
        ↓
⑮ P2P
        ↓
⑯ NAT Traversal
        ↓
⑰ STUN / TURN / ICE
        ↓
⑱ Overlay Network
```

不要把：

```text
OSI 七层
```

当第一件事情狂背。

先知道数据到底怎么从：

```text
Program
```

走到：

```text
Internet
```

OSI 自然会逐渐理解。

---

## 第一阶段完成标准

学完 IP、Subnet、Gateway、Routing、DNS、ICMP 后，必须能够独立解释：

```text
ping 127.0.0.1
```

测试什么？

```text
ping 自己IP
```

测试什么？

```text
ping 默认网关
```

测试什么？

```text
ping 8.8.8.8
```

测试什么？

```text
nslookup google.com
```

测试什么？

```text
ping google.com
```

又比 `ping 8.8.8.8` 多了哪个环节？

如果这几个问题能顺畅回答，基础网络已经真正入门。

---

## 第二阶段完成标准

学完 TCP、UDP、Port、HTTP 后，能够解释：

```text
ping google.com 失败
```

为什么不能证明：

```text
https://google.com
```

访问失败。

因为：

```text
ping
→ ICMP

HTTPS
→ TCP 443 + TLS + HTTP
```

完全是两套不同的通信过程。

---

## 第三阶段完成标准

学完 Proxy / VPN / TUN 后，能够解释：

```text
Browser ✅
ping    ❌
curl    ❌
```

但是：

```text
curl -x http://127.0.0.1:7890 ... ✅
```

为什么完全合理。

必须能够画出：

```text
Browser
    ↓
System Proxy
    ↓
127.0.0.1:7890
    ↓
Proxy Core
    ↓
Proxy Server
    ↓
Internet
```

以及：

```text
ping
 ↓
OS
 ↓
Physical Network
```

两者区别。

---

## 第四阶段完成标准

学完 Tunnel / P2P 后，能够自己解释：

```text
Proxy
VPN
Tunnel
TUN
NAT
P2P
NAT Traversal
STUN
TURN
ICE
```

之间的关系。

最终形成这样一个整体模型：

```text
                    Application
                         │
              ┌──────────┴──────────┐
              │                     │
          Application Proxy       Socket
              │                     │
          HTTP/SOCKS              TCP/UDP
              │                     │
              └──────────┬──────────┘
                         │
                        IP
                         │
                   Routing Table
                         │
             ┌───────────┴───────────┐
             │                       │
       Physical Adapter         TUN Adapter
             │                       │
           LAN                  VPN/Tunnel
             │                       │
            NAT                      │
             │                       │
             └────────── Internet ───┘
                          │
                  Remote Server / Peer
```

看到这张图的时候，如果每一条线为什么存在都能解释出来，这套网络知识基本就串起来了。

---

## 学习过程中最重要的原则

不要只记：

```text
TCP 是可靠的
UDP 是不可靠的
DNS 是域名解析
VPN 是翻墙
```

每学一个概念，都问自己三个问题：

```text
它解决什么问题？

没有它会怎样？

我怎么在自己的电脑上观察到它？
```

然后一定实际运行命令、抓包。

计算机网络特别适合：

```text
理论
→ 命令验证
→ Wireshark
→ 再回来看理论
```

这样学。

最终目标不是“背完计算机网络”。

而是看到：

```text
Connection timed out
Connection refused
DNS lookup failed
Network unreachable
Connection reset
TLS handshake failed
```

这些错误时，脑子里会自动开始判断：

```text
DNS？
Routing？
TCP？
Firewall？
Proxy？
TLS？
Server？
```

到这一步，网络知识就真正变成工程能力了。

这份路线里，**前 1～10 阶段属于扎实的 Computer Networks 基础 + 排障；11～17 是很实用的代理/VPN/隧穿；18 以后逐渐进入抓包、P2P 和现代网络应用。**

---

## 系列导航

- [开始阅读：数据如何离开电脑：网络的整体模型](/notes/computer-net/01-network-model/)
