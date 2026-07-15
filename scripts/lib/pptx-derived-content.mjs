import { courseMediaGroupsForLesson } from './course-media.mjs'

const blockPattern = /<!-- pptx-derived:start\b[^>]*-->[\s\S]*?<!-- pptx-derived:end -->\n*/
const courseMediaBlockPattern = /\n{2}<!-- course-media:start\b[^>]*-->[\s\S]*?<!-- course-media:end -->\n{2}/g

const normalizeText = (value) => String(value ?? '')
  .replace(/\s+([，。；：！？、）》])/g, '$1')
  .replace(/([《（])\s+/g, '$1')
  .replace(/\s+/g, ' ')
  .trim()

const markdown = (value) => normalizeText(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('{', '&#123;')
  .replaceAll('}', '&#125;')
  .replaceAll('https://', 'https&#58;//')
  .replaceAll('http://', 'http&#58;//')

const lessonKnowledgeMaps = {
  'OV-001': {
    intro: '从可观察的案例出发，逐步定位人工智能、大模型与现实任务之间的关系。',
    concepts: [
      ['案例中的智能', '观察对话机器人、具身机器人与仿真平台分别展示了什么能力。'],
      ['人工智能的结构', '把感知、推理与行动放回同一个任务闭环中理解。'],
      ['大模型的位置', '辨清人工智能、机器学习、深度学习、预训练模型与大语言模型的层级。'],
      ['能力与边界', '用任务、证据和后果判断系统能做什么，以及何时需要人工负责。']
    ]
  },
  'OV-002': {
    intro: '技术能力、资源条件与社会预期共同推动人工智能演进，也共同塑造它的影响。',
    concepts: [
      ['技术转折', '沿规则系统、机器学习、深度学习与大模型观察能力范式的变化。'],
      ['工作与学习', '把注意力放在任务如何重组，而不是简单预测某个职业是否消失。'],
      ['依赖与风险', '识别技术依赖、错误强化和心理风险，并保留现实世界的判断依据。']
    ]
  },
  'OV-003': {
    intro: '先建立概念层级，再理解模型如何从数据中学习，以及如何检验它能否泛化。',
    concepts: [
      ['概念层级', '区分人工智能、机器学习、深度学习、预训练模型与大语言模型。'],
      ['训练机制', '用数据、模型、损失与优化描述一次完整的学习过程。'],
      ['泛化检验', '通过训练集、验证集与测试集判断模型是否只记住了样本。']
    ]
  },
  'OV-004': {
    intro: '从序列建模的限制进入 Transformer，再把模型结构与真实能力边界连接起来。',
    concepts: [
      ['架构演进', '比较循环网络的顺序计算与 Transformer 的并行上下文建模。'],
      ['注意力机制', '理解自注意力、多头注意力与位置编码各自解决的问题。'],
      ['训练与生成', '把预训练、对齐和逐步生成放进同一条模型工作链。'],
      ['能力边界', '区分语言生成、工具使用与可靠完成现实任务所需的额外条件。']
    ]
  },
  'OV-005': {
    intro: '模型名称会快速变化，更稳定的学习方式是比较架构路线、开放程度与部署选择。',
    concepts: [
      ['模型路线', '从 GPT、BERT、DeepSeek 与混合专家架构观察不同设计取向。'],
      ['开放程度', '分别考察模型权重、代码、训练信息与使用许可是否真正开放。'],
      ['部署选择', '结合数据边界、成本、运维与任务评测选择 API、托管或本地运行。']
    ]
  },
  'OV-006': {
    intro: '把提示词和多模态生成放进可复用的工作流，而不是只追求一次看似惊艳的输出。',
    concepts: [
      ['多模态表示', '理解文本、图像、音频和视频如何以不同方式进入模型。'],
      ['提示词结构', '明确任务、上下文、约束、示例与输出格式，减少解释空间。'],
      ['生成工作流', '把候选生成、人工选择、事实核对与交付验收连接起来。']
    ]
  },
  'OV-007': {
    intro: '可靠使用人工智能，需要同时处理知识依据、系统权限与最终责任。',
    concepts: [
      ['知识与对齐', '用检索增强、偏好对齐和评测减少无依据或不合目标的输出。'],
      ['攻击与隐私', '识别提示注入、越权调用、敏感数据泄露和恶意使用风险。'],
      ['责任机制', '按后果分级设置最小权限、人工断点、审计记录与问责主体。']
    ]
  },
  'AG-001': {
    intro: '智能体的关键不是多说一步推理，而是能在环境反馈中持续选择可验证的行动。',
    concepts: [
      ['三类系统', '先区分语言模型、固定工作流与能够自主选行动的智能体。'],
      ['ReAct 循环', '让观察、推理、行动和新反馈交错发生，逐步缩小不确定性。'],
      ['停止与复盘', '用完成、阻塞、风险和预算条件决定何时停止，并保留执行轨迹。']
    ]
  },
  'AG-002': {
    intro: '长任务能否稳定完成，取决于工具契约、上下文组织和可更新的任务状态。',
    concepts: [
      ['工具与 MCP', '用明确的名称、参数、返回值和授权边界连接外部能力。'],
      ['记忆与规划', '区分当前上下文、短期状态与长期记忆，并持续更新任务图。'],
      ['失败与权限', '把错误变成可读状态；权限不足时停止绕行并请求正确授权。']
    ]
  },
  'AG-003': {
    intro: '多智能体协作只有在拆分收益大于沟通成本时才值得采用。',
    concepts: [
      ['角色与编排', '按责任、输入和交付物划分角色，再选择集中或分布式协调。'],
      ['共享与交接', '只共享协作所需事实，并让接收者能够验证前一环节的结果。'],
      ['冲突与验收', '处理局部结果冲突、故障传播与人工介入，最后做整体验收。']
    ]
  },
  'AG-004': {
    intro: 'AI 编程要形成从需求到证据的短循环，生成代码只是其中一个步骤。',
    concepts: [
      ['需求与基线', '先写清验收标准，再确认环境、现状和不能破坏的边界。'],
      ['生成与观察', '小步修改、立即运行，让真实输出决定下一次修复。'],
      ['测试与交付', '用分层测试、代码审阅和可复现说明收紧最终结果。']
    ]
  },
  'AG-005': {
    intro: '可运营的智能体系统必须让执行过程可观察、结果可评测、失败可恢复。',
    concepts: [
      ['执行轨迹', '记录关键输入、工具调用、状态变化与输出，形成可追溯因果链。'],
      ['分层评测', '同时检查最终结果、过程检查点和长期运行指标。'],
      ['人工与恢复', '按风险设置人工断点，并从最近的已验证状态继续任务。']
    ]
  },
  'EM-001': {
    intro: '具身智能把模型放进物理或仿真环境中，用感知、决策与行动形成反馈闭环。',
    concepts: [
      ['数据与本体', '数据提供经验，本体承担感知和执行，两者共同限定系统能力。'],
      ['闭环结构', '把环境观测转成状态与计划，再通过动作获取新的反馈。'],
      ['实时与安全', '在不确定的物理世界中，为动作设置约束、停止条件和恢复路径。']
    ]
  },
  'EM-002': {
    intro: '理解机器人平台，要同时观察本体结构、运动能力、软件生态与应用约束。',
    concepts: [
      ['本体与感知', '比较四足与人形平台如何配置传感器、执行器和计算单元。'],
      ['能力与成本', '把稳定运动、负载、续航、维护和安全纳入整体比较。'],
      ['应用边界', '从巡检、研究与服务任务判断平台能力是否匹配现实环境。']
    ]
  },
  'EM-003': {
    intro: '环境理解不是传感器数量的叠加，而是让多源观测指向同一个世界状态。',
    concepts: [
      ['主动与多模态', '综合视觉、深度、激光雷达、声音和触觉获得互补信息。'],
      ['时空对齐', '统一坐标、时间戳和对象身份，避免把不同观测错误拼接。'],
      ['状态到任务', '把感知结果组织成可供定位、规划、操作和安全判断使用的表示。']
    ]
  },
  'EM-004': {
    intro: '运动控制既要学会动作策略，也要证明策略能从仿真安全地迁移到真实设备。',
    concepts: [
      ['策略学习', '用状态、动作、奖励与示范描述强化学习和模仿学习。'],
      ['仿真训练', '在可控环境中覆盖任务变化、扰动和失败情形。'],
      ['迁移与验证', '通过参数扰动、分阶段测试和安全约束缩小仿真与现实差距。']
    ]
  },
  'EM-005': {
    intro: '机器人实训从安全和接口开始，通过可观察的消息链逐层定位问题。',
    concepts: [
      ['安全与连接', '先确认急停、网络、设备状态和允许执行的动作范围。'],
      ['ROS2 链路', '用节点、话题、消息与坐标变换描述从命令到执行的路径。'],
      ['诊断与验收', '先复现固定轨迹，再按接口层级检查异常并验证修复。']
    ]
  },
  'EM-006': {
    intro: '群体具身智能需要同时理解个体策略、协作规则和数字孪生训练环境。',
    concepts: [
      ['仿真训练场', '在数字孪生环境中组织任务、对象、交互与反馈。'],
      ['个体与群体', '观察局部行动如何形成协作、竞争或群体涌现。'],
      ['评测与迁移', '同时评估个体、群体和系统表现，再校准到现实适用域。']
    ]
  },
  'IN-001': {
    intro: '行业 AI 的起点不是选择模型，而是把业务问题写成可评测、可停止的任务。',
    concepts: [
      ['场景与基线', '明确对象、输入、输出和当前流程，建立可比较的起点。'],
      ['闭环与风险', '把工具、人工审批、异常处理和系统集成放进执行链。'],
      ['成本与回报', '同时计算建设、运行和纠错成本，并设置推广与停止门槛。']
    ]
  },
  'IN-002': {
    intro: '高校场景中的 AI 应围绕学习和科研目标服务，同时保留证据、隐私与作者责任。',
    concepts: [
      ['教学工作流', '把备课、学习活动与反馈组织成可检查的教学闭环。'],
      ['科研可追溯', '让检索、数据、分析步骤和结论能够回到原始依据。'],
      ['诚信与隐私', '遵守最小必要原则，明确 AI 辅助范围和最终作者责任。']
    ]
  },
  'IN-003': {
    intro: '公共服务中的智能化必须服从流程、权限、证据和责任边界。',
    concepts: [
      ['事项与权限', '从具体服务事项出发，只开放完成任务所需的数据与工具。'],
      ['依据与风险', '让回答回到有效政策和材料，并按后果设置人工复核。'],
      ['服务与责任', '在基层和乡村场景中解决具体需求，同时保留可追溯责任链。']
    ]
  },
  'IN-004': {
    intro: '企业知识工作流要让内容可检索、权限可控、版本有效、交付可审批。',
    concepts: [
      ['知识单元', '把文档和会议内容整理为带来源、时间与权限的可检索信息。'],
      ['检索与生成', '用外部知识支撑回答，并把引用和版本状态一同交付。'],
      ['审批与度量', '在外部使用前设置审核，用真实使用和纠错衡量长期价值。']
    ]
  },
  'IN-005': {
    intro: '工业 AI 的价值来自数据、决策和现场执行形成闭环，而不是孤立的预测分数。',
    concepts: [
      ['数据与工况', '统一设备、批次、时间和运行条件，保证样本可以比较。'],
      ['预测到行动', '把异常、质量、能耗和供应风险转成有责任人的处置流程。'],
      ['安全与成本', '保留保护层和人工权限，同时衡量误报、漏报与运行成本。']
    ]
  },
  'IN-006': {
    intro: '智慧机场需要把多源运行信息对齐，再将知识服务、运维和应急协同接入同一流程。',
    concepts: [
      ['时空融合', '统一对象、位置与时间，让不同系统描述的是同一运行状态。'],
      ['知识与运维', '让问答附带有效依据，并把告警转成可审核的处置建议。'],
      ['应急与评测', '由系统整理共同态势，以影子运行和人工确认验证高风险流程。']
    ]
  },
  'IN-007': {
    intro: '火灾调查辅助系统可以整理线索和知识，但不能替代法定调查与专家判断。',
    concepts: [
      ['资料与证据', '先完整保存现场资料，再建立能够回到原始材料的证据链。'],
      ['假设与依据', '并行检验多种解释，并关联法规、技术资料与反证。'],
      ['复核与责任', '对任务级输出做专业复核，最终结论仍由有职责的人作出。']
    ]
  },
  'IN-008': {
    intro: '海洋与地理空间智能首先要解决多源观测的差异，再组织可追溯的分析服务。',
    concepts: [
      ['多源观测', '辨清遥感、浮标、船舶等数据在尺度、频率和误差上的差异。'],
      ['时空对齐', '统一位置、时间、对象与坐标，让跨来源分析真正成立。'],
      ['服务与评测', '用工具、记忆和规划组织工作流，并以来源与检查点验证结果。']
    ]
  },
  'IN-009': {
    intro: '文旅、展厅与智慧建筑要把空间体验、内容服务和长期运营连接起来。',
    concepts: [
      ['人、空间与任务', '从游客旅程和服务场景定义导览、问答与辅助任务。'],
      ['路线与数字孪生', '用地图、客流、设备和环境状态支撑动态空间服务。'],
      ['运营与接管', '持续更新内容和系统状态，并为异常与高风险问答保留人工入口。']
    ]
  }
}

export const parseSlideSelector = (selector) => {
  const slides = new Set()
  for (const part of String(selector || '').split(',').map((value) => value.trim()).filter(Boolean)) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!match) throw new Error(`Invalid PPTX slide selector: ${part}`)
    const first = Number(match[1])
    const last = Number(match[2] || match[1])
    if (first < 1 || last < first) throw new Error(`Invalid PPTX slide range: ${part}`)
    for (let slide = first; slide <= last; slide += 1) slides.add(slide)
  }
  return [...slides].sort((left, right) => left - right)
}

