这次我们接着上次的 V0.1 整理，作为 V0.2 增补内容。不重复之前已经整理的基础知识，主要补充这几天实际遇到的操作，包括 Diff 导出、Stash、分支间转移修改、Merge、Git 日志以及换行符问题。

整体仍采用“原理说明 + 命令表格 + 实际场景 + 注意事项”的结构，方便以后直接整合进你的 Git & GitLab 使用指南。

# Git 与 GitLab 日常开发使用指南（V0.2 增补）

> 本次补充范围：Diff 导出、Stash、任务与分支管理、分支间修改转移、Git Index、换行符、上游分支、Merge 和提交历史可视化。

---

## 9. Git Diff：查看与导出完整修改

### 9.1 基本概念

`git diff` 用于比较不同文件状态或不同提交之间的差异。

Git 默认可能使用分页器显示 Diff，因此终端中看到的内容不一定是全部差异。可以通过导出文件的方式获取完整修改，方便进行 Code Review 或交给 AI 分析。

### 9.2 常用命令

| 命令                                                   | 作用                             |
| ---------------------------------------------------- | ------------------------------ |
| `git diff`                                           | 查看工作区相对于暂存区的修改                 |
| `git diff --cached`                                  | 查看暂存区相对于 HEAD 的修改              |
| `git diff HEAD`                                      | 查看已跟踪文件全部未提交修改，包括已暂存和未暂存部分     |
| `git --no-pager diff HEAD`                           | 不使用分页器，直接在终端输出全部 Diff          |
| `git diff HEAD --output=../review.diff`              | 将当前未提交修改导出为 Diff 文件            |
| `git show --format= HEAD`                            | 查看最新 Commit 引入的修改，不显示提交说明      |
| `git diff origin/develop...HEAD`                     | 查看从与 develop 的共同祖先到当前 HEAD 的差异 |
| `git diff origin/develop...HEAD --output=../mr.diff` | 导出当前功能分支相对 develop 的修改         |
| `git diff --ignore-cr-at-eol`                        | 比较时忽略行尾 CR 字符的差异               |

### 9.3 常用场景

**场景 A：将当前未提交修改交给 AI 审查**

执行：

`git diff HEAD --output=../review.diff`

如果存在尚未跟踪的新文件，需要注意：`git diff` 默认不会显示这些文件。

可以先执行：

`git add -N .`

这会为未跟踪文件标记 *intent-to-add*，使其内容能够出现在 Diff 中，但不会将其实际内容暂存。该命令会改变 Index 状态。

**场景 B：导出整个 Feature 相对于 develop 的修改**

执行：

1. `git fetch origin`
2. `git diff origin/develop...HEAD --output=../mr.diff`

其中三点语法 `A...B` 在 `git diff` 中表示：比较 A、B 的共同祖先与 B 的内容。

这适合在提交 MR 前审查整个功能分支，而不仅是最后一次 Commit。

---

## 10. Git Stash：临时保存工作现场

### 10.1 基本概念

`git stash` 用于临时保存尚未提交的修改，使开发者可以暂时清理工作区，切换分支处理其他任务。

它与 `git add` 的暂存区不同：

- `git add`：准备下一次 Commit 的内容。
- `git stash`：将未完成的修改临时储藏起来。

Stash 保存在本地仓库中，不会自动上传到 GitLab。

### 10.2 常用命令

| 命令                              | 作用                |
| ------------------------------- | ----------------- |
| `git stash`                     | 储藏已跟踪文件中的暂存与未暂存修改 |
| `git stash push -m "说明"`        | 创建带备注的储藏记录        |
| `git stash push -u -m "说明"`     | 储藏修改，同时包含未跟踪文件    |
| `git stash list`                | 查看全部 Stash 记录     |
| `git stash show 'stash@{0}'`    | 查看指定储藏的修改统计       |
| `git stash show -p 'stash@{0}'` | 查看指定储藏的完整 Diff    |
| `git stash apply`               | 恢复最新储藏，不删除储藏记录    |
| `git stash pop`                 | 恢复最新储藏，成功后删除该记录   |
| `git stash apply 'stash@{1}'`   | 恢复指定的储藏记录         |
| `git stash apply --index`       | 恢复修改，并尝试恢复原有暂存状态  |
| `git stash drop 'stash@{0}'`    | 删除指定储藏记录          |
| `git stash clear`               | 清空所有储藏记录          |
| `git stash push -p`             | 交互式选择需要储藏的修改片段    |
| `git stash push -- File.cs`     | 仅储藏指定文件的修改        |

