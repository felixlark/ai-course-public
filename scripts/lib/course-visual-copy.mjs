const entry = (lessonId, alt, caption) => Object.freeze({
  lesson_id: lessonId,
  after_heading: '## 案例与图解',
  alt,
  caption
})

export const COURSE_VISUAL_COPY = Object.freeze({
  'OV-003': entry(
    'OV-003',
    '模型计算规模随时间增长的趋势图',
    '观察：比较横轴上的时间与纵轴上的数量级变化，同时思考计算规模增长为何不等于能力必然按同样比例提升。'
  ),
  'OV-004': entry(
    'OV-004',
    'Encoder 与 Transformer 信息处理结构对比图',
    '观察：比较两种结构传递上下文信息的路径，重点关注 Transformer 如何让不同位置的信息并行建立联系。'
  ),
  'OV-005': entry(
    'OV-005',
    'DeepSeek 混合专家模型与国产算力硬件协同示意图',
    '观察：区分模型侧的专家选择与硬件侧的计算支撑，比较稀疏激活和算力适配分别解决什么问题。'
  ),
  'OV-006': entry(
    'OV-006',
    '图像分块后送入 Transformer 编码器的 Vision Transformer 流程图',
    '观察：沿着图像分块、向量表示、位置编码和分类输出的顺序追踪数据，比较它与直接处理文字序列的共同点。'
  ),
  'OV-007': entry(
    'OV-007',
    '大模型预训练、微调与人类反馈强化学习流程图',
    '观察：比较预训练、任务微调和人类反馈三个阶段使用的数据与优化目标，找出安全约束主要在哪些环节进入。'
  ),
  'AG-001': entry(
    'AG-001',
    '智能体思考、行动、观察与再规划构成的 ReAct 闭环图',
    '观察：沿着一次完整循环追踪智能体的状态变化，重点关注环境观察如何修正下一轮推理与行动。'
  ),
  'AG-002': entry(
    'AG-002',
    '模型、MCP 客户端、MCP 服务端与外部工具之间的调用时序图',
    '观察：比较请求、工具执行和结果回传发生的位置，找出协议层负责连接什么、又不替代哪些业务判断。'
  ),
  'AG-003': entry(
    'AG-003',
    '多个专业智能体围绕共享任务分工协作的结构图',
    '观察：比较各角色掌握的上下文、承担的子任务和交换的信息，判断哪里需要协调者或共享状态。'
  ),
  'AG-004': entry(
    'AG-004',
    '编程智能体从理解需求到调用工具、测试和修正的执行时序图',
    '观察：沿着需求、计划、编辑、运行和反馈的顺序检查闭环，找出哪些节点必须用真实结果而不是模型自述来验收。'
  ),
  'AG-005': entry(
    'AG-005',
    '智能体评测规则表，列出任务条件、工具行为与结果判定字段',
    '观察：比较输入条件、期望行为、实际结果和通过标准，重点关注规则能否区分“完成任务”与“看起来像完成”。'
  ),
  'EM-001': entry(
    'EM-001',
    '具身智能感知、推理、执行与环境反馈闭环图',
    '观察：沿着传感输入到动作反馈的方向追踪信息，比较身体执行带来的误差与纯软件任务中的误差有何不同。'
  ),
  'EM-002': entry(
    'EM-002',
    '室内彩色画面逐步叠加点云并转为三维环境表示的动态演示',
    '观察：比较彩色画面、点云叠加与三维表示三个阶段，辨认纹理信息如何转为可计算的空间结构；这段素材展示的是环境表征过程，并不直接证明机器人已经完成自主避障。'
  ),
  'EM-003': entry(
    'EM-003',
    'G1 人形机器人在展区连续行走的动态演示',
    '观察：关注迈步、摆臂、落脚与身体姿态的连续变化，区分“能够稳定行走”的现场表现与“具备自主感知、规划和探索能力”的系统结论。'
  ),
  'EM-004': entry(
    'EM-004',
    '智能体与环境之间状态、动作和奖励往返的强化学习循环图',
    '观察：比较状态、动作与奖励在循环中的方向，重点判断奖励信号怎样影响后续策略，而不是直接指定每一步动作。'
  ),
  'EM-005': entry(
    'EM-005',
    '把自然语言取水请求分解为机器人连续动作的任务规划图',
    '观察：从“拿杯水”的目标依次核对移动、抓取、搬运和放置动作，找出一步失败后应从哪里重新规划。'
  ),
  'EM-006': entry(
    'EM-006',
    '从数字孪生训练、个体策略到群体指标和现实校准的流程图',
    '观察：沿着个体行动、通信互动和群体评测向前追踪，比较个体奖励与群体安全、公平和韧性之间的差别。'
  ),
  'IN-001': entry(
    'IN-001',
    '把任务条件、工具行为和结果阈值对应起来的评测规则表',
    '观察：比较业务目标、可观测行为和通过阈值，检查每个目标是否都能被数据或事件记录明确验证。'
  ),
  'IN-002': entry(
    'IN-002',
    '研究问题、检索材料、引用证据与回答结论之间的链路图',
    '观察：从每条结论反向追踪到支持它的材料片段，比较“找到相关材料”和“形成可核查证据”之间的差别。'
  ),
  'IN-003': entry(
    'IN-003',
    '受控 MCP 工具调用的请求、授权、执行与结果回传时序图',
    '观察：比较参数校验、权限确认、真实执行和结果复核四个节点，找出高风险操作应在哪一步暂停。'
  ),
  'IN-004': entry(
    'IN-004',
    '企业知识检索、生成回答与人工审批组成的 RAG 工作流图',
    '观察：比较知识检索、内容生成和审批发布的责任边界，重点关注回答怎样保留依据并在对外使用前接受复核。'
  ),
  'IN-005': entry(
    'IN-005',
    '工业现场传感、分析、决策与执行组成的运行闭环图',
    '观察：沿着现场信号到控制动作再到新状态的路径追踪反馈，比较延迟、误报和执行偏差会在哪些节点累积。'
  ),
  'IN-006': entry(
    'IN-006',
    '建图定位、路径规划与避障控制组成的三段式导航图',
    '观察：比较三段流程各自的输入和输出，判断地图错误、定位漂移或临时障碍分别会怎样传导到最终路线。'
  ),
  'IN-007': entry(
    'IN-007',
    '火灾现场数据、线索关联、假设验证与结论复核组成的证据链图',
    '观察：从结论反向核对每条证据的来源、时间和不确定性，区分模型提出的调查假设与已经验证的事实。'
  ),
  'IN-008': entry(
    'IN-008',
    '图像、位置状态与文本任务共同组成的多模态环境观测图',
    '观察：比较不同模态提供的空间、时间和语义信息，思考当它们互相冲突时应如何校准与取证。'
  ),
  'IN-009': entry(
    'IN-009',
    '机器人持续感知室内人员、障碍物与可通行区域的动态演示',
    '观察：关注人员移动或空间关系变化后环境表示是否及时更新，并判断规划动作如何响应新的可通行区域。'
  )
})

