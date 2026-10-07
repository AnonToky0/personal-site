---
title: "HTTP、TLS、Proxy、VPN 与抓包边界"
description: "沿实际通信路径区分 HTTP、TLS、代理、VPN 与抓包工具，理解连接参与者及明文的出现位置。"
date: 2026-10-07
tags: ["计算机网络", "HTTP", "TLS", "代理", "VPN"]
---

网络工具最容易混淆的地方，不是它们的名字，而是三个问题：

```text
它是否位于通信路径中？
它转发的单位是什么？
TLS 在哪里开始和终止？
```

同样是“能看到 Packet”，可能分别表示：

```text
Proxy：作为通信参与者接收后再发送
VPN：通过虚拟接口和隧道转发流量
Wireshark：从抓包接口复制数据用于观察
TLS Interception Proxy：终止一段 TLS，再建立另一段 TLS
```

本章用“实际连接由谁建立、明文出现在哪里”理解这些组件，而不是机械地把软件贴到某一个 OSI 层。

## 1. 应用数据如何走向网络

以 HTTP/1.1 或 HTTP/2 over TLS 为例：

```text
HTTP Message
   ↓
TLS Record
   ↓
TCP Byte Stream
   ↓
IP Packet
   ↓
Ethernet / Wi-Fi Link Data
```

发送端大致经历：

```text
Application
   ↓ send()/write()
Socket Send Path
   ↓
TCP
   ↓
IP and Route
   ↓
Driver / NIC
```

HTTP/3 不使用 TCP，而是运行在集成 TLS 的 QUIC 之上，通常使用 UDP 443：

```text
HTTP/3
   ↓
QUIC + TLS
   ↓
UDP
   ↓
IP
```

所以“HTTPS = HTTP + TLS + TCP”适用于常见的 HTTP/1.1 和 HTTP/2 路径，但不是所有现代 HTTPS 连接的唯一结构。

## 2. HTTP 是应用层协议

HTTP 定义 Request 与 Response 的语义和格式。例如 HTTP/1.1 请求：

```http
GET /index.html HTTP/1.1
Host: example.com
```

响应可能是：

```http
HTTP/1.1 200 OK
Content-Type: text/html
Content-Length: 5

hello
```

HTTP 本身不负责：

```text
把域名解析成地址
选择本机 IP 路由
完成 TCP 重传
为普通 HTTP 自动提供加密
```

访问 `http://example.com` 的典型依赖链是：

```text
Name Resolution
→ TCP Connection to port 80
→ HTTP Request
→ HTTP Response
```

但缓存、持久连接、代理、HTTP/3 和预连接都会让实际过程不同，不能假设每次 Request 都重新执行完整链路。

## 3. HTTPS 与 TLS

HTTPS 表示 HTTP 通过 TLS 获得安全传输。概念上可以写成：

```text
HTTP
 ↓
TLS
 ↓
TCP
```

TLS 常被描述为位于应用协议与传输协议之间，但它不是 TCP Header 中的一个“半层”。它本身是一组安全协议，由客户端和服务器端的软件实现；在不同分层模型中可被归类到应用层或表示层附近。

TLS 的主要安全目标是：

```text
Confidentiality：没有会话密钥的观察者不能直接读取应用明文
Integrity：检测 TLS 保护数据被修改
Authentication：典型 HTTPS 中客户端验证服务器身份
```

是否进行客户端身份认证取决于配置；普通 HTTPS 通常只要求服务器证书，也可以使用 mTLS 同时验证客户端证书。

## 4. TLS Handshake 在做什么

现代 TLS Handshake 的核心工作包括：

```text
协商 TLS 版本与 Cipher Suite
交换随机参数和密钥协商信息
服务器提供证书链和签名证明
客户端验证服务器身份
双方导出对称 Session Keys
验证 Handshake 未被篡改
```

高度简化的 TLS 1.3 路径：

```text
Client                                      Server

ClientHello + key share
        ---------------------------------->

                    ServerHello + key share
                    Certificate + signature
        <----------------------------------

verify certificate and handshake
derive traffic keys on both endpoints

encrypted HTTP data
        <=================================>
```