### 10.3 Apply 与 Pop

可以近似理解为：

**`git stash pop` = `git stash apply` + 成功后 `git stash drop`**

二者区别：

| 操作        | Apply | Pop     |
| --------- | ----- | ------- |
| 恢复修改      | 是     | 是       |
| 成功后自动删除储藏 | 否     | 是       |
| 保留备份      | 是     | 否       |
| 恢复发生冲突时   | 记录保留  | 通常也保留记录 |

初学时建议先使用 `apply`，确认内容恢复成功以后再执行 `drop`。

### 10.4 使用示例

假设正在开发 Feature A，突然需要修复其他问题。

1. `git stash push -u -m "WIP: Feature A"`
2. `git switch develop`
3. 处理其他任务。
4. `git switch feature/A`
5. `git stash apply 'stash@{0}'`
6. `git status`
7. 确认无误后执行 `git stash drop 'stash@{0}'`

注意事项：

- Stash 采用后进先出顺序，最新记录通常是 `stash@{0}`。
- 删除某条记录后，其他记录的编号可能变化。
- PowerShell 中建议给 `stash@{0}` 加单引号。
- 默认 Stash 不包含未跟踪文件；`-u` 包含未跟踪文件，但不包含被忽略文件。
- Stash 可跨分支恢复，但可能发生冲突。
- 不同 Git 仓库的 Stash 相互独立。
- Stash 适合短期保存，长期保存开发进度更推荐 Commit。

---

## 11. Feature、Fix 与 Commit 的组织原则

### 11.1 基本原则

在团队协作中，需要区分三个层次：

| 概念               | 作用               |
| ---------------- | ---------------- |
| Feature / Fix 分支 | 隔离一个开发任务的修改      |
| Commit           | 保存一次具有明确意义的代码变更  |
| Merge Request    | 将一组修改作为整体提交审查和合并 |

**一个 MR 可以包含多个 Commit，一个 Feature 也可以包含多个子功能。**

一个任务是否需要独立 MR，主要取决于它能否独立审查、测试和交付，而不是单纯根据修改文件的数量判断。

### 11.2 开发过程中发现 Bug

| Bug 情况                       | 推荐处理                   |
| ---------------------------- | ---------------------- |
| 属于当前 Feature 或由当前 Feature 引入 | 在当前 Feature 分支修复       |
| 不属于 Feature，也不阻塞开发           | 先登记 Bug，之后创建独立 Fix 分支  |
| 不属于 Feature，但阻塞当前开发          | 暂停当前任务，优先通过独立 Fix 分支修复 |
| Bug 很小，且是完成当前功能的必要前提         | 可根据团队约定纳入当前 MR         |
| 不相关 Bug 需要紧急修复               | 优先独立处理，目标分支取决于项目发布策略   |

### 11.3 实际案例：导入功能

上午完成“导入用户配置”，并创建 Commit。

下午开发“导入数据”时，发现上午的实现会 Dispose 已有窗口，引发黑屏问题。

如果两个功能按团队要求放在同一个 Feature、同一个 MR 中，可以采用：

1. Commit 1：`feat: 支持导入用户配置`
2. Commit 2：`fix: 修复导入配置后窗口显示异常`
3. Commit 3：`feat: 支持导入数据`

下午尚未提交的代码可以先通过 Stash 保存，修复上午的 Bug 并独立 Commit，再恢复下午的工作。

这样既符合团队的 MR 约定，也保留了清晰的提交记录。

**不同 Commit 不等于不同 MR。**

如果某个无关 Bug 只是单独做成一个 Commit，但仍然放在 Feature 分支中，那么 Feature 的 MR 通常也会包含这个 Bug 修复。

---

## 12. 将部分修改转移到其他分支

### 12.1 场景

假设在 `feature/A` 中同时存在两组未提交修改：

- 修改 A：应该保留在 `feature/A`。
- 修改 B：应该单独放在 `fix/B`。

Git 支持通过选择性 Stash，将两组修改分别恢复到不同分支。

### 12.2 两次 Stash 的方法

假设两组修改位于不同文件。

**第一步：分别储藏**

`git stash push -u -m "修改B" -- BugFile.cs`

