// Practice per chapter, keyed by chapter id. The tasks live next to their chapter in src/cN/quiz.ts.
import c0 from './c0/quiz.ts'
import c1 from './c1/quiz.ts'
import c2 from './c2/quiz.ts'
import c3 from './c3/quiz.ts'
import c4 from './c4/quiz.ts'
import c5 from './c5/quiz.ts'
import type { Task } from './components/quizModel.ts'

export { QUIZ_EN } from './components/quizModel.ts'
export const QUIZZES: Record<string, Task[]> = { basics: c0, compose: c1, 'deep-dive': c2, 'compose-deep-dive': c3, 'docker-internals': c4, 'compose-internals': c5 }
