<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'

const props = defineProps({
  manifest: { type: String, required: true },
  slides: { type: [String, Array], required: true },
  title: { type: String, default: '课程图解' }
})

const deck = ref(null)
const error = ref('')

const applySiteBase = (value) => {
  if (!value || typeof value !== 'string') return ''
  if (/^(?:[a-z]+:)?\/\//i.test(value) || /^(?:data|blob):/i.test(value)) return value
  const base = import.meta.env.BASE_URL || '/'
  if (base !== '/' && (value === base.slice(0, -1) || value.startsWith(base))) return value
  return value.startsWith('/') ? withBase(value) : value
}

const requestedSlides = computed(() => {
  const values = Array.isArray(props.slides) ? props.slides : String(props.slides).split(',')
  return [...new Set(values.map((value) => Number.parseInt(value, 10)).filter((value) => value > 0))]
})

const items = computed(() => requestedSlides.value
  .map((position) => deck.value?.slides?.[position - 1])
  .filter(Boolean)
  .map((slide) => ({
    ...slide,
    image: {
      ...slide.image,
      jpeg: applySiteBase(slide.image?.jpeg),
      webp: applySiteBase(slide.image?.webp)
    },
    videos: (slide.videos || [])
      .filter((video) => video?.status === 'published')
      .map((video) => ({
        ...video,
        src: applySiteBase(video.src),
        poster: applySiteBase(video.poster)
      }))
  })))

const compactText = (value) => String(value || '').replace(/\s+/g, ' ').trim()
const captionFor = (slide, index) => {
  const text = compactText(slide.text)
  if (text) return text.length > 150 ? `${text.slice(0, 147)}…` : text
  return items.value.length > 1 ? `${props.title}（${index + 1}）` : props.title
}

const load = async () => {
  error.value = ''
  try {
    const response = await fetch(applySiteBase(props.manifest), {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const value = await response.json()
    if (!Array.isArray(value?.slides)) throw new Error('课程媒体格式错误')
    deck.value = value
  } catch (cause) {
    deck.value = null
    error.value = cause?.message || '课程媒体加载失败'
  }
}

onMounted(load)
watch(() => props.manifest, load)
</script>

<template>
  <div v-if="items.length" class="ai-course-inline-media" :aria-label="title">
    <figure v-for="(slide, slideIndex) in items" :key="slide.lesson_slide">
      <picture>
        <source :srcset="slide.image.webp" type="image/webp">
        <img
          :src="slide.image.jpeg"
          :alt="captionFor(slide, slideIndex)"
          :width="slide.image.width"
          :height="slide.image.height"
          loading="lazy"
          decoding="async"
        >
      </picture>
      <figcaption>{{ captionFor(slide, slideIndex) }}</figcaption>
      <div v-if="slide.videos.length" class="ai-course-inline-media__videos">
        <p>观看时，请留意画面如何说明“{{ title }}”。</p>
        <video
          v-for="(video, videoIndex) in slide.videos"
          :key="video.src"
          :src="video.src"
          :poster="video.poster"
          :aria-label="`${title}案例视频${slide.videos.length > 1 ? ` ${videoIndex + 1}` : ''}`"
          controls
          playsinline
          preload="metadata"
        >当前浏览器不支持视频播放。</video>
      </div>
    </figure>
  </div>
  <p v-else-if="error" class="ai-course-inline-media__error" role="status">图解暂时无法加载。</p>
</template>
