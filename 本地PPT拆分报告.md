# 本地 PPT 拆分报告

## 结果

- 公开课程保持 4 章、27 节结构。
- 每节已生成一份独立、可编辑的 PPTX，与 Markdown 目录同构。
- 课件由现有 PowerPoint 原稿选页复制，不重做内容，不把整页幻灯片栅格化。
- 已排除明确的个人联系页、答辩结束页和与本节无关页面。
- 27 份发布课件总计约 299 MiB，单文件最大约 50 MiB。

## 目录

```text
docs/
├── zh-cn/
│   ├── stage-1/<lesson>/index.md
│   ├── stage-2/<lesson>/index.md
│   ├── stage-3/<lesson>/index.md
│   └── stage-4/<lesson>/index.md
└── public/course-slides/
    ├── stage-1/<lesson>/slides.pptx
    ├── stage-2/<lesson>/slides.pptx
    ├── stage-3/<lesson>/slides.pptx
    └── stage-4/<lesson>/slides.pptx
```

## 验证

`pnpm courseware:verify` 会检查 27 份课件的唯一映射、PPTX ZIP 完整性、页数、文件体积和孤儿课件。`pnpm verify` 继续检查 Markdown、媒体、隐私、语言和站点构建。
