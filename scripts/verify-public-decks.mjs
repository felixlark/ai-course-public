import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = path.join(root, '课程PPT框架', 'source')
const specsRoot = path.join(root, '课程PPT框架', 'public-decks')
const publicRoot = path.join(root, 'docs', 'public')
const decksRoot = path.join(publicRoot, 'course-assets', 'course-decks')
const pptxRoot = path.join(publicRoot, 'course-assets', 'course-pptx')
const expectedLessonCount = 27
const expectedSlideCount = 336
const supportedTypes = new Set(['cover', 'objectives', 'core', 'case', 'practice', 'recap', 'sources'])
const forbiddenKeys = new Set([
  'source_path', 'source_page', 'sourceSlide', 'source_slide', 'selected_source_pages',
  'selected_slides', 'source_media', 'source_sha256', 'source_title', 'source_deck_ids',
  'private_slide_id', 'derived_from'
])
const failures = []

const relativeLuminance = (hex) => {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

const contrastRatio = (foreground, background) => {
  const first = relativeLuminance(foreground)
  const second = relativeLuminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'))
const fileExists = async (file) => fs.access(file).then(() => true).catch(() => false)

const walk = (value, visitor, field = '$') => {
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, visitor, `${field}[${index}]`))
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      visitor({ key, value: item, field: `${field}.${key}` })
      walk(item, visitor, `${field}.${key}`)
    }
  }
}

const titleIsValid = (title) => {
  if (typeof title !== 'string' || title.trim().length < 6 || title.trim().length > 28) return false
  if (/[？?…]/.test(title)) return false
  if (/^(?:学习目标|核心内容|案例与图解|动手实践|课后复盘|资料与延伸|Web PPT)$/.test(title)) return false
  if (/(?:课程制作|讲者|组件|\.vue|\/course-assets\/)/i.test(title)) return false
  if (/(?:、|与|和|或|以及)$/.test(title)) return false
  return true
}

const validateSlide = (lessonId, slide, index) => {
  const label = `${lessonId}: slides[${index}]`
  if (!slide || typeof slide !== 'object') return failures.push(`${label} must be an object`)
  if (slide.order !== index + 1) failures.push(`${label}.order must be ${index + 1}`)
  if (slide.slide_id !== `${lessonId}-S${String(index + 1).padStart(2, '0')}`) {
    failures.push(`${label}.slide_id is not deterministic`)
  }
  if (!supportedTypes.has(slide.type)) failures.push(`${label}.type is unsupported: ${slide.type}`)
  if (!titleIsValid(slide.title)) failures.push(`${label}.title is not a learner-facing claim: ${slide.title}`)
  if (slide.lesson_id !== lessonId) failures.push(`${label}.lesson_id does not match`)
  if (typeof slide.eyebrow !== 'string' || !slide.eyebrow.trim()) failures.push(`${label}.eyebrow is missing`)

  if (slide.type === 'cover') {
    for (const field of ['subtitle', 'lead']) {
      if (typeof slide[field] !== 'string' || !slide[field].trim()) failures.push(`${label}.${field} is missing`)
    }
  } else if (['objectives', 'practice', 'recap'].includes(slide.type)) {
    if (!Array.isArray(slide.items) || slide.items.length < 2 || slide.items.length > 4) {
      failures.push(`${label}.items must contain 2-4 learner-facing items`)
    }
    if ((slide.items || []).some((item) => typeof item !== 'string' || !item.trim())) failures.push(`${label}.items must contain non-empty strings`)
  } else if (slide.type === 'core') {
    if (!Array.isArray(slide.blocks) || slide.blocks.length < 1 || slide.blocks.length > 3) {
      failures.push(`${label}.blocks must contain 1-3 blocks`)
    }
    for (const [blockIndex, block] of (slide.blocks || []).entries()) {
      if (typeof block?.body !== 'string' || !block.body.trim()) failures.push(`${label}.blocks[${blockIndex}].body is missing`)
      if (block?.label != null && typeof block.label !== 'string') failures.push(`${label}.blocks[${blockIndex}].label must be a string`)
    }
  } else if (slide.type === 'case') {
    if (!Array.isArray(slide.cases) || slide.cases.length < 1 || slide.cases.length > 2) {
      failures.push(`${label}.cases must contain 1-2 cases`)
    }
    for (const [caseIndex, item] of (slide.cases || []).entries()) {
      if (typeof item?.label !== 'string' || !item.label.trim()) failures.push(`${label}.cases[${caseIndex}].label is missing`)
      if (!Array.isArray(item?.rows) || item.rows.length < 2 || item.rows.length > 5) {
        failures.push(`${label}.cases[${caseIndex}].rows must contain 2-5 rows`)
      }
      for (const [rowIndex, row] of (item?.rows || []).entries()) {
        if (typeof row?.label !== 'string' || !row.label.trim() || typeof row?.body !== 'string' || !row.body.trim()) {
          failures.push(`${label}.cases[${caseIndex}].rows[${rowIndex}] must contain label and body`)
        }
      }
    }
  } else if (slide.type === 'sources') {
    if (!Array.isArray(slide.items) || !slide.items.length || slide.items.length > 5) {
      failures.push(`${label}.items must contain 1-5 sources`)
    }
    for (const [itemIndex, item] of (slide.items || []).entries()) {
      if (typeof item?.label !== 'string' || !item.label.trim()) failures.push(`${label}.items[${itemIndex}].label is missing`)
      if (item?.url && !/^https:\/\//.test(item.url)) failures.push(`${label}.items[${itemIndex}].url must use HTTPS`)
    }
    if (typeof slide.note !== 'string' || !slide.note.trim()) failures.push(`${label}.note is missing`)
  }
}

const listFiles = async (directory) => {
  const results = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) results.push(...await listFiles(target))
    else if (entry.isFile() && entry.name !== '.DS_Store') results.push(target)
  }
  return results
}

