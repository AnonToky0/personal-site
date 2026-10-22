---
title: "Diff、文件跟踪与换行符：看清一次修改"
description: "区分工作区、暂存区和分支差异，正确导出 Diff，理解未跟踪文件、忽略规则与 LF/CRLF 规范化。"
date: 2026-10-12
tags: ["Git", "Diff", "文件管理"]
---

执行 `git diff` 没有输出，不一定表示项目没有变化。可能变化已经进入暂存区，也可能新文件还没有被跟踪。每次比较前，先问：两端分别是哪份内容？

## 1. 三种日常比较

| 命令 | 比较方向 | 回答的问题 |
| --- | --- | --- |
| `git diff` | Index → 工作区 | 哪些已跟踪修改还没 Add？ |
| `git diff --cached` | HEAD → Index | 下一次普通 Commit 会改变什么？ |
| `git diff HEAD` | HEAD → 工作区 | 相对最近提交，当前内容总共改变了什么？ |

第三条显示的是两端的净差异，并不是把前两条输出机械拼接。如果 Add 后又把工作区改回 HEAD 的内容，总 Diff 可以为空，但暂存区仍然有待提交变化。

```powershell
git status --short
git diff --stat
git diff --cached --name-status
git diff -- src/content/notes
```

短状态的前两列分别表示暂存区状态和工作区状态；`??` 表示未跟踪路径。

## 2. 新文件为什么没有进入 Diff

普通 Diff 不会直接列出未跟踪文件的内容。先检查 `git status --short`，再选择是否正式 Add。

仅想审查一个新文件时，可以显式记录 intent-to-add：

```powershell
git add -N -- new-note.md
git diff -- new-note.md
```

`-N` 会改变 Index 状态，但不会把新文件的实际内容正式暂存。它也不是长期保存文件的方式；准备提交时仍应正常 Add，再检查暂存区。

不要为了导出 Diff，未经检查就把整个目录所有新文件加入暂存区。

## 3. 导出给自己或审查工具

在仓库根目录执行：

```powershell
git diff HEAD --output=../review.diff
git diff --cached --output=../staged.diff
git --no-pager diff HEAD
```

`--output` 直接让 Git 写文件，避免不同 PowerShell 版本的重定向编码差异；同名输出文件会被覆盖。最后一条关闭 Git 分页器，但终端滚动缓冲区仍可能截断可见内容。

`review.diff` 是 HEAD 到工作区的净差异，不包含未跟踪文件，也不包含已经提交的功能历史。默认补丁对于二进制文件未必包含可重建内容；需要可应用的二进制补丁时再考虑 `--binary`。导出文件也不能代替包含未跟踪和忽略文件的完整备份。

导出普通非合并提交引入的修改：

```powershell
git show --format= --output=../last-commit.diff HEAD
```

合并提交有多个父提交，不能默认把它当成单父提交补丁；需要先决定与哪个父提交比较。

## 4. 两点和三点：分支审查的区别

假设开发已经分叉：

```text
      B---C  main
     /
A---+
     \
      D---E  feature/demo
```

| 命令 | 含义 |
| --- | --- |
| `git diff main HEAD` | 比较 main 当前快照与 HEAD 快照 |
| `git diff main..HEAD` | 对 Diff 而言，与上一条相同 |
| `git diff main...HEAD` | 比较共同祖先 A 与 HEAD 快照 E |

三点 Diff 适合检查功能分支从共同基线以来的净变化：

```powershell
git fetch origin
git diff origin/main...HEAD --output=../feature-review.diff
```

这里假设目标分支是 `main`；团队目标是 `develop` 时，应替换为 `origin/develop`。它只比较已提交内容，不会额外纳入未提交修改。平台 MR / PR 的实际比较还取决于目标分支、合并方式和平台行为。

`git log A..B` 则是在选择提交集合，不能直接照搬 Diff 的解释，详见 [分支与提交历史](/notes/git/03-git-branch/)。

## 5. 忽略与停止跟踪

`.gitignore` 主要影响未跟踪文件的发现和添加，不会自动停止跟踪已入库文件。

假设个人发布配置已经被跟踪，先在 `.gitignore` 中增加对应规则，再执行：

```powershell
git rm --cached -- local-settings.json
git diff --cached
```

