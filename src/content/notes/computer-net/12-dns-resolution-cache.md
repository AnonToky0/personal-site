---
title: "DNS 解析链、缓存与故障诊断"
description: "理解 DNS 解析角色、记录、缓存、加密传输及代理解析位置，并通过对照实验定位故障。"
date: 2026-10-08
tags: ["计算机网络","DNS","故障诊断"]
---

前面的章节已经多次使用域名：

```text
ping example.com
curl.exe https://example.com
CONNECT example.com:443
SOCKS Proxy 连接 example.com
```

这些操作在建立 IP、TCP、QUIC 或代理连接之前，都必须回答一个问题：

> 谁把这个名称转换成地址，答案来自哪里，最终由谁使用？

DNS 不只是“域名翻译成 IP”。真实系统还包含：

```text
Hosts 与本地名称规则
应用和操作系统缓存
Stub Resolver
Recursive Resolver
Root / TLD / Authoritative Server
A、AAAA、CNAME 等 Record
DNS TTL 与 Negative Cache
UDP、TCP、DoT、DoH、DoQ
CDN 与流量调度
Proxy / VPN 的解析位置
DNSSEC 与加密 DNS 的不同安全目标
```

本章最重要的排障原则是：

> 先确认“哪个组件向哪个 Resolver 查询了什么”，再比较答案。一次 `nslookup` 不是所有应用解析路径的完整代表。

## 1. Name 与 Address 是两层标识

应用通常使用稳定、可读的名称：

```text
www.example.com
```

IP 网络最终需要可路由地址：

```text
192.0.2.10
2001:db8::10
```

DNS 允许服务运营者改变后端地址、返回多个地址、使用 CDN 或故障切换，而客户端继续使用同一个名称。

但是 DNS 的输出不必只有 IP。它是一个分布式命名数据库，可以保存多种 Resource Record。

## 2. DNS 名称是分层的

完整域名可以写成：

```text
www.example.com.
```

最后的点表示 DNS Root。名称从右向左形成层次：

```text
.
└── com.
    └── example.com.
        └── www.example.com.
```

常见术语：

```text
Label
→ `www`、`example`、`com` 中的每一段

FQDN
→ Fully Qualified Domain Name，例如 www.example.com.

Zone
→ 由某组 Authoritative Server 管理的一部分 DNS Namespace

Delegation
→ 父 Zone 把子 Zone 的权威职责委派给一组 Name Server
```

Domain 与 Zone 不能总当作同义词。一个域名树下面还可以继续委派出独立 Zone。

## 3. 客户端通常使用 Stub Resolver

普通应用一般不会自己从 Root 一路查询。典型路径是：

```text
Application
   ↓ system name API, e.g. getaddrinfo-like call
OS / Stub Resolver
   ↓ Recursive Query
Configured Recursive Resolver
```

Stub Resolver 是客户端侧较轻量的解析组件。它通常把“请替我查到最终答案”的请求交给 Recursive Resolver。

Windows 的名称解析还可能结合：

```text
Hosts File
DNS Client Cache
DNS Suffix Search
Name Resolution Policy
Multicast or legacy local-name mechanisms（取决于配置）
Application-specific resolver such as browser DoH
```

具体顺序和启用项取决于操作系统、API、域策略和应用，不能把所有名称查询都简化成“先 Hosts，再 DNS”的绝对固定流程。

## 4. Recursive Resolver 做什么

Recursive Resolver 接受客户端的递归查询，并负责尽力取得最终答案。来源可能是：

```text
自己的 Positive Cache
自己的 Negative Cache
Root → TLD → Authoritative 的查询结果
Forwarder 或上游 Resolver
本地管理策略或内部 Zone
```

因此“递归解析器一定亲自问 Root”并不准确。企业 Resolver 可能把查询转发给上游，公共 Resolver 也可能使用复杂的多层缓存架构。

从客户端视角，它通常希望得到：

```text
最终 RRset
或明确的错误，如 NXDOMAIN / SERVFAIL
```

而不是让客户端自己依次联系 Root、TLD 和权威服务器。

## 5. Root、TLD 与 Authoritative Server

假设 Resolver 没有相关缓存，需要解析：

