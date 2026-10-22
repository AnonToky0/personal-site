---
title: "Rebase、快进与合并策略：理解历史重写和推送检查"
description: "通过提交图区分 Rebase、Fast-forward、普通 Push 与 Force-with-lease，理解 GitLab MR 合并方式及两类分支落后问题。"
date: 2026-10-22
tags: ["Git", "Rebase", "GitLab"]
---

Push 被拒绝，与 MR 提示不能快进，是同一个问题吗？两者都与提交的祖先关系有关，但比较的是不同分支。

本章示例统一使用 `develop` 作为目标基线、`feature/search` 作为功能分支。项目使用 main 时，替换对应基线即可。示意图中的字母是提交代号，不是可直接执行的哈希。

## 1. Fast-forward 判断的是祖先关系

```text
A---B---C---D
        ^   ^
    develop feature/search
```

C 是 D 的祖先。在 develop 上合并 Feature，可以只把 develop 引用从 C 移到 D，不需要产生新提交。

如果两边分叉：

```text
A---B---C  develop
     \
      D---E  feature/search
```

C 不是 E 的祖先，develop 无法直接快进到 E。这个判断只看历史结构，不看修改是否冲突；即使双方改的是完全不同的文件，也可能不能快进。

| 选项 | 在当前分支整合指定提交时的行为 |
| --- | --- |
| `--ff` | 可以快进就快进，否则通常创建合并提交 |
| `--ff-only` | 只允许快进或已经包含，分叉时拒绝 |
| `--no-ff` | 即使可以快进，也创建合并提交；已经包含时通常无需新提交 |

例如在 develop 上执行 `git merge --no-ff feature/search`，可以记录一次明确的整合节点。执行方向与 [Merge 章节](/notes/git/06-merge-and-collaboration/) 相同：移动的是当前分支。

**FF-only 不等于所有历史必然线性。** 它只要求目标当前提交是源提交的祖先。如果 Feature 已经包含 Merge Commit，这些提交也可能随快进一起进入目标历史。若团队要求整段线性历史，还需要配合源分支约定或其他检查。

## 2. Rebase 把修改重放到新基础

仍以上面的分叉为例，在 Feature 上执行：

```powershell
git switch feature/search
git status
git fetch origin
git rebase origin/develop
```

先确认工作区干净、远程基线正确，并且允许整理这段历史。对于这条简单的非合并提交链，可理解为把 D、E 的变化依次应用到 C 后面：

```text
A---B---C---D'---E'  feature/search
        ^
   origin/develop
```

D' 的父提交从 B 变成 C，因此它是新的提交对象；E' 的父提交也随之改变。Rebase 不是把旧对象的父指针原地改掉，而是创建或复用适当对象并更新本地分支引用。

实际 Rebase 还会涉及补丁等价、空提交及合并提交处理：并不保证每个旧提交都恰好对应一个新提交。默认 Rebase 也不会照原样保留所有合并结构。

最终快照包含新基线 C 的内容，因此不能说 Rebase 前后文件一定完全相同。冲突解决也会影响结果，完成后需要重新验证。

## 3. Rebase 冲突如何继续

Rebase 可能在重放每个提交时停下，而普通 Merge 通常围绕一次整体整合处理冲突。

```powershell
git status
git diff
```

理解本次正在应用的修改，把文件编辑为正确结果，再执行：

```powershell
git add -- src/SearchService.cs
git rebase --continue
```

后续提交还可能再次冲突。放弃尚在进行的 Rebase：

```powershell
git rebase --abort
```

不要把 `git rebase --skip` 当作普通继续：它会跳过当前补丁，可能丢掉需要的变化。Rebase 中 ours / theirs 的含义也容易与“我原来的功能分支 / 对方分支”的直觉相反，应根据实际内容判断。

完成后检查历史、Diff，运行相关测试。Rebase 只更新本地历史，不自动更新服务器上的 Feature。

## 4. 两种“落后”，为什么 Push 方式不同

### 情况 A：远程同名 Feature 有新提交

假设 C 是自己尚未推送的本地提交，D 是同事推到同名远程 Feature 的提交：

```text
      C  feature/search
     /
A---B
     \
      D  origin/feature/search
```

在允许整理自己未共享提交的前提下：

```powershell
git fetch origin
git rebase origin/feature/search
git push origin feature/search
```

结果是 `A---B---D---C'`。远程当前的 D 是 C' 的祖先，因此普通 Push 可以快进。若期间远程再次前进，仍可能被拒绝，需要重新核对。

也可以 Merge 远程同名 Feature；这里的关键是整合远程已有历史，并不必然需要强制推送。

### 情况 B：目标 develop 前进，自己的已发布 Feature 需要变基

```text
A---B---D  origin/develop
     \
      C  feature/search, origin/feature/search
```

在 Feature 上 Rebase 到 D 后：

```text
A---B---D---C'  feature/search
     \
      C         origin/feature/search
```

虽然 D 已被新 Feature 包含，服务器 Feature 仍在旧 C，而 C 不是 C' 的祖先。普通 Push 会拒绝这种分支更新。允许改写该分支时，才考虑带预期值检查的强制更新。

| 问题 | 比较哪两个位置 |
| --- | --- |
| 普通 Push 能否快进 | 服务器同名分支 → 准备推送的新提交 |
| MR 能否快进到源分支 | 目标分支 → MR 源分支 |

MR 的合并策略与普通 Push 的分支更新检查是两套机制。目标分支更新，也不代表远程同名 Feature 已被别人修改。

