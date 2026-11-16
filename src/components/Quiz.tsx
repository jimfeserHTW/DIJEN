import { useState } from 'react'
import type { Question } from './types.ts'

export function Quiz({ questions, onDone }: { questions: Question[]; onDone: (score: number) => void }) {
  const [i, setI] = useState(0)
  const [pick, setPick] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [fin, setFin] = useState(false)

  if (fin) {
    return (
      <div className="quiz result">
        <p className="score">{score} / {questions.length}</p>
        <p className="lead">{score === questions.length ? 'Perfect. You can move on.' : score >= questions.length / 2 ? 'Good. Review the slides you missed, or retry.' : 'Worth another pass through the slides. Then try again.'}</p>
        <button className="btn" onClick={() => { setI(0); setPick(null); setScore(0); setFin(false) }}>Retry quiz</button>
      </div>
    )
  }
  const q = questions[i]
  const choose = (n: number) => { if (pick === null) { setPick(n); if (n === q.answer) setScore(s => s + 1) } }
  const next = () => {
    if (i + 1 < questions.length) { setI(i + 1); setPick(null); return }
    // score state already includes the last answer because the answer was recorded on click
    setFin(true); onDone(score)
  }
  return (
    <div className="quiz">
      <p className="dim">Question {i + 1} of {questions.length}</p>
      <h3>{q.q}</h3>
      <div className="options" role="group" aria-label="Answers">
        {q.options.map((o, n) => (
          <button key={o} className="option" disabled={pick !== null && n !== pick && n !== q.answer} data-state={pick === null ? '' : n === q.answer ? 'right' : n === pick ? 'wrong' : ''} aria-pressed={pick === n} onClick={() => choose(n)}>{o}</button>
        ))}
      </div>
      {pick !== null && (
        <div className="why" role="status">
          <strong>{pick === q.answer ? 'Correct. ' : 'Not quite. '}</strong>{q.why}
          <div><button className="btn" onClick={next}>{i + 1 < questions.length ? 'Next question' : 'See result'}</button></div>
        </div>
      )}
    </div>
  )
}
