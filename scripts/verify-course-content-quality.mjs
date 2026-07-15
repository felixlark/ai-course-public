import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.join(root, '课程PPT框架', 'source')
const docsDir = path.join(root, 'docs', 'zh-cn')
const acceptanceFile = path.join(sourceDir, 'course-content-acceptance.json')
const failures = []
const requiredChecks = [
  'learner_opening',
  'concept_accuracy_and_boundaries',
  'source_case_or_observation',
  'practice_or_checkpoint',
  'recap',
  'primary_sources_and_dates',
  'media_placement'
]

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const reviewableContent = (value) => String(value).replace(/^---[\s\S]*?---\s*/, '').trim()
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'))
const sectionBody = (text, heading) => {
  const marker = `## ${heading}`
  const markerIndex = text.indexOf(marker)
  if (markerIndex < 0) return ''
  const bodyStart = text.indexOf('\n', markerIndex + marker.length)
  if (bodyStart < 0) return ''
  const remaining = text.slice(bodyStart + 1)
  const nextHeading = remaining.search(/^##\s/mu)
  return nextHeading < 0 ? remaining : remaining.slice(0, nextHeading)
}

const [catalog, acceptance] = await Promise.all([
  readJson(path.join(sourceDir, 'course-catalog.json')),
  readJson(acceptanceFile).catch((error) => {
    failures.push(`cannot read course content acceptance: ${error.message}`)
    return null
  })
])

if (acceptance) {
  if (acceptance.schema_version !== 3 || acceptance.rubric_id !== 'ppt-to-learning-document-v1' || acceptance.hash_scope !== 'learner-body') {
    failures.push('course content acceptance must use learner-body hash scope and schema version 3')
  }
  if (!/original Feishu courseware/i.test(acceptance.source_contract || '')) {
    failures.push('course content acceptance must declare the original Feishu courseware source contract')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acceptance.reviewed_at || '')) {
    failures.push('course content acceptance reviewed_at must be an ISO date')
  }
}

const expectedLessons = catalog.modules.flatMap((catalogModule) =>
  catalogModule.lessons.map((lesson) => ({ catalogModule, lesson }))
)
const results = Array.isArray(acceptance?.lessons) ? acceptance.lessons : []
const resultsById = new Map()
for (const result of results) {
  if (resultsById.has(result?.lesson_id)) failures.push(`duplicate content acceptance result: ${result?.lesson_id}`)
  resultsById.set(result?.lesson_id, result)
}
const expectedIds = expectedLessons.map(({ lesson }) => lesson.id).sort()
if (JSON.stringify([...resultsById.keys()].sort()) !== JSON.stringify(expectedIds)) {
  failures.push('course content acceptance must cover all 27 catalog lessons exactly once')
}

for (const { catalogModule, lesson } of expectedLessons) {
  const result = resultsById.get(lesson.id)
  if (!result) continue
  const relativeFile = path.posix.join(
    'docs/zh-cn',
    catalogModule.id,
    `${lesson.id.toLowerCase()}-${lesson.slug}`,
    'index.md'
  )
  const file = path.join(root, relativeFile)
  const text = await fs.readFile(file, 'utf8').catch(() => '')
  if (!text) {
    failures.push(`${lesson.id}: lesson file is missing`)
    continue
  }
  if (result.file !== relativeFile) failures.push(`${lesson.id}: acceptance file path drifted`)
  if (result.content_sha256 !== sha256(reviewableContent(text))) failures.push(`${lesson.id}: learner body changed after content-quality review`)
  if (result.status !== 'passed') failures.push(`${lesson.id}: content-quality status must be passed`)
  if (typeof result.review_note !== 'string' || result.review_note.trim().length < 8) {
    failures.push(`${lesson.id}: content-quality review note is missing or too vague`)
  }
  for (const check of requiredChecks) {
    if (result.checks?.[check] !== true) failures.push(`${lesson.id}: manual rubric check ${check} is not passed`)
  }

  const intro = sectionBody(text, '本节导入')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '')
  if (intro.length < 60) failures.push(`${lesson.id}: learner-facing introduction is too thin`)
  if (!/^## 动手实践\s*$/mu.test(text)) failures.push(`${lesson.id}: missing an explicit learner practice`)
  if (!/^## 课后复盘\s*$/mu.test(text)) failures.push(`${lesson.id}: missing an explicit recap`)
  if (!/^## 资料与延伸\s*$/mu.test(text)) failures.push(`${lesson.id}: missing sources and further reading`)
  const sources = sectionBody(text, '资料与延伸')
  if (!/https:\/\//.test(sources)) failures.push(`${lesson.id}: sources section has no clickable primary/reference URL`)
  if (!/(案例|场景|观察|示例|任务)/.test(text)) failures.push(`${lesson.id}: no concrete case, scene, observation, example, or task was found`)
}

if (failures.length) {
  console.error('Course content quality verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Verified ${expectedLessons.length} learner-facing lessons against the hash-bound ppt-to-learning-document quality rubric.`)
