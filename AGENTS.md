# AI Course Agent Rules

## 一课一文档课程契约

- 每一节 mini course 必须同时对应一个 Markdown 文件和一份原始飞书课件；课程清单中的 `slides.url`、`slides.wiki_url` 与 `slides.local_pptx` 是云端课件、本地源文件和讲义之间的唯一映射。
- VitePress 只负责课程导航、讲义、独立图解和视频。“幻灯片”按钮必须直接打开该节的飞书 Web PPT，不得重新实现、内嵌或模拟幻灯片播放器。
- 新增、删除或修改课程时，必须同步维护 Markdown、原始飞书课件、`course-catalog.json` 和必要的导航；不得由代码重新生成课程 PPT，也不保留 WPS、Office Embed 或模块级播放器兼容路径。
- Markdown 可以保留独立图片、原生 SVG 图解和独立视频，但严禁把 PPT/PDF 整页渲染为 PNG、JPEG、WebP 或页面图后发布。
- PPT 内容只在飞书原始课件中精修与课堂播放；本地 PPTX 是课程文档提取来源，不进入 GitHub Pages 发布包。
- 发布前必须验证 27 节链接唯一、Markdown/原始课件一一对应、网页不存在旧播放器或 PPT 生成脚本、独立媒体完整且不存在整页 slide raster。

## 预览验收

- 完成网页课程、PPT 框架、课程内容或可视化相关改动后，必须启动或复用本地预览服务，并把 in-app browser 打开到对应预览页面。
- 最终回复前保持 in-app browser 停留在预览页面，方便用户直接验收；不要在验收前关闭页面、停止服务或只给命令让用户自行打开。
- 如果本地预览服务无法启动，说明实际阻塞原因、已运行的命令和需要用户处理的最小事项。
