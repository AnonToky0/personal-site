---
title: "远程分支、上游与同步：提交推到哪里了"
description: "区分本地分支、远程跟踪引用和服务器分支，理解 Fetch、Pull、Push，并判断哪些提交尚未进入远程。"
date: 2026-10-12
tags: ["Git", "远程同步"]
---

工作区干净、Log 里能看到提交，只能证明本地状态。要判断文章是否已经上传，还需要知道远程引用在哪里。

## 1. 三个相似的分支名称

| 对象 | 示例 | 保存在哪里 |
| --- | --- | --- |
| 本地分支 | `main` | 本地仓库中的分支引用 |
| 远程跟踪引用 | `origin/main` | 本地仓库记录的远程分支状态 |
| 服务器分支 | 远程仓库的 `main` | 服务器仓库 |

`origin` 是一个远程仓库配置名称，不是 Git 固定关键字。

```powershell
git remote -v
git branch -vv
git branch -r
```

查看 `origin/main` 的 Log 不会实时查询服务器。它反映本地最后获得的远程信息，可能已经过时。

## 2. Fetch 更新了什么

```powershell
git fetch origin
```

普通 Fetch 获取对象，并按远程的 fetch refspec 更新对应远程跟踪引用；不会自动把当前本地分支合并到新位置。

```text
Fetch 前： A---B  main, origin/main

服务器：  A---B---C---D  main

Fetch 后：A---B---C---D  origin/main
             ^
            main
```

Fetch 的范围由仓库配置决定，不保证所有仓库都获取服务器上的全部分支。浅克隆、单分支克隆或自定义 refspec 都会影响本地掌握的信息。

同一仓库切换分支不要求每次重新 Fetch。不同独立仓库则要分别更新；同仓库的 Worktree 共享对象和大部分引用。

### 读懂 Fetch 输出

普通快进更新可能显示如下虚构记录：

```text
111aaaa..222bbbb  develop -> origin/develop
```

左侧是本地远程跟踪引用的旧位置与新位置；右侧说明服务器 develop 的信息更新到了本地 `origin/develop`。这里的 `..` 是输出格式，不是在执行 Log 的范围查询。

此时本地 develop 和当前 Feature 通常仍停在原位置。新分支、强制更新或其他状态会有不同标记，不能把所有 Fetch 输出都按普通快进解释。[Git Fetch 官方文档](https://git-scm.com/docs/git-fetch)

## 3. 上游是一项关联配置

```powershell
git branch -vv
```

可能显示：

```text
* feature/demo abc1234 [origin/feature/demo: ahead 2, behind 1] ...
```

表示相对本地记录的上游，当前分支有两个独有提交，上游有一个独有提交。双方已经分叉；Ahead / Behind 不是按日期比较，也不是工作区文件数量。

没有方括号通常表示没配置上游，不证明服务器没有同名分支。

首次推送并设置上游：

```powershell
git push -u origin feature/demo
```

这会推送指定本地分支，并在成功设置时记录上游；远程不存在同名分支时，可以在权限允许的情况下创建。它不把 Feature 合并到 main。

若远程跟踪分支已经存在，只想关联配置：

```powershell
git branch --set-upstream-to=origin/feature/demo
```

这条不发送提交，也不合并文件。日常无参数 Push 的目标还受 `push.default`、pushRemote 等配置影响；不确定时显式写出远程和分支。

## 4. 哪些 Commit 还没推送

先更新远程信息：

```powershell
git fetch origin
```

### 已配置上游：比较当前分支与上游

```powershell
git log --oneline '@{u}..HEAD'
git log --oneline 'HEAD..@{u}'
```

第一条是当前分支有、上游没有的提交；第二条相反。PowerShell 中给 `@{u}` 表达式加单引号。没有上游时，命令会报错。

### 没有同名远程分支：与所有已知 origin 分支比较

```powershell
git log --oneline HEAD --not --remotes=origin
```

它查询从 HEAD 可达、但从本地任何已知 origin 远程跟踪引用不可达的提交。

它回答的是“是否进入已知的 origin 分支历史”，不是“是否曾经通过任何方式上传过”。远程 Tag、其他 Remote、被删除的远程分支，以及未获取的引用，都不在这个结论内。

### 查询指定 Commit

```powershell
git branch -r --contains abc1234
```

输出列出本地已知、历史包含该提交的远程跟踪分支。无输出同样受 Fetch 范围和信息新旧限制。

## 5. 为什么不能只看 Log 后面的标签

```text
aaaaaaa (HEAD -> feature/demo)
bbbbbbb
ccccccc (origin/main, main)
```

标签只标出引用的尖端。如果以后 feature/demo 被完整推送，远程分支只在最新提交旁显示标签，更早的祖先提交一样在远程历史中。

如果平台采用 Squash 或 Rebase 合并，修改可能已经进入 main，但原提交 ID 不在 main 的祖先历史中。因此，“内容已经交付”和“原 Commit 被远程分支包含”也要区分。

## 6. Pull 与快进更新

Pull 先 Fetch，再按参数和配置整合到当前分支。整合可能使用 Merge 或 Rebase，不能简单把 Pull 理解为“下载文件”。

假设本地 main 已跟踪 origin/main，工作区干净：

```powershell
git switch main
git pull --ff-only
```

`--ff-only` 要求当前分支能直接快进到目标位置；历史分叉时拒绝自动整合。它失败后应先检查历史，不要直接强制覆盖本地提交。

也可以把获取和本地更新显式拆开：

```powershell
git fetch origin
git switch main
git merge --ff-only origin/main
```

这两组是替代流程，不必每次连着执行。

## 7. 指定 Pull 的分支，不等于切换分支

```powershell
git pull --ff-only origin develop
```

这会获取 develop，并尝试把它整合到**当前检出的分支**，不会先替你切到本地 develop。如果当前 Feature 已经与远程 develop 分叉，FF-only 会拒绝整合，即使文件内容本来可以自动合并。

Fetch 步骤可能已经成功；拒绝的是随后对当前分支的整合。应根据项目策略选择显式 Merge 或 Rebase，而不是把拒绝当成内容冲突。两类“分支落后”的区别，见 [Rebase 与推送检查](/notes/git/07-rebase-and-merge-strategies/)。

## 8. 常见判断错误

| 现象 | 能得出的结论 |
| --- | --- |
| 工作区 clean | 当前没有普通待提交文件变化 |
| 没有配置上游 | 默认跟踪关系尚未设置 |
| `ahead 2` | 相对本地上游引用有两个独有提交 |
| Push 成功 | 对应远程引用已按这次请求更新 |
| PR / MR 已合并 | 修改按平台选定策略进入目标分支，原 ID 未必保留 |

## 实践与思考

在练习仓库旁创建本地 bare 仓库，可以不用在线账户练习：

```powershell
git init --bare ../git-practice-remote.git
git remote add origin ../git-practice-remote.git
git push -u origin main
```

前提是练习仓库已有 main 和至少一个提交，并且尚无 origin；不要把这段初始化命令直接套到已有项目。随后新增一个本地提交，比较 Push 前后的 `git branch -vv` 与范围 Log。

1. 为什么 Fetch 后，main 的文件还没有变？
2. 没有同名远程分支时，提交有没有可能已经通过另一个远程分支上传？
3. 为什么 Squash 合并后，原 Commit 的可达性不能直接证明功能是否已交付？

## 系列导航

- [学习路线与完整目录](/notes/git/00-learning-roadmap/)
- [上一章：分支、HEAD 与提交历史](/notes/git/03-git-branch/)
- [下一章：Stash 与跨分支转移修改](/notes/git/05-stash-and-transfer/)
