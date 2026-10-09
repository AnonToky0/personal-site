---
title: "SSH Tunnel、本地转发、远程转发与动态代理"
description: "对比 SSH 本地、远程与动态转发的监听端、连接端、DNS 位置、加密范围与故障排查。"
date: 2026-10-08
tags: ["计算机网络","SSH","隧道"]
---

SSH 登录连接可以复用为加密通道，承载其他 TCP 字节流。结合 [Proxy 与抓包边界](/notes/computer-net/10-http-tls-proxy-vpn/) 和 [NAT 与 Tunnel](/notes/computer-net/11-nat-tunnels-p2p/)，本章回答：谁监听、谁连接目标、谁解析域名、哪一段被加密。

## 1. 对话核验与范围

对话对 `-L`、`-R`、`-D` 的方向理解正确，三段 TCP 模型也适用于普通 TCP 端口转发。需要补充：

- Local/Remote 相对于执行 SSH 命令的 Client 和登录的 Server，不是相对于业务请求的发送者。
- `-R` 默认远端回环监听，远端其他机器不能直接访问这个端口。
- SSH 加密覆盖 Client 到 Server；Server 到最终目标是否加密取决于上层协议。
- OpenSSH `-D` 支持 SOCKS4/5 的 TCP 代理用途，不等于支持 SOCKS5 UDP ASSOCIATE，也不是全机 VPN。
- curl 的 `socks5://` 对目标域名采用本地解析，`socks5h://` 请求代理解析；这个语法是工具约定，不是所有应用通用的开关。

