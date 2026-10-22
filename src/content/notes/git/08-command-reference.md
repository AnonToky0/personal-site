---
title: "Git 常用命令速查"
description: "按检查状态、比较差异、分支历史、远程同步、储藏和恢复分类查询命令，并标明关键前提与影响范围。"
date: 2026-10-12
tags: ["Git", "命令速查"]
---

这是一份查询表。第一次学习请先按 [学习路线](/notes/git/00-learning-roadmap/) 阅读专题，执行命令前确认当前仓库、分支和工作区状态。

示例中的 `feature/demo`、`main` 和文件路径需要替换为实际名称。`<commit-id>` 是占位符，不要带尖括号原样执行。PowerShell 中的 `@{u}`、`stash@{0}` 应加单引号。

## 1. 检查仓库和配置

| 目的 | 命令 |
| --- | --- |
| 查看工作区和暂存区状态 | `git status` |
| 查看简短文件状态 | `git status --short` |
| 查看当前分支 | `git branch --show-current` |
| 查看本地分支及上游 | `git branch -vv` |
| 查看远程地址 | `git remote -v` |
| 查看提交身份来源 | `git config --show-origin --get user.email` |
| 设置当前仓库邮箱 | `git config --local user.email "you@example.com"` |
| 查看 Git 版本 | `git --version` |
| 查看 Windows 中 Git 路径 | `where.exe git` |

提交身份与远程认证是两回事。仓库内配置通常覆盖用户级配置，但环境变量或命令行设置也可能影响最终身份。

## 2. 比较、暂存与提交

| 目的 | 命令 | 范围或前提 |
| --- | --- | --- |
| 看未暂存变化 | `git diff` | 通常不含未跟踪新文件 |
| 看已暂存变化 | `git diff --cached` | Index 相对 HEAD |
| 看当前净变化 | `git diff HEAD` | 工作区相对 HEAD，不含普通未跟踪文件 |
| 只看路径状态 | `git diff --name-status` | 默认是未暂存差异 |
| 暂存指定路径 | `git add -- lesson.txt` | 保存当前文件状态到 Index |
| 暂存当前目录树 | `git add .` | 不一定是整个仓库 |
| 暂存整个工作区变化 | `git add -A` | 包括新增、修改、删除 |
| 按片段暂存 | `git add -p` | 需人工判断语义边界 |
| 创建提交 | `git commit -m "docs: 补充说明"` | 保存暂存区快照 |
| 查看最新提交概况 | `git show --stat HEAD` | 只读检查 |

详解：[状态模型](/notes/git/01-git-introduction/)、[Diff 与文件管理](/notes/git/02-diff-and-files/)。

## 3. 导出差异

| 目的 | 命令 |
| --- | --- |
| 导出工作区相对 HEAD 的净变化 | `git diff HEAD --output=../review.diff` |
| 导出暂存区变化 | `git diff --cached --output=../staged.diff` |
| 导出功能分支相对共同基线的变化 | `git diff origin/main...HEAD --output=../feature.diff` |
| 导出普通非合并提交补丁 | `git show --format= --output=../commit.diff HEAD` |
| 不经分页器显示 | `git --no-pager diff HEAD` |

输出文件可能覆盖旧文件。三点 Diff 只纳入提交快照，默认 Diff 不直接包含未跟踪文件。Merge Commit 的比较应另行选择父提交；二进制内容也不能默认依赖普通文本补丁恢复。

## 4. 分支与历史

| 目的 | 命令 |
| --- | --- |
| 从当前提交创建并切换 | `git switch -c feature/demo` |
| 切换已有分支 | `git switch feature/demo` |
| 切回上次位置 | `git switch -` |
| 只创建分支 | `git branch feature/demo` |
| 从远程跟踪分支创建本地分支 | `git switch -c feature/demo --track origin/feature/demo` |
| 重命名当前本地分支 | `git branch -m new-name` |
| 检查合并条件后删除本地分支 | `git branch -d feature/demo` |
| 沿第一父路径简化查看主线 | `git log --first-parent --oneline develop` |
| 查看提交图 | `git log --all --oneline --graph --decorate -20` |
| 查看 main 尚未包含的提交 | `git log --oneline main..HEAD` |
| 查看包含某个提交的分支 | `git branch -a --contains <commit-id>` |
| 查看另一分支的文件 | `git show feature/demo:lesson.txt` |
| 查看完整提交 ID | `git rev-parse HEAD` |