会话密钥通常由密钥协商共同导出，而不是服务器把一个可直接使用的对称密钥明文发送给客户端。

## 5. 证书验证不只是“是不是 CA 签发”

客户端通常需要验证：

```text
证书链能否建立到受信任根
目标 Hostname 是否匹配证书标识
证书是否处于有效时间范围
证书用途和算法是否符合要求
签名与 Handshake 证明是否有效
撤销状态是否按平台策略检查
```

证书证明的是公钥和身份之间的受信任绑定。只有“连接使用了加密”而没有正确验证身份，仍可能受到中间人攻击。

## 6. TLS 加密了什么，没有隐藏什么

建立 TLS 后，HTTP Method、Path、Header 和 Body 通常位于加密保护中。路径上的普通观察者一般不能直接看到：

```text
GET /private
Cookie
Authorization
Response Body
```

但 TLS 不会自动隐藏所有元数据。观察位置和协议版本不同，仍可能看到或推断：

```text
源与目标 IP
端口
连接时间和持续时间
流量大小与方向
TLS 版本和部分握手参数
某些情况下的 Server Name
服务器证书信息
```

ECH、代理、VPN、DNS 加密和连接复用会改变哪些元数据可见，因此不能笼统说“HTTPS 把访问的一切都隐藏了”。

## 7. 不同角色：终点、转发者与观察者

### Endpoint

通信端点实际生成或消费应用明文，例如浏览器和目标 Web Server。TLS 必须在某个 Endpoint 加密，并在另一个 Endpoint 解密。

### Forwarder

转发者位于数据路径中，接收数据后决定如何继续发送，例如 HTTP Proxy、SOCKS Proxy、VPN Gateway 和 Router。它能看到什么取决于转发发生在哪个抽象、TLS 是否在它这里终止。

### Passive Observer

旁路观察者复制或捕获经过某个观测点的数据，不替通信双方完成转发。Wireshark 通常属于这一类。

### TLS Terminator / Interception Proxy

TLS 终止点持有该 TLS 会话所需的密钥，能够把 Record 还原为明文。反向代理、CDN、企业检查代理都可能合法地终止 TLS，但信任模型和部署目的不同。

## 8. Plain HTTP Forward Proxy

客户端配置 HTTP Proxy 后，连接关系从：

```text
Client ── TCP ──> Origin Server
```

变成：

```text
Client ── TCP ──> HTTP Proxy ── TCP ──> Origin Server
```

对普通明文 HTTP，请求行可使用 absolute-form：

```http
GET http://example.com/index.html HTTP/1.1
Host: example.com
```

Proxy 理解 HTTP，因此可以按配置执行：

```text
选择上游连接
验证身份
记录 Method、Host、Path 和 Header
修改 Header
缓存允许缓存的内容
执行访问控制
```

由于是明文 HTTP，客户端与 Origin 之间不存在阻止 Proxy 读取内容的端到端 TLS。

## 9. HTTPS 通过 HTTP Proxy：CONNECT

如果客户端要访问：

```text
https://example.com:443
```

它可以先连接 HTTP Proxy，然后发送：

```http
CONNECT example.com:443 HTTP/1.1
Host: example.com:443
```

Proxy 尝试建立到目标 Authority 的连接。成功时可能回复：

```http
HTTP/1.1 200 Connection Established
```

这份 `200` 表示：

> Proxy 已接受 CONNECT 并建立可供转发 byte 的 Tunnel。

它不是 Origin Website 对最终 HTTP Request 返回的 `200 OK`，也不证明后续 TLS Handshake 或网站请求一定成功。

CONNECT 成功后，普通 Tunnel 模式是：

```text
Client
  │ TLS records for Origin
  ▼
HTTP Proxy
  │ forwards opaque bytes
  ▼
Origin TLS Server
```

此时 TLS 通常仍是 Client 与 Origin 之间的会话。Proxy 知道 CONNECT 的目标 Host/Port，并能观察连接元数据，但通常不能读取加密后的 HTTP 内容。

## 10. `curl -I`、`-v` 与 CONNECT 输出

```powershell
curl.exe -I https://example.com
```

