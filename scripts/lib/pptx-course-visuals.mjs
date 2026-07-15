import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

export const VISUAL_POLICY = Object.freeze({
  excluded_lessons: ['OV-001', 'OV-002'],
  allowed_extensions: ['.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'],
  maximum_geometry_ratio: 0.8,
  minimum_geometry_ratio: 0.006,
  minimum_geometry_dimension_ratio: 0.04,
  minimum_raster_width: 180,
  minimum_raster_height: 100,
  minimum_raster_pixels: 40000,
  minimum_visible_alpha_mean: 0.02,
  repeated_asset_minimum_slides: 3,
  repeated_placement_ratio: 0.6
})

// Some source decks contain pictures that are technically independent shapes but are
// still unsuitable learning assets: ornamental bands/icons or a rasterized legacy
// slide pasted into a newer slide. The hash-based review list makes those judgments
// deterministic and auditable without guessing from filenames.
export const CURATED_EXCLUSIONS = Object.freeze({
  'd69022f488fd1099e6db7cd3b652994d5c4cab2992dfe1a886410c1fd98c0f2b': 'ornamental-campus-silhouette',
  'bb73b395d81e8df40472628ef58e7cdd18db3001931044a55badaef214859446': 'ornamental-wave-background',
  'a25df2950c06aea4e4be916047017feb19c05e86e9ccb6f3d1a363ab600515a9': 'rasterized-legacy-slide-with-header-and-footer',
  'a38dedea30abca2a76649cf7f86b937d85cb11b13a1ab910931822c2a89ce2fa': 'rasterized-slide-like-canvas-with-template-band',
  'd1105f24307f99a4779873cf32ac9c0f8f045cb9ad62bd9e4c269b9419f30a98': 'standalone-decorative-robot-icon',
  '160b6b94de958298f027199fdd794bef02a2920bc80cfa3d9792408254556bb4': 'standalone-decorative-person-icon'
})

export const LESSON_SELECTION_OVERRIDES = Object.freeze({
  'OV-003': {
    sha256: '376086e3997844d23325f08a24f104b166f052ac203bc0d1ef7960224a4516dd',
    reason: 'use the reviewed compute-scale chart instead of a generic AI illustration or ornamental anchor asset'
  },
  'OV-005': {
    sha256: '4b2e75feb052e921fa9a8c66ca91aed854fb541e5e693306e1af661b809f39f0',
    reason: 'use the reviewed DeepSeek MoE and domestic-compute illustration instead of a generic model timeline'
  },
  'AG-001': {
    sha256: '41620617f12e74b6fda1f6f72c719ee616b4d22d6d116ad0b29a4031ac14fad0',
    reason: 'use the reviewed ReAct loop instead of a generic AI activity collage'
  },
  'AG-002': {
    sha256: '9aee7d1e53ef0aa8fcfe7425ae0393cf9bc094154cf42bdb0af02f8230cff8d5',
    reason: 'use the reviewed MCP request and tool-call sequence'
  },
  'AG-005': {
    sha256: '8d155d874119b6ed839927d6c52d2d4b1e3c6b6d7aacbac3cd339a2bdf7fa037',
    reason: 'use the reviewed evaluation-rule table instead of a social-media incident screenshot'
  },
  'IN-001': {
    sha256: '8d155d874119b6ed839927d6c52d2d4b1e3c6b6d7aacbac3cd339a2bdf7fa037',
    reason: 'reuse the reviewed evaluation-rule table to show that business success criteria must be executable'
  },
  'IN-002': {
    sha256: 'ab5b5f456606b1d3be33238a6a9e5dd8b8f5c043370ea014456418a18ebe374d',
    reason: 'use the reviewed retrieval-evidence-reader chain instead of a dense paper screenshot'
  },
  'IN-003': {
    sha256: '9aee7d1e53ef0aa8fcfe7425ae0393cf9bc094154cf42bdb0af02f8230cff8d5',
    reason: 'reuse the reviewed controlled MCP sequence instead of a low-contrast hierarchy diagram'
  },
  'IN-004': {
    kind: 'structured-course-diagram',
    slide: 15,
    reason: 'reconstruct the enterprise knowledge workflow because the mapped pictures are generic decoration'
  },
  'IN-005': {
    kind: 'structured-course-diagram',
    slide: 18,
    reason: 'reconstruct the industrial decision loop instead of reusing a weak robot-environment image'
  },
  'IN-007': {
    kind: 'structured-course-diagram',
    slide: 15,
    reason: 'reconstruct the fire-investigation evidence chain because the mapped picture is generic decoration'
  },
  'IN-008': {
    sha256: '3756bcd5377898ae061eb72a355371158934019159487bec6058541195376577',
    reason: 'use the reviewed multimodal environment-observation diagram instead of a generic agent architecture'
  },
  'EM-002': {
    sha256: '709d21e492124969baf7af6355a9177e08c409749a66ff404a0b38983007fc51',
    reason: 'prefer an independent animated robot scene over the pasted legacy-slide raster'
  },
  'EM-004': {
    sha256: '85b406969801d624eef976437b4a84da3667ed62433489fbf646c61e60b7598f',
    reason: 'prefer a standalone reinforcement-learning diagram over the slide-like canvas'
  },
  'EM-005': {
    kind: 'native-group-rendering',
    slide: 10,
    reason: 'reconstruct the native task-planning group instead of publishing either standalone icon or a pasted slide raster'
  },
  'EM-006': {
    kind: 'structured-course-diagram',
    slide: 18,
    reason: 'reconstruct the individual-to-group evaluation chain instead of presenting a single-agent loop as the group architecture'
  },
  'IN-009': {
    sha256: '709d21e492124969baf7af6355a9177e08c409749a66ff404a0b38983007fc51',
    reason: 'reuse the reviewed indoor robot GIF to illustrate dynamic spatial perception'
  }
})

