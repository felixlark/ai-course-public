import fs from 'node:fs/promises'
import fss from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogFile = path.join(root, '课程PPT框架', 'source', 'course-catalog.json')
const catalog = JSON.parse(await fs.readFile(catalogFile, 'utf8'))
const skillDir = '/Users/longbiao/.codex/plugins/cache/openai-primary-runtime/presentations/26.709.11516/skills/presentations'
const setupScript = path.join(skillDir, 'container_tools', 'setup_artifact_tool_workspace.mjs')
const inspectScript = path.join(skillDir, 'template_following_scripts', 'inspect_template_deck.mjs')
const prepareScript = path.join(skillDir, 'template_following_scripts', 'prepare_template_starter_deck.mjs')
const node = process.execPath
const scratch = process.env.AI_COURSE_PPT_TMP || path.join(os.tmpdir(), 'ai-course-local-courseware')
const lessonFilter = process.argv.includes('--lesson') ? process.argv[process.argv.indexOf('--lesson') + 1]?.toUpperCase() : null
const skipExisting = process.argv.includes('--skip-existing')
const maxBytes = 95 * 1024 * 1024

const lessons = catalog.modules.flatMap((module) =>
  module.lessons.map((lesson) => ({ ...lesson, moduleId: module.id }))
).filter((lesson) => !lessonFilter || lesson.id === lessonFilter)

if (lessonFilter && !lessons.length) throw new Error(`Unknown lesson id: ${lessonFilter}`)

