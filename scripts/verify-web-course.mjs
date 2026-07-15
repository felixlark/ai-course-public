import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncCourseMediaBlocks } from './lib/pptx-derived-content.mjs'
import { COURSE_MEDIA_ASSETS, COURSE_MEDIA_PUBLIC_ROOT, courseMediaAssetsForLesson } from './lib/course-media.mjs'
import {
  COURSE_VISUAL_ASSETS,
  COURSE_VISUAL_POLICY,
  buildCourseVisualBlock,
  courseVisualForLesson,
  syncCourseVisualBlock
} from './lib/course-visuals.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.join(root, '课程PPT框架', 'source')
const docsDir = path.join(root, 'docs', 'zh-cn')
const failures = []
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const catalog = JSON.parse(await fs.readFile(path.join(sourceDir, 'course-catalog.json'), 'utf8'))
const slideUrls = new Set()
const wikiUrls = new Set()

const lessons = catalog.modules.flatMap((catalogModule) =>
  catalogModule.lessons.map((lesson) => ({ catalogModule, lesson }))
)

if (catalog.schema_version !== 3) failures.push('course catalog must use schema version 3')
if (catalog.modules.length !== 4 || lessons.length !== 27) failures.push('course catalog must contain four modules and 27 lessons')
if (!/^https:\/\/xmu-mars\.feishu\.cn\/wiki\/[A-Za-z0-9]+$/.test(catalog.feishu_wiki?.root_url || '')) {
  failures.push('course catalog is missing the Feishu Wiki root URL')
}

for (const { lesson } of lessons) {
  const slidesUrl = lesson.slides?.url || ''
  const wikiUrl = lesson.slides?.wiki_url || ''
  if (!/^https:\/\/xmu-mars\.feishu\.cn\/wiki\/[A-Za-z0-9]+$/.test(slidesUrl)) failures.push(`${lesson.id}: invalid original Feishu courseware URL`)
  if (!/^https:\/\/xmu-mars\.feishu\.cn\/wiki\/[A-Za-z0-9]+$/.test(wikiUrl)) failures.push(`${lesson.id}: invalid Feishu Wiki URL`)
  if (slidesUrl !== wikiUrl) failures.push(`${lesson.id}: playback and maintenance must use the same original Wiki node`)
  if (!['file', 'slides'].includes(lesson.slides?.source_type)) failures.push(`${lesson.id}: invalid original courseware type`)
  if (!lesson.slides?.source_title || !/\.pptx$/i.test(lesson.slides?.local_pptx || '')) failures.push(`${lesson.id}: missing original local PPTX mapping`)
  if (slideUrls.has(slidesUrl)) failures.push(`${lesson.id}: duplicate original courseware URL`)
  if (wikiUrls.has(wikiUrl)) failures.push(`${lesson.id}: duplicate Feishu Wiki URL`)
  slideUrls.add(slidesUrl)
  wikiUrls.add(wikiUrl)
}