// Each selected binary is pinned to a visual review. If the source deck changes,
// generation fails until the replacement picture is inspected and re-approved.
export const CURATED_VISUAL_REVIEWS = Object.freeze({
  'OV-003': { sha256: '376086e3997844d23325f08a24f104b166f052ac203bc0d1ef7960224a4516dd', note: 'Compute-scale chart; independent picture without slide chrome.' },
  'OV-004': { sha256: '182950acc5c2dbf54332d9fc4355fd9b7146b76e08d2535a4f21ae30db51e89f', note: 'RNN-to-Transformer comparison diagram; independent crop.' },
  'OV-005': { sha256: '4b2e75feb052e921fa9a8c66ca91aed854fb541e5e693306e1af661b809f39f0', note: 'DeepSeek MoE and domestic-compute illustration; independent crop.' },
  'OV-006': { sha256: '5d593934803e23af2c905df9808ba418fcfbca6599940c04bc83963c543fdc86', note: 'Vision-Transformer comparison diagram; independent crop.' },
  'OV-007': { sha256: 'a48148c53615b016fa25da886f90685630544d923d37feed0607c670a95e9e8f', note: 'Alignment and feedback flow diagram; independent crop.' },
  'IN-004': { sha256: '40010807adc1c5cb4fc3166ab5c60aab4473cbbdf65ec0d68faf384525549d63', note: 'Enterprise knowledge workflow reconstructed from structured course concepts; no slide raster.' },
  'IN-007': { sha256: '0098fa67b8b46a9aaf06903b8087488a4a154fe12fc4fe82b924d0edc9b7e044', note: 'Evidence and accountable-review chain reconstructed from structured course concepts; no slide raster.' },
  'AG-001': { sha256: '41620617f12e74b6fda1f6f72c719ee616b4d22d6d116ad0b29a4031ac14fad0', note: 'ReAct reasoning-action-observation loop; independent crop.' },
  'AG-002': { sha256: '9aee7d1e53ef0aa8fcfe7425ae0393cf9bc094154cf42bdb0af02f8230cff8d5', note: 'MCP request, tool-call and result sequence; independent crop.' },
  'AG-003': { sha256: 'f8dc6f8d92a83e79f5ace0f3c335d2333345ccd1b016966f357c51f44f76c878', note: 'Multi-agent collaboration infographic; independent crop.' },
  'AG-004': { sha256: 'e61986a6ca8dc0710c4f39609579161ddfe01583d1692aabe6a6c9f1fbfba27f', note: 'Role and execution-sequence table; independent crop.' },
  'AG-005': { sha256: '8d155d874119b6ed839927d6c52d2d4b1e3c6b6d7aacbac3cd339a2bdf7fa037', note: 'Executable evaluation-rule table; independent crop.' },
  'IN-001': { sha256: '8d155d874119b6ed839927d6c52d2d4b1e3c6b6d7aacbac3cd339a2bdf7fa037', note: 'Tool-function evaluation table; independent crop.' },
  'IN-002': { sha256: 'ab5b5f456606b1d3be33238a6a9e5dd8b8f5c043370ea014456418a18ebe374d', note: 'Retrieval, evidence and reader chain; independent crop.' },
  'IN-003': { sha256: '9aee7d1e53ef0aa8fcfe7425ae0393cf9bc094154cf42bdb0af02f8230cff8d5', note: 'Controlled MCP request and tool-result sequence; independent crop.' },
  'IN-008': { sha256: '3756bcd5377898ae061eb72a355371158934019159487bec6058541195376577', note: 'Multimodal environment, observation and action diagram; independent crop.' },
  'EM-001': { sha256: '938063d046225e45ce6d37d159327a8642587ec148db18f63cbf9e3a9020a824', note: 'Embodied perception-reasoning-action loop diagram; independent picture.' },
  'EM-002': { sha256: '709d21e492124969baf7af6355a9177e08c409749a66ff404a0b38983007fc51', note: 'Animated robot navigation scene; independent GIF.' },
  'EM-003': { sha256: '43292a195e75a40dc35d2af08e0c75f925d2fd1d5e35b49139840f88c35feabb', note: 'Animated humanoid robot scene; independent GIF.' },
  'EM-004': { sha256: '85b406969801d624eef976437b4a84da3667ed62433489fbf646c61e60b7598f', note: 'Agent-environment reinforcement-learning diagram; independent crop.' },
  'EM-005': { sha256: '7c81609d7ce9566d45cbd173628d8630277738035f50e2642e194b70220e6a25', note: 'Task-planning group reconstructed from native text/shapes and two independent source icons; no slide raster.' },
  'EM-006': { sha256: '40b47d8b8014f48d387aae4e50411e86d0fa665a16ad26e105acfb0b28e783fd', note: 'Individual-to-group evaluation chain reconstructed from structured course concepts; no slide raster.' },
  'IN-005': { sha256: '309cb53ef57e8d1ce98c5a10dc1f9ec195421764aa547026654cd8c154601ba4', note: 'Industrial sensing, decision and feedback loop reconstructed from structured course concepts; no slide raster.' },
  'IN-006': { sha256: '162356930398adb927f5ba6215e7804269b27e4d3ef08b6929f13a6d43c1c8e2', note: 'Navigation-method comparison strip; independent crop.' },
  'IN-009': { sha256: '709d21e492124969baf7af6355a9177e08c409749a66ff404a0b38983007fc51', note: 'Animated indoor robot perception scene; independent GIF.' }
})

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

