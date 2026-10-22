---
title: "工作区、暂存区与提交：Git 保存了什么"
description: "建立工作区、Index 和 HEAD 的三层模型，理解 Add、Commit、Push 的区别，以及一次清晰提交的形成过程。"
date: 2026-10-12
tags: ["Git", "基础模型"]
---

写好文件之后执行了 `git add`，这份内容就已经永久保存了吗？再执行 `git commit`，它是不是就到 GitHub 或 GitLab 了？

回答这些问题，需要先分清 Git 管理的几种状态。

## 1. Git 与托管平台

Git 是分布式版本控制工具。一个普通本地仓库拥有自己的对象数据库和历史，在没有网络连接、没有托管平台的情况下，也能提交和查看历史。

GitHub、GitLab 等平台提供远程仓库托管、代码审查、Issues 和 CI/CD。GitLab 的 Merge Request（MR）和 GitHub 的 Pull Request（PR）都是平台提供的协作机制，并不是 `git commit` 的另一种名称。

| 对象 | 含义 |
| --- | --- |
| Repository | 仓库，保存 Git 对象、引用和配置等信息 |
| Working Tree | 工作区，编辑器实际读写的文件 |
| Index / Staging Area | 暂存区，准备写入下一次提交的内容 |
| Commit | 项目快照及其父提交、作者、说明等元数据 |
| Branch | 指向提交的可移动引用 |
| HEAD | 当前检出位置，通常通过当前分支指向提交 |

## 2. 三层状态模型

先以一个已有提交的普通仓库为例：

```text
HEAD 中的快照       暂存区 Index          工作区文件
     A                  A                   A
                        ^                   |
                        +----- git add -----+
```

`git add` 把选中文件当前的内容更新到暂存区。之后继续编辑文件，暂存区不会自动跟着变化。

| 操作 | HEAD | Index | 工作区 |
| --- | --- | --- | --- |
| 初始状态 | A | A | A |
| 修改文件 | A | A | B |
| 第一次 Add | A | B | B |
| 再次修改 | A | B | C |
| 此时 Commit | B | B | C |
| 再次 Add 并 Commit | C | C | C |

因此，一个文件可以同时出现在 Status 的“已暂存”和“未暂存”区域：暂存区与 HEAD 不同，工作区与暂存区也不同。

重复 Add 只是重新更新暂存区，一般不会产生需要解决的合并冲突。冲突通常发生在 Merge、Rebase、Cherry-pick、Stash 恢复等整合修改的操作中。

## 3. 一次本地提交

在仓库根目录，假设正在修改 `lesson.txt`：

```powershell
git status
git diff -- lesson.txt
git add -- lesson.txt
git diff --cached
git commit -m "docs: 补充练习说明"
git status
```

这里的 `--` 用于分隔选项与路径。含空格的路径要加引号，例如 `git add -- 'notes/git lesson.md'`。

Commit 保存的是暂存区快照，不会默认把所有工作区文件都保存进去。新文件需要 Add；未 Add 的后续修改也不会进入这次普通提交。

`git add .` 处理当前目录及其子目录，`git add -A` 默认处理整个工作区中的新增、修改和删除。提交前逐个检查差异，比直接习惯性 Add 全部内容更容易避免夹带临时文件。

## 4. Commit 记录了什么

Commit 关联一个表示项目快照的 Tree，并包含父提交、作者、提交者、时间和提交说明。普通提交通常有一个父提交，合并提交可以有多个，最初的根提交没有父提交。

```powershell
git show --stat HEAD
git rev-parse HEAD
git cat-file -p HEAD
```

短哈希是完整对象 ID 的缩写。它不是递增序号，也不固定只能显示七位。改写提交说明、父提交等信息，也会改变对象 ID。

分支移动到新提交后，旧提交仍作为祖先保留在历史中；不是把旧版本覆盖掉。

## 5. Add、Commit、Push 各自完成哪一步

| 操作 | 改变什么 | 是否需要远程连接 |
| --- | --- | --- |
| `git add` | 更新 Index | 否 |
| `git commit` | 创建本地提交，并推进当前分支 | 否 |
| `git push` | 发送所需对象并请求更新远程引用 | 是 |

Push 不会上传尚未提交的工作区修改，也不等于把功能分支合并到主分支。关于远程和上游，见 [远程分支、上游与同步](/notes/git/04-remotes-and-sync/)。

`nothing to commit, working tree clean` 表示工作区和暂存区没有待提交的普通文件变化，不证明当前提交已经推送。被忽略文件通常也不会显示在普通 Status 中。

## 6. 提交身份与提交说明

在新仓库第一次提交前，可以检查身份配置：

```powershell
git config --get user.name
git config --get user.email
git config --show-origin --get user.email
```

为当前仓库设置身份：

```powershell
git config --local user.name "Your Name"
git config --local user.email "you@example.com"
```

`--global` 设置用户级配置；`--local` 设置当前仓库配置。提交身份不同于远程平台登录凭据，配置邮箱不会自动获得仓库访问权限。

说明可以采用 `type: 简短描述`，这是项目约定，不是 Git 的强制语法。

| 类型 | 示例 |
| --- | --- |
| `feat` | `feat: 支持导入用户配置` |
| `fix` | `fix: 修复导入配置的校验逻辑` |
| `docs` | `docs: 整理 Git 学习笔记` |
| `refactor` | `refactor: 提取配置解析逻辑` |
| `test` | `test: 覆盖空配置输入` |
| `chore` / `build` / `ci` | 维护、构建或自动化配置 |

一次提交应表达一项能说明清楚的变化。文件少不一定适合合并成一项提交，文件多也不一定要按文件拆开。

## 7. 修改最近一次提交说明

最近一次提交尚未共享，只想修改说明时，先检查暂存区：

```powershell
git status
git diff --cached
git commit --amend -m "docs: 完善安装说明"
git log -1 --oneline
```

普通 `--amend` 会把当前 Index 用于替代提交。如果已暂存其他修改，它们也可能被纳入，不能把这条命令理解成只改文字。

明确只改说明、忽略现有暂存内容时，可以使用：

```powershell
git commit --amend --only -m "docs: 完善安装说明"
```

它创建替代当前 HEAD 的提交，而不是原地修改旧对象；说明变化会改变提交 ID。已经共享的提交涉及历史改写，见 [Rebase 与推送检查](/notes/git/07-rebase-and-merge-strategies/)。修改更早的说明通常需要交互式 Rebase，应另行理解后操作。[Git Commit 官方文档](https://git-scm.com/docs/git-commit)

## 实践与完成标准

在练习仓库中，先把 `lesson.txt` 改成 B 并 Add，再改成 C。分别执行 `git diff` 和 `git diff --cached`，预测 Commit 后哪份内容会被保存，再用 `git show HEAD:lesson.txt` 检查。

完成后应能解释：为什么 Commit 后 Status 仍可能显示该文件有修改？

## 思考题

1. Add 之后编辑器自动格式化了文件，需要再 Add 吗？
2. 工作区干净，为什么仍可能有三个提交没有推送？
3. 同一个文件出现在两组修改中，是否说明 Git 出错？
4. `user.email` 与 GitHub / GitLab 的认证分别解决什么问题？

## 系列导航

- [学习路线与完整目录](/notes/git/00-learning-roadmap/)
- [下一章：Diff、文件跟踪与换行符](/notes/git/02-diff-and-files/)
