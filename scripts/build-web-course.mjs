import fs from 'node:fs/promises'
import fss from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const docsDir = path.join(root, 'docs')
const zhDir = path.join(docsDir, 'zh-cn')
const sourceDir = path.join(root, '课程PPT框架', 'source')

const readJson = async (name) => JSON.parse(await fs.readFile(path.join(sourceDir, name), 'utf8'))

const [catalog, blueprints, deckPlan, courseReferences] = await Promise.all([
  readJson('course-catalog.json'),
  readJson('lesson-blueprints.json'),
  readJson('course-decks.public.json'),
  readJson('course-references.json')
])

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

const unique = (items, key = (item) => String(item)) => {
  const seen = new Set()
  return items.filter((item) => {
    const normalized = key(item).trim().toLowerCase()
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

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
const deckByLessonId = new Map(deckPlan.lessons.map((deck) => [deck.lesson_id, deck]))

const assertCatalog = () => {
  if (catalog.modules.length !== 4) throw new Error(`Expected four modules, found ${catalog.modules.length}`)
  if (lessonById.size !== lessons.length) throw new Error('Duplicate lesson id in course-catalog.json')
  for (const lesson of lessons) {
    if (!deckByLessonId.has(lesson.id)) throw new Error(`Missing course deck plan for ${lesson.id}`)
    if (!Array.isArray(lesson.content_sources) || !lesson.content_sources.length) {
      throw new Error(`Missing content_sources for ${lesson.id}`)
    }
    for (const source of lesson.content_sources) {
      if (!blueprints[source]) throw new Error(`Missing blueprint ${source}, used by ${lesson.id}`)
    }
  }
}

const routeFor = (lesson) => `/zh-cn/${lesson.moduleId}/${lesson.id.toLowerCase()}-${lesson.slug}/`

const fileFor = (lesson) =>
  path.join(zhDir, lesson.moduleId, `${lesson.id.toLowerCase()}-${lesson.slug}`, 'index.md')

const deckManifestUrl = (lesson) => deckByLessonId.get(lesson.id).manifest_url
const sourceMediaManifestUrl = (lesson) => `/course-assets/source-media/${lesson.id.toLowerCase()}/deck.json`

const composeBlueprint = (lesson) => {
  const sources = lesson.content_sources.map((id) => blueprints[id])
  return {
    intro: unique(sources.flatMap((source) => source.intro || [])).slice(0, 6),
    sections: unique(
      sources.flatMap((source) => source.sections || []),
      (section) => section.heading
    ),
    concepts: unique(sources.flatMap((source) => source.concepts || [])).slice(0, 16),
    cases: unique(
      sources.flatMap((source) => source.cases || []),
      (item) => item.title
    ).slice(0, 4),
    practice: unique(sources.flatMap((source) => source.practice || [])).slice(0, 6),
    review: unique(sources.flatMap((source) => source.review || [])).slice(0, 6)
  }
}

const renderParagraphs = (paragraphs) => paragraphs.map((item) => markdown(item)).join('\n\n')

const renderCore = (sections) =>
  sections
    .map(
      (section) => `### ${markdown(section.heading)}

${renderParagraphs(section.paragraphs || [])}`
    )
    .join('\n\n')

const renderCases = (cases) => {
  if (!cases.length) return '本节不单列案例，核心判断将在动手实践中完成。'
  return `<div class="ai-course-case-grid">
${cases
  .map(
    (item) => `<article class="ai-course-case">
<h3>${html(item.title)}</h3>
${item.scenario ? `<p><strong>场景：</strong>${html(item.scenario)}</p>` : ''}
${item.problem ? `<p><strong>问题：</strong>${html(item.problem)}</p>` : ''}
${item.ai ? `<p><strong>方法：</strong>${html(item.ai)}</p>` : ''}
${item.result ? `<p><strong>结果：</strong>${html(item.result)}</p>` : ''}
${item.check ? `<p><strong>边界与复核：</strong>${html(item.check)}</p>` : ''}
</article>`
  )
  .join('\n')}
</div>`
}

const bullets = (items) => items.map((item) => `- ${markdown(item)}`).join('\n')

const sourceBlock = (lesson) => {
  return `### 本节课件来源

- **课程来源：**团队既有 PowerPoint、课程文档与最终讲义。
- **课程精编：**以最终讲义为主线重新组织，使用统一排版与原生 Web 图形。
- **原课件：**播放器保留团队 PowerPoint 精选页、真实图片和内嵌视频；每一页标明原始页码。
- **PPTX：**与 Web PPT 共用页序、标题和正文，可从播放器直接下载。`
}

const sourceMaterialBlock = (lesson) => `<!-- ai-course-source-materials:start -->
## 原课件图片与视频

<SourceMaterialGallery manifest="${sourceMediaManifestUrl(lesson)}" title="${html(lesson.title)}原课件素材" />
<!-- ai-course-source-materials:end -->`

const syncAuthoredSourceMaterials = async (file, lesson) => {
  let content = await fs.readFile(file, 'utf8')
  const block = sourceMaterialBlock(lesson)
  const existing = /<!-- ai-course-source-materials:start -->[\s\S]*?<!-- ai-course-source-materials:end -->/
  if (existing.test(content)) content = content.replace(existing, block)
  else {
    const deckComponent = /<LessonDeck\b[^>]*\/>/
    if (!deckComponent.test(content)) throw new Error(`${lesson.id}: authored lesson is missing LessonDeck`)
    content = content.replace(deckComponent, (match) => `${match}\n\n${block}`)
  }
  if (!/^source_media_manifest:/m.test(content)) {
    content = content.replace(
      /^(deck_manifest:\s*[^\n]+)$/m,
      `$1\nsource_media_manifest: '${sourceMediaManifestUrl(lesson)}'`
    )
  }
  await writeFile(file, content)
}

const referencesBlock = (lesson) => {
  const references = courseReferences[lesson.id] || []
  if (!references.length) return ''
  return `### 一手资料与延伸阅读

${references
  .map(
    (item) => `- [${markdown(item.title)}](${item.url})：${markdown(item.note)}（核对日期：${item.checked_on}）`
  )
  .join('\n')}`
}

const lessonPage = (lesson) => {
  const blueprint = composeBlueprint(lesson)
  const moduleNumber = lesson.moduleOrder
  const lessonNumber = String(lesson.lessonOrder).padStart(2, '0')
  return `---
title: '${yaml(lesson.title)}'
description: '${yaml(lesson.summary)}'
lesson_id: '${lesson.id}'
module: '${yaml(lesson.moduleTitle)}'
deck_manifest: '${deckManifestUrl(lesson)}'
source_media_manifest: '${sourceMediaManifestUrl(lesson)}'
deck_revision: '${deckByLessonId.get(lesson.id).spec_sha256}'
---

<div class="lesson-hero">
  <div class="lesson-hero__num">${moduleNumber}.${lessonNumber}</div>
  <h1 class="lesson-hero__title">${html(lesson.title)}</h1>
  <div class="lesson-hero__sub">${html(lesson.summary)}</div>
  <div class="lesson-hero__tags"><span>${html(lesson.moduleTitle)}</span><span>${lesson.id}</span></div>
</div>

## 学习目标

${bullets(lesson.learning_outcomes || [])}

## Web PPT

<LessonDeck manifest="${deckManifestUrl(lesson)}" title="${html(lesson.title)}" />

${sourceMaterialBlock(lesson)}

## 本节导入

${renderParagraphs(blueprint.intro)}

## 核心内容

${renderCore(blueprint.sections)}

### 关键概念

${bullets(blueprint.concepts)}

## 案例与图解

${renderCases(blueprint.cases)}

## 动手实践

${bullets(blueprint.practice)}

## 课后复盘

${bullets(blueprint.review)}

## 资料与延伸

${sourceBlock(lesson)}

${referencesBlock(lesson)}
`
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
  <div class="lesson-hero__tags"><span>${module.lessons.length} 节</span><span>讲义 + Web PPT</span></div>
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
- **打开 Web PPT：**可在“课程精编”和“原课件”之间切换；原课件模式保留真实图片与可播放视频，并支持全屏讲授。
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

课程按“概念基础 → AI 智能体 → 具身智能 → 行业应用”推进。每一节都是独立学习单元，包含 Web PPT、Markdown 讲义、案例、练习、复盘和来源。

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
    if (isAuthored(file)) {
      await syncAuthoredSourceMaterials(file, lesson)
      console.log(`Preserved authored lesson ${lesson.id}`)
      continue
    }
    await writeFile(file, lessonPage(lesson))
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

  console.log(`Generated ${lessons.length} lessons across ${catalog.modules.length} modules.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