export const parseSlideSpec = (value) => {
  const slides = new Set()
  for (const part of String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean)) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!match) throw new Error(`Invalid slide range: ${part}`)
    const start = Number(match[1])
    const end = Number(match[2] ?? match[1])
    if (start < 1 || end < start) throw new Error(`Invalid slide range: ${part}`)
    for (let slide = start; slide <= end; slide += 1) slides.add(slide)
  }
  return [...slides].sort((left, right) => left - right)
}

const run = (command, args, { binary = false } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  const stdout = []
  const stderr = []
  child.stdout.on('data', (chunk) => stdout.push(chunk))
  child.stderr.on('data', (chunk) => stderr.push(chunk))
  child.on('error', reject)
  child.on('close', (code) => {
    const errorText = Buffer.concat(stderr).toString('utf8').trim()
    if (code !== 0) {
      reject(new Error(`${command} ${args.join(' ')} failed (${code})${errorText ? `: ${errorText}` : ''}`))
      return
    }
    const output = Buffer.concat(stdout)
    resolve(binary ? output : output.toString('utf8'))
  })
})

const hasImageMagick7 = spawnSync('magick', ['-version'], { stdio: 'ignore' }).status === 0

export const unzipEntry = (pptx, entry) => run('unzip', ['-p', pptx, entry], { binary: true })

const decodeXml = (value) => String(value ?? '')
  .replaceAll('&quot;', '"')
  .replaceAll('&apos;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&amp;', '&')

const parseAttributes = (source) => {
  const attributes = {}
  for (const match of source.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attributes[match[1]] = decodeXml(match[2] ?? match[3] ?? '')
  }
  return attributes
}

const parseXml = (xml) => {
  const root = { name: '#document', attributes: {}, children: [], text: '', parent: null }
  const stack = [root]
  const pattern = /<\?[^>]*\?>|<!--[\s\S]*?-->|<![^>]*>|<\/?[\w:.-]+(?:\s[^<>]*?)?\s*\/?>|[^<]+/g
  for (const match of String(xml).matchAll(pattern)) {
    const token = match[0]
    if (!token.startsWith('<')) {
      stack.at(-1).text += decodeXml(token)
      continue
    }
    if (token.startsWith('<?') || token.startsWith('<!')) continue
    if (token.startsWith('</')) {
      const name = token.slice(2, -1).trim()
      const node = stack.pop()
      if (!node || node.name !== name) throw new Error(`Malformed XML around closing tag ${name}`)
      continue
    }
    const selfClosing = /\/\s*>$/.test(token)
    const body = token.slice(1, selfClosing ? token.lastIndexOf('/') : -1).trim()
    const nameMatch = body.match(/^([\w:.-]+)/)
    if (!nameMatch) continue
    const node = {
      name: nameMatch[1],
      attributes: parseAttributes(body.slice(nameMatch[0].length)),
      children: [],
      text: '',
      parent: stack.at(-1)
    }
    stack.at(-1).children.push(node)
    if (!selfClosing) stack.push(node)
  }
  if (stack.length !== 1) throw new Error(`Malformed XML: ${stack.length - 1} unclosed tag(s)`)
  return root
}

const descendants = (node, name, output = []) => {
  for (const child of node.children ?? []) {
    if (child.name === name) output.push(child)
    descendants(child, name, output)
  }
  return output
}

const directChild = (node, name) => (node.children ?? []).find((child) => child.name === name) ?? null

const descendant = (node, name) => descendants(node, name, [])[0] ?? null

const numberAttribute = (node, name) => {
  const value = Number(node?.attributes?.[name])
  return Number.isFinite(value) ? value : null
}

const xfrmBox = (xfrm) => {
  const off = directChild(xfrm, 'a:off')
  const ext = directChild(xfrm, 'a:ext')
  const x = numberAttribute(off, 'x')
  const y = numberAttribute(off, 'y')
  const cx = numberAttribute(ext, 'cx')
  const cy = numberAttribute(ext, 'cy')
  return [x, y, cx, cy].every((value) => value != null) ? { x, y, cx, cy } : null
}

const transformThroughGroup = (box, group) => {
  const xfrm = descendant(directChild(group, 'p:grpSpPr'), 'a:xfrm')
  if (!xfrm) return null
  const off = directChild(xfrm, 'a:off')
  const ext = directChild(xfrm, 'a:ext')
  const chOff = directChild(xfrm, 'a:chOff')
  const chExt = directChild(xfrm, 'a:chExt')
  const values = {
    x: numberAttribute(off, 'x'),
    y: numberAttribute(off, 'y'),
    cx: numberAttribute(ext, 'cx'),
    cy: numberAttribute(ext, 'cy'),
    childX: numberAttribute(chOff, 'x'),
    childY: numberAttribute(chOff, 'y'),
    childCx: numberAttribute(chExt, 'cx'),
    childCy: numberAttribute(chExt, 'cy')
  }
  if (Object.values(values).some((value) => value == null) || values.childCx === 0 || values.childCy === 0) return null
  const scaleX = values.cx / values.childCx
  const scaleY = values.cy / values.childCy
  return {
    x: values.x + (box.x - values.childX) * scaleX,
    y: values.y + (box.y - values.childY) * scaleY,
    cx: box.cx * Math.abs(scaleX),
    cy: box.cy * Math.abs(scaleY)
  }
}