## 5. Force-with-lease 检查什么

`--force-with-lease` 允许非快进更新，但要求服务器引用仍符合指定的预期。它不判断代码正确，也不自动确认团队允许改写历史。受保护分支或服务器规则仍可能拒绝操作。

不带显式预期值时，Git 通常以本地远程跟踪引用作为依据。如果编辑器在后台 Fetch 并更新了这个引用，默认检查可能失去“只覆盖我之前看过的状态”的效果。

下面是 **PowerShell 示例**。仅适用于自己维护、已推送且允许改写的 `feature/search`，远程跟踪引用已存在，当前工作区干净。先核对本地与远程 Feature，不能忽略同事的新提交：

```powershell
git switch feature/search
git status
git fetch origin
git log --left-right --oneline HEAD...origin/feature/search
$expectedFeature = git rev-parse refs/remotes/origin/feature/search
```

确认远程已有工作已妥善保留后，再 Rebase 并检查结果：

```powershell
git rebase origin/develop
git log --graph --oneline --decorate -12
git diff origin/develop...HEAD
```

相关测试通过后，在同一个 PowerShell 会话中推送，明确限定目标引用和预期值：

```powershell
git push "--force-with-lease=refs/heads/feature/search:${expectedFeature}" origin HEAD:refs/heads/feature/search
```

`${expectedFeature}` 是 PowerShell 变量插值，示例不使用 Bash 的赋值与反斜杠续行语法。前面的 Fetch、赋值和 Rebase 都应成功后再执行推送。

如果服务器分支已经被其他人推进，预期值不匹配，Push 就会拒绝。此时应重新 Fetch 并审查新增工作，不要为了通过检查而直接刷新变量重试。显式 Lease 保护的是引用位置符合预期，不能代替内容审查。

## 6. GitLab 的三种 MR 合并方式

以下是基本行为；Squash 是可叠加的设置，可能另外创建压缩后的提交，不能把它与合并方式当作完全相同的开关。

| 方式 | 合并前需要目标是源的祖先 | 是否创建 Merge Commit |
| --- | --- | --- |
| Merge commit | 不要求 | 是 |
| Merge commit with semi-linear history | 要求 | 是 |
| Fast-forward merge | 要求 | 否 |

Semi-linear 要先具备快进条件，但最终仍保留一次合并节点。Fast-forward 不额外创建 Merge Commit；启用 Squash 时，仍可能产生新的压缩提交。

不能仅凭项目叫法或一条旧日志推断当前设置。应结合项目当时的合并设置、源目标关系和实际提交父节点判断。策略、权限、审批与 CI 状态都可能影响是否允许合并。[GitLab 官方说明](https://docs.gitlab.com/user/project/merge_requests/methods/)

### 为什么提示需要 Rebase

目标已前进而源分支没有包含它时，平台要求先建立合适的祖先关系。Rebase 是常用方式，但 FF 的数学条件本身并没有要求必须执行某条 Rebase 命令。

把目标 Merge 进 Feature 也可能建立目标到源的祖先关系，但会留下合并节点，是否允许取决于团队规则。不要为了让按钮可点而绕开项目对历史的约定。

目标在你准备期间继续前进，就可能需要再次同步和验证。保持最新基线能提前发现集成问题，不能保证以后永远无冲突。

## 7. 用父提交验证历史，不凭提交说明猜测

```powershell
git show --no-patch --format='%h %s%nParents: %p' HEAD
```

示意输出：

```text
abc1234 Merge branch 'fix/login-error' into 'develop'
Parents: 111aaaa 222bbbb
```

这里的哈希是虚构示例。两个父提交能证明这是 Merge Commit；说明文字可以自由填写，不能单凭标题证明结构。

即使确认一次合并产生了 Merge Commit，也不能仅凭它区分普通 Merge commit 与 Semi-linear，更不能断言当前项目设置从未变化。

## 8. FF-only 与冲突分别解决什么

FF-only 约束引用如何更新；冲突处理决定代码如何整合。提交落后数量不等于冲突数量，满足快进关系也不能替代构建与功能测试。

选择策略时，可以比较：是否保留整合节点、是否允许改写共享提交、团队如何审查与定位问题，以及基线频繁更新时的协调成本。没有一种历史形状能自动消除集成风险。

## 实践与思考

在练习仓库中，分别保留两个场景：一个只重放尚未共享的本地提交，另一个重放已经推送的 Feature。对比新 HEAD 的祖先是否包含服务器旧 Feature，再预测普通 Push 是否成功。

1. 两边修改完全不同的文件，为什么仍可能不能快进？
2. Rebase 成功后，为什么文件内容和原来不一定相同？
3. 为什么在远程同名 Feature 上重放本地提交，通常可以普通 Push？
4. 默认 Lease 为什么会受到后台 Fetch 影响？
5. 两个父提交能证明什么，又不能证明什么？
6. 源分支里已有 Merge Commit，目标快进过去后，历史一定线性吗？

## 延伸阅读

- [Git Rebase 官方文档](https://git-scm.com/docs/git-rebase)
- [Git Push 官方文档](https://git-scm.com/docs/git-push)

## 系列导航

- [学习路线与完整目录](/notes/git/00-learning-roadmap/)
- [上一章：Merge、冲突与协作流程](/notes/git/06-merge-and-collaboration/)
- [Git 常用命令速查](/notes/git/08-command-reference/)