`git stash push -u -m "修改A" -- FeatureFile.cs`

执行 `git stash list` 后，通常得到：

- `stash@{0}`：修改 A
- `stash@{1}`：修改 B

**第二步：创建独立 Fix 分支**

1. `git switch develop`
2. `git pull --ff-only`
3. `git switch -c fix/B`
4. `git stash apply 'stash@{1}'`

检查修改无误后，对 B 进行 Commit。

然后删除 B 对应的 Stash。

**第三步：恢复原来的 Feature**

1. `git switch feature/A`
2. `git stash list`
3. `git stash apply 'stash@{0}'`
4. 检查并确认修改。
5. 删除已恢复的 Stash。

### 12.3 不同情况的推荐方案

| 场景                | 推荐工具                      |
| ----------------- | ------------------------- |
| 两组修改都没有 Commit    | 选择性 Stash                 |
| 两组修改位于同一个文件       | `git stash push -p` 或手动拆分 |
| A 已完成，可以 Commit   | Commit A，只 Stash B        |
| 修改 B 已经是独立 Commit | `git cherry-pick`         |
| 长期并行开发多个分支        | `git worktree`            |

注意：

`git cherry-pick <commit-id>` 会将某个 Commit 的修改应用到当前分支，通常产生一个新的 Commit，但不会自动删除原分支中的提交。

`git worktree` 可以让同一仓库拥有多个独立工作目录，但不会自动拆分已有修改。

如果 Fix 需要独立提交 MR，通常应该从正确的开发基线（例如 `develop`）创建，而不是直接继承当前 Feature 的历史。

---

## 13. Git Index 与重复 Add

### 13.1 为什么同一个文件会同时出现已暂存和未暂存修改？

Git 管理着三个不同状态：

| 区域                | 含义                   |
| ----------------- | -------------------- |
| HEAD              | 最新提交保存的文件状态          |
| Index（暂存区）        | 下一次 Commit 准备提交的文件状态 |
| Working Tree（工作区） | 当前磁盘上的实际文件           |

例如：

| 操作            | HEAD | Index | 工作区 |
| ------------- | ---- | ----- | --- |
| 初始状态          | A    | A     | A   |
| 修改文件          | A    | A     | B   |
| 第一次 `git add` | A    | B     | B   |
| 文件再次修改        | A    | B     | C   |
| 第二次 `git add` | A    | C     | C   |

因此，第一次 Add 后，如果脚本或编辑器继续修改文件，Git Status 就可能在已暂存和未暂存区域同时显示同一个文件。

### 13.2 为什么重复 Add 不会产生 Merge Conflict？

因为 `git add` 的作用是更新 Index 中的文件内容，而不是尝试合并两个独立开发历史。

简单区别：

| 命令                | 核心行为          |
| ----------------- | ------------- |
| `git add`         | 更新暂存区的文件状态    |
| `git commit`      | 将暂存区保存为新提交    |
| `git merge`       | 整合不同的提交历史     |
| `git rebase`      | 将提交重新应用到新的基础上 |
| `git stash apply` | 尝试恢复储藏的修改     |

通常只有需要整合不同修改、且无法自动判断结果的操作，才可能产生需要手动解决的代码冲突。

推荐在提交前执行：

1. `git status`
2. `git diff --cached`
3. `git commit -m "..."`

确认 Index 中保存的内容符合预期。

---

## 14. LF、CRLF 与 Git 换行符规范化

### 14.1 基本概念

| 换行格式 | 字符     | 常见环境            |
| ---- | ------ | --------------- |
| LF   | `\n`   | Linux、Unix      |
| CRLF | `\r\n` | Windows         |
| CR   | `\r`   | 早期 Macintosh 系统 |

Git 可以根据配置，在文件加入 Index 或检出到工作区时进行换行符转换。

### 14.2 core.autocrlf

通过以下命令查看配置：

`git config --get core.autocrlf`

| 配置      | 主要行为                                     |
| ------- | ---------------------------------------- |
| `true`  | 通常提交时规范化文本为 LF，检出时转换为 CRLF               |
| `input` | 提交时规范化为 LF，检出时不主动转成 CRLF                 |
| `false` | 不由此选项进行自动转换，仍可能受到 `.gitattributes` 等规则影响 |

最终行为还受 `.gitattributes`、文件是否被识别为文本以及仓库原有内容影响。

