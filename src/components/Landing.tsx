import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { chapters, slideHref } from '../content.ts'

const SCRIPT = '$ docker run -d -p 8080:80 nginx\n3f9c0a1b7d2e4c58a6b1\n$ docker ps\nIMAGE   STATUS        PORTS\nnginx   Up 2 seconds  0.0.0.0:8080->80/tcp'

function Demo() {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const [n, setN] = useState(reduced ? SCRIPT.length : 0)
  useEffect(() => {
    if (n >= SCRIPT.length) return
    const t = setTimeout(() => setN(n + 1), SCRIPT[n] === '\n' ? 350 : 32)
    return () => clearTimeout(t)
  }, [n])
  return (
    <div className="term hero-term" aria-hidden="true">
      <div className="term-bar"><span>terminal</span></div>
      <pre className="term-body">{SCRIPT.slice(0, n)}<span className="caret" /></pre>
    </div>
  )
}

export function Landing() {
  const { t } = useTranslation()
  return (
    <>
      <section className="hero">
        <div>
          <h1>{t('Docker, layer by layer.')}</h1>
          <p className="lead">{t('From virtualization to Docker Compose: six chapters from the basics up, each a little harder than the last.')}</p>
          <div className="actions">
            <a className="btn" href={`#/${chapters[0].id}`}>{t('Start with chapter 0')}</a>
            <a className="btn ghost" href="#chapters">{t('See all chapters')}</a>
          </div>
        </div>
        <Demo />
      </section>

      <section id="chapters" className="bento" aria-label={t('Chapters')}>
        {chapters.map((c, i) => (
          <article className="tile" key={c.id}>
            <a className="tile-h" href={`#/${c.id}`}>
              <span className="tile-n">{i}</span>
              <h2>{t(c.title)}</h2>
            </a>
            <span className="level">{t(c.level)}</span>
            <p>{t(c.blurb)}</p>
            <ul className="layers">
              {c.pages.map(p => <li key={p.id}><a href={slideHref(c, p)}>{t(p.title)}</a></li>)}
            </ul>
          </article>
        ))}
      </section>
    </>
  )
}
