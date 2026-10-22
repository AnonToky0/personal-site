---
title: "分支、HEAD 与提交历史：读懂 Git 的引用"
description: "用提交图理解分支和 HEAD，解释切换分支后的文件变化、Log 装饰标记与提交范围查询。"
date: 2026-10-12
tags: ["Git", "分支", "提交历史"]
---

在一个分支中写好的文章，切回主分支之后不见了，是否说明文件丢失？如果文章已经提交，它很可能仍在另一个分支的历史里。

理解这一点，需要把文件视图与提交历史分开来看。

## 1. 分支是引用，不是另一份仓库

```text
A---B---C  main
         \
          D---E  docs/git-basics
```

完整提交历史是有向无环图（DAG）：提交通过父引用连接，合并提交可以连接多条历史；它不是只有一个后继方向的简单链表。图中连接线表示父子关系，阅读时不要把分支名字当成独占路径。两个分支共享 A、B、C。`main` 指向 C，文章分支指向 E。沿父提交向前能到达的提交，构成该引用可见的历史。

分支不是一个永久装着专属 Commit 的盒子。同一个 Commit 可以同时属于多个分支的可达历史。

```powershell
git branch
git branch -a
git log --all --oneline --graph --decorate -20
```

`--all` 查询本地已知引用所能到达的历史，不会实时去服务器搜索所有提交。

## 2. HEAD 表示当前检出位置

常见输出：

```text
eeeeeee (HEAD -> docs/git-basics)
ccccccc (main)
```

这里 HEAD 指向当前本地分支，分支再指向 E。当前分支新增提交后，分支引用前移，HEAD 跟着它定位到新提交。

如果直接检出某个提交，可以进入 detached HEAD 状态：HEAD 直接指向提交。在这个状态下做了需要保留的提交，应及时创建分支引用它，而不是只依赖终端里显示过的哈希。

## 3. 切换分支为什么会改变文件

`git switch main` 通常会把 Index 和工作区更新到 main 对应的版本。E 新增、C 不存在的文章，此时就不会显示在工作区。

```powershell
git status
git switch docs/git-basics
git log --oneline -5
```

未提交修改并不简单地“属于当前分支”。有些修改可以随切换保留；如果切换会覆盖修改，Git 通常会阻止操作。先 Commit 或 Stash，再切换，结果更容易理解。

检查另一个分支的内容也可以不切换：

```powershell
git ls-tree -r --name-only docs/git-basics -- src/content/notes/git
git show docs/git-basics:src/content/notes/git/01-git-introduction.md
```

## 4. 创建、切换、重命名与删除

| 命令 | 行为 |
| --- | --- |
| `git switch -c feature/demo` | 从当前提交创建并切换分支 |
| `git branch feature/demo` | 只创建引用，不切换 |
| `git switch feature/demo` | 切换到已有分支 |
| `git switch -` | 切回上一次检出位置 |
| `git branch -m new-name` | 重命名当前本地分支 |
| `git branch -d feature/demo` | 满足 Git 的合并检查后删除本地分支 |

`-d` 检查相对上游或 HEAD 的合并情况，不代表这个任务已经发布或经过审查。删除本地引用也不会直接删除远程分支。强制删除会跳过检查，不应当作日常清理的默认选项。

从当前 Feature 再创建 Fix，Fix 会继承该 Feature 的历史。如果要独立交付，应从正确基线创建，而不是仅给新分支换一个名字。

## 5. 看懂 Log 的线与标记

```powershell
git log --all --graph --oneline --decorate -15
```

- `*` 表示提交，连接线描述父子关系。
- 分叉与汇合反映历史结构，彩色线条不永久属于某个分支。
- 括号内显示恰好指向该提交的引用，不会列出所有包含它的分支。
- 颜色可以配置，判断引用类型应看名字和完整引用，而不是只看颜色。

例如：

```text
ccccccc (main, origin/main, origin/HEAD)
```

表示本地 `main`、本地远程跟踪引用 `origin/main` 都指向同一个提交，`origin/HEAD` 通常是本地指向远程默认分支的符号引用。它与当前检出位置 HEAD 是两回事。

## 6. 两点范围查询提交集合

```powershell
git log main..feature/demo --oneline
git log feature/demo..main --oneline
git log main...feature/demo --oneline --left-right
```

| 查询 | 含义 |
| --- | --- |
| `A..B` | 从 B 可达、从 A 不可达的提交 |
| `A...B` | 只从其中一端可达的提交，排除共同历史 |
| `--left-right` | 对三点范围标注提交来自左侧还是右侧 |

Log 在选提交，Diff 在比较内容。`git diff A...B` 比较共同祖先到 B 的快照变化，与 `git log A...B` 的对称差集不是同一个含义。

查询某个提交是否被其他分支包含：

```powershell
git branch --contains HEAD
git branch -r --contains HEAD
```

第二条只依据本地远程跟踪信息。先 Fetch 才能让判断更接近服务器当前状态，详见下一章。

## 7. 示例：找回另一分支上的笔记

假设 `main` 上没有 Git 文章，执行：

