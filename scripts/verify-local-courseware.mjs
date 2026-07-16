import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogFile = path.join(root, '课程PPT框架', 'source', 'course-catalog.json')
const rawCatalog = await fs.readFile(catalogFile, 'utf8')
const catalog = JSON.parse(rawCatalog)
const failures = []
const urls = new Set()
const files = new Set()
const maxBytes = 95 * 1024 * 1024

const lessons = catalog.modules.flatMap((module) => module.lessons)
if (catalog.schema_version !== 4) failures.push('course catalog must use schema version 4')
if (catalog.modules.length !== 4 || lessons.length !== 27) failures.push('course catalog must contain four modules and 27 lessons')
if (/https:\/\/|wiki_url|slides_wiki/i.test(rawCatalog)) failures.push('retired cloud-courseware metadata remains in course catalog')

const selectedSlideCount = (value) => {
  const slides = new Set()
  for (const part of String(value).split(',').map((item) => item.trim()).filter(Boolean)) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!match) return 0
    for (let slide = Number(match[1]); slide <= Number(match[2] || match[1]); slide += 1) slides.add(slide)
  }
  return slides.size
}

for (const lesson of lessons) {
  const mapping = lesson.slides || {}
  if (!/^\/course-slides\/[a-z0-9/-]+\/slides\.pptx$/.test(mapping.url || '')) failures.push(`${lesson.id}: invalid local PPTX URL`)
  if (!/^docs\/public\/course-slides\/[a-z0-9/-]+\/slides\.pptx$/.test(mapping.local_pptx || '')) failures.push(`${lesson.id}: invalid published PPTX path`)
  if (!mapping.source_pptx || !mapping.source_slides) failures.push(`${lesson.id}: missing source PPTX selection`)
  if (urls.has(mapping.url)) failures.push(`${lesson.id}: duplicate local PPTX URL`)
  if (files.has(mapping.local_pptx)) failures.push(`${lesson.id}: duplicate published PPTX path`)
  urls.add(mapping.url)
  files.add(mapping.local_pptx)

  const file = path.join(root, mapping.local_pptx || '')
  const stat = await fs.stat(file).catch(() => null)
  if (!stat?.isFile()) {
    failures.push(`${lesson.id}: published PPTX is missing`)
    continue
  }
  if (stat.size <= 0 || stat.size >= maxBytes) failures.push(`${lesson.id}: PPTX size ${stat.size} is outside the 1-95 MiB publication budget`)
  const { stdout = '' } = await exec('unzip', ['-Z1', file], { maxBuffer: 20 * 1024 * 1024 }).catch((error) => ({ stdout: '', error }))
  const slideCount = stdout.split('\n').filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry)).length
  const expected = selectedSlideCount(mapping.source_slides)
  if (!slideCount || slideCount !== expected) failures.push(`${lesson.id}: expected ${expected} slides, found ${slideCount}`)
  await exec('unzip', ['-tqq', file], { maxBuffer: 20 * 1024 * 1024 }).catch(() => failures.push(`${lesson.id}: PPTX archive integrity check failed`))
}

const published = []
const walk = async (dir) => {
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) await walk(file)
    else if (entry.name.endsWith('.pptx')) published.push(path.relative(root, file))
    else failures.push(`unexpected course-slides artifact: ${path.relative(root, file)}`)
  }
}
await walk(path.join(root, 'docs', 'public', 'course-slides'))
if (published.length !== 27) failures.push(`expected 27 published PPTX files, found ${published.length}`)
for (const file of published) if (!files.has(file)) failures.push(`orphan published PPTX: ${file}`)

if (failures.length) {
  console.error('Local courseware verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

const totalBytes = (await Promise.all(published.map((file) => fs.stat(path.join(root, file))))).reduce((sum, stat) => sum + stat.size, 0)
console.log(`Verified 27 unique local PPTX lessons (${(totalBytes / 1024 / 1024).toFixed(1)} MiB) and archive integrity.`)
