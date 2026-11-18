// Assembles the chapters. Each chapter's content lives in src/cN/, shared shapes in components/types.ts.
// Rules: visuals first, then tables and mind maps, never plain text. Theory only: no labs or quizzes in here.
import type { Chapter, Page } from './components/types.ts'
import c0 from './c0/index.tsx'
import c1 from './c1/index.tsx'
import c2 from './c2/index.tsx'
import c3 from './c3/index.ts'
import c4 from './c4/index.ts'
import c5 from './c5/index.ts'

export * from './components/types.ts'

export const chapters: Chapter[] = [c0, c1, c2, c3, c4, c5]

/** All slides of a chapter in playing order, each with the section it belongs to. */
export const deckOf = (c: Chapter) => c.pages.flatMap(page => page.slides.map(slide => ({ page, slide })))
/** Link that opens the presentation at the first slide of a section. */
export const slideHref = (c: Chapter, p: Page) => `#/${c.id}/${deckOf(c).findIndex(d => d.page === p) + 1}`
