import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const indexPath = path.join(root, 'docs', 'public', 'course-assets', 'lesson-media', 'ai-overview', 'index.json')
const index = JSON.parse(await fs.readFile(indexPath, 'utf8'))
const failures = []

const run = (command, args) => spawnSync(command, args, {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024
})

const toolAvailable = (tool) => run('which', [tool]).status === 0
if (!toolAvailable('ffprobe') || !toolAvailable('ffmpeg')) {
  throw new Error('ffprobe and ffmpeg are required to verify published course video playback')
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const mediaDir = path.dirname(indexPath)

for (const asset of index.assets || []) {
  const file = path.join(mediaDir, asset.file_name)
  const bytes = await fs.readFile(file).catch(() => null)
  if (!bytes) {
    failures.push(`${asset.id}: published file is missing`)
    continue
  }
  if (bytes.length !== asset.size || sha256(bytes) !== asset.sha256) {
    failures.push(`${asset.id}: file hash or size drifted from its media index`)
    continue
  }

  const probe = run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name', '-of', 'json', file
  ])
  if (probe.status !== 0) {
    failures.push(`${asset.id}: ffprobe failed (${probe.stderr.trim() || probe.stdout.trim()})`)
    continue
  }

  let metadata
  try {
    metadata = JSON.parse(probe.stdout)
  } catch {
    failures.push(`${asset.id}: ffprobe returned invalid JSON`)
    continue
  }
  const streams = metadata.streams || []
  const video = streams.find((stream) => stream.codec_type === 'video')
  const audio = streams.find((stream) => stream.codec_type === 'audio')
  const duration = Number(metadata.format?.duration)
  if (video?.codec_name !== asset.video_codec) failures.push(`${asset.id}: expected ${asset.video_codec} video, found ${video?.codec_name || 'none'}`)
  if ((audio?.codec_name || null) !== (asset.audio_codec || null)) failures.push(`${asset.id}: unexpected audio codec ${audio?.codec_name || 'none'}`)
  if (!Number.isFinite(duration) || Math.abs(duration - asset.duration_seconds) > 0.25) failures.push(`${asset.id}: duration drifted (${duration}s)`)

  const moov = bytes.indexOf(Buffer.from('moov'))
  const mdat = bytes.indexOf(Buffer.from('mdat'))
  if (asset.faststart && (moov < 0 || mdat < 0 || moov > mdat)) failures.push(`${asset.id}: MP4 is not faststart-ready (moov must precede mdat)`)

  const videoDecode = run('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v:0', '-frames:v', '1', '-f', 'null', '-'])
  if (videoDecode.status !== 0) failures.push(`${asset.id}: video frame decode failed (${videoDecode.stderr.trim() || videoDecode.stdout.trim()})`)
  if (asset.audio_codec) {
    const audioDecode = run('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-t', '0.1', '-f', 'null', '-'])
    if (audioDecode.status !== 0) failures.push(`${asset.id}: audio decode failed (${audioDecode.stderr.trim() || audioDecode.stdout.trim()})`)
  }
}

if (failures.length) {
  console.error('Course media playback verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Verified decode, codecs, duration, faststart placement and hashes for ${index.assets.length} published course videos.`)