const absolutePictureBox = (picture) => {
  const spPr = directChild(picture, 'p:spPr')
  let box = xfrmBox(directChild(spPr, 'a:xfrm'))
  if (!box) return null
  const groups = []
  for (let current = picture.parent; current; current = current.parent) {
    if (current.name === 'p:grpSp') groups.push(current)
  }
  for (const group of groups) {
    box = transformThroughGroup(box, group)
    if (!box) return null
  }
  return box
}

const absoluteGroupBox = (group) => {
  let box = xfrmBox(descendant(directChild(group, 'p:grpSpPr'), 'a:xfrm'))
  if (!box) return null
  for (let current = group.parent; current; current = current.parent) {
    if (current.name !== 'p:grpSp') continue
    box = transformThroughGroup(box, current)
    if (!box) return null
  }
  return box
}

const relationshipMap = (xml) => {
  const root = parseXml(xml)
  const relationships = new Map()
  for (const node of descendants(root, 'Relationship')) {
    const { Id: id, Target: target, Type: type } = node.attributes
    if (!id || !target || !type?.endsWith('/image')) continue
    relationships.set(id, path.posix.normalize(path.posix.join('ppt/slides', target)))
  }
  return relationships
}

const visibleGeometry = (box, slideSize) => {
  const left = Math.max(0, box.x)
  const top = Math.max(0, box.y)
  const right = Math.min(slideSize.width, box.x + box.cx)
  const bottom = Math.min(slideSize.height, box.y + box.cy)
  const visibleWidth = Math.max(0, right - left)
  const visibleHeight = Math.max(0, bottom - top)
  const slideArea = slideSize.width * slideSize.height
  return {
    x_emu: Math.round(box.x),
    y_emu: Math.round(box.y),
    width_emu: Math.round(box.cx),
    height_emu: Math.round(box.cy),
    width_ratio: Number((visibleWidth / slideSize.width).toFixed(6)),
    height_ratio: Number((visibleHeight / slideSize.height).toFixed(6)),
    area_ratio: Number(((visibleWidth * visibleHeight) / slideArea).toFixed(6))
  }
}

const slideSizeFromPresentation = (xml) => {
  const root = parseXml(xml)
  const size = descendant(root, 'p:sldSz')
  const width = numberAttribute(size, 'cx')
  const height = numberAttribute(size, 'cy')
  if (!width || !height) throw new Error('PPTX is missing a valid p:sldSz')
  return { width, height }
}

const visualsFromSlide = ({ xml, relsXml, slide, slideSize }) => {
  const root = parseXml(xml)
  const relationships = relationshipMap(relsXml)
  const pictures = []
  for (const picture of descendants(root, 'p:pic')) {
    const blip = descendant(picture, 'a:blip')
    const relationshipId = blip?.attributes?.['r:embed']
    const sourceEntry = relationships.get(relationshipId)
    const box = absolutePictureBox(picture)
    if (!sourceEntry || !box) continue
    const properties = descendant(picture, 'p:cNvPr')
    pictures.push({
      slide,
      source_entry: sourceEntry,
      shape_id: properties?.attributes?.id ?? null,
      shape_name: properties?.attributes?.name ?? null,
      geometry: visibleGeometry(box, slideSize)
    })
  }
  const groups = []
  for (const group of descendants(root, 'p:grpSp')) {
    const box = absoluteGroupBox(group)
    if (!box) continue
    const relationshipIds = descendants(group, 'a:blip')
      .map((blip) => blip.attributes?.['r:embed'])
      .filter(Boolean)
    const sourceEntries = [...new Set(relationshipIds.map((id) => relationships.get(id)).filter(Boolean))].sort()
    if (!sourceEntries.length) continue
    const properties = descendant(directChild(group, 'p:nvGrpSpPr'), 'p:cNvPr')
    groups.push({
      slide,
      group_id: properties?.attributes?.id ?? null,
      group_name: properties?.attributes?.name ?? null,
      source_entries: sourceEntries,
      text_runs: descendants(group, 'a:t').map((node) => String(node.text ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean),
      geometry: visibleGeometry(box, slideSize)
    })
  }
  return { pictures, groups }
}

const imageMetadata = async (file, extension) => {
  const vector = extension === '.svg'
  if (vector) {
    const source = await fs.readFile(file, 'utf8')
    if (/<script\b|\son[a-z]+\s*=/iu.test(source)) throw new Error(`Unsafe active content in ${file}`)
    for (const match of source.matchAll(/(?:href|xlink:href)\s*=\s*(?:"([^"]+)"|'([^']+)')/giu)) {
      const value = match[1] ?? match[2] ?? ''
      if (!value.startsWith('data:') && !value.startsWith('#')) throw new Error(`External SVG reference in ${file}`)
    }
    const root = source.match(/<svg\b([^>]*)>/iu)
    if (!root) throw new Error(`Unable to find SVG root in ${file}`)
    const attributes = parseAttributes(root[1])
    let width = Number.parseFloat(attributes.width)
    let height = Number.parseFloat(attributes.height)
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      const viewBox = String(attributes.viewBox ?? '').trim().split(/[ ,]+/).map(Number)
      if (viewBox.length === 4 && viewBox.every(Number.isFinite)) {
        width = viewBox[2]
        height = viewBox[3]
      }
    }
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
      throw new Error(`Unable to inspect SVG dimensions for ${file}`)
    }
    return {
      width: Math.round(width),
      height: Math.round(height),
      channels: 'svg',
      opaque: true,
      alpha_mean: 1,
      vector: true
    }
  }
  const frame = `${file}[0]`
  const description = (await run(
    hasImageMagick7 ? 'magick' : 'identify',
    hasImageMagick7
      ? ['identify', '-quiet', '-format', '%w|%h|%[channels]|%[opaque]', frame]
      : ['-quiet', '-format', '%w|%h|%[channels]|%[opaque]', frame]
  )).trim()
  const [widthText, heightText, channels = '', opaque = ''] = description.split('|')
  const width = Number(widthText)
  const height = Number(heightText)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`Unable to inspect image dimensions for ${file}`)
  }
  let alphaMean = 1
  if (!/^true$/i.test(opaque)) {
    const value = (await run(hasImageMagick7 ? 'magick' : 'convert', [frame, '-alpha', 'extract', '-format', '%[fx:mean]', 'info:'])).trim()
    alphaMean = Number(value)
    if (!Number.isFinite(alphaMean)) throw new Error(`Unable to inspect alpha channel for ${file}`)
  }
  return {
    width,
    height,
    channels,
    opaque: /^true$/i.test(opaque),
    alpha_mean: Number(alphaMean.toFixed(8)),
    vector
  }
}