export const getCourseVisualCopy = (lessonId) => {
  const copy = COURSE_VISUAL_COPY[lessonId]
  if (!copy) throw new Error(`${lessonId}: missing learner-facing visual copy`)
  return copy
}

export const validateCourseVisualCopy = (expectedLessonIds = Object.keys(COURSE_VISUAL_COPY)) => {
  const expected = [...expectedLessonIds].sort()
  const actual = Object.keys(COURSE_VISUAL_COPY).sort()
  if (expected.length !== 25 || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Course visual copy must cover the expected 25 lessons exactly; expected=${expected.join(',')}; actual=${actual.join(',')}`)
  }

  const forbiddenProductionLanguage = /(?:PPT|课件|幻灯片|源页|锚点|制作)/iu
  for (const [lessonId, copy] of Object.entries(COURSE_VISUAL_COPY)) {
    if (!Object.isFrozen(copy)) throw new Error(`${lessonId}: visual copy entry must be frozen`)
    if (copy.lesson_id !== lessonId) throw new Error(`${lessonId}: lesson_id mismatch`)
    if (copy.after_heading !== '## 案例与图解') throw new Error(`${lessonId}: unexpected insertion heading`)
    if (!copy.alt.trim()) throw new Error(`${lessonId}: missing alt text`)
    if (!copy.caption.startsWith('观察：')) throw new Error(`${lessonId}: caption must begin with “观察：”`)
    if (forbiddenProductionLanguage.test(`${copy.alt} ${copy.caption}`)) {
      throw new Error(`${lessonId}: visual copy exposes production language`)
    }
  }
  return true
}
