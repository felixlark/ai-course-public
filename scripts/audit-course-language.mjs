import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const scanRoots = [
  path.join(root, 'docs/zh-cn'),
  path.join(root, 'docs/public/course-assets/course-decks'),
  path.join(root, 'docs/public/course-assets/generated'),
  path.join(root, '课程PPT框架/public-decks')
]

const textExtensions = new Set(['.md', '.json', '.svg', '.txt', '.html'])
const checks = [
  {
    name: 'contact-email',
    pattern: /(?:mailto:)?[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    scope: 'raw'
  },
  {
    name: 'contact-mobile',
    pattern: /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/g,
    scope: 'raw'
  },
  {
    name: 'contact-account-label',
    pattern: /(?:微信号|WeChat\s*ID|QQ\s*(?:号|群)?|联系电话|联系手机|联系邮箱|个人邮箱|办公室地址)\s*[:：]?/gi,
    scope: 'visible'
  },
  {
    name: 'absolute-local-path',
    pattern: /(?:file:\/{2,3}|(?:^|[\s"'`(])\/(?:Users|home|private|Volumes)\/[^\s"'`)]+|(?:^|[\s"'`(])[A-Z]:\\(?:Users|Documents and Settings)\\[^\s"'`)]+)/gi,
    scope: 'raw'
  },
  {
    name: 'course-production-meta',
    pattern: /课程制作指南|如何制作课件|如何制作课程|课程生产底座|讲座生产底座|可编辑课程底座|课程PPT框架|课程PPT矩阵|课程矩阵|旧课程矩阵|lesson blueprint/gi,
    scope: 'visible'
  },
  {
    name: 'speaker-instruction-meta',
    pattern: /讲者脚本|讲者验收|读者验收|讲者应该|讲者可以|讲课时应|授课前|面向不同受众的讲法|后续补齐/gi,
    scope: 'visible'
  },
  {
    name: 'material-library-meta',
    pattern: /PPT\s*素材讲义库|完整素材库|素材库首页|打开完整逐页讲义|逐页文本|逐页讲义|原始素材目录/gi,
    scope: 'visible'
  },
  {
    name: 'rewrite-process-meta',
    pattern: /重写为(?:课程|讲义|课件)|本节负责把|这一版(?:先|将)|生成器将|内部生产流程/gi,
    scope: 'visible'
  },
  {
    name: 'public-course-version-label',
    pattern: /原课件|源课件|课程精编|原课件图片与视频|打开本节 Web PPT/gi,
    scope: 'visible'
  },
  {
    name: 'unverified-gpt4-parameter-count',
    pattern: /GPT\s*-?\s*4[^。；\n]{0,50}(?:1[.,]?8\s*万亿|1\.8\s*(?:trillion|T)\b)/gi,
    scope: 'visible'
  },
  {
    name: 'unverified-domestic-model-count',
    pattern: /(?:国内|中国)[^。；\n]{0,60}(?:超过|超|已有|拥有)\s*100\s*(?:个|款|家)?\s*(?:大模型|模型)/gi,
    scope: 'visible'
  },
  {
    name: 'unverified-timeline-prediction',
    pattern: /(?:AGI|通用人工智能|大模型)[^。；\n]{0,80}(?:将在|必将在|会在|预计在)\s*20(?:2[6-9]|3\d)\s*年/gi,
    scope: 'visible'
  }
]

const exists = async (target) => {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

const walk = async (dir) => {
  if (!(await exists(dir))) return []
  const files = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walk(full))
    else if (entry.isFile() && textExtensions.has(path.extname(entry.name).toLowerCase())) files.push(full)
  }
  return files
}

const visibleTextForAudit = (line) =>
  line
    .replace(/https?:\/\/[^\s)\]}>"']+/gi, '')
    .replace(/\b(?:src|href|poster)=["'][^"']*["']/gi, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')

const files = (await Promise.all(scanRoots.map(walk))).flat()
const findings = []

for (const file of files) {
  const text = await fs.readFile(file, 'utf8')
  const lines = text.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    const visible = visibleTextForAudit(line)
    for (const check of checks) {
      const candidate = check.scope === 'raw' ? line : visible
      check.pattern.lastIndex = 0
      if (check.pattern.test(candidate)) {
        findings.push({
          check: check.name,
          file: path.relative(root, file),
          line: index + 1,
          text: line.trim().slice(0, 240)
        })
      }
    }
  }
}

if (findings.length) {
  console.error('Course language audit failed:')
  for (const item of findings) {
    console.error(`${item.file}:${item.line} [${item.check}] ${item.text}`)
  }
  process.exit(1)
}

console.log(`Course language audit passed for ${files.length} public text files; binary media was not scanned.`)
