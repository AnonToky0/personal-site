---
title: "Merge、冲突与协作：把一项任务交付出去"
description: "理解快进与合并提交，处理 Merge 冲突和编辑器状态，并把分支、Commit 与 MR/PR 组织成完整协作流程。"
date: 2026-10-12
tags: ["Git", "Merge", "协作流程"]
---

Fetch 已经拿到了最新基线，功能分支的文件却还没有更新。下一步是把基线历史整合进当前分支。Merge 的方向由“当前分支”决定，而不是由分支名字是否叫 main 或 develop 决定。

## 1. Merge 改变哪一边

假设当前在 `feature/import`：

```powershell
git status
git fetch origin
git merge origin/develop
```

这把本地已获取的 develop 历史整合进 Feature，不会因此更新服务器 develop，也不会把 Feature 提前合并到 develop。

合并前尽量保持工作区干净：先提交或储藏修改。虽然部分未提交修改可以与 Merge 共存，但遇到冲突或需要中止时，恢复边界会更复杂。

## 2. 三种历史结果

### 已经包含

如果目标提交已经是 HEAD 的祖先，通常显示 Already up to date，不需要创建新提交。

### 快进：只移动引用

```text
A---B       当前分支
     \
      C---D  待合并分支
```

当前分支可以直接前移到 D。这称为 Fast-forward，不需要额外 Merge Commit。`--ff-only` 只接受这样的更新（或已经包含的情况）。

### 分叉后合并：创建新提交

```text
A---B---C------M  feature/import
     \       /
      D-----E    origin/develop
```

普通双分支合并中，M 有两个父提交：当前分支原来的 C，以及合入的 E。M 保存整合后的快照。原有提交 ID 保持不变，当前 Feature 移到 M；develop 不会因为这个本地操作移动。

### 读懂一次自动合并的结果

下面是普通文本项目的示意输出，统计仅为例子：

```text
Merge made by the 'ort' strategy.
 2 files changed, 12 insertions(+), 3 deletions(-)
 create mode 100644 src/SearchOptions.cs
```

`ort` 是现代 Git 普通双分支合并使用的策略名称。输出说明此次自动合并成功；统计描述合并结果相对当前分支合并前的变化，`100644` 表示普通非可执行文件模式。这不是 Windows 文件访问权限列表，也不是功能正确性的证明。

如果先 Push，再在本地 Merge，先前的 Push 不会把后来产生的合并提交自动上传。检查合并结果和相关验证后，需要再次 Push；同一源分支已有的 MR / PR 通常随之更新。

## 3. 冲突意味着需要作决定

当双方修改无法按合并规则自动整合时，Git 会停止并报告冲突。

```powershell
git status
git diff --name-only --diff-filter=U
```

普通文本冲突可能包含：

```text
<<<<<<< HEAD
当前分支的内容
=======
合入一方的内容
>>>>>>> origin/develop
```

修改文件为最终需要的结果，删除冲突标记，再 Add：

```powershell
git add -- conflicted-file.txt
git diff --cached
git status
git merge --continue
```

执行 Continue 前，应检查全部冲突均已解决并运行相关验证。最终内容可以是两边的组合，也可以是重新编写的第三种实现。不要仅凭 ours / theirs 的标签批量选择。

并非所有冲突都有文本标记，例如修改与删除、重命名、二进制文件冲突，应结合 Status 和项目语义处理。

如果决定放弃尚未完成的合并：

```powershell
git merge --abort
```

Abort 不是撤销一个已经完成的合并提交。存在合并前未提交修改时，也不能保证所有场景都能完整恢复，因此应在开始前保存现场。

### 相邻删除也可能冲突

假设 `src/SettingsView.cs` 里有两个相邻的废弃方法 `LoadLegacySettings()` 与 `SaveLegacySettings()`。当前 `fix/login-error` 删除前一个，develop 删除后一个，同时双方还分别改进了错误提示和配置校验。

即使双方目标都是清理旧代码，文本片段的上下文也可能使 Git 无法自动整合。合理结果可能是删除两个废弃方法，同时保留双方仍需要的改进；最终还应检查调用点、构建和行为。

因此不能对整个文件盲选 Accept Current 或 Accept Incoming。修改同一文件不必然冲突，改动不同文件也可能存在 Git 无法识别的业务依赖冲突。落后七个提交，更不等于有七处文本冲突。

## 4. 为什么会打开 Vim

