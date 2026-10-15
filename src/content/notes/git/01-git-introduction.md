---
title: "git 基础"
description: "介绍 git 的基础知识和常用指令"
date: 2026-10-12
tags: [git]
---


## 1. Git 与 GitLab 简介

### 1.1 Git 是什么

Git 是一个**分布式版本控制系统**，主要用于记录文件变化、管理代码版本以及支持多人协作开发。

Git 的核心能力包括：

- **版本管理**：记录每次提交的代码状态，方便查看历史和回溯。
- **分支管理**：创建独立分支，使不同功能的开发互不干扰。
- **变更比较**：查看文件在不同版本之间的差异。
- **代码合并**：将不同分支中的修改整合到一起。
- **远程协作**：通过 Push、Fetch、Pull 等操作与远程仓库交换代码。

Git 不依赖 GitLab 也可以使用。例如，在本地执行 `git init` 后，就可以进行版本管理。

### 1.2 GitLab 是什么

GitLab 是基于 Git 的代码托管与协作开发平台。

Git 负责底层版本控制，GitLab 则提供图形化管理和团队协作功能。

| 功能 | 说明 |
|---|---|
| Repository | 托管 Git 仓库，浏览文件及提交历史 |
| Branches | 查看和管理远程分支 |
| Merge Request（MR） | 请求将一个分支的修改合并到另一个分支 |
| Code Review | 审查代码、发表评论和提出修改意见 |
| Issues | 管理缺陷、需求和开发任务 |
| CI/CD | 自动执行构建、测试、部署等流程 |
| Members | 管理项目成员及访问权限 |

**两者的关系：Git 负责代码版本管理，GitLab 负责代码托管和团队协作。**

### 1.3 常见术语

| 术语 | 说明 |
|---|---|
| Repository（仓库） | 存储项目文件与 Git 历史记录 |
| Working Tree（工作区） | 当前本地目录中的实际文件 |
| Staging Area（暂存区） | 准备纳入下一次提交的修改 |
| Commit（提交） | 一次保存到 Git 历史中的项目快照 |
| Branch（分支） | 指向某个 Commit 的可移动引用 |
| HEAD | 表示当前检出的提交位置，通常指向当前分支 |
| Remote（远程） | 远程仓库的命名配置，例如 `origin` |
| Upstream（上游分支） | 本地分支配置的默认跟踪分支 |
| Merge（合并） | 整合不同分支的开发结果 |
| Merge Request（MR） | GitLab 中请求审查并合并代码的机制 |
| Tag（标签） | 指向特定提交的标记，常用于版本或里程碑 |

---

## 2. Git 基本工作流程

### 2.1 本地修改与提交

日常开发通常涉及三个区域：

**工作区 → 暂存区 → 本地仓库**

1. 在工作区修改代码。
2. 使用 `git add` 将修改加入暂存区。
3. 使用 `git commit` 将暂存区内容保存为一个新的 Commit。
4. 使用 `git push` 将本地 Commit 推送到远程仓库。

注意：

- `git add` 不会创建 Commit。
- `git commit` 默认不会将代码上传到 GitLab。
- `git push` 负责将本地提交上传到远程分支。
- `git push` 不等于合并分支，合并通常通过 MR 完成。

### 2.2 本地与远程分支的关系

以 `mmi-main` 为例：

| 对象 | 示例 | 说明 |
|---|---|---|
| 本地仓库 | `D:\repos\mmi\mmi-main` | 本机的 Git 仓库 |
| 远程仓库别名 | `origin` | 本地配置的远程仓库名称 |
| 远程仓库地址 | `git@10.1.11.134:tech-platform/common/ui/mmi/mmi-main.git` | GitLab 仓库 SSH 地址 |
| 本地分支 | `feature/XXX` | 在本机开发的分支 |
| 远程跟踪分支 | `origin/feature/XXX` | 本地保存的远程分支状态记录 |
| GitLab 上的实际分支 | `feature/XXX` | GitLab 服务器上的分支 |