```powershell
git log --all --oneline -- src/content/notes/git
git branch -a --contains abc1234
```

发现 `abc1234` 是增加初稿的提交，而且本地 `docs/git-basics` 包含它，就可以先查看内容，再决定切换分支或提取文件。

这里的 `abc1234` 是虚构提交的示例，其他仓库需要替换成实际哈希。`--all` 找不到不等于彻底不存在；删除过引用、从未提交的文件和编辑器本地历史，需要不同的恢复方法。

## 8. Visual Studio：把界面还原成引用和提交

Git Repository 窗口适合查看分支、标签、提交图及提交详情；Git Changes 更适合检查未提交文件和暂存内容。Repository 中选择的分支、筛选条件和历史加载范围会影响图中显示什么，不应认为界面总与 `git log --all` 完全一致。[Visual Studio 官方说明](https://learn.microsoft.com/en-us/visualstudio/version-control/git-browse-repository?view=visualstudio)

### 名称中的斜杠只是分组依据

```text
feature
  search
  export-report
fix
  login-error
```

完整分支名是 `feature/search`、`feature/export-report` 和 `fix/login-error`。界面可能按 `/` 折叠分组，但这不说明存在一个父分支 feature，也不能证明这些分支从哪里创建。

分支标签旁的提交是引用当前指向的位置。高亮可能表示当前选择或检出状态；灰色、蓝色、空心或实心节点的具体含义取决于工具和主题。某些工具还显示工作区等特殊节点，因此应结合图例和详情判断，不能仅靠样式断言它是普通提交或合并提交。

### 传入和传出是在与谁比较

| 界面信息或动作 | 对应模型 |
| --- | --- |
| Incoming / 传入 | 上游独有、当前分支没有的提交 |
| Outgoing / 传出 | 当前分支独有、上游没有的提交 |
| Fetch / 提取 | 获取远程信息 |
| Pull / 拉取 | 获取并整合指定更新 |
| Push / 推送 | 请求更新远程引用 |
| Sync / 同步 | 通常组合拉取与推送，具体行为看工具设置 |

`0↓ 0↑` 通常只表示相对配置的上游没有已知提交差异。例如 Feature 与 `origin/feature/search` 一致，并不代表它与 develop 一致。计数也不表示工作区没有未提交修改，且受远程信息的新旧影响。

确认当前检出分支，可用 `git branch --show-current`；确认上游和 Ahead / Behind，可用 `git branch -vv`。不要把界面选中的分支直接当成正在开发的分支。

## 9. 两次合并为什么能画在同一列

先看父关系，以下字母只代表示意提交：

| 提交 | 操作发生位置 | 第一父提交 | 第二父提交 |
| --- | --- | --- | --- |
| M1 | develop | 原 develop 的 D | 登录修复的 F |
| M2 | feature/search | 原 Feature 的 S | 已获取的 develop，即 M1 |

这表示 Fix 先合入 develop，Feature 再合入包含 Fix 的 develop。Feature 因而通过 M2 获得了 M1、F 等提交的可达历史，不要求单独再 Merge Fix。

图形工具可以把 M2 到 M1 的路径画在同一列，把 S 画在旁边。**同一列不代表同一分支创建，颜色相同也不代表分支身份相同。** Git 不在每个 Commit 对象中保存“最初属于哪个分支”的永久字段。

多数提交图把较新提交放上面，沿父连接向下追溯历史；具体排序和过滤可能改变布局。`/` 与 `\` 表示线路连接，不能分别机械等同于创建分支与合并分支。

选中实际提交，用下面的命令核对父关系；`<commit-id>` 要替换成真实 ID：

```powershell
git show --no-patch --format='%h %p %s' <commit-id>
```

`%h` 是当前短哈希，`%p` 是父提交短哈希列表，`%s` 是说明第一行。双分支 Merge 通常有两个父提交，顺序对应合并前的当前 HEAD 与合入提交。

需要先简化阅读主线时，可以使用：

```powershell
git log --first-parent --oneline develop
```

它只沿第一父路径追溯，会隐藏其他父路径的展开，不会删除那些历史。若要理解完整关系，仍需结合完整 Graph 和父节点详情。

## 实践与思考

在练习仓库中创建分支并提交新文件，再切回 main。尝试用 `git show 分支:路径` 查看它，不改变当前工作区。

1. 同一个 Commit 为什么能同时出现在两个分支的 Log 中？
2. `git branch new-name` 为什么不会改变当前文件？
3. Commit 后没有 `origin/` 标记，是否足以判断它没推送？
4. 从 Feature 创建 Fix，为什么可能把整个 Feature 一起带入 MR？

## 延伸阅读

- [Git Branch 官方文档](https://git-scm.com/docs/git-branch)
- [Git Log 官方文档](https://git-scm.com/docs/git-log)

## 系列导航

- [学习路线与完整目录](/notes/git/00-learning-roadmap/)
- [上一章：Diff、文件跟踪与换行符](/notes/git/02-diff-and-files/)
- [下一章：远程分支、上游与同步](/notes/git/04-remotes-and-sync/)
