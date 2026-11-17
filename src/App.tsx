import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { chapters, deckOf } from './content.ts'
import { Header, Mark } from './components/Header.tsx'
import { LEGAL, LegalView, SOURCE, type LegalId } from './components/Legal.tsx'
import { Landing } from './components/Landing.tsx'
import { ChapterView } from './components/Pages.tsx'
import { Presentation } from './components/Presentation.tsx'

// Hash routes keep the app working on GitHub Pages sub-paths without server rewrites:
//   #/                 landing
//   #/<chapter>        chapter intro
//   #/<chapter>/<n>    presentation, slide n (1-based)
const parse = (hash: string) => {
  const [c, n] = hash.replace(/^#\/?/, '').split('/')
  const chapter = chapters.find(x => x.id === c)
  const total = chapter ? deckOf(chapter).length : 0
  const slide = /^\d+$/.test(n ?? '') ? Math.min(Math.max(Number(n), 1), total) - 1 : -1
  const legal = Object.hasOwn(LEGAL, c) ? c as LegalId : undefined
  return { chapter, slide, legal }
}

export default function App() {
  const { t: tr, i18n } = useTranslation()
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  const { chapter, slide, legal } = parse(hash)
  useEffect(() => {
    const t = chapter && slide >= 0 ? tr(deckOf(chapter)[slide].slide.title) : chapter ? tr(chapter.title) : legal ? tr(LEGAL[legal].title) : tr('title')
    document.title = `${t} – StudyNix`
  }, [chapter, slide, legal, tr, i18n.language])

  if (chapter && slide >= 0) return <Presentation chapter={chapter} index={slide} next={chapters[chapters.indexOf(chapter) + 1]} />
  // App shell for every non-presentation page: sticky header on top, footer at the end of the page
  return (
    <div className="shell">
      <Header route={hash} chapterId={chapter?.id} />
      <main id="main">{chapter ? <ChapterView chapter={chapter} /> : legal ? <LegalView id={legal} /> : <Landing />}</main>
      <footer className="foot">
        <div className="foot-in">
          <a className="brand" href="#/" aria-label={tr('home')}><Mark />StudyNix</a>
          <nav className="foot-nav" aria-label={tr('Legal')}>
            {(Object.keys(LEGAL) as LegalId[]).map(k => <a key={k} href={`#/${k}`}>{tr(LEGAL[k].title)}</a>)}
            <a href={SOURCE}>{tr('Source code')}</a>
          </nav>
          <p className="foot-note">{tr('footer')}</p>
        </div>
      </footer>
    </div>
  )
}
