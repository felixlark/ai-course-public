export const COURSE_MEDIA_PUBLIC_ROOT = '/course-assets/lesson-media/ai-overview'

const asset = ({ id, sourceEntry, lessonId, slideIndex, label, viewingQuestion }) => ({
  id,
  source_entry: sourceEntry,
  file_name: `${id}.mp4`,
  public_url: `${COURSE_MEDIA_PUBLIC_ROOT}/${id}.mp4`,
  lesson_id: lessonId,
  slide_index: slideIndex,
  label,
  viewing_question: viewingQuestion
})

export const COURSE_MEDIA_ASSETS = Object.freeze([
  asset({
    id: 'sophia-dialogue',
    sourceEntry: 'ppt/media/media1.mp4',
    lessonId: 'OV-001',
    slideIndex: 3,
    label: '索菲亚对话',
    viewingQuestion: '观看时想一想：流畅对话和拟人表情分别证明了哪些能力，又没有证明什么？'
  }),
  asset({
    id: 'robotics-research-interview',
    sourceEntry: 'ppt/media/media2.mp4',
    lessonId: 'OV-001',
    slideIndex: 5,
    label: '机器人研究者访谈',
    viewingQuestion: '观看时留意：采访如何描述机器人研究的目标与现实场景，哪些判断还需要用任务数据验证？'
  }),
  asset({
    id: 'laifu-walking-demo',
    sourceEntry: 'ppt/media/media3.mp4',
    lessonId: 'OV-001',
    slideIndex: 7,
    label: '来福动作演示',
    viewingQuestion: '观看时把动作拆成感知、决策、执行和反馈，找出每一步可能依赖的传感器或控制机制。'
  }),
  asset({
    id: 'laifu-tv-interview',
    sourceEntry: 'ppt/media/media4.mp4',
    lessonId: 'OV-001',
    slideIndex: 7,
    label: '来福专题访谈',
    viewingQuestion: '观看时区分现场可见的机器人表现、研究者的解释，以及仍需进一步验证的能力边界。'
  }),
  asset({
    id: 'crowdverse-simulation',
    sourceEntry: 'ppt/media/media5.mp4',
    lessonId: 'OV-001',
    slideIndex: 8,
    label: 'Crowdverse 仿真界面',
    viewingQuestion: '观看时找出任务指令、状态反馈和行为评估分别出现在哪里。'
  }),
  asset({
    id: 'crowdverse-motion-retargeting',
    sourceEntry: 'ppt/media/media6.mp4',
    lessonId: 'OV-001',
    slideIndex: 8,
    label: '机器人跳舞：动作重定向与真机联动',
    viewingQuestion: '观看时比较人的舞蹈动作、虚拟角色与真实机器人，找出动作采集、重定向、稳定控制和安全保护分别在哪一步发挥作用。'
  }),
  asset({
    id: 'robot-perception-action-loop',
    sourceEntry: 'ppt/media/media7.mp4',
    lessonId: 'OV-001',
    slideIndex: 10,
    label: '机器人动作循环',
    viewingQuestion: '观看时用“感知—思考—行动—反馈”标注能观察到的环节，并指出哪些内部过程只能推断。'
  }),
  asset({
    id: 'crow-problem-solving',
    sourceEntry: 'ppt/media/media8.mp4',
    lessonId: 'OV-002',
    slideIndex: 19,
    label: '乌鸦利用交通环境解决问题',
    viewingQuestion: '观看时观察乌鸦如何利用车辆、信号和时机完成目标，它依赖了哪些环境反馈？'
  }),
  asset({
    id: 'student-ai-dependence',
    sourceEntry: 'ppt/media/media9.mp4',
    lessonId: 'OV-002',
    slideIndex: 25,
    label: 'AI 依赖与学习判断风险',
    viewingQuestion: '观看时记录哪些学习环节被交给 AI，以及这会怎样削弱理解、核验和独立判断；哪些责任仍必须由人承担。'
  })
])

export const COURSE_MEDIA_GROUPS = Object.freeze([
  {
    id: 'sophia-dialogue',
    lesson_id: 'OV-001',
    after_heading: '### 索菲亚：会对话不等于真正理解',
    asset_ids: ['sophia-dialogue']
  },
  {
    id: 'laifu-and-research',
    lesson_id: 'OV-001',
    after_heading: '### 来福：智能进入身体之后',
    asset_ids: ['robotics-research-interview', 'laifu-walking-demo', 'laifu-tv-interview']
  },
  {
    id: 'crowdverse',
    lesson_id: 'OV-001',
    after_heading: '### 研发案例：把机器人跳舞做成可复核的工程工作',
    asset_ids: ['crowdverse-simulation', 'crowdverse-motion-retargeting']
  },
  {
    id: 'perception-action-loop',
    lesson_id: 'OV-001',
    after_heading: '### 从输入和输出理解 AI 系统',
    asset_ids: ['robot-perception-action-loop']
  },
  {
    id: 'crow-problem-solving',
    lesson_id: 'OV-002',
    after_heading: '### 一只乌鸦的启示',
    asset_ids: ['crow-problem-solving']
  },
  {
    id: 'student-ai-dependence',
    lesson_id: 'OV-002',
    after_heading: '### AI 可能怎样削弱学习判断',
    asset_ids: ['student-ai-dependence']
  }
])

const assetById = new Map(COURSE_MEDIA_ASSETS.map((item) => [item.id, item]))

export const courseMediaAssetsForLesson = (lessonId) =>
  COURSE_MEDIA_ASSETS.filter((item) => item.lesson_id === lessonId)

export const courseMediaGroupsForLesson = (lessonId) =>
  COURSE_MEDIA_GROUPS
    .filter((group) => group.lesson_id === lessonId)
    .map((group) => ({
      ...group,
      assets: group.asset_ids.map((id) => {
        const item = assetById.get(id)
        if (!item) throw new Error(`${group.id}: unknown course media asset ${id}`)
        return item
      })
    }))