const placementSignature = (geometry) => [
  geometry.x_emu,
  geometry.y_emu,
  geometry.width_emu,
  geometry.height_emu
].map((value) => Math.round(value / 10000)).join(':')

const exclusionReasons = (candidate, repeatStats) => {
  const reasons = []
  const { geometry, image } = candidate
  if (!VISUAL_POLICY.allowed_extensions.includes(candidate.extension)) reasons.push('unsupported-web-format')
  if (geometry.area_ratio > VISUAL_POLICY.maximum_geometry_ratio) reasons.push('near-full-slide-image')
  if (geometry.area_ratio < VISUAL_POLICY.minimum_geometry_ratio ||
      geometry.width_ratio < VISUAL_POLICY.minimum_geometry_dimension_ratio ||
      geometry.height_ratio < VISUAL_POLICY.minimum_geometry_dimension_ratio) reasons.push('tiny-slide-decoration')
  if (!image.vector && (image.width < VISUAL_POLICY.minimum_raster_width ||
      image.height < VISUAL_POLICY.minimum_raster_height ||
      image.width * image.height < VISUAL_POLICY.minimum_raster_pixels)) reasons.push('low-resolution-raster')
  if (image.alpha_mean < VISUAL_POLICY.minimum_visible_alpha_mean) reasons.push('transparent-or-sparse-decoration')
  if (repeatStats.isRepeatedDecoration) reasons.push('repeated-decoration')
  if (CURATED_EXCLUSIONS[candidate.image.sha256]) reasons.push(`curated:${CURATED_EXCLUSIONS[candidate.image.sha256]}`)
  return reasons
}

const scoreCandidate = (candidate, anchors) => {
  const anchorIndex = anchors.indexOf(candidate.slide)
  const anchorScore = anchorIndex >= 0 ? 100000 - anchorIndex * 1000 : 0
  const geometryScore = Math.round(Math.min(candidate.geometry.area_ratio, 0.5) * 10000)
  const pixelScore = candidate.image.vector
    ? 2000
    : Math.round(Math.log2(Math.max(1, candidate.image.width * candidate.image.height)) * 50)
  const rarityScore = Math.max(0, 100 - candidate.repeat_stats.slide_count * 5)
  return anchorScore + geometryScore + pixelScore + rarityScore
}

