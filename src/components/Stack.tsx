import type { CSSProperties, ReactNode } from 'react'
import { parts, type Part } from './vocab.ts'
import { t } from '../i18n.ts'
import './diagram.css'

export type Mark = 'ok' | 'bad' | 'gone' | 'focus'
/** A part (by key), an isolated unit with its own rows, or empty space beside a part (null, or space with a width). */
export type Block =
  | Part | null | { space: number }
  | { part: Part; label?: string; sub?: string; mark?: Mark; w?: number; /** Accepted answers: the quiz shows an empty field instead of the label. */ blank?: string }
  | { unit: string; kind: 'container' | 'vm' | 'image' | 'proc'; sub?: string; rows: Row[]; mark?: Mark; w?: number }
/** One layer. Several blocks in a row sit side by side. Rows are listed bottom-up: hardware first. */
export type Row = Block | Block[]

export const at = (i: number) => ({ '--i': i }) as CSSProperties
export const ctr = (n: string | number, rows: Row[] = ['libs', 'app'], mark?: 'ok' | 'bad', w?: number): Block => ({ unit: `Container ${n}`, kind: 'container', rows, mark, w })
export const vm = (n: number, rows: Row[] = ['guestKernel', 'libs', 'app'], mark?: 'ok' | 'bad'): Block => ({ unit: `VM ${n}`, kind: 'vm', rows, mark })
export const css = (o: Record<string, string | number>) => o as CSSProperties
const list = (r: Row) => (Array.isArray(r) ? r : [r])
/** Width share of a block. Rows use grid fr columns, so equal shares line up exactly across rows. */
const weight = (b: Block) => (b === null || typeof b === 'string' ? 1 : 'space' in b ? b.space : b.w ?? 1)
const cols = (r: Row) => ({ gridTemplateColumns: list(r).map(b => `minmax(0, ${weight(b)}fr)`).join(' ') })

function Blk({ b, blank }: { b: Block; blank?: (spec: string) => ReactNode }) {
  if (b === null) return <div className="spacer" />
  if (typeof b === 'object' && 'space' in b) return <div className="spacer" />
  const x = typeof b === 'string' ? { part: b } : b
  if ('unit' in x) return (
    <div className="unit" data-kind={x.kind} data-mark={x.mark}>
      <header><b>{t(x.unit)}</b>{x.sub && <small>{t(x.sub)}</small>}</header>
      <div className="urows">{x.rows.map((r, k) => <div className="urow" key={k} style={cols(r)}>{list(r).map((y, j) => <Blk key={j} b={y} blank={blank} />)}</div>)}</div>
    </div>
  )
  const p: { label: string; tone: string; sub?: string } = parts[x.part]
  const sub = x.sub ?? p.sub
  return <div className="blk" data-t={p.tone} data-mark={x.mark}><b>{x.blank && blank ? blank(x.blank) : t(x.label ?? p.label)}</b>{sub && <small>{t(sub)}</small>}</div>
}

export type StackProps = {
  title?: string; sub?: string; icon?: ReactNode; tag?: string
  rows: Row[]
  /** Index of the first row each unit owns; a dashed line separates it from the shared rows below. */
  boundary?: number
  /** Brackets on the right: who looks after rows from..to. */
  roles?: { label: string; sub?: string; from: number; to: number }[]
  status?: { mark: 'ok' | 'bad'; text: string }
  size?: 's' | 'm'
  /** Build delay in steps, to let several stacks build one after another. */
  d?: number
  /** Renders the field of a block with `blank`. */
  blank?: (spec: string) => ReactNode
}

/** Layer diagram used by every stack slide, so all of them read the same way. */
export function Stack({ title, sub, icon, tag, rows, boundary, roles, status, size = 'm', d = 0, blank }: StackProps) {
  const n = rows.length
  return (
    <div className="stk-wrap" data-size={size} style={{ '--d': d } as CSSProperties}>
      {title && <div className="stk-head">{icon}<div><b>{t(title)}</b>{sub && <small>{t(sub)}</small>}</div>{tag && <span className="stk-tag">{t(tag)}</span>}</div>}
      <div className="stk" data-edge={boundary !== undefined || undefined}>
        {rows.map((r, i) => (
          <div className="srow" key={i} style={{ gridRow: n - i, ...cols(r), ...at(i) }}>
            {list(r).map((b, j) => <Blk key={j} b={b} blank={blank} />)}
            {i === boundary && <span className="bnd" aria-hidden="true"><em>{t('▲ eigen')}</em><em>{t('▼ geteilt')}</em></span>}
          </div>
        ))}
        {roles?.map(r => (
          <div className="role" key={r.label} style={{ gridRow: `${n - r.to} / ${n - r.from + 1}`, ...at(n) }}><div><b>{t(r.label)}</b>{r.sub && <small>{t(r.sub)}</small>}</div></div>
        ))}
      </div>
      {status && <div className="stk-status" data-mark={status.mark} style={at(n)}><span aria-hidden="true">{status.mark === 'ok' ? '✓' : '✗'}</span>{t(status.text)}</div>}
    </div>
  )
}