详解：[分支、HEAD 与提交历史](/notes/git/03-git-branch/)。

## 5. 远程同步和推送判断

| 目的 | 命令 | 前提或边界 |
| --- | --- | --- |
| 更新 origin 信息 | `git fetch origin` | 依 fetch 配置获取，不自动整合当前分支 |
| 快进更新本地分支 | `git pull --ff-only` | 已有正确上游，分叉时停止 |
| 首次推送并设置上游 | `git push -u origin feature/demo` | 推送到 origin 同名分支 |
| 后续推送 | `git push` | 先确认上游及 Push 配置 |
| 关联已有远程跟踪分支 | `git branch --set-upstream-to=origin/feature/demo` | 不推送、不合并 |
| 看相对上游多出的提交 | `git log --oneline '@{u}..HEAD'` | 需要上游；先 Fetch |
| 看上游多出的提交 | `git log --oneline 'HEAD..@{u}'` | 需要上游；先 Fetch |
| 看未被已知 origin 分支包含的提交 | `git log --oneline HEAD --not --remotes=origin` | 不涵盖未获取的引用、远程 Tag 等 |
| 看包含指定提交的远程跟踪分支 | `git branch -r --contains <commit-id>` | 只查询本地已知信息 |

clean 不等于已 Push；没有上游不等于远程没有同名分支。详解：[远程分支、上游与同步](/notes/git/04-remotes-and-sync/)。

## 6. Stash 与任务转移

| 目的 | 命令 |
| --- | --- |
| 储藏已跟踪修改 | `git stash push -m "WIP: 任务说明"` |
| 同时储藏未跟踪新文件 | `git stash push -u -m "WIP: 任务说明"` |
| 只储藏指定文件 | `git stash push -u -m "独立修复" -- BugFile.cs` |
| 按片段选择储藏 | `git stash push -p` |
| 查看记录列表 | `git stash list` |
| 查看记录及新文件差异 | `git stash show -p --include-untracked 'stash@{0}'` |
| 恢复并保留记录 | `git stash apply 'stash@{0}'` |
| 尝试同时恢复暂存状态 | `git stash apply --index 'stash@{0}'` |
| 恢复成功后自动删除记录 | `git stash pop 'stash@{0}'` |
| 确认恢复后删除指定记录 | `git stash drop 'stash@{0}'` |
| 复制独立提交到当前分支 | `git cherry-pick <commit-id>` |
| 查看并行工作目录 | `git worktree list` |

`-u` 不包含忽略文件。Stash 编号会变化，Drop 前重新核对。Cherry-pick 不会删除来源提交。详解：[Stash 与跨分支转移](/notes/git/05-stash-and-transfer/)。

## 7. 合并与冲突

| 目的 | 命令 | 说明 |
| --- | --- | --- |
| 把基线整合到当前分支 | `git merge origin/main` | 先 Fetch 并保存工作现场 |
| 只允许快进更新 | `git merge --ff-only origin/main` | 不创建分叉历史的合并提交 |
| 接受默认合并说明 | `git merge origin/main --no-edit` | 不会跳过冲突 |
| 列出未解决冲突 | `git diff --name-only --diff-filter=U` | 配合 Status |
| 解决并 Add 后继续 | `git merge --continue` | 先验证结果 |
| 中止未完成合并 | `git merge --abort` | 不用于撤销已完成提交 |
| Cherry-pick 解决冲突后继续 | `git cherry-pick --continue` | 已 Add 解决结果 |
| 中止 Cherry-pick | `git cherry-pick --abort` | 仅针对进行中的操作 |