`-I` 通常让 curl 请求 Origin 的 Response Header，常使用 HEAD。它不是“只测试 TCP”的选项。

```powershell
curl.exe -v -x http://127.0.0.1:7890 https://example.com
```

详细输出可能同时包含多个阶段：

```text
连接本地 Proxy
→ CONNECT example.com:443
→ Proxy 返回 200 Connection Established
→ 与 Origin 进行 TLS Handshake
→ 发送最终 HTTP Request
→ Origin 返回 HTTP Response
```

阅读日志时要区分 Proxy 的 CONNECT Response 和 Origin 的最终 Response。不同 curl 版本、代理认证和协议协商会让具体输出不同。

## 11. SOCKS Proxy

SOCKS 是一个应用使用的代理协议，而不是 TCP/IP 协议栈里新增的“传输层协议”。客户端先与 SOCKS Server 建立会话，请求它连接某个目标地址和端口：

```text
Application
  ↓ SOCKS request: connect target:port
SOCKS Proxy
  ↓ new outbound flow
Target
```

建立成功后，SOCKS TCP CONNECT 通常转发任意应用 Byte Stream，因此不需要理解里面是 HTTP、TLS、SSH 还是自定义 MMI 协议。

SOCKS5 还定义 UDP ASSOCIATE，但 UDP 转发的语义、支持程度和 NAT 行为与简单 TCP Tunnel 不同，不能把 SOCKS 一概描述成“只支持 TCP”。

“SOCKS 是 TCP 层代理”可以作为直观简称，但严格来说 SOCKS 自身运行在应用层，只是它提供比 HTTP Forward Proxy 更通用的连接转发能力。

## 12. 名称由谁解析也是路径的一部分

请求 Proxy 连接目标时，可以传 IP，也可以传 Domain Name。究竟由本机还是 Proxy 解析会影响：

```text
使用哪个 DNS Resolver
得到哪个 CDN 地址
内外网名称是否可见
DNS 是否绕过 Proxy
连接能否成功
```

curl 中常见差异：

```text
socks5://...
→ 通常由客户端先解析名称

socks5h://...
→ 将 Hostname 交给 SOCKS Proxy 解析
```

具体工具语义应查其文档，不能只看“使用了 SOCKS”就断定 DNS 一定走远端。

## 13. 本地 Proxy 为什么不直接出现在默认路由中

假设浏览器使用：

```text
127.0.0.1:7890
```

实际至少有两段通信：

```text
Browser
→ Loopback 127.0.0.1:7890
→ Local Proxy Process

Local Proxy Process
→ Remote Proxy / Target
→ Internet
```

浏览器没有直接为 Origin IP 建立普通 TCP 连接，所以不能只用“Origin 会匹配哪条路由”解释浏览器流量。路由表仍然参与每一段 IP 通信：第一段匹配 Loopback，第二段由 Proxy Process 针对它的实际远端目标重新查路由。

`route print` 展示 IP Forwarding 决策，不展示“哪个进程按照 HTTP 或 SOCKS 协议委托了另一个进程”。因此应用 Proxy 通常不会像 TUN 那样增加一条代表全部代理策略的系统路由。

## 14. VPN 与 TUN

典型 TUN VPN 创建一个虚拟三层接口。操作系统根据路由把 IP Packet 送入 TUN，VPN Client 读取这些 Packet，再封装进到 VPN Server 的外层连接：

```text
Application
  ↓ TCP/UDP/ICMP
Inner IP Packet
  ↓ route selects TUN
VPN Client
  ↓ encrypt and encapsulate
Outer UDP/TCP/IP Packet
  ↓ physical interface
Internet
  ↓
VPN Server
  ↓ decrypt and decapsulate
Inner IP Packet continues
```

VPN 的实现横跨虚拟接口、路由、用户态或内核加密程序以及外层传输，不能简单理解成“一个纯网络层软件”。它与应用 Proxy 的关键差异是：TUN 接收的是被路由进去的 IP Packet，应用不必主动使用 HTTP/SOCKS API。

## 15. Inner Packet 与 Outer Packet

VPN Tunnel 中同时存在两个寻址层次：

