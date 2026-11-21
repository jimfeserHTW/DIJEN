import { Fragment, type CSSProperties } from 'react'
import type { NodeD, Visual } from './types.ts'
import { t } from '../i18n.ts'

// Every block numbers its parts in reading order (--i). CSS turns that into a staggered build,
// and --d (set per visual) lets several visuals on one slide build one after the other.
const at = (i: number) => ({ '--i': i }) as CSSProperties

const count = (v: Visual): number => {
  switch (v.kind) {
    case 'flow': return v.nodes.length * 2 - 1
    case 'tree': return 2 + v.children.length
    case 'stack': return Math.max(...v.columns.map(c => c.layers.length))
    case 'anatomy': return v.rows.flat().length
    case 'code': return v.lines.length
    case 'cards': return v.items.length
    case 'table': return v.rows.length + 1
    case 'mindmap': return 1 + 2 * v.branches.length
    case 'matrix': return v.rows.length + 1
    case 'bars': return v.rows.length
  }
}

const Node = ({ d, i }: { d: NodeD; i: number }) => (
  <div className="node" data-tone={d.tone ?? 'plain'} style={at(i)}>
    <strong>{t(d.label)}</strong>
    {d.sub && <span>{t(d.sub)}</span>}
    {d.items && <ul>{d.items.map(x => <li key={x}>{t(x)}</li>)}</ul>}
  </div>
)

/** `code` spans inside a string become <code>. */
export const rich = (s: string) => t(s).split('`').map((p, i) => (i % 2 ? <code key={i}>{p}</code> : p))

const Link = ({ label, i }: { label?: string; i: number }) => (
  <div className="link" style={at(i)}><span>{label ? t(label) : ' '}</span><i /></div>
)

/** Instruction or key in accent colour: FROM, COPY, services:, docker … */
const highlight = (text: string) => {
  const m = text.match(/^(\s*)([A-Z]{3,}|[\w-]+:|docker)(.*)$/)
  return m ? <>{m[1]}<span className="kw">{m[2]}</span>{m[3]}</> : text
}

function One({ v }: { v: Visual }) {
  switch (v.kind) {
    case 'flow':
      return (
        <div className="flow" data-dir={v.dir ?? 'row'}>
          {v.nodes.map((n, k) => (
            <Fragment key={k}>
              <Node d={n} i={2 * k} />
              {k < v.nodes.length - 1 && <Link label={v.links?.[k]} i={2 * k + 1} />}
            </Fragment>
          ))}
        </div>
      )
    case 'tree':
      return (
        <div className="flow" data-dir="col">
          <Node d={v.root} i={0} />
          <Link label={v.link} i={1} />
          <div className="kids">{v.children.map((c, k) => <Node key={k} d={c} i={2 + k} />)}</div>
        </div>
      )
    case 'stack':
      return (
        <div className="stack">
          {v.columns.map((col, c) => (
            <div className="col" key={c}>
              {col.title && <h3>{t(col.title)}</h3>}
              <div className="lyrs">
                {col.layers.map((l, k) => (
                  <div className="layer" key={k} data-tone={l.tone ?? 'plain'} style={at(k)}><b>{t(l.label)}</b>{l.note && <small>{t(l.note)}</small>}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )
    case 'anatomy': {
      let n = 0
      return (
        <div className="anatomy">
          {v.rows.map((row, r) => (
            <div className="row" key={r}>
              {row.map(p => <div className="part" key={n} style={at(n++)}><code>{p.text}</code><i /><span>{t(p.label)}</span></div>)}
            </div>
          ))}
        </div>
      )
    }
    case 'code':
      return (
        <div className="codeblock">
          <div className="code-grid">
            {v.file && <div className="code-bar">{v.file}</div>}
            {v.lines.map((l, k) => (
              <Fragment key={k}>
                <pre className="cell" style={at(k)}>{highlight(l.text) || ' '}</pre>
                <span className="cnote" style={at(k)}>{l.note && rich(l.note)}</span>
              </Fragment>
            ))}
          </div>
        </div>
      )
    case 'table':
      return (
        <table className="tbl">
          <thead><tr style={at(0)}>{v.head.map((h, c) => <th key={c} scope="col">{rich(h)}</th>)}</tr></thead>
          <tbody>{v.rows.map((r, k) => <tr key={k} style={at(k + 1)}>{r.map((cell, c) => c === 0 ? <th key={c} scope="row">{rich(cell)}</th> : <td key={c}>{rich(cell)}</td>)}</tr>)}</tbody>
        </table>
      )
    case 'mindmap':
      return (
        <div className="mm">
          <div className="mm-root" style={at(0)}>{t(v.root)}</div>
          <ul className="mm-branches">
            {v.branches.map((b, k) => (
              <li key={k} data-pos={v.branches.length === 1 ? 'only' : k === 0 ? 'first' : k === v.branches.length - 1 ? 'last' : 'mid'}>
                <span className="mm-node" style={at(1 + 2 * k)}>{t(b.label)}</span>
                <ul className="mm-leaves">{b.leaves.map(l => <li key={l} style={at(2 + 2 * k)}>{t(l)}</li>)}</ul>
              </li>
            ))}
          </ul>
        </div>
      )
    case 'matrix':
      return (
        <>
          <table className="tbl matrix">
            <thead><tr style={at(0)}>{v.head.map((h, c) => <th key={c} scope="col">{t(h)}</th>)}</tr></thead>
            <tbody>{v.rows.map((r, k) => (
              <tr key={k} style={at(k + 1)}>{r.map((cell, c) => c === 0 ? <th key={c} scope="row">{t(cell)}</th>
                : /^[0-4]$/.test(cell) ? <td key={c}><span className="ball" role="img" aria-label={t('{{n}} of 4', { n: cell })} style={{ '--p': `${Number(cell) * 25}%` } as CSSProperties} /></td>
                : <td key={c}>{t(cell)}</td>)}</tr>
            ))}</tbody>
          </table>
          {v.legend && <p className="legend">{t(v.legend)}</p>}
        </>
      )
    case 'bars':
      return (
        <div className="bars">
          {v.rows.map((r, k) => (
            <div className="bar-row" key={k} style={at(k)}>
              <b>{t(r.label)}</b>
              <div className="bar" data-s="a" style={{ '--w': `${r.a}%` } as CSSProperties}><i /><span>{t(v.legend[0])}</span></div>
              <div className="bar" data-s="b" style={{ '--w': `${r.b}%` } as CSSProperties}><i /><span>{t(v.legend[1])}</span></div>
            </div>
          ))}
        </div>
      )
    case 'cards':
      return <div className="cards">{v.items.map((c, k) => <div className="card" key={k} style={at(k)}><strong>{t(c.title)}</strong><span>{t(c.text)}</span></div>)}</div>
  }
}

/** One slide's graphics. A list builds in order: the second starts when the first has finished. `d` delays the start, after a diagram above. */
export function Visuals({ v, d = 0 }: { v: Visual | Visual[]; d?: number }) {
  let offset = d
  return (
    <>
      {(Array.isArray(v) ? v : [v]).map((x, k) => {
        const d = offset
        offset += count(x)
        return <div className="vis" key={k} style={{ '--d': d } as CSSProperties}><One v={x} /></div>
      })}
    </>
  )
}
