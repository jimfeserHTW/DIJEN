import { useEffect, useRef } from 'react'
import './dial.css'

const STEP = 160 // px between two items, so titles never crowd however many items there are

/**
 * Compass-like 0–100 % dial. Pass any list of titles: item i sits at (i + 1) / n of the scale, so the last one is 100 %.
 * Scroll it and the item under the needle is selected; select from outside and it turns to that item.
 *   <Dial items={titles} index={current} onSelect={setCurrent} label="Slides" />
 */
export function Dial({ items, index, onSelect, label }: { items: string[]; index: number; onSelect: (i: number) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const settle = useRef(0)
  const n = items.length
  // The track starts half a dial in and items sit STEP apart, so item i is under the needle at scrollLeft (i + 1) * STEP.
  // Absolute targets only: a relative scrollBy during a running smooth scroll adds up and runs away.
  const turnTo = (i: number) => {
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    ref.current?.scrollTo({ left: (i + 1) * STEP, behavior: smooth ? 'smooth' : 'auto' })
  }

  // keep the current item under the needle
  useEffect(() => turnTo(index), [index, n])
  useEffect(() => () => clearTimeout(settle.current), [])

  // once scrolling stops, select the item nearest the needle, or snap back if it is still the current one
  const onScroll = () => {
    clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      if (!ref.current) return
      const best = Math.min(Math.max(Math.round(ref.current.scrollLeft / STEP) - 1, 0), n - 1)
      if (best !== index) onSelect(best)
      else if (Math.abs(ref.current.scrollLeft - (index + 1) * STEP) > 1) turnTo(index)
    }, 160)
  }

  return (
    <nav className="dial-wrap" aria-label={label}>
      <div className="dial" ref={ref} onScroll={onScroll}
        onWheel={e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) ref.current!.scrollLeft += e.deltaY }}>
        <div className="dial-track" style={{ width: n * STEP }}>
          {Array.from({ length: 101 }, (_, k) => (
            <i key={k} className="dial-tick" data-major={k % 10 === 0 || undefined} style={{ left: `${k}%` }}>{k % 10 === 0 && <span>{k} %</span>}</i>
          ))}
          {items.map((title, i) => (
            <button key={i} type="button" className="dial-mark" style={{ left: `calc(${((i + 1) / n) * 100}% - ${STEP / 2}px)`, width: STEP }}
              aria-current={i === index ? 'step' : undefined} tabIndex={i === index ? 0 : -1} title={title} onClick={() => onSelect(i)}>
              <span>{title}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}
