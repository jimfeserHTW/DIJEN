import type { ReactNode } from 'react'
import { at } from './Stack.tsx'
import { t as tr } from '../i18n.ts'

// Building blocks for hand-drawn diagrams. Boxes share their colours (data-t) with the Stack blocks.
export type BoxTone = 'hw' | 'kernel' | 'kchip' | 'guest' | 'hyper' | 'engine' | 'host' | 'runtime' | 'libs' | 'app' | 'reg' | 'container' | 'ok' | 'bad' | 'gone'
export type ArrowKind = 'go' | 'back' | 'bad' | 'ok' | 'mute'
const kinds: ArrowKind[] = ['go', 'back', 'bad', 'ok', 'mute']

export function Svg({ w, h, label, children }: { w: number; h: number; label: string; children: ReactNode }) {
  return (
    <svg className="dgm" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={tr(label)}>
      <defs>
        {kinds.map(k => (
          <marker key={k} id={`ah-${k}`} className={`ah ah-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 10 5 0 10z" />
          </marker>
        ))}
      </defs>
      {children}
    </svg>
  )
}

export function Box({ x, y, w, h, t = 'app', label, sub, i = 0, size = 17 }: { x: number; y: number; w: number; h: number; t?: BoxTone; label: string; sub?: string; i?: number; size?: number }) {
  const cy = y + h / 2
  return (
    <g className="sb" data-t={t} style={at(i)}>
      <rect x={x} y={y} width={w} height={h} rx={12} />
      <text x={x + w / 2} y={sub ? cy - 4 : cy + size / 3} textAnchor="middle" fontSize={size} fontWeight={700}>{tr(label)}</text>
      {sub && <text x={x + w / 2} y={cy + 16} textAnchor="middle" fontSize={13} className="sb-sub">{tr(sub)}</text>}
    </g>
  )
}

/** Arrow along a path, with an optional step number (n at nx,ny) and label (at lx,ly). */
export function Arrow({ d, kind = 'go', n, nx = 0, ny = 0, label, lx = 0, ly = 0, anchor = 'middle', i = 0, both }: {
  d: string; kind?: ArrowKind; n?: number; nx?: number; ny?: number; label?: string; lx?: number; ly?: number; anchor?: 'start' | 'middle' | 'end'; i?: number; both?: boolean
}) {
  return (
    <g className="sa" data-k={kind} style={at(i)}>
      <path d={d} markerEnd={`url(#ah-${kind})`} markerStart={both ? `url(#ah-${kind})` : undefined} />
      {n !== undefined && <g className="sa-n"><circle cx={nx} cy={ny} r={13} /><text x={nx} y={ny + 5} textAnchor="middle">{n}</text></g>}
      {label && <text className="sa-l" x={lx} y={ly} textAnchor={anchor}>{tr(label)}</text>}
    </g>
  )
}

/** Free text inside a diagram, building in with the rest. */
export const Label = ({ x, y, children, i = 0, size = 14, weight = 500, anchor = 'middle', tone }: { x: number; y: number; children: ReactNode; i?: number; size?: number; weight?: number; anchor?: 'start' | 'middle' | 'end'; tone?: 'muted' | 'bad' | 'ok' | 'blue' }) => (
  <text className="sl" data-tone={tone} x={x} y={y} fontSize={size} fontWeight={weight} textAnchor={anchor} style={at(i)}>{typeof children === 'string' ? tr(children) : children}</text>
)
