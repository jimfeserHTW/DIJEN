import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { chapters, deckOf } from './content.ts'
import { Header } from './components/Header.tsx'
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
  return { chapter, slide }
}

export default function App() {
  const { t: tr, i18n } = useTranslation()
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  const { chapter, slide } = parse(hash)
  useEffect(() => {
    const t = chapter && slide >= 0 ? tr(deckOf(chapter)[slide].slide.title) : chapter ? tr(chapter.title) : tr('title')
    document.title = `${t} – StudyNix`
  }, [chapter, slide, tr, i18n.language])

  if (chapter && slide >= 0) return <Presentation chapter={chapter} index={slide} next={chapters[chapters.indexOf(chapter) + 1]} />
  return (
    <>
      <Header route={hash} chapterId={chapter?.id} />
      <main id="main">{chapter ? <ChapterView chapter={chapter} /> : <Landing />}</main>
      <footer className="foot">{tr('footer')}</footer>
      <div className="edge" aria-hidden="true" />
    </>
  )
}
