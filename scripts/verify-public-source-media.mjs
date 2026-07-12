import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = path.join(root, 'docs', 'public')
const mediaRoot = path.join(publicRoot, 'course-assets', 'source-media')
const catalog = JSON.parse(await fs.readFile(path.join(root, '课程PPT框架/source/course-catalog.json'), 'utf8'))
const lessons = catalog.modules.flatMap((module) => module.lessons)
const failures = []
const expected = {
  lessons: 27,
  sourcePages: 454,
  imageReferences: 963,
  embeddedVideos: 24,
  publishedVideos: 24
}

const exists = async (file) => fs.access(file).then(() => true).catch(() => false)
const filesUnder = async (directory) => {
  const files = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue
    const target = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) failures.push(`symbolic link is forbidden: ${path.relative(root, target)}`)
    else if (entry.isDirectory()) files.push(...await filesUnder(target))
    else if (entry.isFile()) files.push(target)
  }
  return files
}
const resolvePublic = (url, lessonId, field) => {
  if (typeof url !== 'string' || !url.startsWith('/course-assets/source-media/')) {
    failures.push(`${lessonId}: ${field} must stay under /course-assets/source-media/`)
    return null
  }
  const target = path.resolve(publicRoot, url.slice(1))
  if (!target.startsWith(`${mediaRoot}${path.sep}`)) {
    failures.push(`${lessonId}: ${field} escapes the source-media root`)
    return null
  }
  return target
}
const checkAsset = async (url, bytes, lessonId, field, suffixes) => {
  const target = resolvePublic(url, lessonId, field)
  if (!target) return null
  if (!suffixes.includes(path.extname(target).toLowerCase())) failures.push(`${lessonId}: ${field} has unsupported extension`)
  if (!(await exists(target))) {
    failures.push(`${lessonId}: ${field} is missing: ${url}`)
    return target
  }
  const stat = await fs.stat(target)
  if (!stat.size || stat.size !== bytes) failures.push(`${lessonId}: ${field} byte count does not match: ${url}`)
  if (stat.size >= 100_000_000) failures.push(`${lessonId}: ${field} is at least 100 MB: ${url}`)
  return target
}

if (lessons.length !== expected.lessons) failures.push(`catalog lesson count ${lessons.length} != ${expected.lessons}`)
const expectedFiles = new Set()
let sourcePages = 0
let imageReferences = 0
let embeddedVideos = 0
let publishedVideos = 0
let assetBytes = 0

