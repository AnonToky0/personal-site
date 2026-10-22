---
title: "Stash 与跨分支转移：保存现场，拆开任务"
description: "理解 Stash 的范围与恢复方式，通过完整案例拆分未提交修改，并区分 Cherry-pick 与 Worktree 的用途。"
date: 2026-10-12
tags: ["Git", "Stash", "任务管理"]
---

功能写到一半，突然需要修复另一个问题，当前文件该放在哪里？先判断这些修改是否已经 Commit，再选择临时储藏、复制提交或另开工作目录。

## 1. Stash 与暂存区不同

暂存区准备下一次 Commit；Stash 临时保存尚未完成的工作现场。普通 `git stash push` 会储藏已跟踪文件的暂存和未暂存修改，再回退相应文件状态。

```powershell
git status
git stash push -u -m "WIP: 导入功能"
git stash list
git status
```

| 选项 | 处理范围 |
| --- | --- |
| 默认 | 已跟踪文件的修改 |
| `-u` | 额外包含未跟踪文件，仍不含忽略文件 |
| `-a` | 额外包含未跟踪和忽略文件，并清理相应工作区内容 |
| `-- path` | 只处理指定路径 |
| `-p` | 交互式选择已跟踪修改片段 |

被忽略的构建产物或其他未覆盖路径可能仍在工作区，因此 Stash 后也应检查状态。`-a` 的范围很大，不应习惯性使用。Stash 也不会作为普通分支 Push 的一部分上传。

## 2. 查看、恢复与删除

```powershell
git stash list
git stash show --stat 'stash@{0}'
git stash show -p --include-untracked 'stash@{0}'
git stash apply 'stash@{0}'
git status
git diff
```

`show -p` 默认展示的范围受选项和配置影响；明确加上 `--include-untracked` 才能把储藏中的未跟踪文件也纳入审查。

| 操作 | 恢复内容 | 成功后删除记录 |
| --- | --- | --- |
| `apply` | 是 | 否 |
| `pop` | 是 | 是 |
| `apply --index` | 尝试同时恢复原暂存状态 | 否 |

恢复时可能冲突。Pop 如果因冲突失败，不会自动删除该记录。`--index` 也可能失败，不能把它理解成无条件还原整个环境。

先 Apply，检查和验证后再 Drop，便于保留回退依据：

```powershell
git stash list
git stash drop 'stash@{0}'
```

执行 Drop 前必须核对描述和内容。新建或删除记录会改变 `stash@{n}` 的编号；它不是永久身份。PowerShell 中为这种引用加单引号。

### Stash 列表共享，不会自动匹配当前任务

同一仓库的 Stash 不按分支分开。下面是虚构输出：

```text
stash@{0}: On develop: 补充输入校验
stash@{1}: On feature/search: 调整搜索配置
```

即使当前在 `fix/login-error`，仍能看见这两条记录。不带记录参数的 `git stash pop` 恢复最新的 `stash@{0}`，不会自动寻找“属于登录修复”的那一条。`On develop` 只描述创建时的位置，不限制恢复位置。

### Pop 后重新 Push，为什么描述变了

假设把原来的记录成功 Pop 到 `fix/login-error`，随后执行不带 `-m` 的 `git stash push`，可能出现：

```text
stash@{0}: WIP on fix/login-error: abc1234 fix: 改善登录错误提示
```

这是全新记录的默认描述：WIP 表示 Work In Progress，分支名和提交说明来自创建时的 HEAD。示例哈希是虚构值，它不是被重新储藏的业务提交。

Pop 成功后原记录被删除，新的 Push 根据当时实际未提交状态重新储藏。描述不同不代表已提交代码重新变成未提交修改；但也不能单凭描述认定前后内容完全相同。

如果恢复后编辑过文件、有其他未提交变化，或者前次包含新文件而这次没有使用 `-u`，新记录的范围就可能不同。重新核对 List、Show 和 Status，仍是判断依据。

## 3. 暂停任务，回来继续

假设当前分支是 `feature/import`：

1. 用带描述的 Stash 保存修改，包含需要保存的新文件。
2. 检查工作区，再切换到基线创建修复分支。
3. 完成修复并提交。
4. 切回 `feature/import`，用 `git stash list` 找到原记录。
5. Apply 后检查文件和测试结果，最后删除已确认恢复的记录。

Stash 不要求回到原分支才能恢复；但在不同基线恢复，冲突概率和语义风险可能更高。长期保存进度时，创建有说明的本地 Commit 通常更容易追踪。

