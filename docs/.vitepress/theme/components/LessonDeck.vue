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
const currentIndex = ref(0)
const isOpen = ref(false)
const isLoading = ref(false)
const isFullscreen = ref(false)
const isPseudoFullscreen = ref(false)
const error = ref('')

let loadSequence = 0
let previousBodyOverflow = ''
let returnFocus = null

const manifestUrl = computed(() => typeof props.manifest === 'string' ? props.manifest.trim() : '')
const slides = computed(() => deck.value?.slides || [])
const total = computed(() => slides.value.length)
const currentSlide = computed(() => slides.value[currentIndex.value] || null)
const deckTitle = computed(() => deck.value?.title || props.title)
const currentPageLabel = computed(() => `第 ${currentIndex.value + 1} 页`)
const fullscreenActive = computed(() => isFullscreen.value || isPseudoFullscreen.value)
const themeStyle = computed(() => ({
  '--native-deck-accent': deck.value?.theme?.accent || '#D6A33A',
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
  if (!raw.theme || typeof raw.theme !== 'object') throw new Error('deck.json 缺少课程主题')
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
    slides: normalizedSlides
  }
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

const openDeck = async ({ fullscreen = false, focus = true } = {}) => {
  if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
    returnFocus = document.activeElement === openButtonRef.value ? null : document.activeElement
  }
  isOpen.value = true
  await nextTick()
  if (fullscreen) await enterFullscreen()
  if (focus) await focusDeck()
  await loadDeck()
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
const setThumbRef = (element, index) => { if (element) thumbRefs.value[index] = element }

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
  void openDeck({ fullscreen: event.detail?.fullscreen !== false, focus: event.detail?.focus !== false })
}

watch(currentIndex, async () => {
  await nextTick()
  thumbRefs.value[currentIndex.value]?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' })
})
watch(() => props.manifest, () => {
  loadSequence += 1
  deck.value = null
  currentIndex.value = 0
  error.value = ''
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
    :aria-busy="isLoading"
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
      <span>打开本节 Web PPT</span>
    </button>

    <div v-else class="ai-course-lesson-deck__player">
      <header class="ai-course-lesson-deck__toolbar">
        <div class="ai-course-lesson-deck__heading">
          <span class="ai-course-lesson-deck__eyebrow">WEB PPT</span>
          <strong>{{ deckTitle }}</strong>
        </div>
        <div class="ai-course-lesson-deck__toolbar-actions">
          <span v-if="total" class="ai-course-lesson-deck__counter" aria-live="polite">{{ currentIndex + 1 }} / {{ total }}</span>
          <a v-if="deck?.pptxUrl" :href="deck.pptxUrl" download>下载 PPTX</a>
          <button type="button" @click="toggleFullscreen">{{ fullscreenActive ? '退出全屏' : '全屏播放' }}</button>
          <button type="button" aria-label="关闭本节 Web PPT" @click="closeDeck">关闭</button>
        </div>
      </header>

      <div v-if="isLoading" class="ai-course-lesson-deck__state" role="status" aria-live="polite">
        <span class="ai-course-lesson-deck__spinner" aria-hidden="true" />
        <strong>正在加载本节 Web PPT</strong>
        <span>读取原创公开课件与页面结构…</span>
      </div>
      <div v-else-if="error" class="ai-course-lesson-deck__state ai-course-lesson-deck__state--error" role="alert">
        <strong>Web PPT 暂时无法打开</strong>
        <span>{{ error }}</span>
        <button type="button" @click="retry">重新加载</button>
      </div>

      <template v-else-if="currentSlide">
        <div class="ai-course-lesson-deck__stage" :aria-label="`${deckTitle}，${currentPageLabel}`">
          <article class="ai-course-native-slide" :class="`ai-course-native-slide--${currentSlide.type}`">
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
                <a v-for="(item, index) in currentSlide.items" :key="`${item.label}-${index}`" :href="item.url || undefined" :target="item.url ? '_blank' : undefined" :rel="item.url ? 'noreferrer' : undefined">
                  <b>{{ String(index + 1).padStart(2, '0') }}</b><span>{{ item.label }}</span>
                </a>
                <p>{{ currentSlide.note }}</p>
              </div>
            </template>

            <footer>
              <span>陈龙彪团队人工智能公开课</span>
              <b>{{ currentSlide.slide_id }}</b>
            </footer>
          </article>

          <button class="ai-course-lesson-deck__arrow ai-course-lesson-deck__arrow--previous" type="button" :disabled="currentIndex === 0" aria-label="上一页幻灯片" @click="previous">‹</button>
          <button class="ai-course-lesson-deck__arrow ai-course-lesson-deck__arrow--next" type="button" :disabled="currentIndex === total - 1" aria-label="下一页幻灯片" @click="next">›</button>
        </div>

        <footer class="ai-course-lesson-deck__footer">
          <span>{{ currentPageLabel }}</span>
          <span class="ai-course-lesson-deck__keyboard-hint">方向键翻页 · Home / End 跳转 · Esc 退出</span>
        </footer>

        <nav class="ai-course-lesson-deck__thumbs" aria-label="幻灯片页码导航">
          <button
            v-for="(slide, index) in slides"
            :key="slide.slide_id"
            :ref="(element) => setThumbRef(element, index)"
            class="ai-course-lesson-deck__thumb ai-course-lesson-deck__thumb--native"
            :class="{ 'ai-course-lesson-deck__thumb--active': index === currentIndex }"
            type="button"
            :aria-label="`跳转到第 ${index + 1} 页：${slide.title}`"
            :aria-current="index === currentIndex ? 'page' : undefined"
            @click="setCurrent(index)"
          >
            <span>{{ index + 1 }}</span>
            <em>{{ slide.title }}</em>
          </button>
        </nav>
      </template>
    </div>
  </section>
</template>
