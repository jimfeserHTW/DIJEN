import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { deckOf, type Chapter } from '../content.ts'
import { Visuals } from './Visuals.tsx'

const Chevron = ({ flip }: { flip?: boolean }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
    <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Click-through slides: exit top left, small arrows at the sides, progress bar at the bottom centre. */
export function Presentation({ chapter, index, next }: { chapter: Chapter; index: number; next?: Chapter }) {
  const { t, i18n } = useTranslation()
  const deck = deckOf(chapter)
  const n = deck.length
  const { page, slide } = deck[index]
  const goto = (i: number) => { location.hash = `#/${chapter.id}/${i + 1}` }
  const last = index === n - 1
  const after = next ? `#/${next.id}` : '#/' // the last slide leads on to the next chapter
  const prev = useRef(index)
  const dir = index >= prev.current ? 'fwd' : 'back'
  useEffect(() => { prev.current = index }, [index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); last ? (location.hash = after) : goto(index + 1) }
      else if (['ArrowLeft', 'PageUp'].includes(e.key) && index > 0) goto(index - 1)
      else if (e.key === 'Home') goto(0)
      else if (e.key === 'End') goto(n - 1)
      else if (e.key === 'Escape') location.hash = `#/${chapter.id}`
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  return (
    <div className="pres">
      <header className="pres-top">
        <a className="exit" href={`#/${chapter.id}`} aria-label={t('Exit {{title}}', { title: t(chapter.title) })}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
          {t('Exit')}
        </a>
        <span className="sect">{t(chapter.title)}: {t(page.title)}</span>
        <span className="count">{index + 1} / {n}</span>
      </header>

      <main className="stage">
        <article className="slide" key={`${index}-${i18n.language}`} data-dir={dir} aria-roledescription="slide" aria-label={t('{{i}} of {{n}}: {{title}}', { i: index + 1, n, title: t(slide.title) })}>
          <h1>{t(slide.title)}</h1>
          {slide.view ?? (slide.visual && <Visuals v={slide.visual} />)}
        </article>
      </main>

      {index > 0 && <button className="arrow" data-side="l" onClick={() => goto(index - 1)} aria-label={t('Previous slide')}><Chevron flip /></button>}
      <a className="arrow" data-side="r" href={last ? after : `#/${chapter.id}/${index + 2}`} aria-label={last ? (next ? t('Next chapter: {{title}}', { title: t(next.title) }) : t('Back to all chapters')) : t('Next slide')}><Chevron /></a>

      <div className="progress" role="progressbar" aria-label={t('Progress')} aria-valuemin={1} aria-valuemax={n} aria-valuenow={index + 1}>
        <i style={{ width: `${((index + 1) / n) * 100}%` }} />
      </div>
    </div>
  )
}