## 4. 完整案例：两组文件分别去两个分支

假设 `feature/import` 中只有两组未提交修改，且路径不重叠：

- `FeatureFile.cs` 属于当前任务 A。
- `BugFile.cs` 属于独立修复 B。

先分开储藏：

```powershell
git stash push -u -m "B: 独立修复" -- BugFile.cs
git stash push -u -m "A: 导入功能" -- FeatureFile.cs
git stash list
git status
```

如果两次都实际创建了记录，最新通常是 A，下一条是 B。如果某次没有变化而没有创建记录，编号就不会如预想；必须以 List 为准。

工作区确认干净后，从正确基线创建 Fix。这里假设团队使用 develop，且本地分支已关联上游：

```powershell
git switch develop
git pull --ff-only
git switch -c fix/config-validation
```

查出 B 对应的记录，再 Apply。以下假设核对后 B 仍为 `stash@{1}`：

```powershell
git stash show -p --include-untracked 'stash@{1}'
git stash apply 'stash@{1}'
git diff
git add -- BugFile.cs
git diff --cached
git commit -m "fix: 修复独立配置问题"
```

运行相关验证，确认 B 已提交，再重新 List、核对并 Drop B。随后回到 A：

```powershell
git switch feature/import
git stash list
```

找到描述为 A 的记录，Apply、检查、验证后再删除。不要直接沿用操作开始时记下的编号。

如果工作区还有第三组修改，必须先妥善保存；如果 B 依赖 A 的新接口，也不能只靠文件搬移就得到可独立交付的修复。

## 5. 同一个文件混着两个任务

按路径 Stash 无法拆开同文件中的两类修改，可以考虑：

- `git stash push -p`：逐片段选择要储藏的已跟踪修改。
- `git add -p`：逐片段构成一项独立提交，再处理剩余工作。
- 修改高度耦合时，先保存完整现场，再手动提取并验证。

交互片段是文本边界，不自动等于业务边界。拆完后必须检查两边是否都能独立工作。`-p` 也不能当作自动收纳未跟踪新文件的替代方案。

## 6. 已经提交：Cherry-pick

假设修复 B 已经是一个独立、普通的非合并提交，从正确基线创建目标分支后：

```powershell
git cherry-pick <commit-id>
```

`<commit-id>` 是占位符，应替换后再执行。Cherry-pick 把该提交引入的变化应用到当前分支，通常产生新提交；不会自动删除来源分支里的原提交，也不保证所选提交不依赖之前的功能。

发生冲突后，解决文件、Add，再继续：

```powershell
git cherry-pick --continue
```

放弃尚在进行的操作：

```powershell
git cherry-pick --abort
```

如果来源 Feature 不应再包含 B，还需要另行设计其历史整理或撤销方式；不能以为 Cherry-pick 已经完成“移动”。

## 7. 长期并行：Worktree

Worktree 为同一仓库增加另一个工作目录，适合两个任务需要同时打开的情况：

```powershell
git worktree list
git worktree add ../project-fix -b fix/login-error main
```

示例从本地 main 创建新分支并检出到新目录，前提是目录和分支名未被使用，且 main 是期望基线。Worktree 有独立工作区和 Index，但共享对象数据库及大部分引用，Stash 列表也共享。它不会自动拆分当前未提交修改，同一分支通常也不能同时检出到两个 Worktree。

## 8. 选择工具

| 当前状态 | 主要工具 |
| --- | --- |
| 临时暂停未提交工作 | Stash |
| 不同文件分别属于不同任务 | 按路径 Stash |
| 同文件混合多项修改 | 片段选择或手动提取 |
| 需要复制独立提交 | Cherry-pick |
| 长期同时维护两个任务 | Worktree |

## 思考题

1. 为什么恢复了 Stash 后，原暂存状态可能没有恢复？
2. Drop 一条记录后，为什么不能继续使用旧编号？
3. 复制 Bug 提交到 Fix 后，Feature 的 MR 为什么仍可能包含它？
4. Worktree 为什么不能替你把混杂的修改自动分开？

## 延伸阅读

- [Git Stash 官方文档](https://git-scm.com/docs/git-stash)

## 系列导航

- [学习路线与完整目录](/notes/git/00-learning-roadmap/)
- [上一章：远程分支、上游与同步](/notes/git/04-remotes-and-sync/)
- [下一章：Merge、冲突与协作流程](/notes/git/06-merge-and-collaboration/)
