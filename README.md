# 人工智能公开课

这套课程采用“一节 Markdown + 一份原始飞书课件”的结构。VitePress 提供学习路径、结构化讲义、独立图解和视频；页面右上角的“幻灯片”直接打开对应飞书 Web PPT，由飞书负责展示、播放和编辑。项目不再生成课程 PPT。

## 课程结构

课程共 4 章、27 节：

1. 人工智能概述：7 节
2. AI 智能体：5 节
3. 具身智能：6 节
4. 行业应用：9 节

飞书知识库入口：[ai-course](https://xmu-mars.feishu.cn/wiki/IiPBwpu15iC7TwkW2vVcOqconff)

课程目录入口：[人工智能公开课](https://xmu-mars.feishu.cn/wiki/Z7U2wOUmrisiENkU7O9cBAPxnTd)

每节的 Markdown、原始飞书课件链接和本地 PPTX 来源统一记录在 [`课程PPT框架/source/course-catalog.json`](课程PPT框架/source/course-catalog.json)。

## 维护约定

- 新增课程：先在飞书整理已有原始课件，再建立对应 Markdown 和课程清单映射；不要由仓库脚本生成 PPT。
- 修改课程：在飞书精修原始课件，再依据本地同步 PPTX 更新 Markdown；网页图解、视频或代码如有变化，一并更新对应资产。
- 删除课程：同时处理导航、Markdown、课程清单映射和飞书原始课件。
- 飞书精修完成后，可让 Codex根据相同课程 ID 更新 Markdown 或网站代码。
- 公开分享属于单独的发布步骤，必须在内容、版权、隐私与访问范围验收后确认。

## 常用命令

```bash
pnpm install
pnpm generate
pnpm verify
pnpm dev
```

原始课件核验：

```bash
pnpm courseware:verify

# 同时核对飞书上的 27 个真实节点
pnpm courseware:verify:remote
```

核验命令只读取本地源文件和飞书节点，不创建、覆盖或重生成 PPT。

## 媒体边界

- 网站保留 25 个独立课程视觉单元和 9 个独立视频；它们与飞书课件播放互不依赖。
- 禁止把整张幻灯片或 PDF 页面作为图片嵌入网页，也不维护浏览器内嵌 PPT 播放器。
- 课堂播放直接在飞书 Web PPT 中进行，网站只提供链接。

## 验证

`pnpm verify` 会检查：

- 27 节课程均有唯一的原始飞书课件链接和本地 PPTX 来源；
- 每篇 Markdown 注入了正确的链接；
- WPS、Office Embed、模块 PPTX 等旧播放器运行路径已经移除；
- 25 个图解和 9 个视频仍可追溯并通过哈希、尺寸与页面结构检查；
- 课程语言、隐私信息、内容质量与 VitePress 构建通过。

## 权利说明

课件来自团队课程与项目素材。公开发布前仍需逐项核对第三方图片、字体、论文图、产品截图、人物影像与视频授权。技术验证与飞书播放成功不等于自动完成内容权利审核。