需要提交说明时，Git 会启动配置的编辑器。进入 Vim 不是 Merge 失败。

| 目的 | 操作 |
| --- | --- |
| 保存提交说明并正常退出 | `Esc`，输入 `:wq`，Enter |
| 让编辑器以失败状态退出 | `Esc`，输入 `:cq`，Enter |
| 合并时接受默认提交说明 | `git merge origin/develop --no-edit` |

`:q!` 只丢弃本次编辑器里的文本修改，然后通常正常退出；默认提交说明可能仍有效，因此 Git 仍可能完成提交。它不能作为“取消 Merge”的可靠操作。

`:cq` 会让这次编辑器步骤失败，但不等于自动恢复合并前的文件。退出后用 `git status` 判断 Merge 是否仍在进行；需要中止时再用 `git merge --abort`。`--no-edit` 只省去说明编辑，不跳过冲突。

## 5. Merge 与 Rebase 的选择

| 对比 | Merge | Rebase |
| --- | --- | --- |
| 主要方式 | 整合双方历史 | 把一组提交重放到新基线 |
| 原提交 ID | 保留原有提交 | 被重放提交通常改变 ID |
| 分叉历史 | 通常新增合并提交 | 通常形成线性历史 |
| 冲突 | 可能发生 | 可能发生，且可能逐提交处理 |
| 已共享分支 | 通常可正常推送 | 改写后可能涉及协调和强制推送 |

对已推送、多人使用的分支，不应在不了解影响时随意改写历史。初学时先掌握 Merge；团队要求 Rebase 时，再按约定处理。两种方式都不自动保证业务逻辑正确。关于 Rebase 的完整过程、两类 Push 拒绝与 GitLab 合并策略，继续阅读 [Rebase、快进与合并策略](/notes/git/07-rebase-and-merge-strategies/)。

## 6. 从基线到 MR / PR

以下假设目标分支是 develop，本地 develop 已跟踪 origin/develop，工作区干净。

### 同步基线并创建任务分支

```powershell
git switch develop
git pull --ff-only
git switch -c feature/import
```

### 开发、检查并提交

```powershell
git diff
git add -- FeatureFile.cs
git diff --cached
git commit -m "feat: 支持导入用户配置"
```

运行项目要求的检查后推送：

```powershell
git push -u origin feature/import
```

在平台创建 MR / PR，Source 是 Feature，Target 是 develop。一个请求可以包含多个 Commit，也可以多次 Push。

### 审查与继续修改

在原分支按意见修改、检查、Commit、Push，通常就会更新原请求。回复讨论时说明改了什么和如何验证；由谁 Resolve、谁 Approve、谁 Merge，应按团队约定。

“发评论”“批准”和“合并”是不同动作。讨论标为已解决，不代表代码已经进入目标分支。

### 合并后同步本地

```powershell
git switch develop
git pull --ff-only
```

平台更新远程 develop，不会自动更新你本地 develop。团队可能使用 Merge Commit、Squash 或 Fast-forward，结果历史形状并不完全相同。

## 7. Feature、Fix、Commit 与请求范围

任务分支隔离一组工作，Commit 保存一个清晰变化，MR / PR 提交整组差异进行审查。

例如，同一个导入任务中，可以依次提交：

1. `feat: 支持导入用户配置`
2. `fix: 修复导入配置的校验逻辑`
3. `feat: 支持导入数据`

如果修复属于当前功能，放在同一个分支中可以合理。如果是需要独立发布的无关 Bug，应从合适基线创建独立 Fix。

单独做一个 Commit，不会自动让它离开当前 MR。是否需要拆分，取决于能否独立审查、测试、交付，以及团队发布策略。

## 8. 恢复命令的边界

| 操作 | 主要影响 | 需要注意 |
| --- | --- | --- |
| `git restore -- file` | 用 Index 恢复工作区文件 | 会丢弃该文件未暂存修改 |
| `git restore --staged -- file` | 通常用 HEAD 恢复 Index | 保留工作区内容，不再纳入当前暂存快照 |
| `git revert <commit-id>` | 创建抵消指定提交的提交 | 不删除原历史，可能冲突 |
| `git reset --hard <commit-id>` | 移动引用并重置 Index、工作区 | 会丢弃已跟踪修改，也可能覆盖阻挡检出的未跟踪路径 |

这些不是可互换的“撤销”按钮。对共享历史通常先考虑新增纠正提交；合并提交的 Revert 还涉及主线父提交选择，需要单独理解后处理。

