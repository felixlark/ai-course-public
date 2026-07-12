<script setup>
import { computed, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'

const props = defineProps({
  manifest: { type: String, required: true },
  title: { type: String, default: '原课件素材' }
})

const sourceDeck = ref(null)
const loading = ref(true)
const error = ref('')

const applySiteBase = (value) => {
  if (!value || typeof value !== 'string') return ''
  if (/^(?:[a-z]+:)?\/\//i.test(value) || /^(?:data|blob):/i.test(value)) return value
  const base = import.meta.env.BASE_URL || '/'
  if (base !== '/' && (value === base.slice(0, -1) || value.startsWith(base))) return value
  return value.startsWith('/') ? withBase(value) : value
}

const summary = computed(() => sourceDeck.value?.source_media_summary || {})
const previewSlides = computed(() => {
  const slides = sourceDeck.value?.slides || []
  if (!slides.length) return []
  const imageRich = [...slides].sort((a, b) =>
    (b.source_media?.image_count || 0) - (a.source_media?.image_count || 0)
  )[0]
  const candidates = [
    slides[0],
    slides.find((slide) => (slide.videos || []).some((video) => video.status === 'published')),
    imageRich,
    slides[Math.floor(slides.length / 2)],
    slides.at(-1)
  ].filter(Boolean)
  const seen = new Set()
  return candidates.filter((slide) => {
    if (seen.has(slide.lesson_slide)) return false
    seen.add(slide.lesson_slide)
    return true
  }).slice(0, 3)
})

const load = async () => {
  loading.value = true
  error.value = ''
  try {
    const response = await fetch(applySiteBase(props.manifest), {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    if (data?.schema_version !== 1 || data?.render_mode !== 'full-page' || !Array.isArray(data?.slides)) {
      throw new Error('素材清单格式错误')
    }
    sourceDeck.value = data
  } catch (cause) {
    error.value = cause?.message || '原课件素材加载失败'
  } finally {
    loading.value = false
  }
}

const openSourceDeck = () => {
  window.dispatchEvent(new CustomEvent('ai-course-open-deck', {
    cancelable: true,
    detail: { mode: 'source', fullscreen: false, focus: true }
  }))
}

onMounted(load)
</script>

<template>
  <section class="ai-course-source-gallery" :aria-label="title">
    <div v-if="loading" class="ai-course-source-gallery__state" role="status">正在读取原课件图片与视频…</div>
    <div v-else-if="error" class="ai-course-source-gallery__state ai-course-source-gallery__state--error" role="alert">
      <span>原课件素材暂时无法读取：{{ error }}</span>
      <button type="button" @click="load">重新加载</button>
    </div>
    <template v-else-if="sourceDeck">
      <header class="ai-course-source-gallery__header">
        <div>
          <span>POWERPOINT SOURCE</span>
          <h3>{{ sourceDeck.source?.title || title }}</h3>
        </div>
        <div class="ai-course-source-gallery__stats">
          <b>{{ summary.selected_pages || sourceDeck.slides.length }}</b><span>精选页</span>
          <b>{{ summary.image_references || 0 }}</b><span>图片引用</span>
          <b>{{ summary.published_videos || 0 }}</b><span>可播放视频</span>
        </div>
      </header>
      <div class="ai-course-source-gallery__grid">
        <figure v-for="slide in previewSlides" :key="slide.lesson_slide">
          <picture>
            <source :srcset="applySiteBase(slide.image.webp)" type="image/webp">
            <img
              :src="applySiteBase(slide.image.jpeg)"
              :alt="`${sourceDeck.source?.title || title}，原课件第 ${slide.source_page} 页`"
              loading="lazy"
              :width="slide.image.width"
              :height="slide.image.height"
            >
          </picture>
          <figcaption>
            原课件第 {{ slide.source_page }} 页
            <span v-if="slide.source_media?.image_count">图片 {{ slide.source_media.image_count }}</span>
            <span v-if="slide.source_media?.video_count">视频 {{ slide.source_media.video_count }}</span>
          </figcaption>
        </figure>
      </div>
      <button class="ai-course-source-gallery__open" type="button" @click="openSourceDeck">
        在 Web PPT 中查看全部 {{ summary.selected_pages || sourceDeck.slides.length }} 页
        <span v-if="summary.published_videos">并播放 {{ summary.published_videos }} 段视频</span>
      </button>
    </template>
  </section>
</template>