### 14.3 LF will be replaced by CRLF

警告示例：

`LF will be replaced by CRLF the next time Git touches it`

它表示当前工作区的换行符状态与 Git 的检出转换规则不同。

它不是 Merge Conflict，也不意味着代码提交失败。

在 `core.autocrlf=true` 且文本规范化正常工作的情况下：

- Git Index 中通常存储 LF。
- Windows 工作区可以使用 CRLF。
- 仅仅改变物理文件的 LF/CRLF，不一定会在 Git Diff 中产生差异。

### 14.4 常用检查命令

| 命令                               | 用途                        |
| -------------------------------- | ------------------------- |
| `git config --get core.autocrlf` | 查看当前换行符转换配置               |
| `git ls-files --eol -- File.cs`  | 查看指定文件在 Index 和工作区中的换行符状态 |
| `git diff --ignore-cr-at-eol`    | 忽略行尾 CR 差异进行比较            |
| `git diff --cached`              | 查看规范化后准备提交的实际变更           |

例如：

`i/lf w/crlf attr/ SubFormScope.cs`

表示：

- `i/lf`：Index 中为 LF。
- `w/crlf`：工作区中为 CRLF。
- `attr/`：没有显示明确的换行属性。

如果 `git ls-files --eol` 没有输出，应先检查是否进入了正确的 Git 仓库，以及指定文件是否已被 Git 跟踪。

**注意：Git Diff 的文本比较结果，不一定反映工作区文件的真实换行字节。** 如果项目另有严格的换行符检查脚本，还需要遵循项目规范。

---

## 15. 查看指定分支历史与上游关系

### 15.1 查看指定分支 Commit

| 命令                                           | 用途                           |
| -------------------------------------------- | ---------------------------- |
| `git log develop`                            | 查看本地 develop 的提交历史           |
| `git log origin/develop`                     | 查看远程跟踪分支的历史                  |
| `git log feature/xxx --oneline`              | 简洁查看指定分支的历史                  |
| `git log feature/xxx --oneline -10`          | 查看指定分支最近 10 个 Commit         |
| `git log develop..feature/xxx --oneline`     | 查看 Feature 可达、develop 不可达的提交 |
| `git log origin/develop..HEAD --oneline`     | 查看当前分支中远程 develop 尚未包含的提交    |
| `git log --all --oneline --graph --decorate` | 查看本地所有已知引用可达的提交关系图           |

`git log A..B` 表示显示从 B 可达、但从 A 不可达的提交。

需要注意：`git log` 中的 `A..B` 与 `git diff` 中的 `A...B` 是不同操作，不应混为一谈。

### 15.2 查看上游分支

| 命令                                                              | 用途               |
| --------------------------------------------------------------- | ---------------- |
| `git branch -vv`                                                | 查看本地分支及其上游关系     |
| `git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'` | 查看当前分支配置的上游      |
| `git branch --set-upstream-to=origin/feature/xxx`               | 将当前分支关联到已有远程跟踪分支 |
| `git push -u origin feature/xxx`                                | 推送分支并设置上游关系      |

例如：

`* feature/monitor-basic 42b3fb3 refactor: 提取公共创建页面方法`

这行没有 `[origin/...]`，通常说明当前分支没有配置上游。

如果已经配置，则可能显示：

`* feature/monitor-basic 42b3fb3 [origin/feature/monitor-basic] refactor: 提取公共创建页面方法`

需要区分：

**没有设置上游，不代表远程一定不存在同名分支。**

---

## 16. 将 develop 的更新同步到未合并的 Fix 分支

### 16.1 实际场景

从 `develop` 创建 `fix/terminal-command-caret` 并 Push。

之后其他人的修改已经合入远程 `develop`，但当前 Fix 还没有合并。

现在希望继续在 Fix 上开发，同时获取最新的 develop 代码。

### 16.2 推荐方式：Merge

在工作区干净的前提下：

1. `git switch fix/terminal-command-caret`
2. `git fetch origin`
3. `git merge origin/develop`
4. 检查合并结果。
5. `git push`

其中：

`git merge origin/develop`

含义是把远程跟踪分支 `origin/develop` 的历史与修改整合进当前 Fix 分支。

它不会直接修改远程 develop，也不会把 Fix 提前合并到 develop。

### 16.3 Fetch 的执行范围

`git fetch origin` 默认按远程仓库的 Fetch 配置更新相关远程跟踪引用。

