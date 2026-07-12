import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const docsDir = path.join(root, 'docs')
const zhDir = path.join(docsDir, 'zh-cn')
const publicDir = path.join(docsDir, 'public')
const catalogPath = path.join(root, '课程PPT框架/source/course-catalog.json')
const deckPlanPath = path.join(root, '课程PPT框架/source/course-decks.public.json')

const expectedModules = [
  { id: 'stage-1', order: 1, title: '人工智能概述', lessonCount: 7, prefix: 'OV' },
  { id: 'stage-2', order: 2, title: 'AI 智能体', lessonCount: 5, prefix: 'AG' },
  { id: 'stage-3', order: 3, title: '具身智能', lessonCount: 6, prefix: 'EM' },
  { id: 'stage-4', order: 4, title: '行业应用', lessonCount: 9, prefix: 'IN' }
]
const expectedLessonCount = 27
const expectedLessonHeadings = [
  '学习目标', '本节导入', '核心内容',
  '案例与图解', '动手实践', '课后复盘', '资料与延伸'
]
const failures = []

const exists = async (file) => {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

const readJson = async (file, label) => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    failures.push(`${label} cannot be read as JSON: ${path.relative(root, file)} (${error.message})`)
    return null
  }
}

const parseFrontmatter = (text, file) => {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) {
    failures.push(`missing YAML frontmatter: ${path.relative(root, file)}`)
    return {}
  }
  const values = {}
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][\w-]*):\s*(.*?)\s*$/)
    if (!field) continue
    let value = field[2]
    if (
      value.length >= 2 &&
      ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"')))
    ) {
      value = value.slice(1, -1)
    }
    values[field[1]] = value
  }
  return values
}

const lessonRoute = (module, lesson) =>
  `/zh-cn/${module.id}/${lesson.id.toLowerCase()}-${lesson.slug}/`

const lessonFile = (module, lesson) =>
  path.join(zhDir, module.id, `${lesson.id.toLowerCase()}-${lesson.slug}`, 'index.md')

