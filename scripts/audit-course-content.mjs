import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const docsDir = path.join(root, 'docs/zh-cn')
const catalogPath = path.join(root, '课程PPT框架/source/course-catalog.json')
const deckPlanPath = path.join(root, '课程PPT框架/source/course-decks.public.json')
const expectedLessonCount = 27

const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'))
const deckPlan = JSON.parse(await fs.readFile(deckPlanPath, 'utf8'))
const findings = []

const lessons = catalog.modules.flatMap((module) =>
  module.lessons.map((lesson) => ({ module, lesson }))
)
const deckByLessonId = new Map(
  (deckPlan.lessons || [])
    .filter((deck) => deck.status === 'ready')
    .map((deck) => [deck.lesson_id, deck])
)

const pagePathFor = (module, lesson) =>
  path.join(docsDir, module.id, `${lesson.id.toLowerCase()}-${lesson.slug}`, 'index.md')

const stripFrontmatter = (text) => text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')

const section = (text, headingPatterns) => {
  const headings = [...text.matchAll(/^##\s+(.+?)\s*$/gm)]
  const match = headings.find((candidate) =>
    headingPatterns.some((pattern) => pattern.test(candidate[1].trim()))
  )
  if (!match) return null
  const start = match.index + match[0].length
  const next = headings.find((candidate) => candidate.index > match.index)
  return {
    heading: match[1].trim(),
    body: text.slice(start, next ? next.index : text.length).trim()
  }
}

const visibleText = (text) =>
  stripFrontmatter(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const meaningfulLength = (text) => visibleText(text).replace(/\s/g, '').length
const bulletCount = (text) => (text.match(/^\s*(?:[-*+] |\d+\. )/gm) || []).length
const h3Count = (text) => (text.match(/^###\s+.+$/gm) || []).length

const sectionRules = [
  { key: 'goals', label: '学习目标', headings: [/^学习目标$/], minimum: 30 },
  { key: 'intro', label: '本节导入', headings: [/^本节导入$/], minimum: 40 },
  { key: 'core', label: '核心内容', headings: [/^核心内容$/], minimum: 350 },
  { key: 'case', label: '案例与图解', headings: [/^案例与图解$/, /^案例分析$/], minimum: 100 },
  { key: 'practice', label: '动手实践', headings: [/^动手实践$/, /^实践任务$/], minimum: 30 },
  { key: 'review', label: '课后复盘', headings: [/^课后复盘$/, /^复盘与自测$/], minimum: 30 },
  {
    key: 'resources',
    label: '资料与延伸',
    headings: [/^资料与延伸$/, /^资源与延伸$/, /^延伸学习$/],
    minimum: 45
  }
]

const metaPatterns = [
  { label: '课程制作指南', pattern: /课程制作指南|如何制作课件|如何制作课程|课程生产底座|可编辑课程底座/ },
  { label: '讲者内部指令', pattern: /讲者脚本|讲者验收|读者验收|讲者应该|讲者可以|讲课时应|授课前/ },
  { label: '内部课程结构', pattern: /课程PPT框架|课程PPT矩阵|课程矩阵|旧课程矩阵|lesson blueprint/i },
  { label: '素材库替代课程', pattern: /PPT\s*素材讲义库|完整素材库|打开完整逐页讲义|逐页文本/ },
  { label: '重写过程', pattern: /重写为(?:课程|讲义|课件)|本节负责把|这一版(?:先|将)/ },
  { label: '公开页生产版本', pattern: /原课件|源课件|课程精编|打开本节 Web PPT|原课件图片与视频/ }
]

if (catalog.modules.length !== 4) findings.push(`catalog: expected 4 modules, found ${catalog.modules.length}`)
if (lessons.length !== expectedLessonCount) {
  findings.push(`catalog: expected ${expectedLessonCount} lessons, found ${lessons.length}`)
}

for (const { module, lesson } of lessons) {
  const file = pagePathFor(module, lesson)
  let text
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (error) {
    findings.push(`${lesson.id}: cannot read ${path.relative(root, file)} (${error.message})`)
    continue
  }

  const bodies = {}
  for (const rule of sectionRules) {
    const found = section(text, rule.headings)
    if (!found) {
      findings.push(`${lesson.id}: missing learner-facing section "${rule.label}"`)
      continue
    }
    bodies[rule.key] = found.body
    const length = meaningfulLength(found.body)
    if (rule.minimum > 0 && length < rule.minimum) {
      findings.push(`${lesson.id}: section "${found.heading}" is too thin (${length} < ${rule.minimum})`)
    }
  }

  if (bodies.goals && bulletCount(bodies.goals) < 2) {
    findings.push(`${lesson.id}: learning goals need at least 2 observable outcomes`)
  }
  const deck = deckByLessonId.get(lesson.id)
  if (!deck) {
    findings.push(`${lesson.id}: missing ready slide plan`)
  }
  const expectedSourceMedia = deck?.source_media_manifest_url || null
  const courseMedia = [...text.matchAll(/<CourseMedia\b[^>]*\bmanifest="([^"]+)"[^>]*\bslides="([^"]+)"[^>]*\/>/g)]
  if (!courseMedia.length || courseMedia.some((match) => match[1] !== expectedSourceMedia)) {
    findings.push(`${lesson.id}: learner sections must embed CourseMedia from ${expectedSourceMedia}`)
  }
  if (/<LessonDeck\b|<SourceMaterialGallery\b|^##\s+(?:Web PPT|原课件图片与视频)\s*$/m.test(text)) {
    findings.push(`${lesson.id}: slide launcher or detached media inventory remains in the article`)
  }
  if (bodies.core && h3Count(bodies.core) < 2) {
    findings.push(`${lesson.id}: core content needs at least 2 concept subsections`)
  }
  if (
    bodies.case &&
    h3Count(bodies.case) < 1 &&
    !/ai-course-case|<figure\b|<table\b/i.test(bodies.case)
  ) {
    findings.push(`${lesson.id}: case section needs a named case, figure, or comparison table`)
  }
  if (bodies.practice && bulletCount(bodies.practice) < 2) {
    findings.push(`${lesson.id}: practice section needs at least 2 executable tasks`)
  }
  if (bodies.review && bulletCount(bodies.review) < 3) {
    findings.push(`${lesson.id}: review section needs at least 3 retrieval or reflection questions`)
  }
  if (bodies.resources && !/(https:\/\/|一手资料|延伸阅读|参考资料|团队资料)/.test(bodies.resources)) {
    findings.push(`${lesson.id}: resources section must provide learner-facing references`)
  }

  if (meaningfulLength(text) < 900) {
    findings.push(`${lesson.id}: learner notes are too short (${meaningfulLength(text)} < 900)`)
  }
  for (const { label, pattern } of metaPatterns) {
    if (pattern.test(text)) findings.push(`${lesson.id}: production meta-language remains (${label})`)
  }
  for (const legacy of ['<WebDeck', '<PageSlidesButton', 'ai-course-slides-source', 'ai-course-deck-detail']) {
    if (text.includes(legacy)) findings.push(`${lesson.id}: legacy course component remains: ${legacy}`)
  }
  if (/^#{3,4}\s*第\s*\d+\s*页\b/m.test(text)) {
    findings.push(`${lesson.id}: raw slide-by-slide dump heading remains`)
  }
}

if (findings.length) {
  console.error('Course content audit failed:')
  for (const finding of findings) console.error(`- ${finding}`)
  process.exit(1)
}

console.log(`Course content audit passed for 4 modules and ${lessons.length} learner-facing lessons.`)