export const formatSlideSelector = (selector) => String(selector || '')
  .split(',')
  .map((part) => part.trim().replace('-', '–'))
  .filter(Boolean)
  .join('、')

const knowledgeMapForLesson = (lessonId) => {
  const map = lessonKnowledgeMaps[lessonId]
  if (!map) throw new Error(`${lessonId}: missing curated learner-facing knowledge map`)
  const intro = normalizeText(map.intro)
  if (!intro || intro.length > 90) throw new Error(`${lessonId}: knowledge-map intro must be 1-90 characters`)
  if (!Array.isArray(map.concepts) || map.concepts.length < 3 || map.concepts.length > 4) {
    throw new Error(`${lessonId}: knowledge map must contain 3-4 concepts`)
  }

  const titles = new Set()
  const concepts = map.concepts.map(([rawTitle, rawHint]) => {
    const title = normalizeText(rawTitle)
    const hint = normalizeText(rawHint)
    if (!title || title.length > 18) throw new Error(`${lessonId}: invalid knowledge-map title ${title}`)
    if (!hint || hint.length > 80) throw new Error(`${lessonId}: invalid knowledge-map hint for ${title}`)
    if (titles.has(title)) throw new Error(`${lessonId}: duplicate knowledge-map title ${title}`)
    titles.add(title)
    return { title, hint }
  })
  return { intro, concepts }
}

