import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogFile = path.join(root, '课程PPT框架', 'source', 'course-catalog.json')
const catalog = JSON.parse(await fsp.readFile(catalogFile, 'utf8'))
const lessons = catalog.modules.flatMap((module) => module.lessons)
const failures = []
const remote = process.argv.includes('--remote')
const urls = new Set()
const localSources = new Set()
const generatedArtifacts = [
  '课程PPT框架/00-课程PPT矩阵.pptx',
  '课程PPT框架/01-人工智能概述-课程框架.pptx',
  '课程PPT框架/02-AI大模型-课程框架.pptx',
  '课程PPT框架/03-智能体工程-课程框架.pptx',
  '课程PPT框架/04-具身智能-课程框架.pptx',
  'scripts/sync-feishu-slides.mjs',
  'scripts/verify-feishu-slides.mjs'
]

if (catalog.schema_version !== 3) failures.push('course catalog must use schema version 3')
if (catalog.modules.length !== 4 || lessons.length !== 27) failures.push('course catalog must contain four modules and 27 lessons')

const run = (command, args, options = {}) => spawnSync(command, args, {
  cwd: root,
  encoding: options.encoding ?? 'utf8',
  maxBuffer: 128 * 1024 * 1024,
  env: {
    ...process.env,
    LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1',
    LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1'
  }
})

const parseJsonOutput = (output) => {
  const start = String(output).indexOf('{')
  if (start < 0) throw new Error('command did not return JSON')
  return JSON.parse(String(output).slice(start))
}

const lookupRemoteNode = (wikiUrl, attempts = 3) => {
  let result
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    result = run('lark-cli', ['wiki', '+node-get', '--node-token', wikiUrl, '--as', 'user', '--format', 'json'])
    if (result.status === 0) return result
    const output = `${result.stderr || ''}\n${result.stdout || ''}`
    if (!/(?:timeout|timed out|i\/o timeout|operation timed out)/i.test(output) || attempt === attempts) return result
    console.warn(`Remote lookup timed out; retrying (${attempt}/${attempts})...`)
  }
  return result
}

const sha256File = (absolutePath) => new Promise((resolve, reject) => {
  const digest = createHash('sha256')
  const stream = fs.createReadStream(absolutePath)
  stream.on('data', (chunk) => digest.update(chunk))
  stream.on('error', reject)
  stream.on('end', () => resolve(digest.digest('hex')))
})

const inspectPptx = async (relativePath) => {
  const absolutePath = path.join(root, relativePath)
  const entriesResult = run('unzip', ['-Z1', absolutePath])
  if (entriesResult.status !== 0) throw new Error(entriesResult.stderr || entriesResult.stdout)
  const entries = entriesResult.stdout.split(/\r?\n/).filter(Boolean)
  const slideCount = entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry)).length
  const mediaCount = entries.filter((entry) => /^ppt\/media\/[^/]+$/.test(entry)).length
  if (slideCount < 1) throw new Error('PPTX contains no slide XML')
  const stat = fs.statSync(absolutePath)
  const digest = await sha256File(absolutePath)
  return { slideCount, mediaCount, size: stat.size, sha256: digest }
}

let localPresent = 0
for (const lesson of lessons) {
  const source = lesson.slides || {}
  if (!/^https:\/\/xmu-mars\.feishu\.cn\/wiki\/[A-Za-z0-9]+$/.test(source.url || '')) {
    failures.push(`${lesson.id}: invalid original Feishu Wiki URL`)
  }
  if (source.url !== source.wiki_url) failures.push(`${lesson.id}: playback and maintenance URL differ`)
  if (urls.has(source.url)) failures.push(`${lesson.id}: duplicate original Feishu courseware URL`)
  urls.add(source.url)
  if (!['file', 'slides'].includes(source.source_type)) failures.push(`${lesson.id}: invalid source_type`)
  if (!source.source_title) failures.push(`${lesson.id}: missing source_title`)
  if (!/\.pptx$/i.test(source.local_pptx || '')) failures.push(`${lesson.id}: missing local PPTX source mapping`)
  if (localSources.has(source.local_pptx)) failures.push(`${lesson.id}: duplicate local PPTX source mapping`)
  localSources.add(source.local_pptx)
  if (fs.existsSync(path.join(root, source.local_pptx || ''))) localPresent += 1
}

if (localPresent > 0 && localPresent !== lessons.length) {
  for (const lesson of lessons) {
    if (!fs.existsSync(path.join(root, lesson.slides.local_pptx))) failures.push(`${lesson.id}: local PPTX source is missing`)
  }
}

if (localPresent === lessons.length) {
  for (const [index, lesson] of lessons.entries()) {
    try {
      const result = await inspectPptx(lesson.slides.local_pptx)
      console.log(`[${index + 1}/${lessons.length}] ${lesson.id}: ${result.slideCount} slides, ${result.mediaCount} media, sha256 ${result.sha256.slice(0, 12)}`)
    } catch (error) {
      failures.push(`${lesson.id}: ${error.message}`)
    }
  }
} else if (localPresent === 0) {
  console.log('Private PPTX archive is not present in this checkout; verified the 27 source mappings only.')
}

for (const artifact of generatedArtifacts) {
  if (fs.existsSync(path.join(root, artifact))) failures.push(`retired generated artifact still exists: ${artifact}`)
}

if (remote) {
  for (const [index, lesson] of lessons.entries()) {
    const result = lookupRemoteNode(lesson.slides.wiki_url)
    if (result.status !== 0) {
      failures.push(`${lesson.id}: remote source lookup failed (${result.stderr || result.stdout})`)
      continue
    }
    try {
      const node = parseJsonOutput(result.stdout).data
      if (node.space_id !== '7620664273408183524') failures.push(`${lesson.id}: source is outside the ai-course Wiki`)
      if (node.title !== lesson.slides.source_title) failures.push(`${lesson.id}: remote title drifted (${node.title})`)
      if (node.obj_type !== lesson.slides.source_type) failures.push(`${lesson.id}: remote type drifted (${node.obj_type})`)
      console.log(`[remote ${index + 1}/${lessons.length}] ${lesson.id}: ${node.title}`)
    } catch (error) {
      failures.push(`${lesson.id}: invalid remote lookup response (${error.message})`)
    }
  }
}

if (failures.length) {
  console.error('Original courseware verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Verified ${lessons.length} unique original Feishu courseware mappings${localPresent === lessons.length ? ' and all local PPTX sources' : ''}${remote ? ' against the live ai-course Wiki' : ''}.`)
