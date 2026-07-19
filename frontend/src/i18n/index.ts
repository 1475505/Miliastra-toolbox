import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import chs from './locales/chs.json'
import cht from './locales/cht.json'
import en from './locales/en.json'
import de from './locales/de.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import id from './locales/id.json'
import it from './locales/it.json'
import jp from './locales/jp.json'
import kr from './locales/kr.json'
import pt from './locales/pt.json'
import ru from './locales/ru.json'
import th from './locales/th.json'
import tr from './locales/tr.json'
import vi from './locales/vi.json'

export const SUPPORTED_LANGUAGES = [
  'chs', 'cht', 'en', 'de', 'es', 'fr', 'id', 'it',
  'jp', 'kr', 'pt', 'ru', 'th', 'tr', 'vi',
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: SupportedLanguage = 'chs'

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  chs: '简体中文',
  cht: '繁體中文',
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
  jp: '日本語',
  kr: '한국어',
  pt: 'Português',
  ru: 'Русский',
  th: 'ไทย',
  tr: 'Türkçe',
  vi: 'Tiếng Việt',
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      chs: { translation: chs },
      cht: { translation: cht },
      en: { translation: en },
      de: { translation: de },
      es: { translation: es },
      fr: { translation: fr },
      id: { translation: id },
      it: { translation: it },
      jp: { translation: jp },
      kr: { translation: kr },
      pt: { translation: pt },
      ru: { translation: ru },
      th: { translation: th },
      tr: { translation: tr },
      vi: { translation: vi },
    },
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    lng: DEFAULT_LANGUAGE,
    detection: {
      lookupLocalStorage: 'lang',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
