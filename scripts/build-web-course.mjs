import fs from 'node:fs/promises'
import fss from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncCourseMediaBlocks } from './lib/pptx-derived-content.mjs'
import { syncCourseVisualBlock } from './lib/course-visuals.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const docsDir = path.join(root, 'docs')
const zhDir = path.join(docsDir, 'zh-cn')
const sourceDir = path.join(root, '课程PPT框架', 'source')

const readJson = async (name) => JSON.parse(await fs.readFile(path.join(sourceDir, name), 'utf8'))

const catalog = await readJson('course-catalog.json')

const publicBase = (() => {
  const value = process.env.VITEPRESS_BASE || '/'
  return `/${value.replace(/^\/+|\/+$/g, '')}${value === '/' ? '' : '/'}`.replace('//', '/')
})()

const href = (route) => `${publicBase}${String(route).replace(/^\/+/, '')}`

const html = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const markdown = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;')

const yaml = (value) => String(value ?? '').replaceAll("'", "''")

const lessons = catalog.modules.flatMap((module) =>
  module.lessons.map((lesson, lessonIndex) => ({
    ...lesson,
    moduleId: module.id,
    moduleOrder: module.order,
    moduleTitle: module.title,
    moduleSummary: module.summary,
    lessonOrder: lessonIndex + 1
  }))
)

const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]))
const assertCatalog = () => {
  if (catalog.modules.length !== 4) throw new Error(`Expected four modules, found ${catalog.modules.length}`)
  if (lessonById.size !== lessons.length) throw new Error('Duplicate lesson id in course-catalog.json')
  const coursewareUrls = new Set()
  for (const lesson of lessons) {
    if (!/^https:\/\/xmu-mars\.feishu\.cn\/wiki\/[A-Za-z0-9]+$/.test(lesson.slides?.url || '')) {
      throw new Error(`${lesson.id}: missing or invalid original Feishu courseware URL`)
    }
    if (!/^https:\/\/xmu-mars\.feishu\.cn\/wiki\/[A-Za-z0-9]+$/.test(lesson.slides?.wiki_url || '')) {
      throw new Error(`${lesson.id}: missing or invalid Feishu Wiki URL`)
    }
    if (!['file', 'slides'].includes(lesson.slides?.source_type)) throw new Error(`${lesson.id}: invalid original courseware type`)
    if (!lesson.slides?.source_title || !/\.pptx$/i.test(lesson.slides?.local_pptx || '')) {
      throw new Error(`${lesson.id}: missing original courseware title or local PPTX source`)
    }
    if (coursewareUrls.has(lesson.slides.url)) throw new Error(`${lesson.id}: duplicate original courseware URL`)
    coursewareUrls.add(lesson.slides.url)
  }
}

const routeFor = (lesson) => `/zh-cn/${lesson.moduleId}/${lesson.id.toLowerCase()}-${lesson.slug}/`

const fileFor = (lesson) =>
  path.join(zhDir, lesson.moduleId, `${lesson.id.toLowerCase()}-${lesson.slug}`, 'index.md')

const cleanLearnerPage = (value) => String(value)
  .replace(/^pptx_manifest:.*(?:\r?\n|$)/gmu, '')
  .replace(/^pptx:.*(?:\r?\n|$)/gmu, '')
  .replace(/^pptx_source_(?:slides|coverage|sha256):.*(?:\r?\n|$)/gmu, '')
  .replace(/^slides_url:.*(?:\r?\n|$)/gmu, '')
  .replace(/^slides_wiki_url:.*(?:\r?\n|$)/gmu, '')
  .replace(/<!-- pptx-derived:start[^>]*-->\s*/gmu, '')
  .replace(/\s*<!-- pptx-derived:end -->/gmu, '')
  .replace(/\n{3,}/g, '\n\n')
const syncAuthoredLearningPage = async (file, lesson) => {
  let content = cleanLearnerPage(await fs.readFile(file, 'utf8'))
  const frontmatterFields = `slides_url: '${lesson.slides.url}'\nslides_wiki_url: '${lesson.slides.wiki_url}'`
  content = content.replace(/^(module:\s*[^\n]+)$/m, `$1\n${frontmatterFields}`)
  content = syncCourseMediaBlocks(content, lesson.id)
  content = syncCourseVisualBlock(content, lesson.id)
  await writeFile(file, content)
}

const moduleIndex = (module) => {
  const cards = module.lessons
    .map(
      (lesson, index) => `<a class="section-card" href="${href(routeFor({ ...lesson, moduleId: module.id }))}">
<b>${module.order}.${index + 1} ${html(lesson.title)}</b>
<span>${html(lesson.summary)}</span>
</a>`
    )
    .join('\n')

  return `---
title: '${yaml(module.title)}'
description: '${yaml(module.summary)}'
aside: false
---

<div class="lesson-hero lesson-hero--module">
  <div class="lesson-hero__num">0${module.order}</div>
  <h1 class="lesson-hero__title">${html(module.title)}</h1>
  <div class="lesson-hero__sub">${html(module.summary)}</div>
  <div class="lesson-hero__tags"><span>${module.lessons.length} 节</span><span>讲义 + 幻灯片</span></div>
</div>

## 本章课程

<div class="section-cards">
${cards}
</div>
`
}