export const inspectPptxVisuals = async ({ module, pptx, temporaryDirectory }) => {
  const presentationXml = (await unzipEntry(pptx, 'ppt/presentation.xml')).toString('utf8')
  const slideSize = slideSizeFromPresentation(presentationXml)
  const pictures = []
  const groups = []
  for (let slide = 1; slide <= module.slide_count; slide += 1) {
    const [xml, relsXml] = await Promise.all([
      unzipEntry(pptx, `ppt/slides/slide${slide}.xml`),
      unzipEntry(pptx, `ppt/slides/_rels/slide${slide}.xml.rels`)
    ])
    const slideVisuals = visualsFromSlide({
      xml: xml.toString('utf8'),
      relsXml: relsXml.toString('utf8'),
      slide,
      slideSize
    })
    pictures.push(...slideVisuals.pictures)
    groups.push(...slideVisuals.groups)
  }

  const uniqueEntries = [...new Set(pictures.map((item) => item.source_entry))].sort()
  const media = new Map()
  for (const [index, sourceEntry] of uniqueEntries.entries()) {
    const extension = path.extname(sourceEntry).toLowerCase()
    const buffer = await unzipEntry(pptx, sourceEntry)
    const hash = sha256(buffer)
    const temporaryFile = path.join(temporaryDirectory, `${module.id}-${index}${extension || '.bin'}`)
    await fs.writeFile(temporaryFile, buffer)
    let metadata = {
      width: 0,
      height: 0,
      channels: '',
      opaque: false,
      alpha_mean: 0,
      vector: extension === '.svg'
    }
    let inspectError = null
    if (VISUAL_POLICY.allowed_extensions.includes(extension)) {
      try {
        metadata = await imageMetadata(temporaryFile, extension)
      } catch (error) {
        inspectError = String(error.message || error)
      }
    }
    media.set(sourceEntry, {
      extension,
      buffer,
      sha256: hash,
      size: buffer.length,
      ...metadata,
      inspect_error: inspectError
    })
  }

  const occurrencesByHash = new Map()
  for (const picture of pictures) {
    const hash = media.get(picture.source_entry)?.sha256
    if (!hash) continue
    if (!occurrencesByHash.has(hash)) occurrencesByHash.set(hash, [])
    occurrencesByHash.get(hash).push(picture)
  }

  const candidates = pictures.map((picture) => {
    const image = media.get(picture.source_entry)
    const occurrences = occurrencesByHash.get(image.sha256) ?? []
    const slides = new Set(occurrences.map((item) => item.slide))
    const placements = new Map()
    for (const occurrence of occurrences) {
      const signature = placementSignature(occurrence.geometry)
      placements.set(signature, (placements.get(signature) ?? 0) + 1)
    }
    const strongestPlacement = Math.max(0, ...placements.values())
    const repeatStats = {
      slide_count: slides.size,
      occurrence_count: occurrences.length,
      strongest_placement_ratio: occurrences.length ? Number((strongestPlacement / occurrences.length).toFixed(6)) : 0,
      isRepeatedDecoration: slides.size >= VISUAL_POLICY.repeated_asset_minimum_slides &&
        strongestPlacement / occurrences.length >= VISUAL_POLICY.repeated_placement_ratio
    }
    const candidate = {
      ...picture,
      extension: image.extension,
      image,
      repeat_stats: repeatStats
    }
    candidate.exclusion_reasons = image.inspect_error
      ? ['unreadable-image']
      : exclusionReasons(candidate, repeatStats)
    return candidate
  })

  return { slideSize, candidates, groups }
}

const escapeSvg = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')

const reconstructedGeometry = (slideSize) => {
  const widthRatio = 0.86
  const heightRatio = 0.68
  const x = slideSize.width * (1 - widthRatio) / 2
  const y = slideSize.height * (1 - heightRatio) / 2
  return {
    x_emu: Math.round(x),
    y_emu: Math.round(y),
    width_emu: Math.round(slideSize.width * widthRatio),
    height_emu: Math.round(slideSize.height * heightRatio),
    width_ratio: widthRatio,
    height_ratio: heightRatio,
    area_ratio: Number((widthRatio * heightRatio).toFixed(6))
  }
}

const svgCandidate = ({
  lessonId,
  slide,
  sourceEntry,
  sourceEntries = [],
  sourceSlides = [slide],
  sourceKind,
  shapeId = null,
  shapeName,
  geometry,
  svg
}) => {
  const buffer = Buffer.from(svg, 'utf8')
  return {
    lesson_id: lessonId,
    slide,
    source_entry: sourceEntry,
    source_entries: sourceEntries,
    source_slides: sourceSlides,
    source_kind: sourceKind,
    shape_id: shapeId,
    shape_name: shapeName,
    geometry,
    extension: '.svg',
    image: {
      extension: '.svg',
      buffer,
      sha256: sha256(buffer),
      size: buffer.length,
      width: 1200,
      height: 640,
      channels: 'svg',
      opaque: true,
      alpha_mean: 1,
      vector: true,
      inspect_error: null
    },
    repeat_stats: {
      slide_count: 1,
      occurrence_count: 1,
      strongest_placement_ratio: 1,
      isRepeatedDecoration: false
    },
    exclusion_reasons: []
  }
}

export const STRUCTURED_VISUAL_SPECS = Object.freeze({
  'EM-006': Object.freeze({
    slide: 18,
    source_slides: Object.freeze([18, 21, 22]),
    title: '从个体策略到群体智能',
    subtitle: '群体表现不能由单个智能体的奖励回路直接推断',
    steps: Object.freeze([
      Object.freeze(['仿真训练场', '数字孪生任务', '对象与反馈']),
      Object.freeze(['个体策略', '局部感知', '行动与学习']),
      Object.freeze(['通信互动', '协作或竞争', '规则与约束']),
      Object.freeze(['群体指标', '效率·安全', '公平与韧性']),
      Object.freeze(['现实校准', '真实数据', '适用域与迁移'])
    ])
  }),
  'IN-004': Object.freeze({
    slide: 15,
    source_slides: Object.freeze([14, 15, 18, 19]),
    title: '企业知识工作流',
    subtitle: '让每一次生成都能回到权限、版本和原始依据',
    steps: Object.freeze([
      Object.freeze(['知识单元', '文档与会议', '来源·时间·权限']),
      Object.freeze(['检索校准', '按身份过滤', '只取有效版本']),
      Object.freeze(['带引用生成', '答案附证据', '缺证据即停止']),
      Object.freeze(['审批交付', '人工确认', '再对外使用']),
      Object.freeze(['使用度量', '命中与纠错', '持续更新'])
    ])
  }),
  'IN-005': Object.freeze({
    slide: 18,
    source_slides: Object.freeze([18, 21, 22]),
    title: '工业 AI 决策闭环',
    subtitle: '预测只有进入受约束的现场行动，才会产生可持续价值',
    steps: Object.freeze([
      Object.freeze(['对象与工况', '设备·批次', '时间与环境']),
      Object.freeze(['感知与预测', '异常·质量', '能耗与供应']),
      Object.freeze(['约束决策', '产能·成本', '安全优先']),
      Object.freeze(['保护与确认', '规则保护层', '人工权限']),
      Object.freeze(['执行与反馈', '工单与处置', '结果回写'])
    ])
  }),
  'IN-007': Object.freeze({
    slide: 15,
    source_slides: Object.freeze([15, 18, 19]),
    title: '火灾调查证据链',
    subtitle: 'AI 可以整理线索，但正式判断必须回到程序、证据和责任',
    steps: Object.freeze([
      Object.freeze(['原始资料', '照片·日志', '记录与笔录']),
      Object.freeze(['证据保全', '哈希·时间', '来源与过程']),
      Object.freeze(['竞争假设', '支持证据', '矛盾与缺口']),
      Object.freeze(['交叉核验', '法规·技术', '专家复核']),
      Object.freeze(['人工定案', '法定程序', '责任与复查'])
    ])
  })
})