const unzipList = (file) => {
  const result = spawnSync('unzip', ['-Z1', file], { encoding: 'utf8' })
  if (result.status !== 0) {
    failures.push(`${path.relative(root, file)}: unreadable PPTX (${result.stderr || result.stdout})`)
    return []
  }
  return result.stdout.split(/\r?\n/).filter(Boolean)
}

const unzipText = (file, member) => {
  const result = spawnSync('unzip', ['-p', file, member], { encoding: 'utf8' })
  if (result.status !== 0) return ''
  return result.stdout
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
}
const unzipRaw = (file, member) => {
  const result = spawnSync('unzip', ['-p', file, member], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout : ''
}

const decodeXmlText = (value) => value
  .replace(/<[^>]+>/g, '')
  .replaceAll('&amp;', '&')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"')
  .replaceAll('&apos;', "'")

const orderedPptxSlides = (file, members, lessonId) => {
  const presentationXml = unzipRaw(file, 'ppt/presentation.xml')
  const relationshipsXml = unzipRaw(file, 'ppt/_rels/presentation.xml.rels')
  const relationTargets = new Map()
  for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]+)>?/g)) {
    const attributes = match[1]
    const id = attributes.match(/\bId="([^"]+)"/)?.[1]
    const target = attributes.match(/\bTarget="([^"]+)"/)?.[1]
    const type = attributes.match(/\bType="([^"]+)"/)?.[1]
    if (id && target && /\/slide$/.test(type || '')) relationTargets.set(id, target)
  }
  const orderedIds = [...presentationXml.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"[^>]*\/?\s*>/g)].map((match) => match[1])
  const orderedMembers = orderedIds.map((id) => {
    const target = relationTargets.get(id)
    if (!target) return ''
    return target.startsWith('/')
      ? path.posix.normalize(target.slice(1))
      : path.posix.normalize(path.posix.join('ppt', target))
  })
  if (!orderedMembers.length || orderedMembers.some((member) => !member || !members.includes(member))) {
    failures.push(`${lessonId}: PPTX presentation order cannot be resolved safely`)
    return []
  }
  if (new Set(orderedMembers).size !== orderedMembers.length) failures.push(`${lessonId}: PPTX presentation order contains duplicate slides`)
  return orderedMembers
}