本章讨论常用 TCP 转发，不展开 Unix Socket、`-w` 或远程动态转发等其他模式。参数语义见 [OpenSSH ssh 手册](https://man.openbsd.org/ssh)。

## 2. 三种模式统一比较

| 模式 | 谁监听 | 谁建立最终目标连接 | 目标如何确定 |
|---|---|---|---|
| `-L` | SSH Client | SSH Server | 命令中固定目标 |
| `-R` | SSH Server | SSH Client | 命令中固定目标 |
| `-D` | SSH Client 上的 SOCKS 入口 | SSH Server | 每条 SOCKS 请求指定 |

监听方向不代表数据单向：连接建立后，请求和回复都可以经通道双向传输。

## 3. Local Forward：我访问远端内网

假设 SSH Server 可访问数据库 `10.0.0.50:5432`，而本地电脑不能直接访问它：

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:15432:10.0.0.50:5432 user@jump-server
```

```text
本地数据库客户端
  → 本地 127.0.0.1:15432（SSH Client 监听）
  → SSH 加密连接 → jump-server
  → 10.0.0.50:5432
```

数据库客户端改连 `127.0.0.1:15432`。若目标写成域名，解析和目标连接在 SSH Server 一侧发生。因此 `-L ...:localhost:5432` 中的目标 localhost 指 SSH Server 自己，不能理解为本地电脑。

`jump-server` 是示例占位符，需替换成实际可登录主机。原对话的 `203.0.113.10` 属于文档示例地址，不能拿来当真实公网服务器。

## 4. 一条业务连接对应哪些 TCP 段

普通 `-L` TCP 转发可拆成：

```text
TCP #1：应用 → 本地 SSH Client 的监听端口
TCP #2：SSH Client → SSH Server（加密 SSH 传输）
TCP #3：SSH Server → 最终服务
```

它转发字节流，不把第一段的 TCP Header 原样搬到第三段。各段有自己的序列号、ACK、窗口和故障边界。第一段出现 TCP ACK，不能证明最终服务已收到或处理数据。

一个 SSH 传输连接可以复用多个逻辑 Channel。通常每新增一条转发连接，会新增两端的 TCP 连接和一个 SSH Channel，中间 SSH TCP 可以共享，不能理解为每条业务连接都再建一条 SSH TCP。

## 5. Remote Forward：远端访问本地服务

本地服务监听 `127.0.0.1:5000`，本地电脑主动登录远端：

```powershell
ssh -N -o ExitOnForwardFailure=yes -R 127.0.0.1:9000:127.0.0.1:5000 user@server
```

```text
server 上的程序 → server 的 127.0.0.1:9000
  → SSH 通道 → 本地 SSH Client
  → 本地 127.0.0.1:5000
```

`-R` 的目标地址由 SSH Client 一侧访问；目标不一定是 Client 本身，也可以是 Client 可达的另一台机器。写域名时也在 Client 一侧解析。

默认远端 TCP 监听只绑定回环地址。要让远端其他主机访问，需匹配远端绑定地址、服务端 `GatewayPorts`、转发权限和防火墙等条件。服务端 `GatewayPorts yes` 会强制通配监听，`clientspecified` 允许 Client 选择地址；必须检查实际监听结果，不能只看命令字符串。[sshd_config 手册](https://man.openbsd.org/sshd_config#GatewayPorts)

本地在 NAT 后仍可工作，是因为先建立了出站 SSH 连接，再把远端接受的字节流通过它送回本地。它是经 Server 中继的反向隧道，不是直接 P2P 打洞，也不自动开放家庭路由器的入站端口。

## 6. Dynamic Forward：本地 SOCKS 入口

```powershell
ssh -N -o ExitOnForwardFailure=yes -D 127.0.0.1:1080 user@server
```

另一个终端：

```powershell
curl.exe --noproxy "" --proxy socks5h://127.0.0.1:1080 https://example.com
```

```text
curl → 本地 SOCKS 入口
  → SSH Client 把流放入 SSH Channel
  → SSH Server → SOCKS 请求指定的目标
```

`-L` 把目标写在命令里；`-D` 让应用逐连接提供目标。应用必须使用 SOCKS，不能把 SOCKS 端口当成 HTTP Proxy 使用，也不能指望 `ping` 自动走它。OpenSSH 这类动态转发不会自动承载 UDP/QUIC；具体应用是否回退到 TCP 还取决于应用配置。

## 7. curl 的 socks5 与 socks5h

| curl 代理形式 | 目标域名解析 | 交给 SOCKS 的目标 |
|---|---|---|
| `socks5://127.0.0.1:1080` | curl 本地解析 | 目标 IP |
| `socks5h://127.0.0.1:1080` | 请求代理解析；本例最终由 SSH Server 侧解析 | 目标域名 |

`socks5h` 中的 h 是 curl 对远端 Hostname Resolution 的约定。它减少此请求的目标 DNS 在本地解析的情况，但不保证整台电脑没有 DNS Leak：其他应用、浏览器预解析、SSH Server 名称解析仍可能走本地。远端 DNS 也不因 SSH 隧道自动变为加密 DNS。[curl 代理与解析文档](https://curl.se/docs/manpage.html#--socks5-hostname)

可比较两种形式的 `curl.exe -v` 输出，并结合本地与远端抓包。缓存、Hosts、加密 DNS 会影响能否看到 DNS 报文，不能仅凭“没抓到 UDP 53”断言没有本地解析。

## 8. 加密和身份验证边界

```text
应用 ←TCP→ SSH Client ═加密 SSH═ SSH Server ←TCP→ 最终目标
```

SSH 保护中间一段。明文 HTTP 或未启用 TLS 的数据库协议从 Server 到目标时仍可能是明文；HTTPS 可继续在应用与最终目标间维持 TLS。SSH Host Key 用于验证跳板机，最终服务身份仍应按它自己的协议验证。

SSH 转发也不自动解决 HTTP Host、虚拟主机或 TLS SNI/证书名称问题。把浏览器 URL 简单改成 `https://127.0.0.1:端口`，可能导致证书名称不匹配；应保留真实服务名称并正确配置连接路径。

## 9. 启动成功不等于目标连接成功

`-N` 表示不执行远程命令，适合只维持转发。`ExitOnForwardFailure=yes` 用于发现转发建立失败，例如监听端口占用或远端拒绝监听；不保证后续每个最终目标都可连接。

| 现象 | 检查方向 |
|---|---|
| SSH 登录失败 | SSH Server 可达性、账号认证、Host Key |
| 本地无法监听 | 地址、端口占用与客户端配置 |
| 远端拒绝转发 | `AllowTcpForwarding`、`DisableForwarding`、`PermitOpen`、`PermitListen` 及密钥限制 |
| `channel ... open failed` | 目标侧 DNS、路由、防火墙和服务监听 |
| `-R` 远端本机能访问，其他机器不能 | 回环监听、GatewayPorts、远端防火墙 |
| SOCKS 能连接但请求失败 | 目标可达性、DNS、TLS 与应用协议 |

本地 Windows 观察示例：

```powershell
Get-NetTCPConnection -State Listen -LocalPort 1080
Get-NetTCPConnection -State Listen -LocalPort 15432
```

确认监听仅证明入口存在。`Test-NetConnection` 也只验证它所连接的 TCP 端点；最终成功应通过数据库查询或 HTTP 响应等业务结果确认。需要日志时给 SSH 加 `-v` 或 `-vv`。关闭维持隧道的 SSH 进程后，转发入口和通道通常随之结束。

## 9.1 省略的是监听地址，不是目标主机

常用固定目标 TCP 转发语法为：

```text
-L [bind_address:]local_port:target_host:target_port
-R [bind_address:]remote_port:target_host:target_port
```

方括号表示可选部分，不是命令中要输入的字符。省略 `bind_address` 后采用默认监听配置；与端口是否知名无关。`-L` 通常默认回环监听，但客户端 `GatewayPorts` 等配置可改变它；`-R` 的监听范围还受服务端 `GatewayPorts` 管理。回环可能包含 `127.0.0.1` 和 `::1`，不能把所有默认情形写死为一个 IPv4 地址。[ssh 手册](https://man.openbsd.org/ssh)、[客户端 GatewayPorts](https://man.openbsd.org/ssh_config#GatewayPorts)

```powershell
ssh -N -L 127.0.0.1:12345:10.0.0.50:80 user@server
ssh -N -R 127.0.0.1:9000:127.0.0.1:5000 user@server
```

第一个命令监听本地 `127.0.0.1:12345`，远端连接 `10.0.0.50:80`；第二个命令请求远端回环监听 `9000`，本地连接 `127.0.0.1:5000`。监听地址和目标地址要分开读。

## 9.2 为什么监听 443 不会接管所有 HTTPS

TCP 端点至少要结合地址和端口理解，完整连接按双方 IP/Port 区分；讨论不同传输协议时，还必须区分 TCP 和 UDP。

```text
server 上的程序
  ├─ connect(127.0.0.1:443) → 该回环监听 Socket → SSH 转发
  └─ connect(目标网站IP:443) → 目标网站；不因同为 443 而进入 SSH
```

`-R 443:127.0.0.1:5000` 请求的是远端监听 Socket，不是按“所有目的端口为 443 的包”创建拦截规则。它也不接管 UDP 443 的 HTTP/3。远端 443 若已被占用，或系统要求低端口绑定权限，转发还可能建立失败。

443 是 HTTPS 的常用标准端口；8080 在 IANA 登记为 `http-alt`，也常用于开发服务。但登记与惯例不强制进程使用某种协议，SSH 转发只按配置转发字节，不把 HTTP 自动转换成 HTTPS。[IANA 端口注册表](https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.xhtml)

例如把本地 6666 转发到目标 443，TLS 可从本地 6666 进入；反过来把监听 443 转发到明文 HTTP 服务，也不会自动获得 TLS。协议由连接两端的程序实现。

## 9.3 回环、指定地址和通配监听

| 绑定地址 | 监听范围 |
|---|---|
| `127.0.0.1:9000` | 本机 IPv4 回环 |
| `192.168.1.10:9000` | 本机对应 IPv4 地址 |
| `0.0.0.0:9000` | 本机所有 IPv4 地址的通配监听 |
| `[::1]:9000` | 本机 IPv6 回环 |
| `[::]:9000` | IPv6 通配监听；是否兼容 IPv4 取决于系统与 Socket 配置 |

`0.0.0.0` 是绑定时的通配地址，不是给其他机器连接的实际目标地址。其他机器应连接 Server 的某个真实可达地址。即使监听所有接口，远端去其他网站的出站连接也不会被接管。

```powershell
ssh -N -R 0.0.0.0:9000:127.0.0.1:5000 user@server
```

该命令只是请求远端 IPv4 通配监听；能否成功及实际绑定结果仍要核对服务端策略。Server 公网地址可达、防火墙允许、若有 NAT 则入站映射正确时，外部客户端才可能访问它。

理解要点：SSH Port Forwarding 创建监听 Socket，并转发连接该 Socket 的字节流；全流量接管需要另行配置路由、透明重定向等机制，普通 `-L/-R` 本身不建立这类规则。
## 10. 可复现实验与检查题

准备自有 SSH Server 和可访问的测试服务，替换示例用户名与主机名，再分别实验：

1. `-L`：本地连转发端口，确认 Server 建立到目标的连接。
2. `-R`：在 Server 本机连回环端口，确认请求抵达本地服务。
3. `-D`：使用 curl 的两种 SOCKS 形式，对照目标 DNS 解析位置。
4. 停止目标服务，观察“SSH 仍保持连接，目标访问失败”；再关闭 SSH，观察入口变化。

以上是实验步骤，未使用你的设备或账号执行。

答案要点：`-L` 本地监听、远端连接目标；`-R` 远端监听、本地连接目标；`-D` 的目的地逐请求决定；`socks5h` 将此目标域名交给代理解析；反向访问依靠已建立的出站 SSH 通道和 Server 中继。

下一章：[综合网络实验与 TLS 身份验证排障](/notes/computer-net/18-network-labs-tls-identity/)，按实际路径串联 DNS、路由、TCP、TLS、Proxy 和 Tunnel。

---

## 系列导航

- [学习清单与完整目录](/notes/computer-net/00-learning-roadmap/)
- [上一章：TCP 流量控制、拥塞控制与背压](/notes/computer-net/16-tcp-flow-congestion-backpressure/)
- [下一章：综合网络实验与 TLS 身份验证排障](/notes/computer-net/18-network-labs-tls-identity/)