export const buildStructuredCourseVisual = ({ lessonId, inspection }) => {
  const spec = STRUCTURED_VISUAL_SPECS[lessonId]
  if (!spec) throw new Error(`${lessonId}: missing structured visual spec`)
  const cardWidth = 204
  const gap = 20
  const startX = 50
  const cards = spec.steps.map(([label, line1, line2], index) => {
    const x = startX + index * (cardWidth + gap)
    const number = index + 1
    const arrow = index === spec.steps.length - 1
      ? ''
      : `<path d="M${x + cardWidth + 4} 337 H${x + cardWidth + gap - 6}" stroke="#4b7bec" stroke-width="6" stroke-linecap="round"/><path d="M${x + cardWidth + gap - 6} 337 l-12 -8 v16 z" fill="#4b7bec"/>`
    return `<g><rect x="${x}" y="178" width="${cardWidth}" height="318" rx="24" fill="#ffffff" stroke="#c9d7ee" stroke-width="2"/><circle cx="${x + 34}" cy="216" r="19" fill="#2855d9"/><text x="${x + 34}" y="223" text-anchor="middle" font-size="20" font-weight="700" fill="#ffffff">${number}</text><text x="${x + 22}" y="280" font-size="25" font-weight="700" fill="#17324d">${escapeSvg(label)}</text><line x1="${x + 22}" y1="304" x2="${x + cardWidth - 22}" y2="304" stroke="#dbe5f4" stroke-width="2"/><text x="${x + 22}" y="354" font-size="21" fill="#3f5870"><tspan x="${x + 22}" dy="0">${escapeSvg(line1)}</tspan><tspan x="${x + 22}" dy="38">${escapeSvg(line2)}</tspan></text>${arrow}</g>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="640" viewBox="0 0 1200 640" role="img" aria-labelledby="title desc"><title id="title">${escapeSvg(spec.title)}</title><desc id="desc">${escapeSvg(spec.subtitle)}</desc><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7faff"/><stop offset="1" stop-color="#edf4ff"/></linearGradient></defs><rect width="1200" height="640" rx="32" fill="url(#bg)"/><text x="50" y="70" font-family="PingFang SC, Noto Sans CJK SC, sans-serif" font-size="38" font-weight="750" fill="#17324d">${escapeSvg(spec.title)}</text><text x="50" y="116" font-family="PingFang SC, Noto Sans CJK SC, sans-serif" font-size="22" fill="#52687c">${escapeSvg(spec.subtitle)}</text><g font-family="PingFang SC, Noto Sans CJK SC, sans-serif">${cards}</g><text x="50" y="565" font-family="PingFang SC, Noto Sans CJK SC, sans-serif" font-size="20" fill="#2855d9">观察顺序：先确认输入与边界，再沿箭头检查每一步的证据、权限与反馈。</text></svg>`
  return svgCandidate({
    lessonId,
    slide: spec.slide,
    sourceEntry: `ppt/slides/slide${spec.slide}.xml#structured-course-${lessonId.toLowerCase()}`,
    sourceSlides: [...spec.source_slides],
    sourceKind: 'structured-course-diagram',
    shapeName: `${lessonId} structured course diagram`,
    geometry: reconstructedGeometry(inspection.slideSize),
    svg
  })
}

export const buildNativeTaskPlanningVisual = async ({ inspection }) => {
  const humanHash = '160b6b94de958298f027199fdd794bef02a2920bc80cfa3d9792408254556bb4'
  const robotHash = 'd1105f24307f99a4779873cf32ac9c0f8f045cb9ad62bd9e4c269b9419f30a98'
  const human = inspection.candidates.find((candidate) => candidate.slide === 10 && candidate.image.sha256 === humanHash)
  const robot = inspection.candidates.find((candidate) => candidate.slide === 10 && candidate.image.sha256 === robotHash)
  if (!human || !robot) throw new Error('EM-005: native task-planning icons are missing')
  const group = inspection.groups.find((candidate) =>
    candidate.slide === 10 &&
    candidate.source_entries.includes(human.source_entry) &&
    candidate.source_entries.includes(robot.source_entry) &&
    candidate.text_runs.some((value) => value.includes('MoveTo,bottle')))
  if (!group) throw new Error('EM-005: native task-planning group is missing')

  const prompt = group.text_runs.filter((value) => /我渴了|拿杯水/.test(value)).join('')
  const sourceStepLabels = ['移动到水瓶附近', '拿起水开', '移动到桌子附近', '把水放到桌上']
  const displayStepLabels = ['移动到水瓶附近', '拿起水瓶', '移动到桌子附近', '把水瓶放到桌上']
  const displayCommands = ['(MoveTo, bottle)', '(PickUp, bottle)', '(MoveTo, table)', '(PutDown, bottle, table)']
  const steps = sourceStepLabels.map((sourceLabel, stepIndex) => {
    const index = group.text_runs.findIndex((value) => value === sourceLabel)
    const sourceCommand = index >= 0 ? group.text_runs[index + 1] : ''
    if (!sourceCommand?.startsWith('(')) throw new Error(`EM-005: native task-planning step drifted (${sourceLabel})`)
    return { label: displayStepLabels[stepIndex], command: displayCommands[stepIndex] }
  })
  if (!prompt) throw new Error('EM-005: native task-planning prompt drifted')

  const rows = steps.map((step, index) => {
    const y = 210 + index * 82
    return `<g transform="translate(660 ${y})"><rect width="460" height="62" rx="14" fill="#ffffff" stroke="#9db1c7" stroke-width="2"/><text x="22" y="27" font-size="21" font-weight="650" fill="#18324a">${escapeSvg(step.label)}</text><text x="22" y="50" font-size="16" fill="#52687c">${escapeSvg(step.command)}</text></g>`
  }).join('')
  const humanData = `data:image/png;base64,${human.image.buffer.toString('base64')}`
  const robotData = `data:image/png;base64,${robot.image.buffer.toString('base64')}`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="640" viewBox="0 0 1200 640" role="img" aria-labelledby="title desc"><title id="title">任务规划示意图</title><desc id="desc">把自然语言请求分解为机器人可以执行的连续技能</desc><rect width="1200" height="640" rx="28" fill="#f4f8fc"/><text x="54" y="70" font-family="PingFang SC, Noto Sans CJK SC, sans-serif" font-size="34" font-weight="700" fill="#17324d">任务规划：把人类指令分解为可执行技能</text><rect x="48" y="118" width="500" height="150" rx="22" fill="#ffffff" stroke="#8ca7c0" stroke-width="3"/><text x="84" y="170" font-family="PingFang SC, Noto Sans CJK SC, sans-serif" font-size="25" fill="#17324d"><tspan x="84" dy="0">${escapeSvg(prompt.slice(0, 12))}</tspan><tspan x="84" dy="38">${escapeSvg(prompt.slice(12))}</tspan></text><image href="${humanData}" x="96" y="310" width="150" height="210" preserveAspectRatio="xMidYMid meet"/><path d="M280 414 H560" fill="none" stroke="#2f6fa3" stroke-width="8" stroke-linecap="round"/><path d="M560 414 l-28 -18 v36 z" fill="#2f6fa3"/><text x="338" y="390" font-family="PingFang SC, Noto Sans CJK SC, sans-serif" font-size="22" fill="#31546f">分解任务</text><image href="${robotData}" x="565" y="72" width="100" height="125" preserveAspectRatio="xMidYMid meet"/>${rows}</svg>`
  return svgCandidate({
    lessonId: 'EM-005',
    slide: 10,
    sourceEntry: `ppt/slides/slide10.xml#native-group-${group.group_id ?? 'task-planning'}`,
    sourceEntries: group.source_entries,
    sourceKind: 'native-group-rendering',
    shapeId: group.group_id,
    shapeName: group.group_name ?? 'Task planning group',
    geometry: group.geometry,
    svg
  })
}