const [catalog, plan] = await Promise.all([
  readJson(path.join(sourceRoot, 'course-catalog.json')),
  readJson(path.join(sourceRoot, 'course-decks.public.json'))
])
const catalogLessons = catalog.modules.flatMap((module) => module.lessons.map((lesson) => ({ module, lesson })))
const catalogById = new Map(catalogLessons.map((item) => [item.lesson.id, item]))

if (catalog.modules.length !== 4) failures.push(`catalog module count ${catalog.modules.length} != 4`)
if (catalogLessons.length !== expectedLessonCount) failures.push(`catalog lesson count ${catalogLessons.length} != ${expectedLessonCount}`)
if (plan.schema_version !== 2 || plan.kind !== 'public-native-course-decks') failures.push('public deck plan must use schema v2 and public-native kind')
if (!Array.isArray(plan.lessons) || plan.lessons.length !== expectedLessonCount) failures.push(`public deck plan lesson count must be ${expectedLessonCount}`)

let slideCount = 0
const seenIds = new Set()
for (const record of plan.lessons || []) {
  const lessonId = record.lesson_id
  if (seenIds.has(lessonId)) failures.push(`${lessonId}: duplicate public deck record`)
  seenIds.add(lessonId)
  const catalogItem = catalogById.get(lessonId)
  if (!catalogItem) {
    failures.push(`${lessonId}: public deck is not in the catalog`)
    continue
  }
  if (record.status !== 'ready') failures.push(`${lessonId}: public deck status must be ready`)
  if (record.render_mode !== 'native-web') failures.push(`${lessonId}: render_mode must be native-web`)
  if (record.rights?.basis !== 'team-original-remake') failures.push(`${lessonId}: rights basis must be team-original-remake`)
  if (record.rights?.third_party_media_count !== 0) failures.push(`${lessonId}: third_party_media_count must be zero`)
  if (record.rights?.public_review_required !== false) failures.push(`${lessonId}: public_review_required must be false`)
  const idLower = lessonId.toLowerCase()
  const expectedManifestUrl = `/course-assets/course-decks/${idLower}/deck.json`
  const expectedPptxUrl = `/course-assets/course-pptx/${idLower}.pptx`
  if (record.manifest_url !== expectedManifestUrl) failures.push(`${lessonId}: manifest_url must be ${expectedManifestUrl}`)
  if (record.pptx_url !== expectedPptxUrl) failures.push(`${lessonId}: pptx_url must be ${expectedPptxUrl}`)

  const specFile = path.join(root, record.spec_path || '')
  const manifestFile = path.join(decksRoot, idLower, 'deck.json')
  const pptxFile = path.join(pptxRoot, `${idLower}.pptx`)
  for (const [label, file] of [['spec', specFile], ['manifest', manifestFile], ['PPTX', pptxFile]]) {
    if (!(await fileExists(file))) failures.push(`${lessonId}: missing ${label} ${path.relative(root, file)}`)
  }
  if (!(await fileExists(specFile)) || !(await fileExists(manifestFile)) || !(await fileExists(pptxFile))) continue

  const [specText, manifestText, pptxBytes] = await Promise.all([
    fs.readFile(specFile, 'utf8'), fs.readFile(manifestFile, 'utf8'), fs.readFile(pptxFile)
  ])
  if (specText !== manifestText) failures.push(`${lessonId}: public spec and Web manifest differ`)
  if (sha256(specText) !== record.spec_file_sha256) failures.push(`${lessonId}: spec_file_sha256 does not match the committed spec`)
  if (sha256(pptxBytes) !== record.pptx_sha256) failures.push(`${lessonId}: pptx_sha256 does not match the committed PPTX`)

  let deck
  try { deck = JSON.parse(specText) } catch (error) {
    failures.push(`${lessonId}: invalid public spec JSON (${error.message})`)
    continue
  }
  if (deck.schema_version !== 1 || deck.generator_version !== plan.generator_version || deck.aspect_ratio !== '16:9') {
    failures.push(`${lessonId}: spec schema, generator version, or aspect ratio is invalid`)
  }
  if (!deck.theme || typeof deck.theme !== 'object' || !['accent', 'accentInk', 'accentSoft', 'ink', 'surface', 'dark'].every((field) => typeof deck.theme[field] === 'string')) {
    failures.push(`${lessonId}: spec theme is incomplete`)
  } else {
    if (contrastRatio(deck.theme.accentInk, '#FFFFFF') < 4.5) failures.push(`${lessonId}: accentInk does not meet 4.5:1 on white`)
    if (contrastRatio(deck.theme.accent, '#0B1F3A') < 4.5) failures.push(`${lessonId}: accent does not meet 4.5:1 on the cover`)
  }
  if (deck.spec_sha256 !== record.spec_sha256) failures.push(`${lessonId}: spec_sha256 does not match the shared content revision`)
  walk(deck, ({ key, value, field }) => {
    if (forbiddenKeys.has(key)) failures.push(`${lessonId}: forbidden private field at ${field}`)
    if (typeof value === 'string' && /<\/?[a-z][^>]*>/i.test(value)) failures.push(`${lessonId}: arbitrary HTML at ${field}`)
    if (typeof value === 'string' && /(?:\/Users\/|\/Volumes\/|飞书导入-|file:\/\/)/.test(value)) failures.push(`${lessonId}: private path or archive marker at ${field}`)
    if (typeof value === 'string' && /…/.test(value)) failures.push(`${lessonId}: visible slide copy is mechanically truncated at ${field}`)
    if (typeof value === 'string' && /(?:验收“|必须经过边界验证)/.test(value)) failures.push(`${lessonId}: production-oriented fallback copy leaked at ${field}`)
    if (typeof value === 'string' && /(?:geometry msgs|task id|step id|in progress|robot state publisher)/i.test(value)) {
      failures.push(`${lessonId}: technical identifier lost its underscore at ${field}`)
    }
    if (typeof value === 'string' && /(?:与此同时|因此|但是|然而|同时|此外|例如|比如|所以|从而|包括|可以包括)$/.test(value.trim())) {
      failures.push(`${lessonId}: incomplete connective ending at ${field}`)
    }
  })
  if (deck.render_mode !== 'native-web') failures.push(`${lessonId}: spec render_mode must be native-web`)
  if (deck.lesson_id !== lessonId || deck.title !== record.title) failures.push(`${lessonId}: spec identity does not match plan`)
  if (deck.pptx_asset !== record.pptx_url) failures.push(`${lessonId}: spec PPTX URL does not match plan`)
  if (!Array.isArray(deck.slides) || deck.slides.length < 8 || deck.slides.length > 14) {
    failures.push(`${lessonId}: slide count must be 8-14`)
    continue
  }
  slideCount += deck.slides.length
  if (deck.slides.length !== record.slide_count) failures.push(`${lessonId}: record slide_count does not match spec`)
  deck.slides.forEach((slide, index) => validateSlide(lessonId, slide, index))
  for (const [type, expected] of [['cover', 1], ['objectives', 1], ['practice', 1], ['recap', 1], ['sources', 1]]) {
    const actual = deck.slides.filter((slide) => slide.type === type).length
    if (actual !== expected) failures.push(`${lessonId}: expected ${expected} ${type} slide, found ${actual}`)
  }
  if (!deck.slides.some((slide) => slide.type === 'core')) failures.push(`${lessonId}: missing core slides`)
  if (!deck.slides.some((slide) => slide.type === 'case')) failures.push(`${lessonId}: missing case slides`)

  const canonical = structuredClone(deck)
  delete canonical.spec_sha256
  if (sha256(`${JSON.stringify(canonical)}\n`) !== deck.spec_sha256) failures.push(`${lessonId}: internal spec_sha256 is stale`)

  const lessonDir = `${lessonId.toLowerCase()}-${catalogItem.lesson.slug}`
  const lessonMarkdown = path.join(root, 'docs', 'zh-cn', catalogItem.module.id, lessonDir, 'index.md')
  const markdown = await fs.readFile(lessonMarkdown, 'utf8')
  const revision = markdown.match(/^deck_revision:\s*['"]([^'"]+)['"]\s*$/m)?.[1]
  if (revision !== deck.spec_sha256) failures.push(`${lessonId}: Markdown deck_revision does not match public spec`)

  const members = unzipList(pptxFile)
  const slideMembers = members.filter((member) => /^ppt\/slides\/slide\d+\.xml$/.test(member))
  if (slideMembers.length !== deck.slides.length) failures.push(`${lessonId}: PPTX slide count ${slideMembers.length} != ${deck.slides.length}`)
  const forbiddenMemberPrefixes = [
    'ppt/media/', 'ppt/embeddings/', 'ppt/activeX/', 'ppt/charts/', 'ppt/diagrams/',
    'ppt/comments', 'ppt/threadedComments', 'ppt/oleObjects/', 'customXml/'
  ]
  for (const prefix of forbiddenMemberPrefixes) {
    if (members.some((member) => member.startsWith(prefix))) failures.push(`${lessonId}: PPTX contains forbidden package member ${prefix}`)
  }
  for (const member of members.filter((item) => item.endsWith('.rels'))) {
    const relationships = unzipRaw(pptxFile, member)
    if (/\bTargetMode="External"/i.test(relationships)) failures.push(`${lessonId}: PPTX contains an external relationship in ${member}`)
    if (/(?:file:\/\/|\/Users\/|\/Volumes\/)/.test(relationships)) failures.push(`${lessonId}: PPTX relationship exposes a local path in ${member}`)
  }
  for (const member of members.filter((item) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(item))) {
    const notesXml = unzipRaw(pptxFile, member)
    const notesText = [...notesXml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)]
      .map((match) => decodeXmlText(match[1]).trim())
      .filter(Boolean)
    if (notesText.length) failures.push(`${lessonId}: PPTX contains speaker-note text in ${member}`)
  }
  const orderedMembers = orderedPptxSlides(pptxFile, members, lessonId)
  for (const slide of deck.slides) {
    const member = orderedMembers[slide.order - 1]
    const xmlText = member ? unzipText(pptxFile, member) : ''
    if (!xmlText.includes(slide.slide_id)) failures.push(`${lessonId}: PPTX slide ${slide.order} is missing slide_id`)
    if (!xmlText.includes(slide.title)) failures.push(`${lessonId}: PPTX slide ${slide.order} is missing the shared title`)
  }
}