```text
www.example.com. A
```

高度简化的查询链：

```text
Recursive Resolver
   ↓ ask Root
Root Server
   → referral: ask .com Name Servers

Recursive Resolver
   ↓ ask .com TLD Server
.com Server
   → referral: ask example.com Authoritative Servers

Recursive Resolver
   ↓ ask example.com Authoritative Server
Authoritative Server
   → authoritative answer or another relevant record
```

Root 通常不保存 `www.example.com` 的最终 A Record；它返回与 `.com` Delegation 有关的信息。TLD Server 通常返回 `example.com` 的 NS Delegation。父 Zone 在必要时还会提供 Glue Address，帮助 Resolver 找到位于子域中的 Name Server。

Authoritative Server 对某个 Zone 的数据具有权威性，但不保证每次直接返回 IP：

```text
可能返回 A / AAAA
可能返回 CNAME
可能返回 NXDOMAIN
可能返回 NODATA
可能因为 Delegation 指向更深的 Zone
```

## 6. Recursive Query 与 Iterative Query

这两个词不能混为一谈。

客户端通常向 Resolver 发出 Recursive Query，含义接近：

> 请替我得到最终答案。

Resolver 向 Root、TLD 或 Authoritative Server 查询时，常进行 Iterative Resolution。上游如果没有最终答案，可以返回 Referral：

> 我不负责最终名称，但下一步应去问这些服务器。

因此整体模型是：

```text
Stub → Recursive Resolver
       请求递归服务

Recursive Resolver → DNS Hierarchy
       逐步跟随 Referral
```

## 7. 常见 Resource Record

### A

```text
Name → IPv4 Address
```

### AAAA

```text
Name → IPv6 Address
```

### CNAME

```text
Alias Name → Canonical Name
```

客户端或 Resolver 还要继续取得 Canonical Name 所需的记录。传统 DNS 规则下，一个 Owner Name 若存在 CNAME，通常不能再同时拥有其他普通数据记录。

### NS

```text
Zone / Delegation → Authoritative Name Servers
```

### MX

```text
Mail Domain → Mail Exchanger Hostname + Preference
```

MX 指向主机名称，而不是简单把域名直接映射为邮件服务器 IP；随后还需解析目标主机地址。

### TXT

保存文本形式的数据，常用于域名验证、SPF 等用途。它不是无限大小、无结构的任意配置数据库。

### PTR

用于 Reverse DNS，把特定反向命名空间中的地址表示映射到名称。PTR 结果不能单独证明某台主机的安全身份。

### SOA

Start of Authority，描述 Zone 的主要管理信息，并参与 Negative Caching 等行为。

## 8. 一个名称可以对应多个地址

Resolver 可能返回：

```text
example.com A
→ 192.0.2.10
→ 192.0.2.11

example.com AAAA
→ 2001:db8::10
```

应用和操作系统可以根据 IPv4/IPv6 可用性、地址排序、Happy Eyeballs 一类连接策略和失败历史选择连接对象。

所以：

```text
解析成功
≠ 一定连接第一行地址

ping 显示某个地址
≠ 浏览器必然连接同一地址
```

浏览器还可能重用已有连接、使用代理、使用自己的 DNS Cache 或协商 HTTP/3。

## 9. DNS TTL 与 IP TTL 完全不同

DNS RR 带有 TTL：

```text
example.com. 300 IN A 192.0.2.10
```

表示缓存方在规则允许下可把该 RRset 缓存 300 秒，随后应重新验证或查询。它不是一份跨越所有缓存层的统一倒计时保证：应用、系统和 Resolver 各自可能在不同时间取得并保存答案。

对比：

```text
IPv4 TTL
→ 每经过 Router 递减，防止路由环路

DNS TTL
→ 指示 DNS 数据的缓存寿命
```

TTL 是更新速度与查询成本之间的折中：

```text
较长 TTL
→ 查询负载较低，故障或迁移后的旧答案存留更久

较短 TTL
→ 更快重新查询，但增加 Resolver 和 Authoritative 负载
```

## 10. Negative Caching

DNS 也会缓存“不存在”或“当前没有该类型数据”等 Negative Answer。

