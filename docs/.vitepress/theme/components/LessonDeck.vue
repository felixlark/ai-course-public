<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'

const props = defineProps({
  manifest: { type: [String, Object], default: '' },
  title: { type: String, default: '本节 Web PPT' }
})

const supportedTypes = new Set(['cover', 'objectives', 'core', 'case', 'practice', 'recap', 'sources'])
const rootRef = ref(null)
const openButtonRef = ref(null)
const thumbRefs = ref([])
const deck = ref(null)
const sourceDeck = ref(null)
const currentIndex = ref(0)
const activeMode = ref('native')
const activeVideoIndex = ref(-1)
const isOpen = ref(false)
const isLoading = ref(false)
const isSourceLoading = ref(false)
const isFullscreen = ref(false)
const isPseudoFullscreen = ref(false)
const error = ref('')
const sourceError = ref('')

let loadSequence = 0
let previousBodyOverflow = ''
let returnFocus = null

const manifestUrl = computed(() => typeof props.manifest === 'string' ? props.manifest.trim() : '')
const nativeSlides = computed(() => deck.value?.slides || [])
const sourceSlides = computed(() => sourceDeck.value?.slides || [])
const slides = computed(() => activeMode.value === 'source' ? sourceSlides.value : nativeSlides.value)
const total = computed(() => slides.value.length)
const currentSlide = computed(() => slides.value[currentIndex.value] || null)
const deckTitle = computed(() => deck.value?.title || props.title)
const currentPageLabel = computed(() => `第 ${currentIndex.value + 1} 页`)
const playerLoading = computed(() => isLoading.value || (activeMode.value === 'source' && isSourceLoading.value))
const playerError = computed(() => error.value || (activeMode.value === 'source' ? sourceError.value : ''))
const sourceManifestUrl = computed(() => deck.value?.sourceMaterials?.manifest || '')
const sourceSummary = computed(() => sourceDeck.value?.source_media_summary || null)
const currentSourceVideos = computed(() => activeMode.value === 'source'
  ? (currentSlide.value?.videos || []).filter((video) => video?.status === 'published')
  : [])
const currentSlideTitle = computed(() => activeMode.value === 'source'
  ? `原课件第 ${currentSlide.value?.source_page || currentIndex.value + 1} 页`
  : currentSlide.value?.title || '')
const fullscreenActive = computed(() => isFullscreen.value || isPseudoFullscreen.value)
const themeStyle = computed(() => ({
  '--native-deck-accent': deck.value?.theme?.accent || '#D6A33A',
  '--native-deck-accent-ink': deck.value?.theme?.accentInk || '#8A5A00',
  '--native-deck-accent-soft': deck.value?.theme?.accentSoft || '#FFF4D7',
  '--native-deck-ink': deck.value?.theme?.ink || '#102A43',
  '--native-deck-dark': deck.value?.theme?.dark || '#123B67',
  '--native-deck-surface': deck.value?.theme?.surface || '#F8FAFC'
}))

