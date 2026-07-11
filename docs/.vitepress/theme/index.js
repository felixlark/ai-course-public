import DefaultTheme from 'vitepress/theme'
import LessonDeck from './components/LessonDeck.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('LessonDeck', LessonDeck)
  }
}
