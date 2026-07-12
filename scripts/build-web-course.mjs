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
const mediaDeckByLessonId = new Map(await Promise.all(lessons.map(async (lesson) => {
  const file = path.join(docsDir, 'public', 'course-assets', 'source-media', lesson.id.toLowerCase(), 'deck.json')
  return [lesson.id, JSON.parse(await fs.readFile(file, 'utf8'))]
})))

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

const inlineMediaMarker = /<!-- ai-course-inline-media:start[^>]*-->[\s\S]*?<!-- ai-course-inline-media:end -->\s*/g
const stopTokens = new Set(['人工智能', '智能', '模型', '系统', '课程', '内容', '核心', '案例', '本节', '学习', '技术', '应用'])

const semanticTokens = (value) => {
  const text = String(value || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ')
  const tokens = new Set((text.match(/[a-z][a-z0-9+.-]{1,}|\d{2,}/g) || []).filter((item) => !stopTokens.has(item)))
  for (const sequence of text.match(/[\p{Script=Han}]{2,}/gu) || []) {
    if (sequence.length <= 4 && !stopTokens.has(sequence)) tokens.add(sequence)
    for (let index = 0; index < sequence.length - 1; index += 1) {
      const pair = sequence.slice(index, index + 2)
      if (!stopTokens.has(pair)) tokens.add(pair)
    }
  }
  return tokens
}

const cleanLearnerPage = (value) => String(value)
  .replace(inlineMediaMarker, '')
  .replace(/\n*##\s+Web PPT\s*\n[\s\S]*?(?=\n##\s+|$)/gi, '\n')
  .replace(/\n*##\s+Web PPT\s*\n+<LessonDeck\b[^>]*\/>\s*/gi, '\n')
  .replace(/\n*<!-- ai-course-source-materials:start -->[\s\S]*?<!-- ai-course-source-materials:end -->\s*/g, '\n')
  .replace(/^\s*-\s*\*\*课程来源：\*\*.*(?:\r?\n|$)/gmu, '')
  .replace(/^\s*-\s*\*\*课程精编：\*\*.*(?:\r?\n|$)/gmu, '')
  .replace(/^\s*-\s*\*\*原课件：\*\*.*(?:\r?\n|$)/gmu, '')
  .replace(/^\s*-\s*\*\*PPTX：\*\*.*(?:\r?\n|$)/gmu, '')
  .replace(/^\s*#{3,4}\s+本节课件来源\s*(?:\r?\n|$)/gmu, '')
  .replace(/^\s*-\s*\*\*(?:团队)?主课件：\*\*.*(?:\r?\n|$)/gmu, '')
  .replace(/^\s*-\s*主课件：.*(?:\r?\n|$)/gmu, '')
  .replace(/<div class="ai-course-card ai-course-deck-card"><strong>[^<]+<\/strong><br>本节课件[^<]*<\/div>\s*/gmu, '')
  .replace(/本节 Web PPT 选取其中与/g, '其中重点介绍')
  .replace(/本节 Web PPT/g, '本节幻灯片')
  .replace(/讲义\s*\+\s*Web PPT/g, '讲义 + 幻灯片')
  .replace(/本节主课件以/g, '本节以')
  .replace(/团队主课件/g, '课程案例')
  .replace(/团队课件以/g, '这一案例以')
  .replace(/课件截图/g, '页面截图')
  .replace(/\n{3,}/g, '\n\n')

const learningAnchors = (content) => {
  const headings = [...content.matchAll(/^(#{2,3})\s+(.+?)\s*$/gmu)].map((match) => ({
    level: match[1].length,
    title: match[2].trim(),
    start: match.index,
    headingEnd: match.index + match[0].length
  }))
  let currentH2 = ''
  const allowed = new Set(['本节导入', '核心内容', '案例与图解', '案例分析'])
  for (const heading of headings) {
    if (heading.level === 2) currentH2 = heading.title
    heading.parent = currentH2
  }
  const anchors = headings.filter((heading) => heading.level === 3 && allowed.has(heading.parent))
  const selected = anchors.length ? anchors : headings.filter((heading) => heading.level === 2 && allowed.has(heading.title))
  return selected.map((anchor) => {
    const next = headings.find((heading) => heading.start > anchor.start && heading.level <= anchor.level)
    const end = next?.start ?? content.length
    const body = content.slice(anchor.headingEnd, end)
    return { ...anchor, end, tokens: semanticTokens(`${anchor.title} ${body}`) }
  })
}

const distributeSlides = (anchors, slides) => {
  const assignments = new Array(slides.length).fill(-1)
  slides.forEach((slide, slideIndex) => {
    const tokens = semanticTokens(slide.text)
    let bestIndex = -1
    let bestScore = 0
    anchors.forEach((anchor, anchorIndex) => {
      let score = 0
      for (const token of tokens) if (anchor.tokens.has(token)) score += token.length > 2 ? 3 : 1
      if (score > bestScore) { bestScore = score; bestIndex = anchorIndex }
    })
    if (bestScore >= 2) assignments[slideIndex] = bestIndex
  })
  if (!assignments.some((value) => value >= 0)) {
    return assignments.map((_, index) => Math.min(anchors.length - 1, Math.floor(index * anchors.length / slides.length)))
  }
  assignments.forEach((value, index) => {
    if (value >= 0) return
    let nearest = -1
    let distance = Number.POSITIVE_INFINITY
    assignments.forEach((candidate, candidateIndex) => {
      if (candidate < 0) return
      const nextDistance = Math.abs(candidateIndex - index)
      if (nextDistance < distance) { nearest = candidate; distance = nextDistance }
    })
    assignments[index] = nearest >= 0 ? nearest : 0
  })
  return assignments
}

const addInlineMedia = (content, lesson) => {
  const deck = mediaDeckByLessonId.get(lesson.id)
  const slides = deck?.slides || []
  const anchors = learningAnchors(content)
  if (!slides.length || !anchors.length) throw new Error(`${lesson.id}: cannot map course media into learner sections`)
  const assignments = distributeSlides(anchors, slides)
  const byAnchor = new Map()
  assignments.forEach((anchorIndex, slideIndex) => {
    if (!byAnchor.has(anchorIndex)) byAnchor.set(anchorIndex, [])
    byAnchor.get(anchorIndex).push(slideIndex + 1)
  })
  let result = content
  for (const [anchorIndex, positions] of [...byAnchor.entries()].sort((a, b) => anchors[b[0]].end - anchors[a[0]].end)) {
    const anchor = anchors[anchorIndex]
    const block = `\n<!-- ai-course-inline-media:start -->\n<CourseMedia manifest="${sourceMediaManifestUrl(lesson)}" slides="${positions.join(',')}" title="${html(anchor.title)}" />\n<!-- ai-course-inline-media:end -->\n`
    result = `${result.slice(0, anchor.end).trimEnd()}\n${block}\n${result.slice(anchor.end).trimStart()}`
  }
  return result
}

const syncAuthoredLearningMedia = async (file, lesson) => {
  let content = cleanLearnerPage(await fs.readFile(file, 'utf8'))
  if (!/^source_media_manifest:/m.test(content)) {
    content = content.replace(/^(deck_manifest:\s*[^\n]+)$/m, `$1\nsource_media_manifest: '${sourceMediaManifestUrl(lesson)}'`)
  }
  content = addInlineMedia(content, lesson)
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
- **播放幻灯片：**点击页面右上角的“幻灯片”，即可全屏查看本节图片与视频。
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
    if (isAuthored(file)) {
      await syncAuthoredLearningMedia(file, lesson)
      console.log(`Preserved authored lesson ${lesson.id}`)
      continue
    }
    await writeFile(file, addInlineMedia(lessonPage(lesson), lesson))
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