```text
NXDOMAIN
→ 该查询名称不存在

NODATA / NoError with empty answer
→ 名称可能存在，但没有所请求的 RR Type

SERVFAIL
→ Resolver 无法完成查询，不等于名称不存在
```

Negative Cache 的期限与 SOA 等规则有关。刚刚创建的名称仍然查不到，可能不只是 Positive Cache 没刷新，也可能有 Negative Cache 尚未过期。

## 11. DNS 为什么使用 UDP，也使用 TCP

传统 DNS 常使用 UDP 53：

```text
Query → Response
```

UDP 开销低，但 DNS 不等于 UDP。DNS 也使用 TCP 53，例如：

```text
Response 被截断后重试
Zone Transfer
Resolver 或策略选择 TCP
```

EDNS(0) 允许协商更大的 UDP Payload Size，但较大 UDP Response 仍可能遭遇 IP Fragmentation、路径 MTU 或防火墙问题。DNS 实现必须正确处理 Truncation、TCP Fallback 和超时，不能假设所有响应都塞进一份小 UDP Datagram。

## 12. DoT、DoH 与 DoQ

### DoT

DNS over TLS 通常使用：

```text
DNS
→ TLS
→ TCP 853
```

### DoH

DNS over HTTPS 把 DNS Message 作为 HTTPS Request/Response 传输：

```text
DNS Message
→ HTTP
→ TLS
→ TCP or QUIC
```

DoH 可以使用 HTTP/2，也可能使用 HTTP/3，因此不应固定写成“DoH 一定是 TCP 443”。

### DoQ

DNS over QUIC 直接使用 QUIC 提供的安全传输能力。

这些协议主要保护客户端与所选 Resolver 之间的 Query/Response 机密性和完整性。Resolver 仍知道查询名称；它还必须继续从缓存或 DNS Hierarchy 获得答案。

## 13. 加密 DNS 与 DNSSEC 解决不同问题

```text
DoT / DoH / DoQ
→ 保护 Client 与 Resolver 之间的 Transport

DNSSEC
→ 让验证方用数字签名验证 DNS Data 的来源真实性和完整性
```

DNSSEC 不负责隐藏查询名称，也不保证目标 Web Server 的应用身份；HTTPS 仍需正确验证 TLS Certificate。加密 DNS 也不自动保证 Resolver 给出的数据在权威链上真实，除非还进行了 DNSSEC Validation 或采用其他可信机制。

## 14. Hosts File

Windows Hosts File 通常位于：

```text
C:\Windows\System32\drivers\etc\hosts
```

示例条目：

```text
192.0.2.50 internal.example.test
```

使用 Windows 系统名称解析 API 的应用通常可能受到 Hosts File 影响。但：

```text
并非所有应用都一定调用相同系统 API
浏览器可能有自己的 Resolver 或 Secure DNS
nslookup 是 DNS 查询工具，不是完整系统名称解析模拟器
```

因此 Hosts 条目能影响某些应用，却不一定改变 `nslookup` 输出；反过来，`nslookup` 正常也不能排除 Hosts 或应用级覆盖。

只读检查：

```powershell
Get-Content -LiteralPath "$env:SystemRoot\System32\drivers\etc\hosts"
```

修改 Hosts 会改变本机名称解析行为，应先确认用途和权限，不应把任意网上 IP 当作永久修复。

## 15. 多层 DNS Cache

缓存可能存在于：

```text
Application / Browser
Operating System DNS Client
Local Proxy or VPN Client
Home Router / Enterprise Forwarder
Recursive Resolver
Intermediate service infrastructure
```

Windows 可查看 DNS Client Cache：

```powershell
Get-DnsClientCache
ipconfig /displaydns
```

清理系统缓存：

```powershell
ipconfig /flushdns
```

清理系统缓存不会自动清掉：

```text
Browser private cache
Proxy core cache
Recursive Resolver cache
CDN control-plane state
```

所以“flush 后仍旧”并不自动证明 Flush 失败。

## 16. 系统配置的 DNS Server 从哪里来

DNS Server Address 可能来自：

```text
DHCP
手动 Network Interface 配置
VPN / TUN 下发
Enterprise Policy
IPv6 Router / DHCPv6-related configuration
Local security or proxy software
```

