import DefaultTheme from 'vitepress/theme-without-fonts'
import LessonDeck from './components/LessonDeck.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('LessonDeck', LessonDeck)
  }
}
