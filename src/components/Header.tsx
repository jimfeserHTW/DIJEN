import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { chapters } from '../content.ts'
import { LAB_LEVELS } from '../labs.ts'

export const Mark = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
    <rect x="3" y="17" width="12" height="12" rx="3" fill="var(--blue)" />
    <rect x="17" y="17" width="12" height="12" rx="3" fill="#6EA0FF" />
    <rect x="10" y="3" width="12" height="12" rx="3" fill="var(--ink)" />
  </svg>
)

const href = (c: string) => `#/${c}`
// shortcut: these sections have no pages yet, so they render without a link; give them an href once they exist
const UNBOUND = ['stats'] as const
type Menu = 'theory' | 'labs' | 'quiz'
const LANGS = ['en', 'de'] as const

/** Global bar: hover or focus Theory, Labs or Quiz to open its menu while the page behind softens, like apple.com. */
export function Header({ route, chapterId }: { route: string; chapterId?: string }) {
  const { t, i18n } = useTranslation()
  const [menu, setMenu] = useState<Menu | null>(null)
  const [sheet, setSheet] = useState(false)
  const timer = useRef(0)
  const show = (m: Menu) => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setMenu(m), 90) }
  const hide = () => { clearTimeout(timer.current); setMenu(null) }
  const theoryLinks = chapters.map(c => ({ id: c.id, href: href(c.id), label: t(c.title) }))
  const labLinks = [...LAB_LEVELS.map(l => ({ id: l.id, href: href(`labs/${l.id}`), label: t(l.level) })), { id: 'sandbox', href: href('labs/sandbox'), label: t('Docker sandbox') }]
  const quizLinks = chapters.map(c => ({ id: c.id, href: href(`quiz/${c.id}`), label: t(c.title) }))
  const menuLinks = { theory: theoryLinks, labs: labLinks, quiz: quizLinks }

  useEffect(() => { hide(); setSheet(false) }, [route])
  useEffect(() => { document.body.style.overflow = sheet ? 'hidden' : '' }, [sheet])

  return (
    <div className="chrome" onMouseLeave={hide} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) hide() }} onKeyDown={e => { if (e.key === 'Escape') { hide(); setSheet(false) } }}>
      {(menu || sheet) && <div className="scrim" onClick={() => { hide(); setSheet(false) }} onMouseEnter={hide} aria-hidden="true" />}
      <header className="bar">
        <div className="bar-in">
          <a className="brand" href="#/" aria-label={t('home')} onMouseEnter={hide}><Mark /><span aria-hidden="true">S<span className="grow">tudy</span>N<span className="grow">othing</span></span></a>
          <nav className="nav" aria-label={t('nav.label')}>
            <a href={href(chapters[0].id)} aria-current={chapterId ? 'page' : undefined} aria-expanded={menu === 'theory'} data-open={menu === 'theory'}
              onMouseEnter={() => show('theory')} onFocus={() => show('theory')}>{t('nav.theory')}</a>
            <a href={href('labs')} aria-current={route.startsWith('#/labs') ? 'page' : undefined} aria-expanded={menu === 'labs'} data-open={menu === 'labs'}
              onMouseEnter={() => show('labs')} onFocus={() => show('labs')}>{t('nav.labs')}</a>
            <a href={href('quiz')} aria-current={route.startsWith('#/quiz') ? 'page' : undefined} aria-expanded={menu === 'quiz'} data-open={menu === 'quiz'}
              onMouseEnter={() => show('quiz')} onFocus={() => show('quiz')}>{t('nav.quiz')}</a>
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
              <small>{t(`nav.${menu}`)}</small>
              <p>{t(`${menu}.blurb`)}</p>
            </div>
            <ul className="mega-links" key={menu}>
              {menuLinks[menu].map(l => <li key={l.id}><a href={l.href}>{l.label}</a></li>)}
            </ul>
          </div>
        </div>
      )}

      {sheet && (
        <nav className="sheet" aria-label={t('nav.label')}>
          <div>
            <span className="sheet-h">{t('nav.theory')}</span>
            {theoryLinks.map(l => <a key={l.id} className="sheet-l" href={l.href}>{l.label}</a>)}
          </div>
          <div>
            <a className="sheet-h" href={href('labs')}>{t('nav.labs')}</a>
            {labLinks.map(l => <a key={l.id} className="sheet-l" href={l.href}>{l.label}</a>)}
          </div>
          <div>
            <a className="sheet-h" href={href('quiz')}>{t('nav.quiz')}</a>
            {quizLinks.map(l => <a key={l.id} className="sheet-l" href={l.href}>{l.label}</a>)}
          </div>
          {UNBOUND.map(k => <span key={k} className="sheet-h" aria-disabled="true">{t(`nav.${k}`)}</span>)}
        </nav>
      )}
    </div>
  )
}
