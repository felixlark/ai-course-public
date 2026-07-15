<script setup>
defineProps({
  url: { type: String, required: true },
  title: { type: String, default: '本节课程' }
})
</script>

<template>
  <a
    class="ai-course-slides-link"
    :href="url"
    target="_blank"
    rel="noopener noreferrer"
    :aria-label="`在飞书中打开《${title}》幻灯片`"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4.75A1.75 1.75 0 0 1 5.75 3h12.5A1.75 1.75 0 0 1 20 4.75v9.5A1.75 1.75 0 0 1 18.25 16H13v2.25h2.25a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5H11V16H5.75A1.75 1.75 0 0 1 4 14.25v-9.5Zm1.5 0v9.5c0 .14.11.25.25.25h12.5c.14 0 .25-.11.25-.25v-9.5a.25.25 0 0 0-.25-.25H5.75a.25.25 0 0 0-.25.25Z" fill="currentColor"/>
      <path d="m10.25 7.1 4.2 2.4-4.2 2.4V7.1Z" fill="currentColor"/>
    </svg>
    <span>幻灯片</span>
  </a>
</template>