Windows 查看接口 DNS 配置：

```powershell
Get-DnsClientServerAddress
Get-NetIPConfiguration
```

必须按 Interface 查看。多网卡、VPN 和虚拟接口可能同时配置 Resolver，系统还可能根据 Name Resolution Policy 或接口 Metric 选择路径。

## 17. `nslookup` 到底证明什么

执行：

```powershell
nslookup example.com
```

输出前半部分通常显示它选择查询的 DNS Server；Answer 部分显示该 DNS Server 对这次 DNS Query 返回了什么。

它主要证明：

```text
nslookup 针对某个 Server 发出的 DNS Query
→ 收到了什么 DNS Response
```

它不完整模拟：

```text
Hosts File
所有 Windows DNS Client 策略
应用自己的 Cache
Browser DoH
Proxy 远端解析
应用实际的 IPv4/IPv6 连接选择
```

查询指定 Server：

```powershell
nslookup example.com 1.1.1.1
```

表示工具尝试向 `1.1.1.1` 发 DNS Query。它是有用的对照，但不绝对证明 Packet 未被网络重定向、代理或阻断，也不证明该答案适合你的网络位置。

## 18. `Resolve-DnsName` 与系统应用解析

Windows PowerShell 可以使用：

```powershell
Resolve-DnsName example.com
```

它提供比传统 `nslookup` 更结构化的 DNS Record 输出，也支持指定 Server 和查询类型。例如：

```powershell
Resolve-DnsName example.com -Type A
Resolve-DnsName example.com -Type AAAA
Resolve-DnsName example.com -Server 1.1.1.1
```

但它仍是一种 DNS 诊断工具。要观察应用通过系统 Socket 名称 API 得到什么，可以结合：

```powershell
[System.Net.Dns]::GetHostAddresses('example.com')
```

即便如此，具体浏览器或代理仍可能走自己的解析路径。工具对照的重点是定位差异，而不是寻找一个永远代表所有应用的命令。

## 19. `ping name` 包含两个阶段

```powershell
ping example.com
```

至少包含：

```text
Name Resolution
→ 选择一个 Address
→ Route + ICMP Echo
```

如果输出：

```text
Pinging example.com [192.0.2.10] ...
```

说明某种名称解析已经产生了一个地址，不能再把后面的 ICMP Timeout 称为“完全没有解析成功”。但该地址是否正确、是否是应用会选择的同一个地址，仍要单独验证。

## 20. CDN 与 DNS 流量调度

同一域名可以因下列因素返回不同答案：

```text
Resolver 所在网络或地理位置
EDNS Client Subnet（若使用）
运营商与网络延迟
Edge 节点负载
节点健康状态
产品与成本策略
查询时间
IPv4 / IPv6 能力
```

CDN 目标通常不是简单的“地理上最近”，而是策略判断下较合适的服务节点。

CNAME 常用于把业务名称委托给 CDN 命名体系：

```text
www.example.com
→ CNAME customer.cdn.example
→ A / AAAA for selected edge
```

CDN 还可能使用 Anycast，让多个地点宣告相同 IP，由 BGP 路由把用户送到某个网络入口。所以“同一 IP”也不必表示全球只有一台物理服务器。

## 21. 为什么不应硬编码公共服务 IP

公共服务地址可能因为以下原因变化：

```text
CDN 调度
扩缩容
故障切换
Anycast 或 Network Policy
TLS Virtual Hosting
服务迁移
```

即使某个 IP 当前可以建立 TCP 443，也不能保证：

```text
TLS Certificate 与目标 Hostname 匹配
HTTP Host / SNI 被正确发送
该地址长期属于相同服务
它是你当前网络最合适的地址
```

诊断中临时固定 Address 可以帮助对比，但不应作为常规永久修复。

## 22. Proxy、VPN 与 DNS 路径

### Direct Application

```text
Application
→ System Resolver
→ Configured DNS Server
→ connect resolved Address
```

### HTTP CONNECT Proxy

客户端可以把 Hostname 放在 CONNECT Authority 中：

```http
CONNECT example.com:443 HTTP/1.1
```

Proxy 可能在远端解析该名称，客户端未必先取得 Origin IP。