for (const lesson of lessons) {
  const id = lesson.id
  const idLower = id.toLowerCase()
  const directory = path.join(mediaRoot, idLower)
  const manifestFile = path.join(directory, 'deck.json')
  expectedFiles.add(manifestFile)
  if (!(await exists(manifestFile))) {
    failures.push(`${id}: source-media deck.json is missing`)
    continue
  }
  let deck
  try { deck = JSON.parse(await fs.readFile(manifestFile, 'utf8')) } catch (error) {
    failures.push(`${id}: source-media deck.json is invalid (${error.message})`)
    continue
  }
  const serialized = JSON.stringify(deck)
  if (/(?:\/Users\/|\/Volumes\/|file:\/\/|飞书导入-|"source_path")/.test(serialized)) {
    failures.push(`${id}: source-media manifest exposes a private path or archive marker`)
  }
  if (deck.schema_version !== 1 || deck.render_pipeline_version !== 2 || deck.render_mode !== 'full-page') {
    failures.push(`${id}: source-media schema or render mode is invalid`)
  }
  if (deck.lesson_id !== id || deck.public_asset_dir !== `/course-assets/source-media/${idLower}`) {
    failures.push(`${id}: source-media identity or asset directory is invalid`)
  }
  if (typeof deck.source?.title !== 'string' || !deck.source.title.trim() || 'path' in (deck.source || {})) {
    failures.push(`${id}: source title is missing or local source path leaked`)
  }
  if (deck.rights?.classification !== 'team-course-source' || deck.rights?.public_review_required !== false) {
    failures.push(`${id}: public source-media rights metadata is incomplete`)
  }
  if (deck.video_policy?.mode !== 'extract') failures.push(`${id}: embedded videos are not configured for publication`)
  if (!Array.isArray(deck.selected_source_pages) || !deck.selected_source_pages.length || new Set(deck.selected_source_pages).size !== deck.selected_source_pages.length) {
    failures.push(`${id}: selected source pages are missing or duplicated`)
  }
  if (!Array.isArray(deck.slides) || deck.slides.length !== deck.selected_source_pages?.length) {
    failures.push(`${id}: source slide count does not match selected pages`)
    continue
  }

  let lessonImageReferences = 0
  let lessonEmbeddedVideos = 0
  let lessonPublishedVideos = 0
  for (const [index, slide] of deck.slides.entries()) {
    const label = `${id}.slides[${index}]`
    if (slide.lesson_slide !== index + 1 || slide.source_page !== deck.selected_source_pages[index]) {
      failures.push(`${label}: source page order is invalid`)
    }
    if (
      slide.image?.width !== 1600 ||
      !Number.isInteger(slide.image?.height) ||
      slide.image.height < 880 ||
      slide.image.height > 1220
    ) failures.push(`${label}: source page render dimensions are invalid`)
    for (const [key, suffixes] of [['jpeg', ['.jpg', '.jpeg']], ['webp', ['.webp']]]) {
      const target = await checkAsset(slide.image?.[key], slide.image?.[`${key}_bytes`], id, `${label}.image.${key}`, suffixes)
      if (target) {
        expectedFiles.add(target)
        assetBytes += slide.image?.[`${key}_bytes`] || 0
      }
    }
    const media = slide.source_media || {}
    lessonImageReferences += media.image_count || 0
    lessonEmbeddedVideos += media.video_count || 0
    const videos = Array.isArray(slide.videos) ? slide.videos : []
    if (videos.length !== (media.video_count || 0)) failures.push(`${label}: video records do not match source media count`)
    for (const [videoIndex, video] of videos.entries()) {
      if (video.status !== 'published') failures.push(`${label}: video ${videoIndex + 1} is not published`)
      else lessonPublishedVideos += 1
      const videoTarget = await checkAsset(video.src, video.bytes, id, `${label}.videos[${videoIndex}].src`, ['.mp4'])
      const posterTarget = await checkAsset(video.poster, video.poster_bytes, id, `${label}.videos[${videoIndex}].poster`, ['.jpg', '.jpeg'])
      if (videoTarget) { expectedFiles.add(videoTarget); assetBytes += video.bytes || 0 }
      if (posterTarget) { expectedFiles.add(posterTarget); assetBytes += video.poster_bytes || 0 }
    }
  }
  const summary = deck.source_media_summary || {}
  const expectedSummary = {
    selected_pages: deck.slides.length,
    image_references: lessonImageReferences,
    pages_with_images: deck.slides.filter((slide) => (slide.source_media?.image_count || 0) > 0).length,
    embedded_videos: lessonEmbeddedVideos,
    published_videos: lessonPublishedVideos
  }
  for (const [field, value] of Object.entries(expectedSummary)) {
    if (summary[field] !== value) failures.push(`${id}: source_media_summary.${field} ${summary[field]} != ${value}`)
  }
  if (lessonImageReferences < 1) failures.push(`${id}: lesson exposes no real source image references`)
  sourcePages += deck.slides.length
  imageReferences += lessonImageReferences
  embeddedVideos += lessonEmbeddedVideos
  publishedVideos += lessonPublishedVideos
}

for (const [field, actual] of Object.entries({ sourcePages, imageReferences, embeddedVideos, publishedVideos })) {
  if (actual !== expected[field]) failures.push(`total ${field} ${actual} != ${expected[field]}`)
}

if (await exists(mediaRoot)) {
  const actualFiles = new Set(await filesUnder(mediaRoot))
  for (const file of actualFiles) if (!expectedFiles.has(file)) failures.push(`unreferenced source-media asset: ${path.relative(root, file)}`)
  for (const file of expectedFiles) if (!actualFiles.has(file)) failures.push(`referenced source-media asset is absent: ${path.relative(root, file)}`)
}

if (failures.length) {
  console.error('Public source-media verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(
  `Verified ${expected.lessons} source decks, ${sourcePages} original PowerPoint pages, ` +
  `${imageReferences} real image references, and ${publishedVideos}/${embeddedVideos} playable embedded videos ` +
  `(${expectedFiles.size} files, ${(assetBytes / 1024 / 1024).toFixed(1)} MiB).`
)
