// Simulated `docker compose up / ps / down` for a compose.yaml typed in the browser.
import { parse } from 'yaml'
import { table } from './docker.ts'

type Svc = { image?: string; build?: unknown; ports?: unknown[]; volumes?: unknown[]; depends_on?: string[] | Record<string, unknown> }
const PROJECT = 'demo'

export function compose(text: string, cmd: 'up' | 'ps' | 'down', running: boolean): { out: string; running: boolean } {
  const fail = (m: string) => ({ out: `${m}`, running })
  let doc: { services?: Record<string, Svc>; volumes?: Record<string, unknown>; version?: unknown }
  try { doc = parse(text) ?? {} } catch (e) { return fail(`yaml: ${(e as Error).message.split('\n')[0]}`) }
  if (typeof doc !== 'object' || !doc.services || !Object.keys(doc.services).length) return fail('no service selected: the file needs a top-level `services:` with at least one service')
  const svcs = doc.services
  const names = Object.keys(svcs)

  for (const n of names) {
    const s = svcs[n] ?? {}
    if (!s.image && !s.build) return fail(`service "${n}" has neither an image nor a build context specified: invalid compose project`)
    const deps = Array.isArray(s.depends_on) ? s.depends_on : Object.keys(s.depends_on ?? {})
    for (const d of deps) if (!svcs[d]) return fail(`service "${n}" depends on undefined service "${d}": invalid compose project`)
    for (const v of s.volumes ?? []) {
      const src = String(v).split(':')[0]
      if (String(v).includes(':') && !/^[./~]/.test(src) && !(doc.volumes && src in doc.volumes)) return fail(`service "${n}" refers to undefined volume ${src}: invalid compose project\n(declare it under a top-level \`volumes:\`)`)
    }
  }

  // Start order: dependencies first. A cycle means we cannot order anything.
  const order: string[] = [], seen = new Set<string>(), stack = new Set<string>()
  const visit = (n: string): string | void => {
    if (stack.has(n)) return `dependency cycle detected: ${n}`
    if (seen.has(n)) return
    stack.add(n)
    const d = svcs[n].depends_on
    for (const x of Array.isArray(d) ? d : Object.keys(d ?? {})) { const e = visit(x); if (e) return e }
    stack.delete(n); seen.add(n); order.push(n)
  }
  for (const n of names) { const e = visit(n); if (e) return fail(e) }

  const vols = Object.keys(doc.volumes ?? {})
  const ctr = (n: string) => `${PROJECT}-${n}-1`
  const w = Math.max(...order.map(n => ctr(n).length), 24) + 12
  const line = (t: string, name: string, st: string) => ` ✔ ${t} ${name}`.padEnd(w) + st
  const warn = doc.version ? 'level=warning msg="the attribute `version` is obsolete, it will be ignored"\n' : ''

  if (cmd === 'down') {
    const items = [...order.reverse().map(n => line('Container', ctr(n), 'Removed')), line('Network', `${PROJECT}_default`, 'Removed')]
    return { out: `${warn}[+] Running ${items.length}/${items.length}\n${items.join('\n')}`, running: false }
  }
  if (cmd === 'ps') {
    if (!running) return { out: table([['NAME', 'IMAGE', 'COMMAND', 'SERVICE', 'STATUS', 'PORTS']]), running }
    return { out: table([['NAME', 'IMAGE', 'COMMAND', 'SERVICE', 'STATUS', 'PORTS'], ...order.map(n => [ctr(n), svcs[n].image ?? `${PROJECT}-${n}`, '"…"', n, 'Up 4 seconds', (svcs[n].ports ?? []).map(p => `0.0.0.0:${String(p).replace(/:(\d+)$/, '->$1/tcp')}`).join(', ')])]), running }
  }
  const items = [line('Network', `${PROJECT}_default`, 'Created'), ...vols.map(v => line('Volume', `"${PROJECT}_${v}"`, 'Created')), ...order.map(n => line('Container', ctr(n), 'Started'))]
  const urls = order.flatMap(n => (svcs[n].ports ?? []).map(p => `${n} → http://localhost:${String(p).split(':')[0]}`))
  return { out: `${warn}[+] Running ${items.length}/${items.length}\n${items.join('\n')}` + (urls.length ? `\n\nReachable from your browser:\n${urls.join('\n')}` : ''), running: true }
}