const courseMediaDir = path.join(root, 'docs', 'public', COURSE_MEDIA_PUBLIC_ROOT.replace(/^\//, ''))
const courseMediaIndex = await fs.readFile(path.join(courseMediaDir, 'index.json'), 'utf8').then(JSON.parse).catch(() => null)
if (!courseMediaIndex) {
  failures.push('independent course media index is missing')
} else {
  if (courseMediaIndex.policy !== 'independent-course-media-no-slide-raster') failures.push('course media index has an unexpected policy')
  if (courseMediaIndex.source?.kind !== 'curated-course-media') failures.push('course media index must not depend on a public PPTX runtime')
  const indexedById = new Map((courseMediaIndex.assets || []).map((item) => [item.id, item]))
  for (const item of COURSE_MEDIA_ASSETS) {
    const indexed = indexedById.get(item.id)
    if (!indexed) {
      failures.push(`${item.id}: missing from course media index`)
      continue
    }
    const value = await fs.readFile(path.join(courseMediaDir, item.file_name)).catch(() => null)
    if (!value) failures.push(`${item.id}: published MP4 is missing`)
    else if (indexed.size !== value.length || indexed.sha256 !== sha256(value)) failures.push(`${item.id}: published MP4 hash or size drifted`)
  }
}

let sectionCount = 0
for (const { catalogModule, lesson } of lessons) {
  const file = path.join(docsDir, catalogModule.id, `${lesson.id.toLowerCase()}-${lesson.slug}`, 'index.md')
  const text = await fs.readFile(file, 'utf8').catch(() => '')
  if (!text) {
    failures.push(`${lesson.id}: lesson Markdown is missing`)
    continue
  }
  if (!text.includes(`slides_url: '${lesson.slides.url}'`)) failures.push(`${lesson.id}: wrong slides_url`)
  if (!text.includes(`slides_wiki_url: '${lesson.slides.wiki_url}'`)) failures.push(`${lesson.id}: wrong slides_wiki_url`)
  if (!/^authored:\s*true\s*$/m.test(text)) failures.push(`${lesson.id}: authored learner-facing expansion is required`)
  if (/^pptx(?:_|:)|module-pptx|<LessonDeck\b|pptx-derived:|pptx-viewer/mi.test(text)) failures.push(`${lesson.id}: retired PPTX player metadata remains`)

  try {
    if (syncCourseMediaBlocks(text, lesson.id) !== text) failures.push(`${lesson.id}: inline course media drifted`)
  } catch (error) {
    failures.push(`${lesson.id}: ${error.message}`)
  }
  try {
    if (syncCourseVisualBlock(text, lesson.id) !== text) failures.push(`${lesson.id}: course visual drifted`)
  } catch (error) {
    failures.push(`${lesson.id}: ${error.message}`)
  }

  const expectedVisual = courseVisualForLesson(lesson.id)
  const visualBlockCount = [...text.matchAll(/<!-- course-visual:start\b/gmu)].length
  if (visualBlockCount !== (expectedVisual ? 1 : 0)) failures.push(`${lesson.id}: unexpected course visual block count ${visualBlockCount}`)
  if (expectedVisual && !text.includes(buildCourseVisualBlock(lesson.id))) failures.push(`${lesson.id}: missing learner-facing course visual`)

  const expectedMedia = courseMediaAssetsForLesson(lesson.id)
  const videoCount = [...text.matchAll(/<video\b/gmu)].length
  if (videoCount !== expectedMedia.length) failures.push(`${lesson.id}: expected ${expectedMedia.length} inline video(s), found ${videoCount}`)
  for (const media of expectedMedia) {
    if (!text.includes(`<source src="${media.public_url}" type="video/mp4">`)) failures.push(`${lesson.id}: missing inline video ${media.id}`)
  }

  for (const heading of ['## 学习目标', '## 本节导入']) {
    if (!text.includes(heading)) failures.push(`${lesson.id}: missing ${heading}`)
  }
  const sections = [...text.matchAll(/^##\s+(.+)$/gmu)].length
  if (sections < 4) failures.push(`${lesson.id}: structured Markdown has only ${sections} level-two sections`)
  sectionCount += sections
}

if (COURSE_VISUAL_POLICY !== 'native-pptx-and-structured-course-visuals-no-slide-raster' || COURSE_VISUAL_ASSETS.length !== 25) {
  failures.push('course visual index is missing or has an unexpected no-slide-raster policy')
}

const home = await fs.readFile(path.join(docsDir, 'index.md'), 'utf8')
if (!home.includes('直接在飞书 Web PPT 中打开本节课件')) failures.push('course home does not explain Feishu Slides playback')

const runtimeFiles = [
  path.join(root, 'docs', '.vitepress', 'theme', 'Layout.vue'),
  path.join(root, 'docs', '.vitepress', 'theme', 'components', 'LessonSlidesLink.vue'),
  path.join(root, 'package.json')
]
for (const file of runtimeFiles) {
  const text = await fs.readFile(file, 'utf8')
  if (/WPS|WebOffice|Microsoft 365|pptx-viewer|LessonDeck|module-pptx/i.test(text)) failures.push(`${path.relative(root, file)}: retired office player reference remains`)
}
const retiredRuntime = path.join(root, 'docs', 'public', 'course-assets', 'module-pptx')
const retiredEntries = await fs.readdir(retiredRuntime).catch(() => [])
if (retiredEntries.length) failures.push(`retired module-pptx runtime still contains: ${retiredEntries.join(', ')}`)

if (failures.length) {
  console.error('Web course verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Verified ${lessons.length} Markdown/original-courseware pairs, ${COURSE_VISUAL_ASSETS.length} visuals, ${COURSE_MEDIA_ASSETS.length} videos and ${sectionCount} lesson sections.`)
