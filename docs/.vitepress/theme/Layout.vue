<script setup>
import DefaultTheme from 'vitepress/theme-without-fonts'
import { useData } from 'vitepress'
import LessonDeck from './components/LessonDeck.vue'

const { frontmatter } = useData()
</script>

<template>
  <DefaultTheme.Layout>
    <template #nav-bar-content-after>
      <ClientOnly>
        <LessonDeck
          v-if="frontmatter.deck_manifest"
          :manifest="frontmatter.deck_manifest"
          :title="frontmatter.title || '本节课程'"
          nav
        />
      </ClientOnly>
    </template>
  </DefaultTheme.Layout>
</template>