其中 `origin` 并不是 Git 的固定关键字，而是远程仓库的常用默认名称。

例如：

`git push -u origin feature/XXX`

这条命令的作用是：

1. 查找本地配置的远程仓库 `origin`。
2. 将本地 `feature/XXX` 分支推送到该仓库。
3. 如果远程同名分支不存在，创建该分支。
4. 使用 `-u` 为本地分支设置对应的上游分支。

它不会自动把代码合并到远程主分支如`develop`。

---

## 3. GitLab Merge Request 工作流程

### 3.1 标准开发流程

团队日常开发通常采用 Feature Branch + Merge Request 模式。

**第一步：同步开发基线**

| 操作 | 命令 |
|---|---|
| 检查状态 | `git status` |
| 切换公共分支 | `git switch develop` |
| 获取远程更新 | `git fetch origin` |
| 更新本地分支 | `git pull --ff-only` |

**第二步：创建功能分支**

`git switch -c feature/XXX`

**第三步：开发并提交**

| 操作 | 命令 |
|---|---|
| 检查修改 | `git diff` |
| 暂存修改 | `git add 文件名` |
| 检查暂存内容 | `git diff --cached` |
| 创建提交 | `git commit -m "feat: xxx"` |

**第四步：首次推送到 GitLab**

`git push -u origin feature/XXX`

执行成功后，在 GitLab 对应项目中创建 MR：

- Source branch：`feature/XXX`
- Target branch：`develop`

**第五步：Review 与修改**

如果审查者要求修改代码：

1. 在原分支上继续修改。
2. 创建新的 Commit。
3. 执行 `git push`。
4. 新提交会自动出现在原 MR 中。
5. 在对应评论中回复已修改，等待确认。

**不需要重新创建 MR。**

**第六步：合并后同步**

MR 被合并后，GitLab 上的 `develop` 已经更新，但本地 `develop` 不会自动移动。

执行：

1. `git switch develop`
2. `git fetch origin`
3. `git pull --ff-only`

将本地分支同步到最新状态。

### 3.2 GitLab 评论与审查操作

| 操作 | 用途 | 常见使用场景 |
|---|---|---|
| Add comment now | 立即发布评论 | 回复审查者，说明修改情况 |
| Start a review | 开始批量审查，暂存评论供稍后统一发布 | 审查多个文件 |
| Reply | 回复已有评论 | 解释代码或者反馈修改结果 |
| Resolve thread | 将讨论标记为已解决 | 问题已经处理完成 |
| Reopen thread | 重新打开已解决讨论 | 发现仍有问题 |
| Approve | 表示认可当前 MR | 审查通过 |
| Merge | 将源分支合并进目标分支 | 完成 MR |
| Emoji reaction | 使用表情回应评论 | 简单反馈 |

<!-- 建议采用的协作习惯：

开发者修改并 Push 后，先通过 `Reply` 说明修改内容；由审查者确认并 `Resolve thread`。如果团队另有约定，也可以由开发者自行 Resolve。 -->

### 3.3 Merge Commit

使用 Merge Commit 策略时，GitLab 会保留功能分支的提交历史，并创建合并提交。

需要区分：

- **Commit**：保存某次修改。
- **Push**：将本地提交推送到远程。
- **MR**：提出代码合并请求。
- **Merge**：真正整合分支历史。

一个 MR 可以包含多个 Commit，也可以经过多次 Push。

---

## 5. Commit Message 规范

建议使用简化的 Conventional Commits 风格：

`type: 简短描述`

| 类型 | 适用场景 | 示例 |
|---|---|---|
| `feat` | 新功能 | `feat: 增加实时采集接口` |
| `fix` | 缺陷修复 | `fix: 修复采集状态异常` |
| `refactor` | 不改变外部行为的代码重构 | `refactor: 优化采集模块结构` |
| `docs` | 文档修改 | `docs: 更新部署说明` |
| `test` | 测试代码 | `test: 增加数据解析测试` |
| `chore` | 工程配置及日常维护 | `chore: 添加文件忽略规则` |
| `perf` | 性能优化 | `perf: 减少数据处理开销` |
| `build` | 构建系统或依赖变更 | `build: 更新项目依赖` |
| `ci` | CI/CD 配置变更 | `ci: 添加自动构建任务` |

