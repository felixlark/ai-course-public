<script setup>
import DefaultTheme from 'vitepress/theme-without-fonts'
import { useData } from 'vitepress'
import LessonSlidesLink from './components/LessonSlidesLink.vue'

const { frontmatter } = useData()
</script>

<template>
  <DefaultTheme.Layout>
    <template #nav-bar-content-after>
      <LessonSlidesLink
        v-if="frontmatter.slides_url"
        :url="frontmatter.slides_url"
        :title="frontmatter.title || '本节课程'"
      />
    </template>
  </DefaultTheme.Layout>
</template>
