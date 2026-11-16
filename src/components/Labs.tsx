import { useEffect, useRef, useState } from 'react'
import { initial, run, type State } from '../sim/docker.ts'
import { build, runImage } from '../sim/dockerfile.ts'
import { compose } from '../sim/compose.ts'
import type { Goal } from './types.ts'

function Goals<T>({ goals, done }: { goals: Goal<T>[]; done: boolean[] }) {
  const all = done.every(Boolean)
  return (
    <aside className="goals" aria-label="Goals">
      <h3>{all ? 'All goals reached' : 'Goals'}</h3>
      <ul>
        {goals.map((g, i) => (
          <li key={g.label} data-done={done[i]}>
            <span aria-hidden="true">{done[i] ? '✓' : ''}</span>
            <span>{g.label}<span className="sr"> – {done[i] ? 'done' : 'open'}</span></span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

export function TerminalLab({ intro, goals }: { intro: string; goals: Goal<State>[] }) {
  const sim = useRef<State>(initial())
  const [log, setLog] = useState<{ cmd: string; out: string }[]>([])
  const [done, setDone] = useState<boolean[]>(goals.map(() => false))
  const [value, setValue] = useState('')
  const [hist, setHist] = useState(-1)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [log])

  const submit = () => {
    const cmd = value.trim()
    setValue(''); setHist(-1)
    if (cmd === 'clear') return setLog([])
    const out = run(sim.current, cmd)
    setLog(l => [...l, { cmd, out }])
    // Goals stay checked once reached, even if a later command (e.g. docker rm) undoes the state.
    setDone(d => goals.map((g, i) => d[i] || g.test(sim.current)))
  }
  const key = (e: React.KeyboardEvent) => {
    const cmds = log.map(l => l.cmd).filter(Boolean)
    if (e.key === 'ArrowUp' && cmds.length) { e.preventDefault(); const h = Math.min(hist + 1, cmds.length - 1); setHist(h); setValue(cmds[cmds.length - 1 - h]) }
    if (e.key === 'ArrowDown') { e.preventDefault(); const h = hist - 1; setHist(h); setValue(h < 0 ? '' : cmds[cmds.length - 1 - h]) }
  }
  const reset = () => { sim.current = initial(); setLog([]); setDone(goals.map(() => false)) }

  return (
    <div className="lab">
      <p className="lead">{intro}</p>
      <div className="lab-grid">
        <div className="term" onClick={() => document.getElementById('term-in')?.focus()}>
          <div className="term-bar"><span>sandbox</span><button className="link-btn" onClick={reset}>Reset</button></div>
          <div className="term-body" role="log" aria-live="polite">
            {log.length === 0 && <div className="dim">Type a command below. Try `help`.</div>}
            {log.map((l, i) => (<div key={i}><div><span className="ps">$</span> {l.cmd}</div>{l.out && <pre>{l.out}</pre>}</div>))}
            <form onSubmit={e => { e.preventDefault(); submit() }} className="term-line">
              <span className="ps" aria-hidden="true">$</span>
              <input id="term-in" aria-label="Command" value={value} onChange={e => setValue(e.target.value)} onKeyDown={key} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="docker run hello-world" />
            </form>
            <div ref={end} />
          </div>
        </div>
        <Goals goals={goals} done={done} />
      </div>
    </div>
  )
}

export function EditorLab({ kind, intro, start, goals }: { kind: 'dockerfile' | 'compose'; intro: string; start: string; goals: Goal<string>[] }) {
  const [text, setText] = useState(start)
  const [out, setOut] = useState('')
  const [isErr, setErr] = useState(false)
  const [up, setUp] = useState(false)
  const esc = useRef(false)
  const done = goals.map(g => g.test(text))

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { esc.current = true; return }
    if (e.key !== 'Tab' || e.shiftKey) { esc.current = false; return }
    if (esc.current) { esc.current = false; return } // Esc then Tab leaves the editor (no keyboard trap)
    e.preventDefault()
    const t = e.currentTarget, a = t.selectionStart
    setText(text.slice(0, a) + '  ' + text.slice(t.selectionEnd))
    requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2))
  }
  const doBuild = (andRun: boolean) => {
    const r = build(text)
    const parts = [r.out, ...r.warnings.map(w => `⚠ ${w}`)]
    if (r.ok && andRun) parts.push('', '$ docker run myapp', runImage(r.ins))
    setOut(parts.join('\n')); setErr(!r.ok)
  }
  const doCompose = (cmd: 'up' | 'ps' | 'down') => {
    const r = compose(text, cmd, up)
    setUp(r.running); setOut(r.out); setErr(/invalid compose|no service|yaml:|cycle/.test(r.out))
  }

  return (
    <div className="lab">
      <p className="lead">{intro}</p>
      <div className="lab-grid">
        <div className="editor">
          <div className="term-bar"><span>{kind === 'dockerfile' ? 'Dockerfile' : 'compose.yaml'}</span><button className="link-btn" onClick={() => { setText(start); setOut('') }}>Reset</button></div>
          <textarea aria-label={kind === 'dockerfile' ? 'Dockerfile editor' : 'compose.yaml editor'} value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey} spellCheck={false} rows={11} />
          <div className="actions">
            {kind === 'dockerfile'
              ? (<><button className="btn" onClick={() => doBuild(false)}>Build image</button><button className="btn ghost" onClick={() => doBuild(true)}>Build and run</button></>)
              : (<><button className="btn" onClick={() => doCompose('up')}>docker compose up</button><button className="btn ghost" onClick={() => doCompose('ps')}>ps</button><button className="btn ghost" onClick={() => doCompose('down')}>down</button></>)}
            <small>Esc, then Tab leaves the editor.</small>
          </div>
        </div>
        <Goals goals={goals} done={done} />
      </div>
      <div className="term out" role="status" aria-live="polite">
        <div className="term-bar"><span>output</span></div>
        <pre className={isErr ? 'err' : ''}>{out || 'Output appears here.'}</pre>
      </div>
    </div>
  )
}