其中 `type` 后使用英文冒号和空格。

日常团队开发可以采用中文描述，只要保持清晰一致即可。

---

## 6. Visual Studio 中使用 Git

Visual Studio 2022 已经内置了较完整的 Git 工具，大多数日常操作不需要安装插件。

| 功能入口 | 用途 | 对应 Git 操作 |
|---|---|---|
| View → Git Changes | 查看修改、暂存、提交、推送 | `status`、`diff`、`add`、`commit`、`push` |
| View → Git Repository | 查看分支、提交历史及关系图 | `branch`、`log` |
| Diff Viewer | 对比文件修改前后内容 | `git diff` |
| Git Blame | 查看代码行对应的历史提交 | `git blame` |
| 底部状态栏分支入口 | 查看或切换当前分支 | `git switch` |

建议的使用方式：

- 日常开发：使用 **Git Changes** 检查文件修改。
- 查看历史：使用 **Git Repository** 的提交图。
- 提交代码：先查看 Diff，再暂存和提交。
- 理解 Git：同时对照命令行与 Visual Studio 图形界面。

对于需要在编辑器边缘实时标记修改行的场景，可以考虑 Visual Studio 2022 扩展 **Git Diff Margin**。

---

## 7. 常见问题与注意事项

| 问题 | 解释或建议 |
|---|---|
| Push 后代码是否进入 `develop`？ | 否。通常只是更新远程功能分支，仍需通过 MR 合并。 |
| 每次 Push 都要重新创建 MR 吗？ | 不需要。同一源分支的新提交会自动更新到原 MR。 |
| 一个 MR 可以有多个 Commit 吗？ | 可以。Commit 数量与 MR 数量没有一一对应关系。 |
| 为什么本地 `develop` 比 GitLab 落后？ | GitLab 合并 MR 不会自动更新本地分支，需要主动同步。 |
| `origin` 是远程仓库地址吗？ | 不是地址本身，而是远程仓库的本地别名。 |
| `origin/develop` 是服务器上的真实分支吗？ | 不是，它是本地维护的远程跟踪引用。 |
| `git fetch` 会修改当前代码吗？ | 不会自动将远程变更合并到当前工作分支。 |
| `git pull` 与 `git fetch` 一样吗？ | 不一样。Pull 会进一步尝试整合远程更新。 |
| 没有 `git switch` 怎么办？ | 使用 `git checkout`，或将 Git 升级到 2.23 及以上。 |
| `.gitignore` 为什么不生效？ | 可能因为文件已被 Git 跟踪，需要先取消跟踪。 |
| 两个人 Git 版本不同可以协作吗？ | 通常可以，但应注意旧版本支持的命令和仓库功能。 |
| 为什么 `git log --oneline` 只有 7 位哈希？ | 显示的是可用于识别对象的缩短前缀，而不是完整哈希。 |


---

## 8. 后续计划补充的内容

以下内容暂不展开，遇到实际场景后再逐步补充：

- [ ] Git 工作区、暂存区、Commit 的内部原理
- [ ] Git 分支、HEAD 与提交关系图详解
- [ ] Merge、Rebase、Squash 的区别
- [ ] Git 冲突产生的原因与解决流程
- [ ] Reset、Restore、Revert 的区别及风险
- [ ] Cherry-pick 与跨分支提交管理
- [ ] Stash：临时保存未完成的修改
- [ ] Reflog：误操作后的历史恢复
- [ ] Git Tag 与版本发布
- [ ] GitLab 分支保护、成员权限与审批规则
- [ ] 多仓库协作与依赖版本管理
- [ ] GitLab CI/CD 基础
- [ ] 常见 Git 报错与排查案例

---