import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { chapters } from '../content.ts'

export const Mark = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
    <rect x="3" y="17" width="12" height="12" rx="3" fill="var(--blue)" />
    <rect x="17" y="17" width="12" height="12" rx="3" fill="#6EA0FF" />
    <rect x="10" y="3" width="12" height="12" rx="3" fill="var(--ink)" />
  </svg>
)

const href = (c: string) => `#/${c}`
// shortcut: these sections have no pages yet, so they render without a link; give them an href once they exist
const UNBOUND = ['labs', 'quiz', 'stats'] as const
const LANGS = ['en', 'de'] as const

/** Global bar: hover or focus Theory to open its menu while the page behind softens, like apple.com. */
export function Header({ route, chapterId }: { route: string; chapterId?: string }) {
  const { t, i18n } = useTranslation()
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState(false)
  const timer = useRef(0)
  const show = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setMenu(true), 90) }
  const hide = () => { clearTimeout(timer.current); setMenu(false) }

  useEffect(() => { hide(); setSheet(false) }, [route])
  useEffect(() => { document.body.style.overflow = sheet ? 'hidden' : '' }, [sheet])

  return (
    <div className="chrome" onMouseLeave={hide} onKeyDown={e => { if (e.key === 'Escape') { hide(); setSheet(false) } }}>
      {(menu || sheet) && <div className="scrim" onClick={() => { hide(); setSheet(false) }} onMouseEnter={hide} aria-hidden="true" />}
      <header className="bar">
        <div className="bar-in">
          <a className="brand" href="#/" aria-label={t('home')} onMouseEnter={hide}><Mark /><span className="grow" aria-hidden="true">DIJEN</span></a>
          <nav className="nav" aria-label={t('nav.label')}>
            <a href={href(chapters[0].id)} aria-current={chapterId ? 'page' : undefined} aria-expanded={menu} data-open={menu}
              onMouseEnter={show} onFocus={show}>{t('nav.theory')}</a>
            {UNBOUND.map(k => <a key={k} aria-disabled="true" onMouseEnter={hide}>{t(`nav.${k}`)}</a>)}
          </nav>
          <div className="lang" role="group" aria-label={t('lang')} onMouseEnter={hide}>
            {LANGS.map(l => <button key={l} type="button" aria-pressed={i18n.resolvedLanguage === l} onClick={() => i18n.changeLanguage(l)}>{l.toUpperCase()}</button>)}
          </div>
          <button className="burger" aria-expanded={sheet} aria-label={sheet ? t('closeMenu') : t('openMenu')} onClick={() => setSheet(!sheet)}><i /><i /></button>
        </div>
      </header>

      {menu && (
        <div className="mega">
          <div className="mega-in">
            <div className="mega-side">
              <small>{t('nav.theory')}</small>
              <p>{t('theory.blurb')}</p>
            </div>
            <ul className="mega-links">
              {chapters.map(c => <li key={c.id}><a href={href(c.id)}>{t(c.title)}</a></li>)}
            </ul>
          </div>
        </div>
      )}

      {sheet && (
        <nav className="sheet" aria-label={t('nav.label')}>
          <div>
            <span className="sheet-h">{t('nav.theory')}</span>
            {chapters.map(c => <a key={c.id} className="sheet-l" href={href(c.id)}>{t(c.title)}</a>)}
          </div>
          {UNBOUND.map(k => <span key={k} className="sheet-h" aria-disabled="true">{t(`nav.${k}`)}</span>)}
        </nav>
      )}
    </div>
  )
}
