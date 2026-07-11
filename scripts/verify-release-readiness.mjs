import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = path.join(root, '课程PPT框架', 'source')
const publicRoot = path.join(root, 'docs', 'public')
const failures = []
const readJson = async (name) => JSON.parse(await fs.readFile(path.join(sourceRoot, name), 'utf8'))

const publicDeckCheck = spawnSync(process.execPath, [path.join(root, 'scripts', 'verify-public-decks.mjs')], {
  cwd: root,
  encoding: 'utf8'
})
if (publicDeckCheck.status !== 0) {
  failures.push(`public deck verification failed:\n${publicDeckCheck.stderr || publicDeckCheck.stdout}`)
}

const [catalog, publicPlan, assetRights] = await Promise.all([
  readJson('course-catalog.json'),
  readJson('course-decks.public.json'),
  readJson('course-asset-rights.json')
])
const lessons = catalog.modules.flatMap((module) => module.lessons)
const requiredStatusFields = [
  'source_ready', 'deck_ready', 'notes_ready', 'fact_checked',
  'rights_cleared', 'browser_verified', 'publish_ready'
]

if (catalog.modules.length !== 4 || lessons.length !== 27) failures.push('release catalog must contain four modules and 27 lessons')
for (const lesson of lessons) {
  for (const field of requiredStatusFields) {
    if (lesson.status?.[field] !== true) failures.push(`${lesson.id}: status.${field} must be true`)
  }
}

for (const deck of publicPlan.lessons || []) {
  if (deck.status !== 'ready') failures.push(`${deck.lesson_id}: public deck status must be ready`)
  if (deck.rights?.basis !== 'team-original-remake') failures.push(`${deck.lesson_id}: invalid public rights basis`)
  if (deck.rights?.third_party_media_count !== 0) failures.push(`${deck.lesson_id}: public deck contains third-party media`)
  if (deck.rights?.public_review_required !== false) failures.push(`${deck.lesson_id}: public review must be complete`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deck.rights?.reviewed_at || '')) failures.push(`${deck.lesson_id}: reviewed_at is missing`)
  if (typeof deck.rights?.reviewed_by !== 'string' || !deck.rights.reviewed_by.trim()) failures.push(`${deck.lesson_id}: reviewed_by is missing`)
}

const collectFiles = async (directory) => {
  const files = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(target))
    else if (entry.isFile()) files.push(target)
  }
  return files
}

const rightsEntries = Array.isArray(assetRights.assets) ? assetRights.assets : []
if (assetRights.schema_version !== 2 || assetRights.policy !== 'public-original-assets-only') {
  failures.push('course asset rights must use the public-original-assets-only v2 policy')
}
for (const entry of rightsEntries) {
  const assetPath = entry?.asset_path
  if (typeof assetPath !== 'string' || !assetPath.startsWith('/course-assets/')) {
    failures.push(`invalid asset rights path: ${JSON.stringify(assetPath)}`)
    continue
  }
  const target = path.join(publicRoot, assetPath.slice(1))
  try { await fs.access(target) } catch { failures.push(`${assetPath}: rights entry target is missing`) }
  if (!['team-original', 'generated-original'].includes(entry.classification)) failures.push(`${assetPath}: invalid public classification`)
  if (entry.third_party_media_count !== 0) failures.push(`${assetPath}: third_party_media_count must be zero`)
  if (entry.public_review_required !== false) failures.push(`${assetPath}: public review must be complete`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewed_at || '')) failures.push(`${assetPath}: reviewed_at is missing`)
  if (typeof entry.reviewed_by !== 'string' || !entry.reviewed_by.trim()) failures.push(`${assetPath}: reviewed_by is missing`)
}

const files = await collectFiles(path.join(publicRoot, 'course-assets'))
const forbiddenExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.mov', '.webm'])
for (const file of files) {
  const assetPath = `/${path.relative(publicRoot, file).split(path.sep).join('/')}`
  const covered = rightsEntries.some((entry) => entry.asset_path.endsWith('/')
    ? assetPath.startsWith(entry.asset_path)
    : assetPath === entry.asset_path)
  if (!covered) failures.push(`${assetPath}: missing public asset rights coverage`)
  if (forbiddenExtensions.has(path.extname(file).toLowerCase())) failures.push(`${assetPath}: raster or video assets are forbidden in the rights-safe public course`)
}

if (failures.length) {
  console.error('Public release readiness failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Public release readiness passed for ${lessons.length} lessons, ${publicPlan.lessons.length} native Web decks, ${publicPlan.lessons.length} original PPTX files, and zero third-party media assets.`)
