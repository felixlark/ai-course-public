import DefaultTheme from 'vitepress/theme-without-fonts'
import LessonDeck from './components/LessonDeck.vue'
import SourceMaterialGallery from './components/SourceMaterialGallery.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('LessonDeck', LessonDeck)
    app.component('SourceMaterialGallery', SourceMaterialGallery)
  }
}
