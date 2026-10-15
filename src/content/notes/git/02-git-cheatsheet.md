---
title: "git 常用命令"
description: "介绍 git 的常用指令"
date: 2026-10-12
tags: [git]
---


### 1. 仓库状态与基本信息

| 命令 | 用途 |
|---|---|
| `git --version` | 查看当前 Git 版本 |
| `git status` | 查看当前分支、工作区及暂存区状态 |
| `git branch --show-current` | 查看当前分支名称 |
| `git branch` | 列出本地分支 |
| `git branch -a` | 列出本地分支及远程跟踪分支 |
| `git branch -vv` | 查看本地分支及其上游跟踪关系 |
| `git remote -v` | 查看已配置的远程仓库及 Fetch/Push 地址 |
| `git config user.name` | 查看当前生效的 Git 提交用户名 |
| `git config user.email` | 查看当前生效的 Git 提交邮箱 |
| `git branch -m <old-name> <new-name>` | 重命名指定分支；若只写一个名字，则重命名当前分支 |
| `git branch -M <old-name> <new-name>` | 强制重命名指定分支，即使目标分支名已存在也会覆盖 |

**`git status` 是日常使用频率最高的命令之一。进行修改、提交、切换分支前，建议先查看状态。**

### 2. 分支管理

| 命令 | 用途 |
|---|---|
| `git switch A` | 切换到本地 `A` 分支 |
| `git switch -c feature/xxx` | 创建并切换到新分支 |
| `git switch -` | 切换回上一次所在的分支 |
| `git switch -c feature/xxx --track origin/feature/xxx` | 基于远程跟踪分支创建本地分支，并建立跟踪关系 |
| `git branch feature/xxx` | 创建本地分支，但不切换 |
| `git branch -d feature/xxx` | 安全删除已完成合并的本地分支 |
| `git checkout develop` | 旧版 Git 切换分支的写法 |
| `git checkout -b feature/xxx` | 旧版 Git 创建并切换分支的写法 |

说明：

- `git switch` 从 Git 2.23 开始提供。
- 旧版本 Git 可以使用 `git checkout`。
- `git branch -d` 删除的是本地分支，不会直接删除 GitLab 上的分支。
- 分支切换可能因为未提交的修改而受到阻止，不应盲目丢弃修改。

### 3. 文件修改、暂存与恢复

| 命令 | 用途 |
|---|---|
| `git diff` | 查看工作区与暂存区之间的差异，即尚未暂存的修改 |
| `git diff --cached` | 查看已经暂存、准备提交的修改 |
| `git add 文件名` | 将指定文件的修改加入暂存区 |
| `git add .` | 暂存**当前目录及其子目录**中的修改 |
| `git add -A` | 暂存整个工作区的新增、修改和删除 |
| `git restore 文件名` | 将指定文件在工作区的未暂存修改恢复到暂存区版本 |
| `git restore --staged 文件名` | 将文件从暂存区移出，保留工作区修改 |
| `git rm --cached 文件名` | 停止跟踪指定文件，保留本地实际文件 |
| `git stash` | 储藏当前已跟踪文件的未提交修改 |

#### 4.3.1  `git diff`

| 需求 | 命令 |
| --- | --- |
| 查看所有未暂存修改 | `git diff` |
| 导出所有未暂存修改 | `git diff --output=../unstaged.diff` |
| 导出所有已暂存修改 | `git diff --cached --output=../staged.diff` |
| 导出全部未提交修改（已跟踪文件） | `git diff HEAD --output=../all.diff` |
| 导出最近一次 Commit 的修改 | `git show --format= --output=../last-commit.diff HEAD` |
| 导出指定 Commit 的修改 | `git show --format= --output=../commit.diff <commit-id>` |
| 导出分支A从共同祖先开始, 到当前 HEAD 为止的完整已提交变更 | `git diff origin/A...HEAD --output=../mr.diff` |

如果只是想让Git一次性输出到终端，不经过分页器：`git --no-pager diff HEAD`
但修改很多时，终端本身的滚动缓冲区仍可能限制能会看的内容。相比之下导出`.diff`文件更可靠。

#### 4.3.2  `git restore 文件名`
`git restore 文件名` 可能导致未暂存的修改丢失，执行前应确认。


#### 4.3.3  `git rm --cached 文件名`
典型场景：清理不应被 Git 跟踪的文件

例如 `.pubxml.user` 属于个人本地发布配置，可以先将对应规则加入 `.gitignore`，再执行：

`git rm --cached XXX.pubxml.user`

这样可以让 Git 停止跟踪它，并在后续 Commit 中记录这一变更，但本地实际文件仍然保留。

`.gitignore` 不能自动取消已经被 Git 跟踪的文件，因此需要配合 `git rm --cached`。

### 4. Commit 提交与历史查看