export const selectLessonVisual = ({ lesson, lessonSource, candidates, selectedHashes = new Set(), overrideHash = null }) => {
  const slides = new Set(parseSlideSpec(lessonSource.slides))
  const anchors = (lessonSource.anchors ?? []).filter((slide) => slides.has(slide))
  const eligible = candidates
    .filter((candidate) => (!candidate.lesson_id || candidate.lesson_id === lesson.id) && slides.has(candidate.slide) && candidate.exclusion_reasons.length === 0)
    .map((candidate) => ({ ...candidate, selection_score: scoreCandidate(candidate, anchors) }))
    .sort((left, right) =>
      right.selection_score - left.selection_score ||
      left.slide - right.slide ||
      left.source_entry.localeCompare(right.source_entry) ||
      String(left.shape_id).localeCompare(String(right.shape_id)))

  const anchored = eligible.filter((candidate) => anchors.includes(candidate.slide))
  const preferredPool = anchored.length ? anchored : eligible
  const unused = preferredPool.filter((candidate) => !selectedHashes.has(candidate.image.sha256))
  const override = overrideHash ? eligible.find((candidate) => candidate.image.sha256 === overrideHash) : null
  if (overrideHash && !override) throw new Error(`${lesson.id}: selection override is unavailable or excluded (${overrideHash})`)
  const selected = override ?? unused[0] ?? preferredPool[0] ?? null
  const sourceCandidates = candidates.filter((candidate) => (!candidate.lesson_id || candidate.lesson_id === lesson.id) && slides.has(candidate.slide))
  const exclusions = {}
  for (const candidate of sourceCandidates) {
    for (const reason of candidate.exclusion_reasons) exclusions[reason] = (exclusions[reason] ?? 0) + 1
  }
  return {
    selected,
    audit: {
      source_slide_count: slides.size,
      picture_shape_count: sourceCandidates.length,
      eligible_picture_count: eligible.length,
      excluded_picture_count: sourceCandidates.length - eligible.length,
      exclusion_counts: Object.fromEntries(Object.entries(exclusions).sort(([left], [right]) => left.localeCompare(right)))
    }
  }
}

export const inspectOutputImage = imageMetadata