### SOCKS

工具可能选择：

```text
Local Resolution
→ 先在客户端解析，再把 IP 交给 SOCKS

Proxy Resolution
→ 把 Domain Name 交给 SOCKS Server
```

例如 curl 的 `socks5://` 与 `socks5h://` 常用来区分这两种意图。

### VPN / TUN

VPN 可以下发 Resolver、路由 DNS Server、使用本地 DNS Proxy 或拦截 DNS Query；也可能只路由业务流量而保留原 DNS 路径。Full Tunnel 不自动等于 DNS 配置一定正确，Split Tunnel 还可能按域名或接口使用不同 Resolver。

### Browser Secure DNS

浏览器可能绕过系统传统 DNS Server，直接向配置的 DoH Resolver 查询。因此：

```text
Browser 可访问
nslookup 结果异常
```

完全可能同时发生。

## 23. DNS Leak 应如何准确理解

DNS Leak 不是一个脱离目标的绝对标签。它通常表示：

> 按照用户或 VPN 的预期，DNS Query 应通过受保护路径或指定 Resolver，但实际从另一接口发送给了不期望的 Resolver。

例如：

```text
HTTPS Traffic → VPN
Traditional DNS → ISP Resolver outside VPN
```

ISP 可能观察查询名称。若浏览器使用 VPN 外的 DoH，ISP 通常看到与 DoH Provider 的加密连接而看不到具体 Query，但 DoH Provider 仍能看到查询；这仍可能违反“所有解析都应走 VPN Resolver”的隐私或策略预期。

所以检查 DNS Leak 时必须先定义：

```text
期望使用哪个 Resolver？
Query 应从哪个 Interface 出去？
谁允许看到查询名称？
IPv4 与 IPv6 是否一致？
```

## 24. DNS 污染、劫持和配置错误

这些词在不同语境中边界并不完全统一，排障时应优先描述可观察事实：

```text
查询发给了哪个地址？
响应从哪里收到？
Answer、Authority、Additional 中有什么？
是否与受信任的权威链或其他路径不同？
系统、应用最终使用了哪个答案？
```

异常答案可能来自：

```text
Hosts 或本机恶意软件
错误的系统 / VPN / Proxy 配置
Home Router 或 Enterprise DNS Policy
Captive Portal
Resolver 配置错误或过期数据
中间网络对 UDP/TCP 53 的重定向或伪造
恶意 Cache Poisoning
合法的 Split-Horizon / Internal DNS
CDN、GeoDNS 或安全过滤策略
```

不同答案不自动等于攻击。企业内网对内部名称返回私网地址、CDN 对不同 Resolver 返回不同 Edge，都是正常行为。

## 25. 为什么指定公共 Resolver 不是绝对真相

对比：

```powershell
Resolve-DnsName example.com
Resolve-DnsName example.com -Server 1.1.1.1
```

可以判断不同查询路径是否返回不同结果。但解释时要注意：

```text
传统 53 端口可能被阻断或重定向
公共 Resolver 可能根据自身位置返回不同 CDN 答案
本地 Resolver 可能有合法 Internal Zone
Cache 所处时间点不同
一个 Answer 中多个地址的顺序可以不同
```

更强的诊断通常需要多份证据：

```text
系统 API 结果
指定 Resolver 的 A / AAAA / CNAME 查询
Authoritative 数据或可信递归结果
Packet Capture 中实际请求与响应
最终 TCP/TLS 连接地址与证书
```

## 26. “奇怪 IP”应该怎样验证

不要只凭视觉或记忆断言某个地址“一定不属于该网站”。IP Ownership、CDN 和 Anycast 都可能变化。

可以按以下步骤验证：

### 确认名称解析路径

```powershell
Get-DnsClientServerAddress
Resolve-DnsName www.example.com -Type A
Resolve-DnsName www.example.com -Type AAAA
```

### 对照其他 Resolver

```powershell
Resolve-DnsName www.example.com -Server 1.1.1.1
```

### 查看 CNAME Chain 和完整 Record

```powershell
Resolve-DnsName www.example.com
```

### 观察系统 API 与应用路径

```powershell
[System.Net.Dns]::GetHostAddresses('www.example.com')
curl.exe -v https://www.example.com/
```

