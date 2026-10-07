---
title: "如何添加一篇笔记"
description: "通过本地 Markdown 文件维护文章，自动生成列表和独立页面。"
date: 2026-10-07
tags: [Astro, Markdown]
---

## 创建文章

在 `src/content/notes/` 下新建 `.md` 文件，例如 `my-first-note.md`。
默认地址由文件名生成：`/notes/my-first-note/`。子目录也会保留在地址中。

在文件开头填写 frontmatter：

```yaml
---
title: "我的第一篇笔记"
description: "简要介绍这篇文章的内容。"
date: 2026-10-07
tags: [学习, 实践]
---
```

`title`、`description` 和 `date` 必填；`tags` 可以省略，默认为空列表。
日期建议使用 `YYYY-MM-DD`，页面按 UTC 日期显示，列表按日期从新到旧排序。

## 编写正文

正文支持标题、列表、链接、引用、表格、行内代码和代码块。
文章标题已经显示在页面顶部，正文建议从二级标题开始。

给代码块标注语言即可启用语法高亮：

```javascript
const message = 'Hello, Notes!';
console.log(message);
```

长代码行可以横向滚动，避免撑宽页面。

## 本地验证

```bash
npm run build
```

构建时，Astro 会校验 frontmatter，并自动生成所有文章页面。
缺少必填字段或日期无效时，构建会报错。

> 内容保存在仓库中，和网站代码一起通过 Git 管理。

更多语法示例见 [Markdown 排版示例](/notes/markdown-reference/)。
