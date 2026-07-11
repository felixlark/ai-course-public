import { defineConfig } from 'vitepress'
import { courseSidebar } from './course-sidebar.mjs'

const base = process.env.VITEPRESS_BASE || '/'
const repositoryUrl = process.env.VITEPRESS_REPOSITORY_URL || 'https://github.com/felixlark/ai-course-public'
const publicSiteRoot = 'https://felixlark.github.io/ai-course-public/'
const assetBase = base.endsWith('/') ? base : `${base}/`

const canonicalPath = (page) => page
  .replace(/(^|\/)index\.md$/, '$1')
  .replace(/\.md$/, '')

export default defineConfig({
  title: '陈龙彪团队人工智能公开课',
  description: '从人工智能概述、AI 智能体、具身智能到行业应用的公开 Web 课程',
  lang: 'zh-CN',
  base,
  cleanUrls: true,
  lastUpdated: true,
  useWebFonts: false,
  sitemap: {
    hostname: publicSiteRoot
  },
  transformHead({ page, title, description }) {
    const canonicalUrl = new URL(canonicalPath(page), publicSiteRoot).toString()
    return [
      ['link', { rel: 'canonical', href: canonicalUrl }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:locale', content: 'zh_CN' }],
      ['meta', { property: 'og:site_name', content: '陈龙彪团队人工智能公开课' }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: canonicalUrl }],
      ['meta', { name: 'twitter:card', content: 'summary' }]
    ]
  },
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
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${assetBase}course-assets/generated/site-logo.svg` }],
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
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索课程',
            buttonAriaLabel: '搜索课程'
          },
          modal: {
            displayDetails: '显示详情',
            resetButtonTitle: '清除查询',
            backButtonTitle: '关闭搜索',
            noResultsText: '没有找到相关课程内容',
            footer: {
              selectText: '选择',
              selectKeyAriaLabel: '回车键',
              navigateText: '切换',
              navigateUpKeyAriaLabel: '向上箭头',
              navigateDownKeyAriaLabel: '向下箭头',
              closeText: '关闭',
              closeKeyAriaLabel: '退出键'
            }
          }
        }
      }
    },
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    sidebarMenuLabel: '课程目录',
    returnToTopLabel: '返回顶部',
    skipToContentLabel: '跳到课程正文',
    notFound: {
      code: '404',
      title: '页面不存在',
      quote: '这个课程页面可能已移动，返回首页即可继续学习。',
      linkLabel: '返回课程首页',
      linkText: '返回课程首页',
      link: '/zh-cn/'
    },
    externalLinkIcon: true,
    socialLinks: [
      { icon: 'github', link: repositoryUrl }
    ],
    footer: {
      message: '公开课程内容持续校订，重要事实请以所附一手来源为准。',
      copyright: 'Copyright © 2026 陈龙彪团队'
    }
  }
})