export const buildPptxDerivedBlock = ({ lesson, module, manifest }) => {
  const source = module.lesson_sources?.[lesson.id]
  if (!source) throw new Error(`${lesson.id}: missing lesson_sources entry`)
  const selectedSlides = parseSlideSelector(source.slides)
  const anchorSlides = source.anchors || selectedSlides
  const selected = new Set(selectedSlides)
  const slideByIndex = new Map((manifest.slides || []).map((slide) => [slide.index, slide]))
  for (const index of anchorSlides) {
    if (!selected.has(index)) throw new Error(`${lesson.id}: anchor slide ${index} is outside ${source.slides}`)
    if (!slideByIndex.has(index)) throw new Error(`${lesson.id}: anchor slide ${index} is missing from ${module.id}`)
  }
  const knowledgeMap = knowledgeMapForLesson(lesson.id)

  const lines = [
    `<!-- pptx-derived:start module=${module.id} sha256=${module.sha256} slides=${source.slides} coverage=${source.coverage} -->`,
    '## 知识导图',
    '',
    markdown(knowledgeMap.intro)
  ]

  for (const concept of knowledgeMap.concepts) {
    lines.push('', `- **${markdown(concept.title)}：** ${markdown(concept.hint)}`)
  }

  lines.push('', '<!-- pptx-derived:end -->')
  return lines.join('\n')
}

