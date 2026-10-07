---
title: "Markdown 排版示例"
description: "常用 Markdown 语法与代码块的显示示例。"
date: 2026-10-06
tags: [Markdown]
---

## 列表与链接

- 用列表组织并列的信息。
- 用 **粗体** 强调关键词，或使用 *斜体*。
- 用 `inline code` 表示命令和标识符。

1. 编写 Markdown。
2. 运行构建。
3. 查看生成的文章页面。

参考 [Astro Content Collections 文档](https://docs.astro.build/en/guides/content-collections/)。

## 代码块

```typescript
interface Note {
  title: string;
  tags: string[];
}

const note: Note = { title: 'Markdown 排版示例', tags: ['Markdown'] };
```

未标注语言的代码块也能正常显示：

```
src/content/notes/
  writing-notes.md
  markdown-reference.md
```

## 表格与引用

| 字段 | 用途 |
| --- | --- |
| title | 文章标题 |
| description | 列表摘要和页面描述 |
| date | 发布日期和排序 |
| tags | 文章标签 |

> 从一篇小笔记开始，逐步积累文档。