## 9. 什么时候同步基线

不必在 develop 每增加一个提交时都机械同步。是否现在整合，主要看依赖变化、任务持续时间、同模块并行修改情况和审查要求。

| 情况 | 可以采用的处理 |
| --- | --- |
| 刚从最新基线创建分支 | 继续开发，无需立即重复同步 |
| 更新暂时与当前任务无关 | 评估后暂缓 |
| 公共接口、配置或依赖已变化 | 尽早整合并验证 |
| 长周期分支持续积累差异 | 选择明确的集成节点 |
| 即将审查、合并或发布 | 按团队要求检查与最新目标的兼容性 |

频繁 Merge 可能增加历史节点与验证成本；长期不整合则可能推迟暴露问题。不存在适合所有项目的固定频率，保持任务范围较小、及时沟通共同依赖更有帮助。团队要求 Rebase 或特定历史形状时，也应遵循统一策略。

公共分支本地同步常采用 `git pull --ff-only`，让意外分叉显式停下来；它默认比较的是当前分支配置的上游，不是固定指向 develop。命令的完整前提见 [远程同步](/notes/git/04-remotes-and-sync/)。

## 10. 合并后的本地验证与 CI

| 环节 | 验证或承担什么 |
| --- | --- |
| Build | 检查项目是否能按指定配置构建 |
| Test | 执行测试，检查已覆盖行为 |
| CI | 按流水线规则自动执行 Job |
| Runner | 提供执行 Job 的环境 |

Build 和 Test 可以在本地执行，不依赖先搭建 GitLab CI。CI 在什么时候运行，由流水线触发规则决定；它也不会凭空补上仓库没有的测试。

以虚构 .NET 项目 `SampleApp.sln` 为例，使用与项目匹配的 SDK、依赖和测试运行器。在仓库根目录可以执行：

```powershell
dotnet build SampleApp.sln -c Debug
dotnet test tests/SampleApp.Tests/SampleApp.Tests.csproj -c Debug
```

这是示例项目路径，不是本站的构建命令。通常 Test 会进行必要的构建；显式分两步便于区分构建失败和测试失败。明确写 `-c` 能减少默认配置造成的疑惑。具体选项和行为应匹配仓库 SDK 与测试运行器版本。[dotnet build 文档](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-build)、[dotnet test 文档](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-test)

发布流程需要时，另行验证 Release：

```powershell
dotnet build SampleApp.sln -c Release
dotnet test tests/SampleApp.Tests/SampleApp.Tests.csproj -c Release
```

检查命令退出码、实际运行的测试数量和失败情况，不要只看最后一行是否出现成功文字。Build 通过不代表逻辑正确，Test 通过也只覆盖实际执行到的断言；桌面界面和外部服务交互可能仍需人工验证。Windows 桌面项目应使用符合项目要求的操作系统、SDK 和组件环境。

验证是针对某个代码状态和配置的证据。之后又修改文件、解决冲突或重新 Rebase，就要判断哪些检查需要重新执行，不能直接沿用旧结果。

图形界面如何检查分支、Incoming / Outgoing 和 Graph，统一见 [分支与提交历史中的 Visual Studio 说明](/notes/git/03-git-branch/)，避免把界面操作另记成一套 Git 原理。

## 实践与思考

在练习仓库的两个分支中修改同一行并分别提交，Merge 后观察 Status，手动解决冲突并检查最终内容。另做一次冲突练习，在提交合并结果前 Abort，核对文件是否回到预期状态。

1. 在 Feature 上 Merge develop，为什么 develop 不前移？
2. 为什么某次 Merge 不创建提交，另一次会创建双父提交？
3. 退出 Vim 后，怎样确认合并到底有没有完成？
4. 一个独立 Fix Commit 为什么仍可能出现在 Feature 的 MR 里？
5. Restore、Revert 与 Reset 分别处理哪一层状态？

## 延伸阅读

- [Git Merge 官方文档](https://git-scm.com/docs/git-merge)
- [Git Restore 官方文档](https://git-scm.com/docs/git-restore)

## 系列导航

- [学习路线与完整目录](/notes/git/00-learning-roadmap/)
- [上一章：Stash 与跨分支转移修改](/notes/git/05-stash-and-transfer/)
- [下一章：Rebase、快进与合并策略](/notes/git/07-rebase-and-merge-strategies/)
- [Git 常用命令速查](/notes/git/08-command-reference/)