const run = (args, cwd = root) => new Promise((resolve, reject) => {
  const child = spawn(node, args, { cwd, stdio: 'inherit' })
  child.once('error', reject)
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(args[0])} exited ${code}`)))
})

const parseSlides = (value) => {
  const slides = []
  for (const part of String(value).split(',').map((item) => item.trim()).filter(Boolean)) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!match) throw new Error(`Invalid slide range: ${part}`)
    const start = Number(match[1])
    const end = Number(match[2] || match[1])
    if (end < start) throw new Error(`Invalid descending slide range: ${part}`)
    for (let slide = start; slide <= end; slide += 1) slides.push(slide)
  }
  return [...new Set(slides)]
}

const sourceKey = (source) => createHash('sha256').update(source).digest('hex').slice(0, 24)

await fs.mkdir(scratch, { recursive: true })
await run([setupScript, '--workspace', scratch])

const inspectionBySource = new Map()
for (const lesson of lessons) {
  const source = path.join(root, lesson.slides.source_pptx)
  const output = path.join(root, lesson.slides.local_pptx)
  if (!fss.existsSync(source)) throw new Error(`${lesson.id}: source PPTX is missing: ${lesson.slides.source_pptx}`)
  if (skipExisting && fss.existsSync(output)) {
    console.log(`${lesson.id}: keeping existing ${path.relative(root, output)}`)
    continue
  }

  let sourceWorkspace = inspectionBySource.get(source)
  if (!sourceWorkspace) {
    sourceWorkspace = path.join(scratch, 'sources', sourceKey(lesson.slides.source_pptx))
    const inspectFile = path.join(sourceWorkspace, 'template-inspect', 'template-inspect.ndjson')
    if (!fss.existsSync(inspectFile)) {
      await fs.mkdir(sourceWorkspace, { recursive: true })
      console.log(`${lesson.id}: inspecting ${lesson.slides.source_pptx}`)
      await run([inspectScript, '--workspace', sourceWorkspace, '--pptx', source])
    }
    inspectionBySource.set(source, sourceWorkspace)
  }

  const manifest = JSON.parse(await fs.readFile(path.join(sourceWorkspace, 'template-inspect', 'template-manifest.json'), 'utf8'))
  const inspectRows = (await fs.readFile(path.join(sourceWorkspace, 'template-inspect', 'template-inspect.ndjson'), 'utf8'))
    .split('\n').filter(Boolean).map((line) => JSON.parse(line))
  const placeholdersBySlide = new Map()
  for (const row of inspectRows.filter((item) =>
    item.id && Number.isInteger(item.slide) && (item.placeholder || /placeholder|click to add|^date$|^footer$/i.test(item.name || ''))
  )) {
    if (!placeholdersBySlide.has(row.slide)) placeholdersBySlide.set(row.slide, [])
    placeholdersBySlide.get(row.slide).push({ action: 'fill-placeholder', shapeId: row.id })
  }
  const sourceSlideCount = Number(manifest.slideCount || manifest.slide_count || manifest.slides?.length)
  const selected = parseSlides(lesson.slides.source_slides)
  if (!Number.isInteger(sourceSlideCount) || sourceSlideCount < 1) throw new Error(`${lesson.id}: could not determine source slide count`)
  if (selected.some((slide) => slide > sourceSlideCount)) throw new Error(`${lesson.id}: selected slide exceeds source count ${sourceSlideCount}`)

  const workspace = path.join(scratch, 'lessons', lesson.id.toLowerCase())
  await fs.rm(workspace, { recursive: true, force: true })
  await fs.mkdir(workspace, { recursive: true })
  const frameMap = {
    outputSlides: selected.map((sourceSlide, index) => ({
      outputSlide: index + 1,
      sourceSlide,
      narrativeRole: 'preserve source slide',
      reuseMode: 'duplicate-slide',
      editTargets: placeholdersBySlide.get(sourceSlide) || []
    })),
    omittedSourceSlides: Array.from({ length: sourceSlideCount }, (_, index) => index + 1)
      .filter((slide) => !selected.includes(slide))
      .map((sourceSlide) => ({ sourceSlide, reason: '本节课程边界之外，保留在原始课件中。' }))
  }
  await fs.writeFile(path.join(workspace, 'template-frame-map.json'), `${JSON.stringify(frameMap, null, 2)}\n`)
  await fs.writeFile(path.join(workspace, 'template-audit.txt'), [
    `lesson: ${lesson.id} ${lesson.title}`,
    `source: ${lesson.slides.source_pptx}`,
    `source slides: ${sourceSlideCount}`,
    `selected slides: ${selected.join(', ')}`,
    'reuse contract: preserve source slide design, media, typography, masters and spatial relationships without content edits.',
    'privacy contract: catalog ranges exclude personal contact and non-teaching closing slides.'
  ].join('\n') + '\n')
  await fs.writeFile(path.join(workspace, 'deviation-log.txt'), 'No visual or textual deviations. The lesson deck is a lossless source-slide subset.\n')
  await fs.mkdir(path.dirname(output), { recursive: true })

  console.log(`${lesson.id}: building ${selected.length} slides`)
  await run([
    prepareScript,
    '--workspace', workspace,
    '--pptx', source,
    '--map', path.join(workspace, 'template-frame-map.json'),
    '--out', output,
    '--preview-dir', path.join(workspace, 'preview'),
    '--layout-dir', path.join(workspace, 'layouts'),
    '--contact-sheet', path.join(workspace, 'contact-sheet.png'),
    '--inspect', path.join(sourceWorkspace, 'template-inspect', 'template-inspect.ndjson')
  ])

  const stat = await fs.stat(output)
  if (stat.size >= maxBytes) throw new Error(`${lesson.id}: output is ${(stat.size / 1024 / 1024).toFixed(1)} MiB; GitHub limit budget is 95 MiB`)
  await fs.rm(`${output}.inspect.ndjson`, { force: true })
  await fs.rm(path.join(path.dirname(output), 'slides.manifest.json'), { force: true })
  const previewCount = (await fs.readdir(path.join(workspace, 'preview'))).filter((file) => file.endsWith('.png')).length
  const layoutCount = (await fs.readdir(path.join(workspace, 'layouts'))).filter((file) => file.endsWith('.json')).length
  if (previewCount !== selected.length || layoutCount !== selected.length) {
    throw new Error(`${lesson.id}: expected ${selected.length} previews/layouts, found ${previewCount}/${layoutCount}`)
  }
  console.log(`${lesson.id}: ${(stat.size / 1024 / 1024).toFixed(1)} MiB, ${previewCount} rendered slides`)
}

console.log(`Local courseware build complete: ${lessons.length} lesson(s); scratch ${scratch}`)
