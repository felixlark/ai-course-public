import DefaultTheme from 'vitepress/theme-without-fonts'
import Layout from './Layout.vue'
import LessonDeck from './components/LessonDeck.vue'
import CourseMedia from './components/CourseMedia.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('LessonDeck', LessonDeck)
    app.component('CourseMedia', CourseMedia)
  }
}