Vim 保存退出用 `Esc` → `:wq` → Enter。`:q!` 不保证取消提交；编辑器失败退出用 `:cq`，随后检查 Git 状态。详解：[Merge、冲突与协作](/notes/git/06-merge-and-collaboration/)。

## 8. 文件恢复与换行检查

| 目的 | 命令 | 影响 |
| --- | --- | --- |
| 取消指定文件暂存 | `git restore --staged -- lesson.txt` | 保留工作区内容 |
| 放弃未暂存修改 | `git restore -- lesson.txt` | 用 Index 覆盖该工作区文件，先确认不再需要 |
| 停止跟踪并保留当前磁盘文件 | `git rm --cached -- lesson.txt` | 暂存移除，结合忽略规则使用 |
| 新增纠正提交 | `git revert <commit-id>` | 可能冲突；合并提交需另行理解 |
| 查看换行配置 | `git config --show-origin --get core.autocrlf` | 只读 |
| 查看 Index 与工作区换行 | `git ls-files --eol -- lesson.txt` | 路径需已跟踪 |
| 查看属性规则 | `git check-attr text eol -- lesson.txt` | 只读 |
| 辅助忽略行尾 CR 比较 | `git diff --ignore-cr-at-eol` | 不改文件，不修复规则 |

恢复命令会作用于不同状态层，不能仅按“撤销”记忆。大范围清理、强制推送、硬重置或清空 Stash 前，应先明确丢弃范围与恢复条件。

## 9. Rebase 与提交说明

| 目的 | 命令 | 前提与影响 |
| --- | --- | --- |
| 将当前分支重放到新基线 | `git rebase origin/develop` | 先 Fetch，确认允许重写选中历史 |
| 重放到远程同名 Feature | `git rebase origin/feature/search` | 核对远程工作及本地未共享提交 |
| 解决冲突并 Add 后继续 | `git rebase --continue` | 可能多次停在冲突处 |
| 放弃进行中的 Rebase | `git rebase --abort` | 不是撤销已完成的 Rebase |
| 即使可快进也记录合并节点 | `git merge --no-ff feature/search` | 在目标分支执行；已经包含时通常无变化 |
| 检查提交父节点 | `git show --no-patch --format='%h %s%nParents: %p' HEAD` | 两个父节点能证明是合并提交 |
| 修改最近提交说明 | `git commit --amend --only -m "docs: 完善说明"` | 替代 HEAD，改变 ID；不纳入其他已暂存变化 |

已发布历史 Rebase 后可能需要非快进更新，但不能一律强制推送。显式 `--force-with-lease` 的 PowerShell 完整示例及预期值检查，见 [Rebase、快进与合并策略](/notes/git/07-rebase-and-merge-strategies/)。

## 10. 合并后验证（.NET 示例）

| 目的 | 命令 |
| --- | --- |
| Debug 构建 | `dotnet build SampleApp.sln -c Debug` |
| Debug 测试 | `dotnet test tests/SampleApp.Tests/SampleApp.Tests.csproj -c Debug` |
| Release 构建 | `dotnet build SampleApp.sln -c Release` |
| Release 测试 | `dotnet test tests/SampleApp.Tests/SampleApp.Tests.csproj -c Release` |

路径为虚构示例，需要相应项目、SDK 和运行环境。它们不是 Git 命令，也不是本站的构建流程。验证范围与 CI 的区别，见 [合并后的本地验证](/notes/git/06-merge-and-collaboration/)。

Stash 默认 Pop 最新记录，不按当前分支挑选；默认描述中的 HEAD 说明不代表已提交内容被重新储藏。详情见 [Stash 记录机制](/notes/git/05-stash-and-transfer/)。

## 系列导航

- [学习路线与完整目录](/notes/git/00-learning-roadmap/)
- [回到协作流程](/notes/git/06-merge-and-collaboration/)