const applySiteBase = (value) => {
  if (!value || typeof value !== 'string') return ''
  if (/^(?:[a-z]+:)?\/\//i.test(value) || /^(?:data|blob):/i.test(value)) return value
  const base = import.meta.env.BASE_URL || '/'
  if (base !== '/' && (value === base.slice(0, -1) || value.startsWith(base))) return value
  return value.startsWith('/') ? withBase(value) : value
}

const normalizeManifest = (raw) => {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.slides)) {
    throw new Error('deck.json 缺少 slides 数组')
  }
  if (raw.schema_version !== 1 || raw.aspect_ratio !== '16:9') {
    throw new Error('deck.json 使用不受支持的公开课件版本')
  }
  if (raw.render_mode !== 'native-web') throw new Error('deck.json 不是公开原生 Web PPT')
  if (
    !raw.theme ||
    typeof raw.theme !== 'object' ||
    !['accent', 'accentInk', 'accentSoft', 'ink', 'dark', 'surface'].every(
      (field) => typeof raw.theme[field] === 'string' && /^#[0-9A-F]{6}$/i.test(raw.theme[field])
    )
  ) throw new Error('deck.json 缺少完整课程主题')
  const normalizedSlides = raw.slides.map((slide, index) => {
    if (!slide || typeof slide !== 'object') throw new Error(`deck.json 第 ${index + 1} 页格式错误`)
    if (!supportedTypes.has(slide.type)) throw new Error(`deck.json 第 ${index + 1} 页使用未知版式`)
    if (slide.order !== index + 1) throw new Error(`deck.json 第 ${index + 1} 页顺序不连续`)
    if (typeof slide.slide_id !== 'string' || !slide.slide_id) throw new Error(`deck.json 第 ${index + 1} 页缺少 slide_id`)
    if (typeof slide.title !== 'string' || !slide.title.trim()) throw new Error(`deck.json 第 ${index + 1} 页缺少标题`)
    if (typeof slide.eyebrow !== 'string' || !slide.eyebrow.trim()) throw new Error(`deck.json 第 ${index + 1} 页缺少栏目标题`)
    if (slide.type === 'cover') {
      if (typeof slide.subtitle !== 'string' || typeof slide.lead !== 'string') throw new Error('封面缺少副标题或导语')
    } else if (['objectives', 'practice', 'recap'].includes(slide.type)) {
      if (!Array.isArray(slide.items) || slide.items.length < 2 || slide.items.some((item) => typeof item !== 'string')) {
        throw new Error(`deck.json 第 ${index + 1} 页的 items 格式错误`)
      }
    } else if (slide.type === 'core') {
      if (!Array.isArray(slide.blocks) || !slide.blocks.length || slide.blocks.length > 3 || slide.blocks.some((block) => typeof block?.body !== 'string')) {
        throw new Error(`deck.json 第 ${index + 1} 页的 blocks 格式错误`)
      }
    } else if (slide.type === 'case') {
      if (!Array.isArray(slide.cases) || !slide.cases.length || slide.cases.length > 2 || slide.cases.some((item) =>
        typeof item?.label !== 'string' || !Array.isArray(item.rows) || item.rows.length < 2 || item.rows.length > 5 ||
        item.rows.some((row) => typeof row?.label !== 'string' || typeof row?.body !== 'string')
      )) throw new Error(`deck.json 第 ${index + 1} 页的案例格式错误`)
    } else if (slide.type === 'sources') {
      if (!Array.isArray(slide.items) || !slide.items.length || typeof slide.note !== 'string' || slide.items.some((item) =>
        typeof item?.label !== 'string' || (item.url && !/^https:\/\//.test(item.url))
      )) throw new Error(`deck.json 第 ${index + 1} 页的来源格式错误`)
    }
    return slide
  })
  if (!normalizedSlides.length) throw new Error('deck.json 没有可播放的幻灯片')
  return {
    ...raw,
    title: raw.title || props.title,
    pptxUrl: applySiteBase(raw.pptx_asset || ''),
    sourceMaterials: raw.source_materials?.manifest
      ? { ...raw.source_materials, manifest: applySiteBase(raw.source_materials.manifest) }
      : null,
    slides: normalizedSlides
  }
}

const normalizeSourceDeck = (raw) => {
  if (!raw || typeof raw !== 'object' || raw.schema_version !== 1 || raw.render_mode !== 'full-page') {
    throw new Error('原课件素材清单格式错误')
  }
  if (!Array.isArray(raw.slides) || !raw.slides.length) throw new Error('原课件没有可播放页面')
  const normalizedSlides = raw.slides.map((slide, index) => {
    if (!slide || typeof slide !== 'object' || slide.lesson_slide !== index + 1) {
      throw new Error(`原课件第 ${index + 1} 页顺序错误`)
    }
    if (!slide.image?.webp || !slide.image?.jpeg) throw new Error(`原课件第 ${index + 1} 页缺少图片`)
    const videos = (slide.videos || []).map((video) => ({
      ...video,
      src: applySiteBase(video.src || ''),
      poster: applySiteBase(video.poster || '')
    }))
    return {
      ...slide,
      title: `原课件第 ${slide.source_page || index + 1} 页`,
      image: {
        ...slide.image,
        webp: applySiteBase(slide.image.webp),
        jpeg: applySiteBase(slide.image.jpeg)
      },
      videos
    }
  })
  return { ...raw, slides: normalizedSlides }
}