### 核对 TLS Identity

即使连接到了某个 IP，TLS Client 仍应验证证书是否匹配原始 Hostname。证书错误是重要信号，但不能单凭它准确定位异常发生在哪一层。

### 必要时抓包

Wireshark Filter：

```text
dns
```

观察：

```text
Query Name / Type
Destination Resolver
Transaction ID
Response Source
Response Code
Answers / CNAME / TTL
是否重试 TCP
```

若应用使用 DoH，物理接口上通常只看到 TLS/QUIC，传统 `dns` Filter 未必能显示内部 Query，除非拥有匹配的解密 Secrets 或在解析组件的适当位置观测。

## 27. Windows DNS 排障阶梯

### 第一步：确认应用是否真的报告名称错误

区分：

```text
Name Resolution Failure
Connection Timeout / Refused
TLS Certificate Error
HTTP Error
Proxy Error
```

### 第二步：检查接口与 DNS 配置

```powershell
Get-NetIPConfiguration
Get-DnsClientServerAddress
```

### 第三步：检查 Hosts 与本机 Cache

```powershell
Get-Content -LiteralPath "$env:SystemRoot\System32\drivers\etc\hosts"
Get-DnsClientCache
```

### 第四步：比较查询工具与系统 API

```powershell
Resolve-DnsName example.com -Type A
Resolve-DnsName example.com -Type AAAA
[System.Net.Dns]::GetHostAddresses('example.com')
```

### 第五步：对照指定 Resolver

```powershell
Resolve-DnsName example.com -Server 1.1.1.1
```

### 第六步：确认真实连接路径

```powershell
Test-NetConnection example.com -Port 443
curl.exe -v https://example.com/
```

确认是否使用 Proxy、连接哪个 IP、TLS Handshake 和 HTTP 分别在哪里失败。

### 第七步：谨慎刷新 Cache

```powershell
ipconfig /flushdns
```

刷新会改变本机缓存状态，应先记录原答案和 TTL。它只应作为有依据的验证步骤，而不是所有网络问题的第一反应。

### 第八步：抓取实际路径

根据应用使用传统 DNS、DoH 还是 Proxy Remote Resolution，选择正确接口和过滤器。避免因为在错误接口抓不到 UDP 53 就断言“没有解析”。

## 28. 重新解释最初的现象

假设观察到：

```text
ping 8.8.8.8              成功
系统 DNS 返回可疑地址       异常
浏览器通过 127.0.0.1 Proxy 成功
```

可以分别解释：

```text
ping 8.8.8.8
→ Direct Route + ICMP Path 可用

传统 DNS 工具
→ Configured Resolver 或其查询路径返回了某个答案

Browser through Local Proxy
→ Browser 连接 Local Proxy，Origin 可能由 Proxy 远端解析并访问
```

这些测试没有走同一条名称解析和数据路径，所以结果可以同时成立。

更严谨的结论不是立刻说“DNS 一定被污染”，而是：

> 直接 IP 路径至少对该 ICMP 目标可用；传统 DNS 路径得到值得进一步核验的答案；浏览器的代理路径独立可用。下一步应比较 Resolver、系统 API、代理解析方式和最终 TLS 连接证据。

## 29. 本章核心模型

```text
Application
   ↓ system or application-specific resolver
Stub Resolver / Local Policy
   ↓
Recursive Resolver
   ├── Cache Hit → return RRset
   └── Cache Miss
       → Root Referral
       → TLD Referral
       → Authoritative Answer
   ↓
Application receives one or more addresses
   ↓
Address selection + Route + Transport + TLS / App Protocol
```

需要记住：

