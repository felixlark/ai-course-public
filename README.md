# 人工智能公开课

这套课程采用“一节 Markdown + 一份本地 PPTX”的结构。VitePress 提供学习路径、结构化讲义、独立图解和视频；页面右上角的“幻灯片”直接打开或下载对应的 PPTX。

## 课程结构

课程共 4 章、27 节：

1. 人工智能概述：7 节
2. AI 智能体：5 节
3. 具身智能：6 节
4. 行业应用：9 节

每节的 Markdown、发布 PPTX、本地原稿和选页范围统一记录在 [`课程PPT框架/source/course-catalog.json`](课程PPT框架/source/course-catalog.json)。

## 维护约定

- 新增课程：建立 Markdown，从本地原稿选页生成对应 PPTX，并更新课程清单与导航。
- 修改课程：同步修改 Markdown 和本节 PPTX；若原稿页码变化，同步更新 `source_slides`。
- 删除课程：同时处理导航、Markdown、发布 PPTX 和课程清单。
- 不维护浏览器内嵌 PPT 播放器，也不把整页幻灯片转成图片发布。

## 常用命令

```bash
pnpm install --frozen-lockfile
pnpm generate
pnpm courseware:verify
pnpm verify
pnpm dev
```

需要从本地原稿重新拆分课件时：

```bash
pnpm courseware:build
```

## 验证

`pnpm verify` 会检查：

- 27 篇 Markdown 与 27 份 PPTX 一一对应；
- 课件链接唯一、ZIP 结构完整、页数与选页范围一致，且单文件小于 95 MiB；
- WPS、Office Embed、云课件与旧播放器路径已移除；
- 独立图解、视频、课程语言、隐私信息、内容质量与 VitePress 构建通过。

## 权利说明

课件来自团队课程与项目素材。公开发布前仍需逐项核对第三方图片、字体、论文图、产品截图、人物影像与视频授权。