const loadDeck = async ({ force = false } = {}) => {
  if (deck.value && !force) return
  const sequence = ++loadSequence
  isLoading.value = true
  error.value = ''
  try {
    let raw
    if (props.manifest && typeof props.manifest === 'object') {
      raw = props.manifest
    } else {
      const sourceUrl = applySiteBase(manifestUrl.value)
      if (!sourceUrl) throw new Error('未提供 deck.json 地址')
      const response = await fetch(sourceUrl, {
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      })
      if (!response.ok) throw new Error(`无法读取 deck.json（HTTP ${response.status}）`)
      raw = await response.json()
    }
    const normalized = normalizeManifest(raw)
    if (sequence !== loadSequence) return
    deck.value = normalized
    currentIndex.value = Math.min(currentIndex.value, normalized.slides.length - 1)
  } catch (cause) {
    if (sequence !== loadSequence) return
    deck.value = null
    error.value = cause?.message || 'Web PPT 加载失败'
  } finally {
    if (sequence === loadSequence) isLoading.value = false
  }
}

const loadSourceDeck = async ({ force = false } = {}) => {
  if (sourceDeck.value && !force) return
  if (!sourceManifestUrl.value) throw new Error('本节尚未关联原课件素材')
  isSourceLoading.value = true
  sourceError.value = ''
  try {
    const response = await fetch(sourceManifestUrl.value, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
    if (!response.ok) throw new Error(`无法读取原课件素材（HTTP ${response.status}）`)
    sourceDeck.value = normalizeSourceDeck(await response.json())
  } catch (cause) {
    sourceDeck.value = null
    sourceError.value = cause?.message || '原课件素材加载失败'
    throw cause
  } finally {
    isSourceLoading.value = false
  }
}

const selectMode = async (mode) => {
  if (mode === activeMode.value) return
  activeMode.value = mode
  currentIndex.value = 0
  activeVideoIndex.value = -1
  thumbRefs.value = []
  if (mode === 'source') {
    try { await loadSourceDeck() } catch { return }
  }
  await nextTick()
  await focusDeck()
}

const showSourceVideo = (index) => {
  activeVideoIndex.value = index
}
const showSourcePage = () => { activeVideoIndex.value = -1 }

const focusDeck = async () => {
  await nextTick()
  rootRef.value?.focus?.({ preventScroll: fullscreenActive.value })
}

const enterFullscreen = async () => {
  await nextTick()
  const root = rootRef.value
  if (!root || document.fullscreenElement === root || isPseudoFullscreen.value) return
  if (root.requestFullscreen) {
    try {
      await root.requestFullscreen()
      return
    } catch {
      // Some browsers reject Fullscreen API outside a direct user gesture.
    }
  }
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  isPseudoFullscreen.value = true
}

const exitFullscreen = async () => {
  if (document.fullscreenElement === rootRef.value) await document.exitFullscreen().catch(() => {})
  if (isPseudoFullscreen.value) {
    document.body.style.overflow = previousBodyOverflow
    isPseudoFullscreen.value = false
  }
}

const openDeck = async ({ fullscreen = false, focus = true, mode = 'native' } = {}) => {
  if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
    returnFocus = document.activeElement === openButtonRef.value ? null : document.activeElement
  }
  isOpen.value = true
  await nextTick()
  if (fullscreen) await enterFullscreen()
  if (focus) await focusDeck()
  await loadDeck()
  if (mode === 'source') await selectMode('source')
}

const closeDeck = async () => {
  await exitFullscreen()
  isOpen.value = false
  await nextTick()
  if (returnFocus?.isConnected) returnFocus.focus?.()
  else openButtonRef.value?.focus?.()
  returnFocus = null
}

const toggleFullscreen = async () => {
  if (fullscreenActive.value) await exitFullscreen()
  else await enterFullscreen()
  await focusDeck()
}

const setCurrent = (index) => {
  if (!total.value) return
  currentIndex.value = Math.max(0, Math.min(index, total.value - 1))
}
const previous = () => setCurrent(currentIndex.value - 1)
const next = () => setCurrent(currentIndex.value + 1)
const retry = () => loadDeck({ force: true })
const retryPlayer = () => activeMode.value === 'source'
  ? loadSourceDeck({ force: true }).catch(() => {})
  : retry()
const setThumbRef = (element, index) => { if (element) thumbRefs.value[index] = element }

const onThumbKeydown = async (event, index) => {
  let target = index
  if (event.key === 'ArrowLeft') target = Math.max(0, index - 1)
  else if (event.key === 'ArrowRight') target = Math.min(total.value - 1, index + 1)
  else if (event.key === 'Home') target = 0
  else if (event.key === 'End') target = total.value - 1
  else return
  event.preventDefault()
  event.stopPropagation()
  setCurrent(target)
  await nextTick()
  thumbRefs.value[target]?.focus?.()
}

