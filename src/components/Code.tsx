import type { CSSProperties, ReactNode } from 'react'
import { t } from '../i18n.ts'
import './code.css'

// Terminal and file panels for diagrams. Lines build in one by one, faster than diagram parts.
// cmd: typed command ($ prompt) · cont: continued command line · out: program output · ok/bad: status output · note: comment
export type LineKind = 'cmd' | 'cont' | 'out' | 'ok' | 'bad' | 'note'
export type Line = string | {
  t: string; k?: LineKind
  /** rarely needed: shown greyed out */
  dim?: boolean
  /** small tag on the right, e.g. the matching docker run flag */
  chip?: string
  /** numbered badge on the right, links the line to a part of another diagram */
  n?: number
  /** from file 1 (a), from file 2 (b), overwritten (x), error (bad) */
  mark?: 'a' | 'b' | 'x' | 'bad'
}

/** `${VAR}` in yellow, ` # comment` muted. */
const vars = (s: string): ReactNode => {
  const hash = s.indexOf(' #')
  const [body, rest] = hash < 0 ? [s, ''] : [s.slice(0, hash), s.slice(hash)]
  return <>{body.split(/(\$\{[^}]+\})/).map((p, k) => (k % 2 ? <span key={k} className="c-var">{p}</span> : p))}{rest && <span className="c-cmt">{rest}</span>}</>
}
/** YAML key in accent colour. */
const yaml = (s: string): ReactNode => {
  const m = s.match(/^(\s*)([\w.-]+:)(.*)$/)
  return m ? <>{m[1]}<span className="c-key">{m[2]}</span>{vars(m[3])}</> : vars(s)
}
/** `docker compose` muted, the subcommand bright. */
const cmd = (s: string): ReactNode => {
  const m = s.match(/^(docker compose|docker)( .*)?$/)
  return m ? <><span className="c-pre">{m[1]}</span>{vars(m[2] ?? '')}</> : vars(s)
}

/** A bracket on the right that names a block of lines (from = first line, n = number of lines). */
export type Group = { from: number; n: number; label: string }

export function Code({ title, lines, kind = 'term', d = 0, i = 0, className, groups }: {
  title?: string; lines: Line[]; kind?: 'term' | 'file'; d?: number; i?: number; className?: string; groups?: Group[]
}) {
  return (
    <div className={`code ${className ?? ''}`} data-kind={kind} data-grp={groups ? '' : undefined} style={{ '--d': d, '--i': i } as CSSProperties}>
      {title && <div className="code-top"><i /><i /><i /><span>{t(title)}</span></div>}
      <div className="code-body">
        {lines.map((l, k) => {
          const raw = typeof l === 'string' ? { t: l } : l
          const x = { ...raw, t: raw.t && t(raw.t) } // comments and example values (e.g. passwords) are translated
          const kk = x.k ?? (kind === 'term' ? 'out' : undefined)
          const text = kk === 'cmd' ? cmd(x.t) : kk === 'note' ? <span className="c-cmt">{x.t}</span> : kind === 'file' ? yaml(x.t) : x.t
          return (
            <div className="ln" key={k} data-k={kk} data-dim={x.dim || undefined} data-mark={x.mark} style={{ '--l': k } as CSSProperties}>
              <pre>{x.t ? text : ' '}</pre>
              {x.chip && <span className="c-chip">{t(x.chip)}</span>}
              {x.n !== undefined && <span className="c-n">{x.n}</span>}
            </div>
          )
        })}
        {groups?.map(g => <span className="c-grp" key={g.label} style={{ '--f': g.from, '--n': g.n, '--l': g.from } as CSSProperties}><b>{t(g.label)}</b></span>)}
      </div>
    </div>
  )
}