这会在 Index 中记录移除，保留当前磁盘文件。提交后，仓库新版本不再包含它；其他人同步这次删除时，行为受其本地状态影响，不能把“保留我的本地文件”理解成对所有人的保证。

如果文件曾包含密码，仅停止跟踪不会清除旧提交里的内容。应先更换泄露凭据，再根据项目要求处理历史。

## 6. LF、CRLF 与 Index

| 形式 | 字节表示 | 常见使用环境 |
| --- | --- | --- |
| LF | `\n` | Unix 风格文本 |
| CRLF | `\r\n` | Windows 风格文本 |

Git 可以在 Add 时规范化文本，在检出时按规则生成工作区换行。因此，磁盘字节与 Index 中字节可能不同，但 Git 仍认为内容没有变化。

```powershell
git config --show-origin --get core.autocrlf
git ls-files --eol -- lesson.txt
git check-attr text eol -- lesson.txt
```

`i/lf w/crlf` 表示 Index 是 LF、工作区是 CRLF。

| `core.autocrlf` | 主要行为 |
| --- | --- |
| `true` | 对按规则处理的文本进行 LF 规范化，并通常以 CRLF 检出 |
| `input` | 入库时进行 LF 规范化，不主动转成 CRLF 检出 |
| `false` | 不由此选项自动转换，仍可能受属性规则影响 |

最终行为还取决于 `.gitattributes`、文本识别和仓库已有内容。`LF will be replaced by CRLF` 是转换规则提示，不是合并冲突。

## 7. 用项目规则减少环境差异

团队可以在 `.gitattributes` 中明确约定，例如：

```text
* text=auto
*.md text eol=lf
*.sh text eol=lf
*.bat text eol=crlf
```

这是示例，不能未经评估就当作所有仓库的标准。对已有仓库引入规则后，如果决定重新规范化，应在干净工作区单独处理：

```powershell
git add --renormalize .
git diff --cached --stat
git diff --cached
```

该操作会更新暂存区，应把规范化变更与业务修改分开审查。`git diff --ignore-cr-at-eol` 适合辅助判断行尾噪声，不会修复文件，也不能证明所有差异都只有换行符。

## 8. Status 显示修改，Diff 却没有输出

先判断修改位于哪一层，不要立刻归因于换行符：

```powershell
git status --short
git diff -- lesson.txt
git diff --cached -- lesson.txt
git ls-files --eol -- lesson.txt
git check-attr text eol -- lesson.txt
```

变化可能已经暂存；也可能与文件模式、过滤器或规范化状态有关。`i/lf w/crlf` 本身只描述原始换行格式，不足以证明异常，更不表示必须把两边字节改成一样。

如果已确认规则正确、需要重新按规则刷新指定已跟踪文件的 Index，可以执行：

```powershell
git add --renormalize -- lesson.txt
git status
git diff --cached -- lesson.txt
```

它重新处理文件并更新 Index，不直接重写工作区文件。规范化结果与 HEAD 相同，可能不会形成待提交差异；如果仍有变化，就必须检查变化内容。真实业务修改也会被纳入该路径的暂存快照，因此不能把它当成无条件的“清理状态”命令。

换行转换主要发生在加入 Index 和检出等流程，Push 不会替你修复换行格式。

## 实践与思考

1. 新增未跟踪文件，确认普通 Diff 和 Status 的区别。
2. 对同一文件分别制造已暂存和未暂存修改，预测三个 Diff 的输出。
3. 在两个分叉分支中比较两点与三点 Diff，解释为什么基线更新可能只出现在两点比较中。
4. 为什么 `.gitignore` 加了规则，已经入库的文件仍有修改记录？
5. 为什么 Git Diff 没有变化，磁盘上的换行字节却可能不同？

## 延伸阅读

- [Git Diff 官方文档](https://git-scm.com/docs/git-diff)
- [Git Attributes 官方文档](https://git-scm.com/docs/gitattributes)

## 系列导航

- [学习路线与完整目录](/notes/git/00-learning-roadmap/)
- [上一章：工作区、暂存区与提交](/notes/git/01-git-introduction/)
- [下一章：分支、HEAD 与提交历史](/notes/git/03-git-branch/)