1. Stub Resolver 通常把递归工作委托给 Recursive Resolver。
2. Recursive Resolver 可以查 Cache、跟随 Referral 或转发上游，不一定每次亲自问 Root。
3. Authoritative Server 对 Zone 有权威性，但答案可能是 CNAME、NXDOMAIN 或 Delegation，不一定直接是 IP。
4. DNS TTL 控制缓存寿命，与 IPv4 TTL 完全不同。
5. NXDOMAIN、NODATA 与 SERVFAIL 表示不同状态；Negative Answer 也可能被缓存。
6. DNS 可以使用 UDP、TCP、DoT、DoH 或 DoQ，不能简化为 UDP 53。
7. 加密 DNS 保护 Client 到 Resolver 的 Transport；DNSSEC 验证 DNS Data，二者目标不同。
8. Hosts、系统 Cache、浏览器 DoH、Proxy 和 VPN 会让不同应用走不同解析路径。
9. `nslookup` 主要测试一次 DNS Query，不是完整的系统应用解析模拟器。
10. 同一域名返回不同 IP 可能源自 CDN、Anycast、缓存、Split DNS 或异常，不能只凭不同就断定攻击。
11. DNS 解析成功只提供候选地址，不证明 TCP、QUIC、TLS 或 HTTP 成功。
12. Proxy Remote Resolution 与 Local Resolution 会改变谁看到 Query 及最终连接地址。
13. DNS Leak 必须相对预期 Resolver、Interface 和隐私边界来定义。
14. 排障要比较真实解析路径、实际连接地址和 TLS Identity，而不是只运行一条命令。

## 思考题

1. Stub Resolver、Recursive Resolver 与 Authoritative Server 分别负责什么？
2. Recursive Query 与 Resolver 跟随 Referral 的 Iterative Resolution 有什么区别？
3. Root 和 TLD Server 为什么通常不直接返回最终网站 IP？
4. A、AAAA、CNAME、NS、MX、SOA 分别表达什么？
5. DNS TTL 与 IP TTL 为什么只是同名而不是同一机制？
6. NXDOMAIN、NODATA 与 SERVFAIL 有什么区别？
7. 为什么 `nslookup` 正常不能证明浏览器使用相同答案？
8. 为什么清空 Windows DNS Cache 后，浏览器仍可能使用旧答案？
9. DoH 与 DNSSEC 分别解决什么安全问题？
10. 同一域名在上海和纽约得到不同地址，为什么不一定是 DNS 污染？
11. `socks5h` 一类远端解析为什么会改变排障路径？
12. 开启 VPN 后，为什么仍需单独验证 DNS Resolver 和 Interface？
13. 收到一个“看起来奇怪”的 IP 时，应收集哪些证据再下结论？
14. 为什么 DNS Answer 正确仍不能证明网站可以访问？

下一章将进入 **Wireshark 综合实战**：在正确的抓包接口上观察 ARP、DNS、ICMP、TCP、TLS、Proxy 和 VPN 封装，把前面所有分层模型对应到真实 Packet。

## 延伸阅读

- [RFC 1034：Domain Names — Concepts and Facilities](https://www.rfc-editor.org/rfc/rfc1034)
- [RFC 1035：Domain Names — Implementation and Specification](https://www.rfc-editor.org/rfc/rfc1035)
- [RFC 2308：Negative Caching of DNS Queries](https://www.rfc-editor.org/rfc/rfc2308)
- [RFC 6891：Extension Mechanisms for DNS（EDNS(0)）](https://www.rfc-editor.org/rfc/rfc6891)
- [RFC 7858：DNS over TLS](https://www.rfc-editor.org/rfc/rfc7858)
- [RFC 8484：DNS Queries over HTTPS](https://www.rfc-editor.org/rfc/rfc8484)
- [RFC 9250：DNS over Dedicated QUIC Connections](https://www.rfc-editor.org/rfc/rfc9250)
- [Resolve-DnsName（Microsoft Learn）](https://learn.microsoft.com/en-us/powershell/module/dnsclient/resolve-dnsname)

## 综合诊断补充

DNS 有答案不等于地址正确，独立 TCP 测试也不证明 curl 使用相同路径。证书名称不匹配的完整案例与对照步骤见 [综合网络实验与 TLS 身份验证排障](/notes/computer-net/18-network-labs-tls-identity/)。

---

## 系列导航

- [学习清单与完整目录](/notes/computer-net/00-learning-roadmap/)
- [上一章：NAT、Tunnel 与 P2P 穿透](/notes/computer-net/11-nat-tunnels-p2p/)
- [下一章：Wireshark 综合实战：从 Packet 还原故障层次](/notes/computer-net/13-wireshark-practice/)
