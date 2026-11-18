import { at } from './Stack.tsx'
import { t } from '../i18n.ts'
import type { Chapter } from './types.ts'

/** Learning path: one stop per chapter, coloured by tier. The current chapter is filled solid, the line is solid up to it. */
export function Progress({ chapters, current }: { chapters: Chapter[]; current: Chapter }) {
  const here = chapters.indexOf(current)
  return (
    <ol className="path">
      {chapters.map((c, k) => (
        <li key={c.id} style={at(k)} data-tier={c.level} data-on={k === here || undefined} data-done={k <= here || undefined}>
          <i />
          <span>{t(c.title)}</span>
          <small>{t(c.level)}</small>
        </li>
      ))}
    </ol>
  )
}