```text
Inner Packet
Src = VPN virtual address
Dst = actual application destination

Outer Packet
Src = current physical network address
Dst = VPN Server address
```

中间 Internet Router 主要根据 Outer Destination 把加密 Tunnel 数据送到 VPN Server。VPN Server 解封装后，才继续处理 Inner Destination。

这就是 Tunnel 的核心：

> 把一种网络数据作为另一种网络通信的 Payload 进行传输。

## 16. VPN 不一定接管所有流量

Full Tunnel 可能通过默认路由或更具体的覆盖路由让大多数目标进入 TUN。Split Tunnel 则只接管指定前缀：

```text
公司网段 → TUN
普通 Internet → Physical Interface
```

还可能存在：

```text
VPN Server 自身的旁路路由
本地 LAN 例外
IPv4 与 IPv6 策略不同
DNS 使用独立规则
Per-app VPN
策略路由或多个 Route Table
```

所以“VPN 一定让所有程序和所有流量经过它”并不准确。必须查看虚拟接口、路由、DNS 和 VPN Policy。

## 17. Wireshark 为什么不是 Proxy

Proxy 位于逻辑通信路径中：

```text
Client → Proxy → Server
```

Wireshark 通常通过 Npcap 等捕获机制在选定接口观察 Packet 的副本：

```text
Application → Network Stack → Interface → Network
                            ↘ capture copy → Wireshark
```

停止 Wireshark 一般不会中断被观察的连接；停止一个必经 Proxy 则通常会中断或阻止相应通信。这是两者最直观的差别。

抓包位置很重要：

```text
Loopback Interface
Physical NIC
TUN Interface
VPN Outer Interface
Remote Mirror Port
```

不同位置可能看到 TLS 之前或之后的协议封装、Inner Packet 或 Outer Tunnel Packet。网卡 Offload 也会让本机抓包显示与实际线上 Frame 不完全相同。

## 18. Wireshark 能看到 HTTPS 的哪些部分

没有会话密钥时，Wireshark仍可解析可见封装：

```text
Ethernet / Wi-Fi Capture Metadata
IP Address
TCP 或 UDP / QUIC
TLS Handshake 中未加密的字段
Encrypted Application Data 的长度与时间
```

它通常不能从 TLS Application Data 直接还原：

```text
HTTP Path
Cookie
Authorization
HTTP Body
聊天正文
```

“能抓到 Packet”与“能解密应用内容”是两个完全不同的能力。

## 19. 使用 TLS Key Log 解密自己的会话

支持的客户端可以把 TLS 会话 Secrets 写入 Key Log File。Wireshark 同时获得：

```text
Captured TLS Traffic
+ Matching Session Secrets
```

就可以解密对应会话并进一步解析 HTTP。

常见环境变量名是：

```text
SSLKEYLOGFILE
```

但是否支持、怎样启用以及是否覆盖 HTTP/3 取决于具体客户端和 TLS 实现。Key Log 包含高度敏感的会话秘密，任何获得它和对应抓包的人都可能读取明文；实验后应安全删除或严格保护，不能在生产环境随意开启。

现代 TLS 常使用具有 Forward Secrecy 的临时密钥协商。仅持有服务器证书的私钥，通常不足以事后解密已抓取的现代 TLS 会话；会话 Secrets 是更可靠的调试方式。

## 20. TLS Interception / MITM Proxy

企业 TLS Inspection 的典型结构是：

```text
Client
  ⇄ TLS Session A
Inspection Proxy
  ⇄ TLS Session B
Origin Server
```

Proxy 在 Session A 中向客户端出示为目标域名动态签发的证书。客户端设备之所以接受，通常是因为组织管理的 Root CA 已被安装进其 Trust Store。Proxy 解密客户端流量、按策略检查，再通过独立的 Session B 连接 Origin。

这不是普通 CONNECT Tunnel：

```text
CONNECT Tunnel
→ TLS 端点通常仍是 Client 与 Origin

TLS Interception
→ Proxy 分别是两段 TLS 的端点，可以看到中间明文
```