const trapFullscreenFocus = (event) => {
  if (event.key !== 'Tab' || !fullscreenActive.value || !rootRef.value) return false
  const focusable = Array.from(
    rootRef.value.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')
  ).filter((element) => !element.hidden && element.getClientRects().length)
  if (!focusable.length) return false
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
    return true
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
    return true
  }
  return false
}

const onKeydown = (event) => {
  if (!isOpen.value) return
  if (!fullscreenActive.value && rootRef.value && !rootRef.value.contains(document.activeElement)) return
  if (trapFullscreenFocus(event)) return
  const interactiveTarget = event.target instanceof Element && event.target.closest(
    'button, a, input, textarea, select, [contenteditable="true"]'
  )
  if (interactiveTarget && [' ', 'Enter', 'Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault(); previous()
  } else if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
    event.preventDefault(); next()
  } else if (event.key === 'Home') {
    event.preventDefault(); setCurrent(0)
  } else if (event.key === 'End') {
    event.preventDefault(); setCurrent(total.value - 1)
  } else if (event.key === 'Escape' && !isFullscreen.value) {
    event.preventDefault(); closeDeck()
  }
}

const onFullscreenChange = () => { isFullscreen.value = document.fullscreenElement === rootRef.value }
const onGlobalOpen = (event) => {
  if (event.defaultPrevented) return
  event.preventDefault()
  void openDeck({
    fullscreen: event.detail?.fullscreen !== false,
    focus: event.detail?.focus !== false,
    mode: event.detail?.mode === 'source' ? 'source' : 'native'
  })
}

watch(currentIndex, async () => {
  activeVideoIndex.value = -1
  await nextTick()
  thumbRefs.value[currentIndex.value]?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' })
})
watch(() => props.manifest, () => {
  loadSequence += 1
  deck.value = null
  sourceDeck.value = null
  currentIndex.value = 0
  activeMode.value = 'native'
  activeVideoIndex.value = -1
  error.value = ''
  sourceError.value = ''
  if (isOpen.value) void loadDeck()
})

onMounted(() => {
  window.addEventListener('ai-course-open-deck', onGlobalOpen)
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('fullscreenchange', onFullscreenChange)
})
onBeforeUnmount(() => {
  loadSequence += 1
  window.removeEventListener('ai-course-open-deck', onGlobalOpen)
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (isPseudoFullscreen.value) document.body.style.overflow = previousBodyOverflow
})
</script>

