import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_LABELS,
  SupportedLanguage,
} from '../../i18n'
import { syncAnswerLanguage } from '../../utils/config'
import { GlobeIcon, ChevronDownIcon } from './icons'

interface LanguageSwitcherProps {
  compact?: boolean
}

export default function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = (i18n.language || 'chs') as SupportedLanguage

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (lang: SupportedLanguage) => {
    void i18n.changeLanguage(lang)
    syncAnswerLanguage(lang)
    setOpen(false)
  }

  if (compact) {
    return (
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-on-surface-variant transition-colors duration-200 hover:bg-surface-variant hover:text-on-surface"
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <GlobeIcon className="h-5 w-5 shrink-0" />
          <span className="flex-1 truncate text-left">{LANGUAGE_LABELS[current]}</span>
          <ChevronDownIcon
            className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>

        {open && (
          <div
            className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-60 overflow-y-auto rounded-xl border border-outline bg-surface shadow-lg"
            role="listbox"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang}
                type="button"
                role="option"
                aria-selected={lang === current}
                onClick={() => handleSelect(lang)}
                className={[
                  'w-full px-4 py-2 text-left text-sm transition-colors duration-200',
                  lang === current
                    ? 'bg-primary-container/30 text-primary'
                    : 'text-on-surface hover:bg-surface-variant',
                ].join(' ')}
              >
                {LANGUAGE_LABELS[lang]}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 rounded-xl border border-outline bg-surface-variant/50 px-3 py-2 text-sm text-on-surface transition-colors duration-200 hover:bg-surface-variant"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <GlobeIcon className="h-4 w-4 shrink-0 text-on-surface-variant" />
        <span className="flex-1 truncate text-left">
          {LANGUAGE_LABELS[current]}
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-on-surface-variant transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-outline bg-surface shadow-lg"
          role="listbox"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              role="option"
              aria-selected={lang === current}
              onClick={() => handleSelect(lang)}
              className={[
                'w-full px-3 py-2 text-left text-sm transition-colors duration-200',
                lang === current
                  ? 'bg-primary-container/30 text-primary'
                  : 'text-on-surface hover:bg-surface-variant',
              ].join(' ')}
            >
              {LANGUAGE_LABELS[lang]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