| 命令 | 用途 |
|---|---|
| `git commit -m "feat: xxx"` | 将暂存区内容创建为一个新的 Commit |
| `git log` | 查看提交历史 |
| `git log --oneline` | 使用简洁格式查看提交历史 |
| `git log --oneline -3` | 查看当前分支最近 3 个 Commit |
| `git log origin/develop --oneline -3` | 查看本地记录的远程 `develop` 最近 3 个 Commit |
| `git log --oneline --graph --decorate -n 6` | 图形化显示最近 6 个 Commit、分支和标签 |
| `git rev-parse HEAD` | 查看当前提交的完整哈希 |
| `git rev-parse <commit>` | 将指定 Commit 引用解析为完整哈希 |
| `git cat-file -t <commit>` | 查看指定 Git 对象的类型 |
| `git cat-file -p <commit>` | 查看指定 Git 对象的内容 |

### 5. `git Stash`

`git stash`用于代码改到一半，还不想commit，但需要临时切换分支或处理其他任务。

| 命令 | 作用 |
| --- | --- |
| `git stash` | 储藏当前已跟踪文件的未提交修改 |
| `git stash push -m "说明"` | 储藏修改，并添加备注 |
| `git stash push -u -m "说明"` | 同时储藏未跟踪的新文件（不包含被忽略文件） |
| `git stash list` | 查看所有储藏记录 |
| `git stash show stash@{0}` | 查看指定储藏的修改统计 |
| `git stash show -p stash@{0}` | 查看指定储藏的完整 Diff |
| `git stash pop` | 恢复最近一次储藏，成功后删除该储藏 |
| `git stash apply` | 恢复最近一次储藏，但保留储藏记录 |
| `git stash apply 'stash@{1}'` | 恢复指定储藏 |
| `git stash drop 'stash@{0}'` | 删除指定储藏 |
| `git stash clear` | 删除全部储藏记录 |

PowerShell 中引用 stash@{0} 时，建议加单引号，避免特殊字符解析问题。

**Commit ID 说明**

例如：

`e9a6479`

这是完整 Commit 哈希的缩写，不是只有 7 位的完整哈希。

传统 Git 仓库使用 SHA-1，完整哈希长度为 40 个十六进制字符；Git 也支持 SHA-256 对象格式。

Commit 哈希与提交内容、父提交、作者和提交信息等有关。

可以通过 `git rev-parse --show-object-format` 查看仓库对象格式。

### 4.5 远程仓库与代码同步

| 命令 | 用途 |
|---|---|
| `git remote -v` | 显示远程仓库的 Fetch 和 Push 地址 |
| `git fetch origin` | 从 `origin` 获取远程对象并更新远程跟踪引用，不自动合并当前分支 |
| `git pull` | 获取上游分支的更新并整合到当前分支 |
| `git pull --ff-only` | 仅允许以快进方式更新当前分支 |
| `git push` | 按当前分支配置向远程推送提交 |
| `git push origin feature/xxx` | 推送本地 `feature/xxx` 到 `origin` 的同名分支 |
| `git push -u origin feature/xxx` | 推送分支，并设置本地分支的上游跟踪关系 |
| `git push origin local:remote` | 将本地 `local` 分支推送到远程 `remote` 分支 |
| `git remote rename origin company` | 将远程仓库别名从 `origin` 改为 `company` |

**Fetch 与 Pull 的区别**

- `git fetch`：获取远程最新信息，但不自动修改当前工作分支。
- `git pull`：获取远程更新，并尝试整合到当前分支。
- `git pull --ff-only`：如果本地与远程历史产生分叉，就拒绝自动合并。

对于日常同步 `develop` 等公共分支，推荐先确认工作区状态，再使用：

1. `git switch develop`
2. `git fetch origin`
3. `git pull --ff-only`

注意，`origin/develop` 是本地的远程跟踪引用，并不代表每次查看时都会实时查询 GitLab。可以先运行 `git fetch origin` 更新该引用。

### 4.6 Git 配置与版本管理

| 命令 | 用途 |
|---|---|
| `git config --global user.name "Name"` | 配置全局提交用户名 |
| `git config --global user.email "email@example.com"` | 配置全局提交邮箱 |
| `git config --local user.email "email@example.com"` | 设置当前仓库使用的提交邮箱,不携带global/local默认为local，配置保存在`.git/config` |
| `git config --local user.email` | 查看当前仓库使用的提交邮箱 |
| `where.exe git` | 在 Windows 中查看 PATH 中匹配的 Git 可执行文件路径 |
| `git update-git-for-windows` | 使用 Git for Windows 更新工具（安装版本支持时） |
| `winget upgrade --id Git.Git -e` | 使用 Windows 包管理器升级 Git for Windows |

注意，升级 Git 通常不会删除已有仓库和提交历史。升级后应重新打开终端，并检查 `git --version`。