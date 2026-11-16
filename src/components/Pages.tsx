import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { chapters, deckOf, slideHref, type Chapter } from '../content.ts'

/** Chapter intro: what it covers, then start the presentation (or jump to a section). */
export function ChapterView({ chapter }: { chapter: Chapter }) {
  const { t } = useTranslation()
  const h1 = useRef<HTMLHeadingElement>(null)
  useEffect(() => { window.scrollTo({ top: 0 }); h1.current?.focus({ preventScroll: true }) }, [chapter.id])
  return (
    <div className="page">
      <a className="crumb" href="#/">{t('All chapters')}</a>
      <div className="meta"><span className="level">{t('Chapter {{n}}', { n: chapters.indexOf(chapter) })}</span><span className="level">{t(chapter.level)}</span></div>
      <h1 ref={h1} tabIndex={-1}>{t(chapter.title)}</h1>
      <p className="lead">{t(chapter.blurb)}</p>
      <div className="actions">
        <a className="btn" href={`#/${chapter.id}/1`}>{t('Start presentation')}</a>
        <span className="dim">{t('{{n}} slides', { n: deckOf(chapter).length })}</span>
      </div>
      <ol className="pagelist">
        {chapter.pages.map((p, i) => (
          <li key={p.id}>
            <a href={slideHref(chapter, p)}>
              <span className="num">{i + 1}</span>
              <span><strong>{t(p.title)}</strong><span>{t(p.summary)}</span></span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  )
}
