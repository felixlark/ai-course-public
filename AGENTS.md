# AI Course Agent Rules

## 一课一文档课程契约

- 每一节 mini course 必须同时对应一个 Markdown 文件和一份本地 PPTX；`course-catalog.json` 中的 `slides.url`、`slides.local_pptx`、`slides.source_pptx` 和 `slides.source_slides` 是讲义、发布课件与原稿页码的唯一映射。
- VitePress 只负责课程导航、讲义、独立图解和视频。“幻灯片”按钮必须直接打开或下载该节的本地 PPTX，不得重新实现、内嵌或模拟幻灯片播放器。
- 新增、删除或修改课程时，必须同步维护 Markdown、本地 PPTX、`course-catalog.json` 和必要导航；不保留云文档、WPS、Office Embed 或模块级播放器兼容路径。
- 课件拆分只能复制原稿中经选定的页面，保留原始版式、媒体与可编辑结构；不得把整页 PPT/PDF 渲染成 PNG、JPEG 或 WebP 再发布。
- 发布前必须验证 27 份 PPTX 链接唯一、Markdown/PPTX 一一对应、每份课件小于 95 MiB、网页不存在旧播放器或云课件路径，且独立媒体完整。

## 预览验收

- 完成网页课程、PPT 框架、课程内容或可视化相关改动后，必须启动或复用本地预览服务，并把 in-app browser 打开到对应预览页面。
- 最终回复前保持 in-app browser 停留在预览页面，方便用户直接验收；不要在验收前关闭页面、停止服务或只给命令让用户自行打开。
- 如果本地预览服务无法启动，说明实际阻塞原因、已运行的命令和需要用户处理的最小事项。