const homePage = () => {
  const cards = catalog.modules
    .map(
      (module) => `<a class="section-card" href="${href(`/zh-cn/${module.id}/`)}">
<b>第 ${module.order} 章 · ${html(module.title)}</b>
<span>${html(module.summary)}</span>
</a>`
    )
    .join('\n')

  return `---
title: '${yaml(catalog.course_title)}'
description: '${yaml(catalog.description)}'
aside: false
---

<div class="course-home-hero">
  <p class="course-home-hero__eyebrow">OPEN WEB COURSE · 2026</p>
  <h1>${html(catalog.course_title)}</h1>
  <p>${html(catalog.description)}</p>
  <div class="course-home-hero__actions">
    <a href="${href('/zh-cn/guide/introduction/')}">查看学习地图</a>
    <a href="${href('/zh-cn/stage-1/')}">从第一章开始</a>
  </div>
</div>

## 四大模块

<div class="section-cards section-cards--home">
${cards}
</div>

## 如何使用这门课

- **阅读讲义：**每节先解释概念，再进入案例、实践和复盘。
- **播放幻灯片：**点击页面右上角的“幻灯片”，直接在飞书 Web PPT 中打开本节课件；网页不内嵌或重新模拟播放器。
- **沿来源核对：**时效性强的模型、协议和案例均标明核对日期；关键结论请回到所附一手资料。
- **按行业选学：**完成前三章后，可在行业应用章按教育、政务、制造、交通、应急、海洋和文旅场景组合学习。
`
}

const guidePage = () => {
  const modules = catalog.modules
    .map(
      (module) => `## 第 ${module.order} 章 · [${markdown(module.title)}](/zh-cn/${module.id}/)

${markdown(module.summary)}

${module.lessons
  .map(
    (lesson, index) =>
      `${index + 1}. [${markdown(lesson.title)}](${routeFor({ ...lesson, moduleId: module.id })}) — ${markdown(lesson.summary)}`
  )
  .join('\n')}`
    )
    .join('\n\n')

  return `---
title: '学习地图'
description: '四章、${lessons.length} 节人工智能公开课学习路径'
aside: false
---

# 学习地图

课程按“概念基础 → AI 智能体 → 具身智能 → 行业应用”推进。每一节都是独立学习单元，包含图文讲解、幻灯片、案例、练习、复盘和延伸阅读。

${modules}
`
}

const sidebarFile = () => {
  const sidebar = {
    '/zh-cn/guide/': [
      {
        text: '学习地图',
        items: [{ text: '全部课程', link: '/zh-cn/guide/introduction/' }]
      }
    ]
  }
  for (const module of catalog.modules) {
    sidebar[`/zh-cn/${module.id}/`] = [
      {
        text: `第 ${module.order} 章 · ${module.title}`,
        link: `/zh-cn/${module.id}/`,
        collapsed: false,
        items: [
          ...module.lessons.map((lesson, index) => ({
            text: `${module.order}.${index + 1} ${lesson.title}`,
            link: routeFor({ ...lesson, moduleId: module.id })
          }))
        ]
      }
    ]
  }
  return `export const courseSidebar = ${JSON.stringify(sidebar, null, 2)}\n`
}

const isAuthored = (file) => {
  if (!fss.existsSync(file)) return false
  const head = fss.readFileSync(file, 'utf8').slice(0, 800)
  return /^authored:\s*true\s*$/m.test(head)
}

const writeFile = async (file, value) => {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${String(value).trim()}\n`)
}

const removeStaleLessonPages = async () => {
  const expected = new Map(
    catalog.modules.map((module) => [
      module.id,
      new Set(module.lessons.map((lesson) => `${lesson.id.toLowerCase()}-${lesson.slug}`))
    ])
  )
  for (const [moduleId, expectedDirs] of expected) {
    const moduleDir = path.join(zhDir, moduleId)
    if (!fss.existsSync(moduleDir)) continue
    for (const entry of await fs.readdir(moduleDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || expectedDirs.has(entry.name)) continue
      await fs.rm(path.join(moduleDir, entry.name), { recursive: true, force: true })
    }
  }
  await fs.rm(path.join(zhDir, 'sample-2026'), { recursive: true, force: true })
  await fs.rm(path.join(zhDir, 'materials'), { recursive: true, force: true })
}

const main = async () => {
  assertCatalog()
  await removeStaleLessonPages()

  for (const lesson of lessons) {
    const file = fileFor(lesson)
    if (!isAuthored(file)) throw new Error(`${lesson.id}: learner-facing authored lesson is required`)
    await syncAuthoredLearningPage(file, lesson)
    console.log(`Synced original Feishu courseware link for ${lesson.id}`)
  }

  for (const module of catalog.modules) {
    await writeFile(path.join(zhDir, module.id, 'index.md'), moduleIndex(module))
  }

  await writeFile(path.join(zhDir, 'index.md'), homePage())
  await writeFile(path.join(zhDir, 'guide', 'introduction', 'index.md'), guidePage())
  await writeFile(path.join(docsDir, '.vitepress', 'course-sidebar.mjs'), sidebarFile())
  await writeFile(
    path.join(docsDir, 'index.md'),
    `---\nlayout: home\n---\n\n<script setup>\nimport { inBrowser, withBase } from 'vitepress'\nif (inBrowser) window.location.replace(withBase('/zh-cn/'))\n</script>\n\n# 人工智能公开课\n\n[进入中文课程](/zh-cn/)`
  )

  console.log(`Synced ${lessons.length} authored lessons to one-Markdown/one-original-courseware pairs.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