export const replacePptxDerivedBlock = (content, block) => {
  if (blockPattern.test(content)) return content.replace(blockPattern, `${block}\n\n`)
  const insertion = '\n## 本节导入'
  if (!content.includes(insertion)) throw new Error('Authored lesson is missing the 本节导入 section')
  return content.replace(insertion, `\n${block}\n\n## 本节导入`)
}

export const extractPptxDerivedBlock = (content) => content.match(blockPattern)?.[0]?.trim() || ''

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const buildCourseMediaBlock = (lessonId, group) => [
  `<!-- course-media:start lesson=${lessonId} group=${group.id} -->`,
  '<div class="ai-course-video-grid">',
  ...group.assets.flatMap((item) => [
    '<figure>',
    '<video controls preload="metadata">',
    `  <source src="${item.public_url}" type="video/mp4">`,
    '  当前浏览器不支持 MP4 视频播放。',
    '</video>',
    `<figcaption><strong>${item.label}：</strong>${item.viewing_question}</figcaption>`,
    '</figure>'
  ]),
  '</div>',
  '<!-- course-media:end -->'
].join('\n')

const insertMediaAfterFirstParagraph = (content, lessonId, group) => {
  const headingPattern = new RegExp(`^${escapeRegExp(group.after_heading)}[ \\t]*$`, 'gmu')
  const matches = [...content.matchAll(headingPattern)]
  if (matches.length !== 1) {
    throw new Error(`${lessonId}: expected one learner heading ${group.after_heading}, found ${matches.length}`)
  }

  const headingEnd = matches[0].index + matches[0][0].length
  const paragraph = content.slice(headingEnd).match(/^(?:[ \\t]*\n)+([\s\S]*?)(?=\n[ \\t]*\n)/)
  if (!paragraph || /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|<)/u.test(paragraph[1].trim())) {
    throw new Error(`${lessonId}: ${group.after_heading} must begin with a learner-facing paragraph`)
  }

  const insertion = headingEnd + paragraph[0].length
  const block = buildCourseMediaBlock(lessonId, group)
  return `${content.slice(0, insertion)}\n\n${block}${content.slice(insertion)}`
}

export const syncCourseMediaBlocks = (content, lessonId) => {
  let result = String(content).replace(courseMediaBlockPattern, '\n\n')
  for (const group of courseMediaGroupsForLesson(lessonId)) {
    result = insertMediaAfterFirstParagraph(result, lessonId, group)
  }
  return result
}
