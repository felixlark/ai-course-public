import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CURATED_EXCLUSIONS,
  CURATED_VISUAL_REVIEWS,
  LESSON_SELECTION_OVERRIDES,
  VISUAL_POLICY,
  inspectOutputImage
} from './lib/pptx-course-visuals.mjs'
import { getCourseVisualCopy, validateCourseVisualCopy } from './lib/course-visual-copy.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const sourceDir = path.join(root, '课程PPT框架', 'source')
const publicDir = path.join(root, 'docs', 'public')
const indexFile = path.join(publicDir, 'course-assets', 'lesson-media', 'visuals-index.json')
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'))
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')

const [catalog, index] = await Promise.all([
  readJson(path.join(sourceDir, 'course-catalog.json')),
  readJson(indexFile)
])

const catalogLessons = new Set(catalog.modules.flatMap((module) => module.lessons.map((lesson) => lesson.id)))
const expected = [...catalogLessons]
  .filter((lessonId) => !VISUAL_POLICY.excluded_lessons.includes(lessonId))
  .sort()
const actual = index.assets.map((asset) => asset.lesson_id).sort()
const failures = []
validateCourseVisualCopy(expected)

if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push('Global visual index does not cover the expected 25 lessons exactly once')
if (index.coverage.required_lessons !== expected.length || index.coverage.selected_assets !== expected.length) {
  failures.push('Global visual coverage counts are inconsistent')
}
if (index.policy !== 'native-pptx-and-structured-course-visuals-no-slide-raster') {
  failures.push('Global visual index has an unexpected no-slide-raster policy')
}

for (const asset of index.assets) {
  if (!catalogLessons.has(asset.lesson_id)) failures.push(`${asset.lesson_id}: missing course catalog lesson`)
  if (!/^[a-f0-9]{64}$/.test(asset.source_pptx_sha256 || '')) failures.push(`${asset.lesson_id}: source PPTX hash is invalid`)
  if (asset.source_kind === 'native-group-rendering') {
    if (!/^ppt\/slides\/slide\d+\.xml#native-group-/.test(asset.source_entry)) failures.push(`${asset.lesson_id}: native group source_entry is invalid`)
    if (!Array.isArray(asset.source_entries) || asset.source_entries.length < 2 || asset.source_entries.some((entry) => !/^ppt\/media\/[^/]+$/.test(entry))) {
      failures.push(`${asset.lesson_id}: native group source media lineage is invalid`)
    }
  } else if (asset.source_kind === 'structured-course-diagram') {
    if (!/^ppt\/slides\/slide\d+\.xml#structured-course-/.test(asset.source_entry)) failures.push(`${asset.lesson_id}: structured diagram source_entry is invalid`)
    if (!Array.isArray(asset.source_entries) || asset.source_entries.length !== 0) failures.push(`${asset.lesson_id}: structured diagram must not claim source media parts`)
  } else if (!/^ppt\/media\/[^/]+$/.test(asset.source_entry)) failures.push(`${asset.lesson_id}: source_entry is not a PPTX media part`)
  if (!Array.isArray(asset.source_slides) || asset.source_slides.length === 0 || asset.source_slides.some((slide) => !Number.isInteger(slide) || slide < 1)) {
    failures.push(`${asset.lesson_id}: visual source slide lineage is invalid`)
  }
  if (asset.geometry.area_ratio > VISUAL_POLICY.maximum_geometry_ratio) failures.push(`${asset.lesson_id}: selected image exceeds full-slide threshold`)
  if (asset.geometry.area_ratio < VISUAL_POLICY.minimum_geometry_ratio) failures.push(`${asset.lesson_id}: selected image is below geometry threshold`)
  if (CURATED_EXCLUSIONS[asset.sha256]) failures.push(`${asset.lesson_id}: selected image is on the curated exclusion list`)
  if (/\bslide[-_ ]?\d+\.(?:png|jpe?g|gif|webp)$/i.test(asset.output_file)) failures.push(`${asset.lesson_id}: output resembles a slide raster filename`)
  const visualCopy = getCourseVisualCopy(asset.lesson_id)
  if (asset.alt !== visualCopy.alt || asset.caption !== visualCopy.caption || !asset.caption.startsWith('观察：')) failures.push(`${asset.lesson_id}: learner-facing alt/caption drifted`)
  if (/(?:知识锚点|源页|第\s*\d+\s*页)/.test(`${asset.alt} ${asset.caption}`)) failures.push(`${asset.lesson_id}: alt/caption exposes production lineage`)
  const override = LESSON_SELECTION_OVERRIDES[asset.lesson_id]
  const expectedOverrideHash = override?.kind ? asset.sha256 : (override?.sha256 ?? null)
  if (expectedOverrideHash !== (asset.selection_override?.sha256 ?? null) || (override?.kind ?? null) !== (asset.selection_override?.kind ?? null)) {
    failures.push(`${asset.lesson_id}: selection override metadata mismatch`)
  }
  const review = CURATED_VISUAL_REVIEWS[asset.lesson_id]
  if (!review || review.sha256 !== asset.sha256 || asset.visual_review?.status !== 'approved' || asset.visual_review?.sha256 !== asset.sha256) {
    failures.push(`${asset.lesson_id}: missing or stale visual review`)
  }

  const outputFile = path.join(publicDir, asset.output_file)
  try {
    const buffer = await fs.readFile(outputFile)
    if (buffer.length !== asset.size) failures.push(`${asset.lesson_id}: output size mismatch`)
    if (hash(buffer) !== asset.sha256) failures.push(`${asset.lesson_id}: output SHA-256 mismatch`)
    const metadata = await inspectOutputImage(outputFile, path.extname(outputFile).toLowerCase())
    if (metadata.width !== asset.width || metadata.height !== asset.height) failures.push(`${asset.lesson_id}: output dimensions mismatch`)
    if (metadata.alpha_mean < VISUAL_POLICY.minimum_visible_alpha_mean) failures.push(`${asset.lesson_id}: output is transparent or visually sparse decoration`)
  } catch (error) {
    failures.push(`${asset.lesson_id}: cannot verify output (${error.message})`)
  }
}

for (const moduleSummary of index.modules) {
  const moduleIndexFile = path.join(publicDir, moduleSummary.index.replace(/^\//, ''))
  try {
    const moduleIndex = await readJson(moduleIndexFile)
    const globalAssets = index.assets.filter((asset) => asset.module_id === moduleSummary.module_id)
    if (JSON.stringify(moduleIndex.assets) !== JSON.stringify(globalAssets)) failures.push(`${moduleSummary.module_id}: module and global indexes differ`)
    if (moduleIndex.coverage.selected_assets !== globalAssets.length) failures.push(`${moduleSummary.module_id}: module coverage count mismatch`)
  } catch (error) {
    failures.push(`${moduleSummary.module_id}: cannot read module index (${error.message})`)
  }
}

if (failures.length) {
  console.error(`Course visual verification failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log(`Verified ${index.assets.length}/${expected.length} PPTX-derived lesson visuals with lineage, geometry, hashes, dimensions and transparency checks.`)