证书固定、客户端证书、ECH、非 HTTP 协议和应用策略都可能让 Interception 失败或不适用。部署还涉及隐私、合规、密钥保护和安全边界，不能只把它理解成“装一个证书就能解密所有流量”。

## 21. VPN 能看到什么

本机到 VPN Server 的外层路径通常只能看到：

```text
本机正在与 VPN Server 通信
Outer Packet 的大小、时间和方向
```

VPN Server 解封装后可以看到 Inner IP/Transport Metadata。对于之后仍受端到端 TLS 保护的 HTTPS，它通常看到的是：

```text
目标地址与端口
流量元数据
可见的 TLS / DNS 元数据（取决于协议与路径）
TLS Ciphertext
```

它不会因为“是 VPN Server”就自动获得 Client 与 Website 的 TLS Session Keys。访问明文 HTTP 时，VPN 出口路径上的观察者则可能直接看到内容。

因此 VPN 提供的是一段 Tunnel 的保护和出口转移，不等于对端到端应用协议的自动解密。

## 22. 谁能看到什么

下面描述典型情况，具体仍取决于配置：

| 角色 | 是否参与转发 | 典型可见内容 | 通常看不到 |
| --- | --- | --- | --- |
| Plain HTTP Proxy | 是 | HTTP Method、URL、Header、Body | 不适用：内容本来是明文 |
| CONNECT Tunnel Proxy | 是 | CONNECT Host/Port、连接元数据、TLS 密文 | 加密后的 HTTP 内容 |
| SOCKS Proxy | 是 | 请求的目标地址/端口、转发字节与元数据 | TLS 内的 HTTP 内容 |
| TUN VPN Client | 是 | 被路由进 TUN 的 Inner Packet | 端到端 TLS 明文，除非同时终止 TLS |
| VPN Server | 是 | 解封装后的 Inner IP/Port 与流量元数据 | 端到端 TLS 明文，除非另有解密能力 |
| Wireshark without keys | 否，通常旁路 | 抓包点可见的 Header、握手元数据、密文 | TLS 应用明文 |
| Wireshark with matching secrets | 否，通常旁路 | 对应会话可解密的应用数据 | 未取得 Secrets 的其他会话 |
| TLS Interception Proxy | 是，且终止 TLS | 两段 TLS 中间的应用明文 | 受另一个端到端加密层保护的内容 |

“谁拥有密钥，谁就能看到明文”是有用的直觉，但还需要满足：密钥与该会话匹配、拥有对应密文和算法上下文，并且加密确实在该处终止。应用还可能在 HTTPS Payload 内再次进行端到端加密。

## 23. 为什么 `ping` 失败但浏览器成功

`ping example.com` 的典型路径：

```text
Name Resolution
→ Route to resolved IP
→ ICMP Echo
```

配置 HTTP Proxy 的浏览器可能走：

```text
Browser
→ Loopback Proxy 127.0.0.1:7890
→ Proxy's outbound connection or encrypted tunnel
→ Website
```

两者可能使用不同的：

```text
协议
目标地址
名称解析位置
路由
防火墙策略
远端出口
```

所以它们的结果没有矛盾。浏览器成功只证明浏览器实际选择的路径和协议成功，不证明 Direct ICMP 或所有命令行工具都能使用同一路径。

## 24. 一套分层诊断方法

面对“浏览器成功、curl 失败、ping 失败”，先记录每个工具的实际路径：

### 名称解析

```text
谁解析 Hostname？
本机系统 Resolver、浏览器 DoH、HTTP Proxy 还是 SOCKS Proxy？
```

### 第一 TCP/UDP 对端

```text
Origin IP？
127.0.0.1 Local Proxy？
Remote Proxy？
VPN Server？
```

### 路由与接口

```text
Physical NIC？
Loopback？
TUN？
Split Tunnel 例外？
```

### TLS Endpoint

```text
Origin Server？
TLS Inspection Proxy？
Local Proxy Core 只是 Tunnel，还是终止 TLS？
```

### 应用结果

```text
CONNECT 成功？
TLS Handshake 成功？
Origin HTTP Response 成功？
```

每层分别收集证据，就不会把 `200 Connection Established` 误认为 Website 已返回最终页面。