for (const lessonId of catalogById.keys()) {
  if (!seenIds.has(lessonId)) failures.push(`${lessonId}: catalog lesson has no public deck`)
}
if (slideCount !== expectedSlideCount) failures.push(`total public slide count ${slideCount} != ${expectedSlideCount}`)

const [deckFiles, specFiles, pptxFiles] = await Promise.all([
  listFiles(decksRoot), listFiles(specsRoot), listFiles(pptxRoot)
])
const unexpectedDeckAssets = deckFiles.filter((file) => path.basename(file) !== 'deck.json')
if (unexpectedDeckAssets.length) failures.push(`public deck directories contain non-JSON slide assets: ${unexpectedDeckAssets.map((file) => path.relative(root, file)).slice(0, 8).join(', ')}`)
if (deckFiles.length !== expectedLessonCount) failures.push(`public Web manifest file count ${deckFiles.length} != ${expectedLessonCount}`)
if (specFiles.filter((file) => file.endsWith('.json')).length !== expectedLessonCount) failures.push(`public spec file count != ${expectedLessonCount}`)
if (pptxFiles.filter((file) => file.endsWith('.pptx')).length !== expectedLessonCount) failures.push(`public PPTX file count != ${expectedLessonCount}`)
if (pptxFiles.some((file) => !file.endsWith('.pptx'))) failures.push('course-pptx contains non-PPTX files')

if (failures.length) {
  console.error('Public deck verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Verified ${expectedLessonCount} native Web decks, ${expectedLessonCount} original PPTX files, and ${slideCount} shared slides with zero raster source-page assets.`)