| 操作                                 | 影响范围                               |
| ---------------------------------- | ---------------------------------- |
| 在 `mmi-main` 执行 `git fetch origin` | 更新该本地仓库中 origin 的远程跟踪信息            |
| 在 `mmi-lib-scope-realtime` 执行      | 更新另一个独立仓库                          |
| 切换本地分支                             | 不要求每次重新 Fetch                      |
| 执行 `git fetch origin`              | 不会自动把本地 develop 移动到 origin/develop |
| 执行 `git merge origin/develop`      | 把所获取的 develop 历史合并进当前分支            |

因此通常是：**每个仓库根据需要 Fetch，而不是每个分支都 Fetch 一次。**

### 16.4 Merge 与 Rebase

| 对比           | Merge             | Rebase                |
| ------------ | ----------------- | --------------------- |
| 原有 Commit ID | 保留                | 被重放的 Commit 通常会产生新 ID |
| 分叉历史         | 通常产生 Merge Commit | 将提交重放到新基线             |
| 是否可能冲突       | 是                 | 是                     |
| 已经 Push 的分支  | 通常可以正常 Push       | 可能需要谨慎强制推送            |
| 初学阶段推荐       | 优先使用              | 理解历史重写后再使用            |

对于已经 Push 的 Fix 分支，日常同步 develop 时，通常优先选择 Merge，除非团队明确采用 Rebase 工作流。

---

## 17. Merge Commit 与 Vim 编辑器

### 17.1 为什么 Merge 后会进入 Vim？

执行：

`git merge origin/develop`

当 Git 需要创建 Merge Commit 时，可能自动打开所配置的文本编辑器，要求确认提交信息。

例如：

`Merge remote-tracking branch 'origin/develop' into fix/terminal-command-caret`

这不是报错。

如果没有冲突，并且不需要修改提交信息，可以直接保存退出。

### 17.2 Vim 常用操作

| 操作              | 按键或命令                                |
| --------------- | ------------------------------------ |
| 退出当前编辑模式        | `Esc`                                |
| 保存并退出           | `Esc` → `:wq` → Enter                |
| 放弃编辑器中的修改并退出    | `Esc` → `:q!` → Enter                |
| 以后合并时不打开提交信息编辑器 | `git merge origin/develop --no-edit` |
| 中止尚未完成的 Merge   | `git merge --abort`                  |

注意：退出 Vim 不等于取消 Merge。是否产生了 Commit、Merge 是否仍在进行，应通过 `git status` 检查。

`--no-edit` 仅表示接受默认的 Merge Commit 信息，不会跳过可能出现的冲突。

---

## 18. Git Log 图形化与引用标记

### 18.1 常用显示参数

| 参数              | 作用                           |
| --------------- | ---------------------------- |
| `--oneline`     | 每个 Commit 使用简短的一行显示          |
| `--graph`       | 绘制 ASCII 提交关系图               |
| `--decorate`    | 显示 Commit 对应的分支、Tag、HEAD 等引用 |
| `--no-decorate` | 不显示分支等引用信息                   |
| `--all`         | 显示本地所有已知引用可达的提交历史            |
| `-8`            | 最多输出 8 个 Commit              |

推荐组合：

`git log --oneline --graph --decorate -15`

在现代 Git 中，`--decorate` 通常已经会在交互式终端中自动启用，因此加上该参数可能看不出差异。

### 18.2 Graph 的作用

普通 `git log` 主要按顺序展示提交。

添加 `--graph` 后，可以看到提交之间的分叉与合并关系：

