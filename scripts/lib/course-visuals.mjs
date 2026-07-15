import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getCourseVisualCopy, validateCourseVisualCopy } from './course-visual-copy.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const indexFile = path.join(root, 'docs', 'public', 'course-assets', 'lesson-media', 'visuals-index.json')
const visualBlockPattern = /\n{2}<!-- course-visual:start\b[^>]*-->[\s\S]*?<!-- course-visual:end -->\n*/g

const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'))
const assets = new Map(index.assets.map((asset) => [asset.lesson_id, Object.freeze(asset)]))
validateCourseVisualCopy([...assets.keys()])

if (assets.size !== 25 || assets.size !== index.assets.length) {
  throw new Error(`Course visual index must contain 25 unique lesson assets; found ${assets.size}/${index.assets.length}`)
}
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const COURSE_VISUAL_POLICY = index.policy
export const COURSE_VISUAL_ASSETS = Object.freeze([...assets.values()])

export const courseVisualForLesson = (lessonId) => assets.get(lessonId) ?? null

export const buildCourseVisualBlock = (lessonId) => {
  const asset = courseVisualForLesson(lessonId)
  if (!asset) return ''
  const copy = getCourseVisualCopy(lessonId)
  if (asset.alt !== copy.alt || asset.caption !== copy.caption) {
    throw new Error(`${lessonId}: visual copy drifted from the auditable asset index`)
  }
  return [
    `<!-- course-visual:start lesson=${lessonId} sha256=${asset.sha256} -->`,
    '<figure class="ai-course-visual">',
    `  <img src="${escapeHtml(asset.public_url)}" alt="${escapeHtml(copy.alt)}" loading="lazy" decoding="async">`,
    `  <figcaption><strong>学习提示：</strong>${escapeHtml(copy.caption)}</figcaption>`,
    '</figure>',
    '<!-- course-visual:end -->'
  ].join('\n')
}

export const syncCourseVisualBlock = (content, lessonId) => {
  let result = String(content).replace(visualBlockPattern, '\n\n')
  const asset = courseVisualForLesson(lessonId)
  if (!asset) return result
  const copy = getCourseVisualCopy(lessonId)
  const headingPattern = new RegExp(`^${escapeRegExp(copy.after_heading)}[ \\t]*$`, 'gmu')
  const matches = [...result.matchAll(headingPattern)]
  if (matches.length !== 1) {
    throw new Error(`${lessonId}: expected one learner heading ${copy.after_heading}, found ${matches.length}`)
  }
  const insertion = matches[0].index + matches[0][0].length
  return `${result.slice(0, insertion)}\n\n${buildCourseVisualBlock(lessonId)}${result.slice(insertion)}`
}
