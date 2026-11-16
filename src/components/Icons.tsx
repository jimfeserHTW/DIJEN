import type { ReactNode } from 'react'

// Metaphor icons on a 48×48 grid. Usable inside an SVG diagram (Icon) or on their own (IconSvg).
export type IconName = 'laptop' | 'server' | 'warehouse' | 'blueprint' | 'crate' | 'person' | 'bolt' | 'file' | 'trash' | 'check' | 'browser' | 'folder'

const draw: Record<IconName, ReactNode> = {
  laptop: <><rect x="9" y="10" width="30" height="21" rx="2" /><path d="M4 35h40l-3 4H7z" /></>,
  server: <><rect x="8" y="6" width="32" height="15" rx="2" /><rect x="8" y="27" width="32" height="15" rx="2" /><circle cx="14" cy="13.5" r="1.6" /><circle cx="14" cy="34.5" r="1.6" /><path d="M22 13.5h12M22 34.5h12" /></>,
  warehouse: <>
    <path d="M3 20 24 7l21 13v22H3z" fill="#fff3d6" />
    <path d="M9 42V24h30v18" />
    {[[12, 27], [21, 27], [30, 27], [16.5, 34.5], [25.5, 34.5]].map(([x, y]) => <rect key={`${x}${y}`} x={x} y={y} width="7" height="7" fill="#f2b84b" />)}
  </>,
  blueprint: <>
    <rect x="5" y="5" width="38" height="38" rx="3" fill="#dce9ff" stroke="#1d63ed" />
    <path d="M5 17h38M5 29h38M17 5v38M29 5v38" stroke="#1d63ed" strokeOpacity=".25" />
    <path d="M14 34V23l10-8 10 8v11zM21 34v-6h6v6" stroke="#1d63ed" />
  </>,
  crate: <><path d="M24 5 42 14v20L24 43 6 34V14z" fill="#dce9ff" stroke="#1d63ed" /><path d="M6 14l18 9 18-9M24 23v20" stroke="#1d63ed" /></>,
  person: <><circle cx="24" cy="15" r="7" /><path d="M10 42c0-9 6-14 14-14s14 5 14 14" /></>,
  bolt: <path d="M27 4 12 27h10l-3 17 17-24H26z" fill="#f2b134" stroke="#b9770e" />,
  file: <><path d="M12 5h17l9 9v29H12z" /><path d="M29 5v9h9M17 22h14M17 28h14M17 34h9" /></>,
  trash: <><path d="M9 13h30M19 13V8h10v5M13 13l2 29h18l2-29" /><path d="M21 20v15M27 20v15" /></>,
  browser: <><rect x="4" y="8" width="40" height="32" rx="3" fill="#fff" /><path d="M4 16h40" /><circle cx="9" cy="12" r="1" /><circle cx="13" cy="12" r="1" /><rect x="18" y="10" width="20" height="4" rx="2" /><path d="M11 24h26M11 30h18" /></>,
  folder: <path d="M4 12a3 3 0 0 1 3-3h11l4 5h19a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#fff3d6" />,
  check: <><circle cx="24" cy="24" r="18" fill="#e2f5ec" stroke="#0e8a5f" /><path d="M16 24l6 6 11-12" stroke="#0e8a5f" strokeWidth="3" /></>,
}

export const Icon = ({ name, x, y, s = 48 }: { name: IconName; x: number; y: number; s?: number }) => (
  <g className="ico" transform={`translate(${x} ${y}) scale(${s / 48})`}>{draw[name]}</g>
)

export const IconSvg = ({ name, size = 34 }: { name: IconName; size?: number }) => (
  <svg className="ico" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">{draw[name]}</svg>
)