- `*`：一个 Commit。
- `|`：提交历史的连接线。
- `/`、`\`：提交路径的分叉或汇合。
- 多条并行线：表示同时存在不同的提交路径。

需要注意：图形显示的是 Commit 的父子关系，并不是单纯把每个分支画成固定的一条线。

### 18.3 Commit 后面的彩色标记

Git 默认主题中常见的配色如下：

| 颜色   | 常见含义            |
| ---- | --------------- |
| 黄色   | Commit 哈希       |
| 绿色   | 本地分支            |
| 红色   | 远程跟踪分支          |
| 青色   | HEAD            |
| 其他颜色 | Tag 或其他引用，视配置而定 |

这些只是常见的配色方案，可以通过 Git 配置修改。

Graph 中的彩色连接线主要用于区分提交路径，并不表示某条线固定属于某个分支。

### 18.4 一个 Commit 为什么有多个分支名称？

例如：

`1371f43 (origin/develop, origin/HEAD, develop)`

表示三个引用当前都指向同一个 Commit：

| 引用               | 说明                    |
| ---------------- | --------------------- |
| `develop`        | 本地 develop 分支         |
| `origin/develop` | 本地记录的远程 develop 状态    |
| `origin/HEAD`    | 指向 origin 默认分支的本地符号引用 |

其中 `origin/HEAD` 和 `HEAD` 不是一回事。

- `HEAD`：当前检出位置，通常指向当前本地分支。
- `origin/HEAD`：本地记录的 origin 默认分支引用。

Git 的分支本质上是指向 Commit 的可移动引用，因此多个分支指向同一个 Commit 完全正常。

### 18.5 Merge 后的真实案例

在 `fix/terminal-command-caret` 执行 `git merge origin/develop` 后，出现：

`4413123 (HEAD -> fix/terminal-command-caret) Merge remote-tracking branch 'origin/develop' into fix/terminal-command-caret`

同时：

`1371f43 (origin/develop, origin/HEAD, develop) Merge branch 'feature/realtime-acquisition-optimization' into 'develop'`

说明：

1. 当前 Fix 分支指向新的 Merge Commit `4413123`。
2. `develop` 和 `origin/develop` 仍然指向 `1371f43`。
3. Fix 已经将 develop 的更新整合到自身。
4. develop 不会因为这次 Merge 而移动。
5. 需要执行 `git push` 才能把新的 Fix 提交上传到 GitLab。

---

## 19. 本次学习的核心结论

| 场景                        | 推荐工具或命令                                              |
| ------------------------- | ---------------------------------------------------- |
| 把全部未提交修改交给 AI             | `git diff HEAD --output=../review.diff`              |
| 导出 Feature 相对 develop 的差异 | `git diff origin/develop...HEAD --output=../mr.diff` |
| 临时保存工作进度                  | `git stash push -u -m "说明"`                          |
| 恢复储藏但保留备份                 | `git stash apply`                                    |
| 只储藏部分修改                   | `git stash push -p`                                  |
| 把未提交修改移动到其他分支             | 选择性 Stash                                            |
| 将独立 Commit 复制到其他分支        | `git cherry-pick`                                    |
| 一个 Feature 中发现自身 Bug      | 当前分支单独修复并 Commit                                     |
| 区分已暂存和未暂存修改               | `git status`、`git diff`、`git diff --cached`          |
| 检查换行符                     | `git ls-files --eol`                                 |
| 查看分支历史                    | `git log <分支名> --oneline`                            |
| 查看当前分支的上游关系               | `git branch -vv`                                     |
| 更新远程分支信息                  | `git fetch origin`                                   |
| 将最新 develop 整合进当前分支       | `git merge origin/develop`                           |
| 查看分支关系图                   | `git log --oneline --graph --decorate`               |
| 检查当前分支有哪些未进入 develop 的提交  | `git log origin/develop..HEAD --oneline`             |

---

## 20. 后续待学习内容

- Merge Conflict 的实际解决过程
- Merge 与 Rebase 的内部原理
- Cherry-pick 的完整操作案例
- Git Worktree 的使用方法
- Reset、Restore、Revert 的详细区别
- Commit Amend 与修改历史
- Reflog 与误操作恢复
- Stash 冲突解决和部分修改恢复
- `.gitattributes` 与跨平台换行符管理
- GitLab MR 中的 Squash、Merge Commit 与 Fast-forward
- 多仓库开发时的版本依赖与提交组织

---

*本次补充重点：理解 Git 的状态管理、历史管理和分支协作，而不仅仅是记忆命令。具体操作应结合工作区状态、分支关系以及团队约定进行判断。*

这次实际上有三个非常关键的知识进展：

- 文件层面：理解了工作区、Index、Commit 之间的关系，以及 Stash、Diff、Add 分别在操作什么。
- 分支层面：理解了一个 Feature 可以有多个 Commit，怎样隔离 Bug，以及如何把修改转移或同步到其他分支。
- 历史层面：通过你实际执行的 Merge，看懂了 Merge Commit、HEAD、远程跟踪分支和 Git Graph。

下一阶段值得深入的:
- Merge Conflict
- Rebase
- Cherry-pick