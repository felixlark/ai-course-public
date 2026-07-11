import { defineConfig } from 'vitepress'
import { courseSidebar } from './course-sidebar.mjs'

const base = process.env.VITEPRESS_BASE || '/'
const repositoryUrl = process.env.VITEPRESS_REPOSITORY_URL || 'https://github.com/felixlark/ai-course-public'

export default defineConfig({
  title: '陈龙彪团队人工智能公开课',
  description: '从人工智能概述、AI 智能体、具身智能到行业应用的公开 Web 课程',
  lang: 'zh-CN',
  base,
  cleanUrls: true,
  lastUpdated: true,
  vite: {
    build: {
      modulePreload: false
    }
  },
  vue: {
    template: {
      transformAssetUrls: {
        video: [],
        source: []
      }
    }
  },
  head: [
    ['meta', { name: 'theme-color', content: '#0b4ea2' }],
    ['meta', { name: 'author', content: '陈龙彪团队' }],
    [
      'meta',
      {
        name: 'keywords',
        content:
          '人工智能课程,AI公开课,大模型,AI智能体,具身智能,行业应用'
      }
    ]
  ],
  themeConfig: {
    logo: '/course-assets/generated/site-logo.svg',
    siteTitle: '人工智能公开课',
    nav: [
      { text: '首页', link: '/zh-cn/' },
      { text: '学习地图', link: '/zh-cn/guide/introduction/' },
      { text: '人工智能概述', link: '/zh-cn/stage-1/' },
      { text: 'AI 智能体', link: '/zh-cn/stage-2/' },
      { text: '具身智能', link: '/zh-cn/stage-3/' },
      { text: '行业应用', link: '/zh-cn/stage-4/' }
    ],
    sidebar: courseSidebar,
    outline: {
      level: [2, 3],
      label: '本页目录'
    },
    docFooter: {
      prev: '上一节',
      next: '下一节'
    },
    lastUpdated: {
      text: '最后更新',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'medium'
      }
    },
    search: {
      provider: 'local'
    },
    socialLinks: [
      { icon: 'github', link: repositoryUrl }
    ],
    footer: {
      message: '公开课程内容持续校订，重要事实请以所附一手来源为准。',
      copyright: 'Copyright © 2026 陈龙彪团队'
    }
  }
})