const courseMediaRefs = (text) =>
  [...text.matchAll(/<CourseMedia\b[^>]*\bmanifest\s*=\s*(["'])([^"']+)\1[^>]*\bslides\s*=\s*(["'])([^"']+)\3[^>]*\/?\s*>/g)].map(
    (match) => ({ manifest: match[2], slides: match[4].split(',').map((value) => Number.parseInt(value, 10)) })
  )

const stripUrlDecorations = (value) => value.split(/[?#]/, 1)[0]

const resolvePageAsset = (reference, pageFile) => {
  const clean = stripUrlDecorations(reference)
  if (!clean || /^(?:[a-z]+:)?\/\//i.test(clean) || /^(?:data|mailto|tel):/i.test(clean)) {
    return null
  }
  if (clean.startsWith('/')) return path.join(publicDir, clean.slice(1))
  return path.resolve(path.dirname(pageFile), clean)
}

const collectIndexPages = async (dir) => {
  if (!(await exists(dir))) return []
  const pages = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) pages.push(...await collectIndexPages(full))
    else if (entry.isFile() && entry.name === 'index.md') pages.push(path.resolve(full))
  }
  return pages
}

const catalog = await readJson(catalogPath, 'course catalog')
const deckPlan = await readJson(deckPlanPath, 'course deck plan')

if (!catalog || !deckPlan) {
  console.error(failures.join('\n'))
  process.exit(1)
}

if (catalog.schema_version !== 1) failures.push('course-catalog.json schema_version must be 1')
if (catalog.catalog_id !== 'chen-longbiao-ai-open-course') {
  failures.push(`unexpected catalog_id: ${catalog.catalog_id}`)
}
if (!Array.isArray(catalog.modules)) failures.push('course catalog modules must be an array')
if ((catalog.modules || []).length !== expectedModules.length) {
  failures.push(`module count ${(catalog.modules || []).length} != ${expectedModules.length}`)
}

const lessons = []
const lessonIds = new Set()
const expectedPages = new Set([
  path.resolve(path.join(zhDir, 'index.md')),
  path.resolve(path.join(zhDir, 'guide/introduction/index.md')),
  ...expectedModules.map((module) => path.resolve(path.join(zhDir, module.id, 'index.md')))
])

for (const expected of expectedModules) {
  const module = (catalog.modules || []).find((item) => item.id === expected.id)
  if (!module) {
    failures.push(`missing module ${expected.id}`)
    continue
  }
  if (module.order !== expected.order) failures.push(`${module.id}: order ${module.order} != ${expected.order}`)
  if (module.title !== expected.title) failures.push(`${module.id}: title ${JSON.stringify(module.title)} != ${JSON.stringify(expected.title)}`)
  if (!Array.isArray(module.lessons)) {
    failures.push(`${module.id}: lessons must be an array`)
    continue
  }
  if (module.lessons.length !== expected.lessonCount) {
    failures.push(`${module.id}: lesson count ${module.lessons.length} != ${expected.lessonCount}`)
  }
  for (const lesson of module.lessons) {
    lessons.push({ module, lesson })
    if (!new RegExp(`^${expected.prefix}-\\d{3}$`).test(lesson.id || '')) {
      failures.push(`${module.id}: invalid lesson id ${JSON.stringify(lesson.id)}`)
    }
    if (lessonIds.has(lesson.id)) failures.push(`duplicate lesson id ${lesson.id}`)
    lessonIds.add(lesson.id)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(lesson.slug || '')) {
      failures.push(`${lesson.id}: invalid slug ${JSON.stringify(lesson.slug)}`)
    }
    if (!lesson.title || !lesson.summary || !Array.isArray(lesson.learning_outcomes)) {
      failures.push(`${lesson.id}: catalog title, summary, and learning_outcomes are required`)
    }
    expectedPages.add(path.resolve(lessonFile(module, lesson)))
  }
}

if (lessons.length !== expectedLessonCount) {
  failures.push(`catalog lesson count ${lessons.length} != ${expectedLessonCount}`)
}
if (lessonIds.size !== lessons.length) failures.push('catalog lesson ids are not unique')

if (deckPlan.schema_version !== 2 || deckPlan.kind !== 'public-native-course-decks') {
  failures.push('course-decks.public.json must use the public-native v2 schema')
}
const selectedDecks = (deckPlan.lessons || []).filter((deck) => deck.status === 'ready')
if (selectedDecks.length !== expectedLessonCount) {
  failures.push(`selected deck plan count ${selectedDecks.length} != ${expectedLessonCount}`)
}
const deckByLessonId = new Map()
for (const deck of selectedDecks) {
  if (deckByLessonId.has(deck.lesson_id)) failures.push(`duplicate deck plan for ${deck.lesson_id}`)
  deckByLessonId.set(deck.lesson_id, deck)
}
for (const deck of selectedDecks) {
  if (!lessonIds.has(deck.lesson_id)) failures.push(`deck plan has unknown lesson ${deck.lesson_id}`)
}

for (const { module, lesson } of lessons) {
  const route = lessonRoute(module, lesson)
  const file = lessonFile(module, lesson)
  const deck = deckByLessonId.get(lesson.id)
  if (!deck) {
    failures.push(`${lesson.id}: missing selected deck plan`)
    continue
  }
  if (deck.module !== module.title) {
    failures.push(`${lesson.id}: deck module ${JSON.stringify(deck.module)} != ${JSON.stringify(module.title)}`)
  }
  if (!/^\/course-assets\/course-decks\/[a-z]{2}-\d{3}\/deck\.json$/.test(deck.manifest_url || '')) {
    failures.push(`${lesson.id}: invalid manifest_url ${JSON.stringify(deck.manifest_url)}`)
    continue
  }
  if (!/^\/course-assets\/course-pptx\/[a-z]{2}-\d{3}\.pptx$/.test(deck.pptx_url || '')) {
    failures.push(`${lesson.id}: invalid pptx_url ${JSON.stringify(deck.pptx_url)}`)
  }
  if (!/^\/course-assets\/source-media\/[a-z]{2}-\d{3}\/deck\.json$/.test(deck.source_media_manifest_url || '')) {
    failures.push(`${lesson.id}: invalid source_media_manifest_url ${JSON.stringify(deck.source_media_manifest_url)}`)
  }
  const manifestUrl = deck.manifest_url
  const sourceMediaManifestUrl = deck.source_media_manifest_url
  const manifestFile = path.join(publicDir, manifestUrl.slice(1))
  const sourceMediaManifestFile = path.join(publicDir, sourceMediaManifestUrl.slice(1))

  if (!(await exists(file))) {
    failures.push(`${lesson.id}: missing page for ${route}: ${path.relative(root, file)}`)
    continue
  }
  const text = await fs.readFile(file, 'utf8')
  const h1Count = [...text.matchAll(/^#\s+.+$/gm)].length + [...text.matchAll(/<h1\b[^>]*>/g)].length
  if (h1Count !== 1) failures.push(`${lesson.id}: expected exactly one H1, found ${h1Count}`)
  const frontmatter = parseFrontmatter(text, file)
  const expectedFrontmatter = {
    title: lesson.title,
    lesson_id: lesson.id,
    module: module.title,
    deck_manifest: manifestUrl,
    source_media_manifest: sourceMediaManifestUrl,
    deck_revision: deck.spec_sha256
  }
  for (const [field, expected] of Object.entries(expectedFrontmatter)) {
    if (frontmatter[field] !== expected) {
      failures.push(
        `${lesson.id}: frontmatter ${field} ${JSON.stringify(frontmatter[field])} != ${JSON.stringify(expected)}`
      )
    }
  }

  if (/<LessonDeck\b|<SourceMaterialGallery\b|^##\s+(?:Web PPT|原课件图片与视频)\s*$/mu.test(text)) {
    failures.push(`${lesson.id}: production-facing slide or media block remains in the article`)
  }
  const inlineMedia = courseMediaRefs(text)
  if (!inlineMedia.length) failures.push(`${lesson.id}: article does not embed CourseMedia beside the lesson content`)
  if (inlineMedia.some((item) => item.manifest !== sourceMediaManifestUrl)) {
    failures.push(`${lesson.id}: CourseMedia must use ${sourceMediaManifestUrl}`)
  }
  const lessonHeadings = [...text.matchAll(/^##\s+(.+?)\s*$/gm)].map((match) => match[1])
  if (JSON.stringify(lessonHeadings) !== JSON.stringify(expectedLessonHeadings)) {
    failures.push(
      `${lesson.id}: H2 order ${JSON.stringify(lessonHeadings)} != ${JSON.stringify(expectedLessonHeadings)}`
    )
  }
  for (const legacy of ['sample-2026', '/zh-cn/materials/', '<WebDeck', '<PageSlidesButton']) {
    if (text.includes(legacy)) failures.push(`${lesson.id}: legacy course reference remains: ${legacy}`)
  }
  if (/<SourceMaterialGallery\b|\/course-assets\/lessons\//i.test(text)) {
    failures.push(`${lesson.id}: public lesson still uses a detached or legacy media path`)
  }

  const assetRefs = [
    ...[...text.matchAll(/(?<!:)\b(?:src|poster)\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]),
    ...[...text.matchAll(/\bwithBase\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]),
    ...[...text.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)].map((match) => match[1])
  ]
  for (const reference of assetRefs) {
    const target = resolvePageAsset(reference, file)
    if (target && !(await exists(target))) {
      failures.push(`${lesson.id}: missing page asset ${reference} used by ${path.relative(root, file)}`)
    }
  }

  if (!(await exists(manifestFile))) {
    failures.push(`${lesson.id}: missing LessonDeck manifest ${manifestUrl}`)
    continue
  }
  if (!(await exists(sourceMediaManifestFile))) {
    failures.push(`${lesson.id}: missing source-media manifest ${sourceMediaManifestUrl}`)
  }
  const sourceManifest = await readJson(sourceMediaManifestFile, `${lesson.id} source-media manifest`)
  if (sourceManifest) {
    const positions = inlineMedia.flatMap((item) => item.slides)
    const expectedPositions = (sourceManifest.slides || []).map((_, index) => index + 1)
    const sortedPositions = [...positions].sort((a, b) => a - b)
    if (JSON.stringify(sortedPositions) !== JSON.stringify(expectedPositions)) {
      failures.push(`${lesson.id}: inline media positions do not cover every course visual exactly once`)
    }
    if ((sourceManifest.slides || []).some((slide) => typeof slide.text !== 'string')) {
      failures.push(`${lesson.id}: source-media manifest is missing learner mapping text`)
    }
  }
  const manifest = await readJson(manifestFile, `${lesson.id} deck manifest`)
  if (!manifest) continue
  for (const [field, expected] of [
    ['lesson_id', lesson.id],
    ['module', module.title],
    ['render_mode', 'native-web'],
    ['pptx_asset', deck.pptx_url],
    ['spec_sha256', deck.spec_sha256]
  ]) {
    if (manifest[field] !== expected) {
      failures.push(`${lesson.id}: deck.json ${field} ${JSON.stringify(manifest[field])} != ${JSON.stringify(expected)}`)
    }
  }
  if (manifest.source_materials?.manifest !== sourceMediaManifestUrl) {
    failures.push(`${lesson.id}: deck.json source_materials.manifest does not match the lesson source media`)
  }
}

for (const legacyDir of [path.join(zhDir, 'sample-2026'), path.join(zhDir, 'materials')]) {
  if (await exists(legacyDir)) failures.push(`legacy public directory must not exist: ${path.relative(root, legacyDir)}`)
}

for (const module of expectedModules) {
  const file = path.join(zhDir, module.id, 'index.md')
  if (!(await exists(file))) continue
  const text = await fs.readFile(file, 'utf8')
  const h1Count = [...text.matchAll(/^#\s+.+$/gm)].length + [...text.matchAll(/<h1\b[^>]*>/g)].length
  if (h1Count !== 1) failures.push(`${module.id}: expected exactly one H1, found ${h1Count}`)
}

const actualPages = new Set(await collectIndexPages(zhDir))
for (const file of expectedPages) {
  if (!actualPages.has(file)) failures.push(`missing expected public page ${path.relative(root, file)}`)
}
for (const file of actualPages) {
  if (!expectedPages.has(file)) failures.push(`unexpected public page ${path.relative(root, file)}`)
}

if (failures.length) {
  console.error('Web course verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `Verified ${catalog.modules.length} modules, ${lessons.length} learner-facing lesson routes, page-level slide manifests, complete inline course media, and public assets.`
)