## 25. 本章核心模型

```text
HTTP Proxy
→ 理解 HTTP；明文 HTTP 可被读取和修改

HTTP CONNECT
→ 先用 HTTP 请求建立 Byte Tunnel，随后通常转发端到端 TLS

SOCKS
→ 应用层的通用目标连接/转发协议，不必理解上层 Payload

TUN VPN
→ 路由把 Inner IP Packet 交给虚拟接口，再加密封装成 Outer Flow

Wireshark
→ 在抓包点观察副本，通常不承担转发

TLS Interception Proxy
→ 终止 Client TLS，再建立到 Origin 的另一段 TLS
```

需要记住：

1. HTTP 是应用协议；TLS 为其提供机密性、完整性和身份认证能力。
2. TLS 位于应用协议与传输之间是概念模型，不应机械当成 TCP/IP 的固定独立层号。
3. HTTP/3 使用 QUIC/UDP，因此 HTTPS 不总是运行在 TCP 上。
4. CONNECT 的 `200 Connection Established` 来自 Proxy，只说明 Tunnel 阶段成功。
5. SOCKS 自身是应用层代理协议，可以转发通用 TCP 流，也可通过 SOCKS5 UDP ASSOCIATE 支持 UDP 场景。
6. TUN VPN 接收路由选入的 IP Packet；Split Tunnel 时不会接管所有目标。
7. Proxy 与 VPN 都参与通信路径；Wireshark 通常只是抓包观察者。
8. 抓到 TLS Packet 不等于能够读取 TLS 明文。
9. Key Log Secret、TLS Endpoint 或合法 Interception 能改变明文可见性。
10. VPN Server 能看到解封装后的流量元数据，但不能自动解密端到端 HTTPS。
11. 名称由本机还是 Proxy 解析，会改变真实路径与排障结论。
12. 分析工具时应问实际第一对端、路由接口、TLS Endpoint 和最终应用响应分别是谁。

## 思考题

1. 为什么不能简单把 SOCKS 称为 TCP/IP 模型中的“传输层协议”？
2. 普通 HTTP Proxy 与 CONNECT Tunnel 分别能看到哪些内容？
3. `HTTP/1.1 200 Connection Established` 为什么不等于目标网站返回 `200 OK`？
4. TLS Handshake 中的会话密钥为什么不是服务器直接明文发送的？
5. HTTPS 为什么仍会暴露 IP、时间、大小等元数据？
6. TUN VPN 中 Inner Destination 与 Outer Destination 分别指向谁？
7. 为什么启用 VPN 后仍可能有部分流量走 Physical Interface？
8. Wireshark 能抓到 TLS Application Data，为什么通常仍看不到 HTTP Body？
9. TLS Key Log 与企业 TLS Interception 有什么根本区别？
10. VPN Server 为什么不能仅凭解封装 IP Packet 就读取端到端 HTTPS 明文？
11. `socks5` 与远端解析形式可能怎样改变 DNS 路径？
12. 浏览器成功而 `ping` 失败时，应该比较哪几个实际路径因素？

下一章将深入学习 **NAT、Tunnel 与 P2P Connectivity**：地址映射与入站过滤如何工作，STUN、TURN 与 ICE 分别解决什么问题，以及 UDP Hole Punching 为什么有时成功、有时必须退回中继。

## 延伸阅读

- [RFC 9110：HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110)
- [RFC 9112：HTTP/1.1](https://www.rfc-editor.org/rfc/rfc9112)
- [RFC 8446：TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446)
- [RFC 9114：HTTP/3](https://www.rfc-editor.org/rfc/rfc9114)
- [RFC 1928：SOCKS Protocol Version 5](https://www.rfc-editor.org/rfc/rfc1928)
- [Wireshark TLS Wiki](https://wiki.wireshark.org/TLS)

---

## 系列导航

- [学习清单与完整目录](/notes/computer-net/00-learning-roadmap/)
- [上一章：Socket 编程模型与连接生命周期](/notes/computer-net/09-socket-lifecycle/)
- [下一章：NAT、Tunnel 与 P2P 穿透](/notes/computer-net/11-nat-tunnels-p2p/)
