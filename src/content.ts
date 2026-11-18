// Assembles the chapters. Each chapter's content lives in src/cN/, shared shapes in components/types.ts.
// Rules: visuals first, then tables and mind maps, never plain text. Theory only: no labs or quizzes in here.
import { createElement } from 'react'
import type { Chapter, Page, Slide } from './components/types.ts'
import { Progress } from './components/Progress.tsx'
import c0 from './c0/index.tsx'
import c1 from './c1/index.tsx'
import c2 from './c2/index.tsx'
import c3 from './c3/index.ts'
import c4 from './c4/index.ts'
import c5 from './c5/index.ts'

export * from './components/types.ts'

export const chapters: Chapter[] = [c0, c1, c2, c3, c4, c5]

/** All slides of a chapter in playing order, each with the section it belongs to.
 *  Every deck opens with the learning path (built from `chapters`, part of the first section), so no chapter has to add it. */
export const deckOf = (c: Chapter): { page: Page; slide: Slide }[] => [
  { page: c.pages[0], slide: { title: 'Lernpfad: Wo stehen wir?', view: createElement(Progress, { chapters, current: c }) } },
  ...c.pages.flatMap(page => page.slides.map(slide => ({ page, slide }))),
]
/** Link that opens the presentation at the first slide of a section. */
export const slideHref = (c: Chapter, p: Page) => `#/${c.id}/${deckOf(c).findIndex(d => d.page === p) + 1}`