<template>
  <section
    ref="rootRef"
    class="ai-course-lesson-deck"
    :class="{
      'ai-course-lesson-deck--open': isOpen,
      'ai-course-lesson-deck--fullscreen': isPseudoFullscreen
    }"
    :style="themeStyle"
    :aria-label="deckTitle"
    :aria-busy="playerLoading"
    :role="fullscreenActive ? 'dialog' : 'region'"
    :aria-modal="fullscreenActive ? 'true' : undefined"
    tabindex="-1"
    data-ai-course-lesson-deck
  >
    <button v-if="!isOpen" ref="openButtonRef" class="ai-course-lesson-deck__open" type="button" @click="openDeck({ focus: true })">
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8" />
        <path d="M9 21h6M12 17v4M10 8l5 2.5-5 2.5z" fill="currentColor" />
      </svg>
      <span>打开本节 Web PPT（含原课件）</span>
    </button>

    <div v-else class="ai-course-lesson-deck__player">
      <header class="ai-course-lesson-deck__toolbar">
        <div class="ai-course-lesson-deck__heading">
          <span class="ai-course-lesson-deck__eyebrow">WEB PPT</span>
          <strong>{{ deckTitle }}</strong>
        </div>
        <nav v-if="deck" class="ai-course-lesson-deck__modes" aria-label="课件版本">
          <button type="button" :aria-pressed="activeMode === 'native'" @click="selectMode('native')">
            课程精编 <small>{{ nativeSlides.length }} 页</small>
          </button>
          <button
            v-if="sourceManifestUrl"
            type="button"
            :aria-pressed="activeMode === 'source'"
            @click="selectMode('source')"
          >
            原课件 <small>{{ sourceSummary?.selected_pages || sourceSlides.length || '…' }} 页</small>
          </button>
        </nav>
        <div class="ai-course-lesson-deck__toolbar-actions">
          <span v-if="total" class="ai-course-lesson-deck__counter">{{ currentIndex + 1 }} / {{ total }}</span>
          <a v-if="deck?.pptxUrl" :href="deck.pptxUrl" download>下载 PPTX</a>
          <button type="button" @click="toggleFullscreen">{{ fullscreenActive ? '退出全屏' : '全屏播放' }}</button>
          <button type="button" aria-label="关闭本节 Web PPT" @click="closeDeck">关闭</button>
        </div>
      </header>

      <div v-if="playerLoading" class="ai-course-lesson-deck__state" role="status" aria-live="polite">
        <span class="ai-course-lesson-deck__spinner" aria-hidden="true" />
        <strong>{{ activeMode === 'source' ? '正在加载原课件素材' : '正在加载本节 Web PPT' }}</strong>
        <span>{{ activeMode === 'source' ? '读取真实 PowerPoint 页面、图片与视频…' : '读取课程精编内容与页面结构…' }}</span>
      </div>
      <div v-else-if="playerError" class="ai-course-lesson-deck__state ai-course-lesson-deck__state--error" role="alert">
        <strong>Web PPT 暂时无法打开</strong>
        <span>{{ playerError }}</span>
        <button type="button" @click="retryPlayer">重新加载</button>
      </div>

      <template v-else-if="currentSlide">
        <p class="ai-course-visually-hidden" aria-live="polite" aria-atomic="true">
          {{ currentPageLabel }}：{{ currentSlideTitle }}
        </p>
        <div
          class="ai-course-lesson-deck__stage"
          role="group"
          aria-roledescription="幻灯片"
          :aria-label="`${deckTitle}，${activeMode === 'source' ? '原课件' : '课程精编'}，${currentPageLabel}：${currentSlideTitle}`"
        >
          <article v-if="activeMode === 'native'" class="ai-course-native-slide" :class="`ai-course-native-slide--${currentSlide.type}`">
            <template v-if="currentSlide.type === 'cover'">
              <div class="ai-course-native-slide__cover-rule" />
              <div class="ai-course-native-slide__cover-copy">
                <span>{{ currentSlide.eyebrow }}</span>
                <h2>{{ currentSlide.title }}</h2>
                <p>{{ currentSlide.subtitle }}</p>
                <small>{{ currentSlide.lead }}</small>
              </div>
              <div class="ai-course-native-slide__orbit" aria-hidden="true"><i /><b /></div>
            </template>

            <template v-else>
              <header class="ai-course-native-slide__header">
                <span>{{ currentSlide.eyebrow }}</span>
                <h2>{{ currentSlide.title }}</h2>
              </header>

              <ol v-if="currentSlide.type === 'objectives'" class="ai-course-native-slide__objectives">
                <li v-for="item in currentSlide.items" :key="item"><span>{{ item }}</span></li>
              </ol>

              <div v-else-if="currentSlide.type === 'core'" class="ai-course-native-slide__core">
                <section v-for="(block, index) in currentSlide.blocks" :key="`${block.label}-${index}`">
                  <b>{{ String(index + 1).padStart(2, '0') }}</b>
                  <h3 v-if="block.label">{{ block.label }}</h3>
                  <p>{{ block.body }}</p>
                </section>
              </div>

              <div v-else-if="currentSlide.type === 'case'" class="ai-course-native-slide__cases" :class="{ 'ai-course-native-slide__cases--pair': currentSlide.cases?.length > 1 }">
                <section v-for="caseItem in currentSlide.cases" :key="caseItem.label">
                  <h3>{{ caseItem.label }}</h3>
                  <dl>
                    <template v-for="row in caseItem.rows" :key="`${row.label}-${row.body}`">
                      <dt>{{ row.label }}</dt><dd>{{ row.body }}</dd>
                    </template>
                  </dl>
                </section>
              </div>

              <ol v-else-if="currentSlide.type === 'practice' || currentSlide.type === 'recap'" class="ai-course-native-slide__steps">
                <li v-for="(item, index) in currentSlide.items" :key="item">
                  <b>{{ index + 1 }}</b><span>{{ item }}</span>
                </li>
              </ol>

              <div v-else-if="currentSlide.type === 'sources'" class="ai-course-native-slide__sources">
                <component
                  :is="item.url ? 'a' : 'div'"
                  v-for="(item, index) in currentSlide.items"
                  :key="`${item.label}-${index}`"
                  class="ai-course-native-slide__source"
                  :href="item.url || undefined"
                  :target="item.url ? '_blank' : undefined"
                  :rel="item.url ? 'noreferrer' : undefined"
                >
                  <b>{{ String(index + 1).padStart(2, '0') }}</b><span>{{ item.label }}</span>
                </component>
                <p>{{ currentSlide.note }}</p>
              </div>
            </template>

            <footer>
              <span>陈龙彪团队人工智能公开课</span>
              <b>{{ currentSlide.slide_id }}</b>
            </footer>
          </article>

          <article v-else class="ai-course-source-slide">
            <picture v-if="activeVideoIndex < 0" class="ai-course-source-slide__picture">
              <source :srcset="currentSlide.image.webp" type="image/webp">
              <img
                :src="currentSlide.image.jpeg"
                :alt="`${sourceDeck?.source?.title || deckTitle}，原课件第 ${currentSlide.source_page} 页`"
                :width="currentSlide.image.width"
                :height="currentSlide.image.height"
              >
            </picture>
            <div v-else class="ai-course-source-slide__video-stage">
              <video
                class="ai-course-source-slide__video"
                :src="currentSourceVideos[activeVideoIndex]?.src"
                :poster="currentSourceVideos[activeVideoIndex]?.poster"
                controls
                playsinline
                preload="metadata"
              >当前浏览器不支持视频播放。</video>
              <button type="button" @click="showSourcePage">返回原课件页</button>
            </div>
            <div class="ai-course-source-slide__meta">
              <span>原课件第 {{ currentSlide.source_page }} 页</span>
              <span>图片 {{ currentSlide.source_media?.image_count || 0 }}</span>
              <span v-if="currentSourceVideos.length">视频 {{ currentSourceVideos.length }}</span>
            </div>
            <div v-if="currentSourceVideos.length && activeVideoIndex < 0" class="ai-course-source-slide__video-actions">
              <button
                v-for="(video, index) in currentSourceVideos"
                :key="`${video.src}-${index}`"
                type="button"
                @click="showSourceVideo(index)"
              >打开本页视频{{ currentSourceVideos.length > 1 ? ` ${index + 1}` : '' }}</button>
            </div>
          </article>

          <button class="ai-course-lesson-deck__arrow ai-course-lesson-deck__arrow--previous" type="button" :disabled="currentIndex === 0" aria-label="上一页幻灯片" @click="previous">‹</button>
          <button class="ai-course-lesson-deck__arrow ai-course-lesson-deck__arrow--next" type="button" :disabled="currentIndex === total - 1" aria-label="下一页幻灯片" @click="next">›</button>
        </div>

        <footer class="ai-course-lesson-deck__footer">
          <span>{{ activeMode === 'source' ? `原课件 ${currentPageLabel}` : currentPageLabel }}</span>
          <span class="ai-course-lesson-deck__keyboard-hint">方向键翻页 · Home / End 跳转 · Esc 退出</span>
        </footer>

        <nav class="ai-course-lesson-deck__thumbs" aria-label="幻灯片页码导航">
          <button
            v-for="(slide, index) in slides"
            :key="slide.slide_id || `source-${slide.source_page}-${index}`"
            :ref="(element) => setThumbRef(element, index)"
            class="ai-course-lesson-deck__thumb"
            :class="[
              activeMode === 'source' ? 'ai-course-lesson-deck__thumb--source' : 'ai-course-lesson-deck__thumb--native',
              { 'ai-course-lesson-deck__thumb--active': index === currentIndex }
            ]"
            type="button"
            :aria-label="`跳转到第 ${index + 1} 页：${activeMode === 'source' ? `原课件第 ${slide.source_page} 页` : slide.title}`"
            :aria-current="index === currentIndex ? 'page' : undefined"
            :tabindex="index === currentIndex ? 0 : -1"
            @click="setCurrent(index)"
            @keydown="onThumbKeydown($event, index)"
          >
            <img v-if="activeMode === 'source'" :src="slide.image.webp" alt="" loading="lazy">
            <span>{{ index + 1 }}</span>
            <em>{{ activeMode === 'source' ? `原课件第 ${slide.source_page} 页` : slide.title }}</em>
          </button>
        </nav>
      </template>
    </div>
  </section>
</template>
