// Helpers shared by the docker and docker compose command lines: flags, tables, time and log formatting.
import type { Container, Daemon, LogLine } from './daemon.ts'
import { ExitEx, type Ctx, type Gen } from './shell.ts'

export class CliError extends Error {
  code: number
  constructor(m: string, code = 125) { super(m); this.code = code }
}
/** `--help` anywhere: print the usage instead of running the command. */
export class HelpRequest { text: string; constructor(t: string) { this.text = t } }

export type Kind = 'b' | 's' | 'm'
export type Flags = Record<string, any>
/** spec: { 'detach|d': 'b', 'name': 's', 'publish|p': 'm' }. Values are stored under the first name. */
export function parseFlags(args: string[], spec: Record<string, Kind>, cmd: string, stopAtFirst = false) {
  const names = new Map<string, { key: string; kind: Kind }>()
  for (const [k, kind] of Object.entries(spec)) { const key = k.split('|')[0]; for (const n of k.split('|')) names.set(n, { key, kind }) }
  const f: Flags = {}, rest: string[] = []
  const see = 'See \'' + cmd + ' --help\'.'
  const set = (n: { key: string; kind: Kind }, v: string | boolean) => { if (n.kind === 'm') (f[n.key] ??= []).push(v); else f[n.key] = v }
  const usage = () => new HelpRequest(`Usage:  ${cmd} [OPTIONS]\n\nOptions:\n${Object.entries(spec).map(([k]) => '  ' + k.split('|').map(n => (n.length === 1 ? '-' : '--') + n).join(', ')).join('\n')}\n`)
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') { rest.push(...args.slice(i + 1)); break }
    if (a === '--help') throw usage()
    if (a.startsWith('--')) {
      const eq = a.indexOf('='), name = eq < 0 ? a.slice(2) : a.slice(2, eq), n = names.get(name)
      if (!n) throw new CliError(`unknown flag: --${name}\n${see}`)
      if (n.kind === 'b') set(n, eq < 0 ? true : a.slice(eq + 1) !== 'false')
      else if (eq >= 0) set(n, a.slice(eq + 1))
      else { if (args[i + 1] === undefined) throw new CliError(`flag needs an argument: --${name}\n${see}`); set(n, args[++i]) }
    } else if (a.length > 1 && a[0] === '-') {
      for (let k = 1; k < a.length; k++) {
        const n = names.get(a[k])
        if (a[k] === 'h' && !n) throw usage()
        if (!n) throw new CliError(`unknown shorthand flag: '${a[k]}' in ${a}\n${see}`)
        if (n.kind === 'b') { set(n, true); continue }
        let v = a.slice(k + 1).replace(/^=/, '')
        if (!v) { if (args[i + 1] === undefined) throw new CliError(`flag needs an argument: '${a[k]}' in ${a}\n${see}`); v = args[++i] }
        set(n, v); break
      }
    } else {
      rest.push(a)
      if (stopAtFirst) { rest.push(...args.slice(i + 1)); break }
    }
  }
  return { f, rest }
}
export function needArgs(rest: string[], min: number, cmd: string, max = Infinity) {
  if (rest.length < min) throw new CliError(`"${cmd}" requires ${min === 1 ? 'at least 1 argument' : `at least ${min} arguments`}.\nSee '${cmd} --help'.`, 1)
  if (rest.length > max) throw new CliError(`"${cmd}" requires at most ${max} argument${max === 1 ? '' : 's'}.\nSee '${cmd} --help'.`, 1)
}
export const table = (rows: string[][]) => {
  const w = rows[0].map((_, i) => Math.max(...rows.map(r => (r[i] ?? '').length)) + 3)
  return rows.map(r => r.map((c, i) => (i === r.length - 1 ? c : (c ?? '').padEnd(w[i]))).join('').trimEnd()).join('\n') + '\n'
}
export function humanTime(ms: number) {
  const s = Math.floor(ms / 1000)
  if (s < 1) return 'Less than a second'
  if (s < 60) return s === 1 ? '1 second' : `${s} seconds`
  const m = Math.round(s / 60)
  if (m === 1) return 'About a minute'
  if (m < 60) return `${m} minutes`
  const h = Math.round(s / 3600)
  if (h === 1) return 'About an hour'
  return h < 48 ? `${h} hours` : `${Math.round(h / 24)} days`
}
export const ago = (ms: number) => `${humanTime(ms)} ago`
export function size(n: number) {
  if (n < 1000) return `${n}B`
  const [v, u] = n < 1e6 ? [n / 1e3, 'kB'] : n < 1e9 ? [n / 1e6, 'MB'] : [n / 1e9, 'GB']
  return `${Number(v.toPrecision(3))}${u}`
}
export function statusText(c: Container, now: number) {
  switch (c.status) {
    case 'created': return 'Created'
    case 'restarting': return `Restarting (${c.exitCode}) ${ago(now - c.finishedAt)}`
    case 'exited': return c.startedAt ? `Exited (${c.exitCode}) ${ago(now - c.finishedAt)}` : 'Created'
    case 'paused': return `Up ${humanTime(now - c.startedAt)} (Paused)`
    case 'dead': return 'Dead'
  }
  const h = c.health ? ` (${c.health.status === 'starting' ? 'health: starting' : c.health.status})` : ''
  return `Up ${humanTime(now - c.startedAt)}${h}`
}
export function portsText(c: Container) {
  const shown = c.bound.map(b => `${b.ip}:${b.host}->${b.port}/${b.proto}`)
  const open = [...c.config.ExposedPorts, ...(c.opts.expose ?? []).map(p => p.includes('/') ? p : `${p}/tcp`)].filter(p => !c.bound.some(b => `${b.port}/${b.proto}` === p))
  return [...new Set([...shown, ...open])].join(', ')
}
export const shortCmd = (c: Container, d: Daemon, full = false) => {
  const s = d.argvOf(c).join(' ')
  return `"${!full && s.length > 20 ? s.slice(0, 19) + '…' : s}"`
}

// ---- logs ----
export const LOG_FLAGS: Record<string, Kind> = { 'follow|f': 'b', 'tail|n': 's', 'timestamps|t': 'b', since: 's', until: 's', details: 'b' }
export const stamp = (t: number) => new Date(t).toISOString().replace('Z', '000000Z')
export function parseTime(s: string, now: number, flag: string) {
  const rel = s.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/)
  if (rel) return now - Number(rel[1]) * { ms: 1, s: 1000, m: 60000, h: 3600000 }[rel[2] as 'ms']!
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s) * 1000
  const t = Date.parse(s)
  if (Number.isNaN(t)) throw new CliError(`invalid value for "${flag}": failed to parse value as time or duration: "${s}"`, 1)
  return t
}
export function logWindow(f: Flags, now: number) {
  if (f.tail !== undefined && f.tail !== 'all' && !/^-?\d+$/.test(f.tail)) throw new CliError(`invalid value for "tail": strconv.Atoi: parsing "${f.tail}": invalid syntax`, 1)
  const since = f.since ? parseTime(f.since, now, 'since') : -Infinity, until = f.until ? parseTime(f.until, now, 'until') : Infinity
  const tail = f.tail === undefined || f.tail === 'all' || Number(f.tail) < 0 ? Infinity : Number(f.tail)
  return (lines: LogLine[]) => { const hit = lines.filter(l => l.t >= since && l.t <= until); return tail === Infinity ? hit : tail ? hit.slice(-tail) : [] }
}
/** Terminal stderr sinks mapped to their uncoloured twin. */
export const plainSinks = new WeakMap<object, (s: string) => void>()
/** Progress and log text belongs on stderr, but it is no error: the terminal must not show it in red. */
export const note = (x: Ctx, s: string) => (plainSinks.get(x.err) ?? x.err)(s)
export type LogView = { prefix?: (c: Container) => string; timestamps?: boolean; details?: boolean }
export function printLines(items: { c: Container; l: LogLine }[], x: Ctx, v: LogView) {
  items.sort((a, b) => a.l.t - b.l.t)
  for (const { c, l } of items) (l.stream === 'stderr' ? (s: string) => note(x, s) : x.out)(`${v.prefix?.(c) ?? ''}${v.timestamps ? stamp(l.t) + ' ' : ''}${v.details ? ' ' : ''}${l.text}\n`)
}
const fresh = (c: Container, from: number) => {
  let i = c.logs.length
  while (i > 0 && c.logs[i - 1].seq >= from) i--
  return c.logs.slice(i)
}
export const alive = (c: Container) => ['running', 'paused', 'restarting'].includes(c.status)
/** Stream new log lines until every container has ended (or Ctrl+C). Returns 130 after Ctrl+C. */
export function* followLogs(d: Daemon, x: Ctx, targets: () => Container[], cursor: Map<string, number>, v: LogView, onExit?: (c: Container) => void): Gen {
  const seen = new Set<string>()
  for (;;) {
    d.sync()
    const list = targets(), items: { c: Container; l: LogLine }[] = []
    for (const c of list) { for (const l of fresh(c, cursor.get(c.id) ?? 0)) items.push({ c, l }); cursor.set(c.id, c.logSeq) }
    printLines(items, x, v)
    for (const c of list) if (!alive(c) && !seen.has(c.id)) { seen.add(c.id); onExit?.(c) }
    if (!list.some(alive)) return 0
    if (x.p.signal === 'INT') { x.p.signal = null; return 130 }
    yield 100
  }
}

// ---- real-time waiting: the terminal's process yields, the daemon's clock follows the wall clock ----
const cancel = (x: Ctx) => { if (x.p.signal === 'INT') { x.p.signal = null; throw new ExitEx(130) } }
/** Sleep that Ctrl+C ends: the command is abandoned and the shell gets its prompt back. */
export function* pause(x: Ctx, ms: number): Gen<void> { yield ms; cancel(x) }
/** Wait until pred holds. False on timeout; Ctrl+C abandons the command. */
export function* waitUntil(d: Daemon, x: Ctx, pred: () => boolean, maxMs: number): Gen<boolean> {
  const end = d.clock() + maxMs
  for (;;) {
    d.sync()
    if (pred()) return true
    if (d.clock() >= end) return false
    yield* pause(x, 50)
  }
}
/** Run jobs side by side on one process. Each job yields its own delays; the first failure ends them all. */
export function* parallel(x: Ctx, gens: Gen<unknown>[]): Gen<void> {
  const open = gens.map(g => ({ g, at: 0 }))
  let t = 0
  try {
    for (;;) {
      for (const j of [...open]) {
        if (j.at > t) continue
        const r = j.g.next()
        if (r.done) open.splice(open.indexOf(j), 1)
        else j.at = t + r.value
      }
      if (!open.length) return
      const next = Math.min(...open.map(j => j.at))
      yield* pause(x, next - t)
      t = next
    }
  } finally { for (const j of open) j.g.return?.(0) }
}
/** Stop containers together. The daemon enforces the grace period, so Ctrl+C here only stops the waiting. */
export function* stopAll(d: Daemon, x: Ctx, list: Container[], timeout?: number): Gen<void> {
  const waiting = list.filter(c => d.stop(c, timeout))
  yield* waitUntil(d, x, () => waiting.every(c => c.status !== 'running'), Infinity)
  if (waiting.length) yield* pause(x, 120) // runc tears down namespaces, mounts and port proxies
}

// ---- live output: blocks a terminal redraws in place ----
/** Terminal stderr sinks that can replace an earlier block of text. */
export const liveSinks = new WeakMap<object, (id: number, text: string) => void>()
let liveSeq = 0
/** On a terminal the block is redrawn; anywhere else (pipe, redirect) only its final state is printed. */
export function liveBlock(x: Ctx) {
  const sink = liveSinks.get(x.err), id = ++liveSeq
  return { tty: !!sink, draw: (s: string) => sink?.(id, s), end: (s: string) => { if (sink) sink(id, s); else note(x, s) } }
}
const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
type Row = { key: string; state: string; start: number; end: number | null; bad: boolean }
/** The `[+] Running 2/3` display of docker compose. */
export class Progress {
  private rows = new Map<string, Row>()
  private block: ReturnType<typeof liveBlock>
  private d: Daemon
  private x: Ctx
  private verb: string
  private mode: string | undefined
  constructor(d: Daemon, x: Ctx, verb = 'Running', mode?: string) { this.d = d; this.x = x; this.verb = verb; this.mode = mode; this.block = liveBlock(x) }
  private get live() { return this.block.tty && this.mode !== 'plain' && this.mode !== 'quiet' }
  private line(r: Row, now: number, width: number) {
    const icon = r.bad ? '✘' : r.end !== null ? '✔' : SPINNER[Math.floor(now / 100) % SPINNER.length]
    return ` ${icon} ${r.key}`.padEnd(width) + ` ${r.state.padEnd(10)} ${(((r.end ?? now) - r.start) / 1000).toFixed(1)}s`
  }
  private text(now: number) {
    const rows = [...this.rows.values()], width = Math.max(38, ...rows.map(r => r.key.length + 5))
    return `[+] ${this.verb} ${rows.filter(r => r.end !== null && !r.bad).length}/${rows.length}\n${rows.map(r => this.line(r, now, width)).join('\n')}\n`
  }
  draw() { if (this.live && this.rows.size) this.block.draw(this.text(this.d.clock())) }
  /** Create or update a row. done = false keeps its spinner and clock running. */
  set(key: string, state: string, done = true, bad = false) {
    const now = this.d.clock(), r = this.rows.get(key) ?? { key, state, start: now, end: null, bad }
    r.state = state; r.bad = bad; r.end = done ? now : null
    this.rows.set(key, r)
    if (this.live) this.draw()
    else if (done && this.mode !== 'quiet') note(this.x, this.line(r, now, 38) + '\n')
  }
  get size() { return this.rows.size }
  /** Run jobs in parallel while the display keeps ticking. */
  *run(jobs: Gen<unknown>[]): Gen<void> {
    let open = jobs.length
    const self = this
    const tracked = jobs.map(g => (function* (): Gen<void> { yield* g; open-- })())
    yield* parallel(this.x, [...tracked, (function* (): Gen<void> { while (open > 0) { self.draw(); yield 100 } })()])
  }
  /** Freeze the block in its last state; anything still spinning stays as it was. */
  finish() { if (this.live && this.rows.size) this.block.end(this.text(this.d.clock())) }
}

// ---- image transfer ----
export const pullMs = (bytes: number) => Math.min(6000, 400 + bytes / 40000) // ~40 MB/s plus registry round trips
const bar = (f: number, w = 18) => { const n = Math.floor(f * w); return `[${'='.repeat(Math.max(0, n - 1))}${n ? '>' : ''}${' '.repeat(w - n)}]` }
/** One line per layer: all download at once, then they are extracted one after the other. */
function layerLines(layers: { id: string; size: number }[], f: number) {
  const biggest = Math.max(...layers.map(l => l.size)), total = layers.reduce((n, l) => n + l.size, 0)
  let from = 0.7
  return layers.map(l => {
    const dl = Math.min(1, (f / 0.7) * (biggest / l.size)), width = 0.3 * l.size / total, ex = (f - from) / width
    from += width
    if (dl < 1) return `${l.id}: Downloading ${bar(dl)}  ${size(Math.round(l.size * dl))}/${size(l.size)}`
    if (ex <= 0) return `${l.id}: Download complete`
    return ex < 1 ? `${l.id}: Extracting  ${bar(ex)}  ${size(Math.round(l.size * ex))}/${size(l.size)}` : `${l.id}: Pull complete`
  }).join('\n') + '\n'
}
/** `docker pull` the way it looks while it runs. The image only exists once the transfer has finished. */
export function* pullImage(d: Daemon, x: Ctx, ref: string, o: { quiet?: boolean; final?: boolean; say?: (s: string) => void } = {}): Gen<void> {
  const plan = d.resolve(ref), local = d.findImage(plan.full), upToDate = local && (!plan.pushed || plan.pushed.id === local.id)
  const say = o.quiet ? () => {} : o.say ?? ((s: string) => note(x, s))
  say(`${plan.tag}: Pulling from ${plan.path}\n`)
  if (upToDate) yield* pause(x, 400)
  else {
    const block = liveBlock(x), start = d.clock(), total = pullMs(plan.size)
    if (o.quiet) yield* pause(x, total)
    else for (let f = 0; f < 1; f = (d.clock() - start) / total) { block.draw(layerLines(plan.layers, f)); yield* pause(x, 100) }
    if (!o.quiet) block.end(plan.layers.map(l => `${l.id}: Pull complete\n`).join(''))
    d.pull(ref)
  }
  say(`Digest: sha256:${plan.digest}\nStatus: ${upToDate ? 'Image is up to date' : 'Downloaded newer image'} for ${plan.full}\n`)
  if (o.final) say(`docker.io/${plan.path}:${plan.tag}\n`)
}

// ---- --format templates: {{.Field}}, {{json .X}}, {{range .X}}...{{end}} ----
const lookupField = (o: any, path: string) => path.split('.').filter(Boolean).reduce((v, k) => v?.[k], o)
export function template(t: string, data: any): string {
  const body = t.replace(/^table\s+/, '').replace(/\\t/g, '\t').replace(/\\n/g, '\n')
  const ranged = body.replace(/\{\{\s*range\s+(\.[\w.]*)\s*\}\}([\s\S]*?)\{\{\s*end\s*\}\}/g, (_, p, inner) => {
    const v = lookupField(data, p)
    return Object.values(v ?? {}).map(x => template(inner, x)).join('')
  })
  return ranged.replace(/\{\{\s*(json\s+)?(\.[\w.]*)\s*\}\}/g, (_, json, p) => {
    const v = p === '.' ? data : lookupField(data, p)
    if (json) return JSON.stringify(v ?? null)
    if (v === undefined || v === null) return '<no value>'
    return typeof v === 'object' ? (Array.isArray(v) ? `[${v.join(' ')}]` : `map[${Object.entries(v).map(([k, x]) => `${k}:${x}`).join(' ')}]`) : String(v)
  })
}
export const lines = (x: Ctx, s: string[]) => { for (const l of s) x.out(l + '\n') }
export function formatted(x: Ctx, fmt: string, rows: any[], headers: Record<string, string> = {}) {
  if (fmt === 'json') { lines(x, rows.map(r => JSON.stringify(r))); return }
  if (fmt.startsWith('table')) {
    const head = template(fmt, Object.fromEntries(Object.keys(rows[0] ?? headers).map(k => [k, headers[k] ?? k.toUpperCase()])))
    x.out(table([head, ...rows.map(r => template(fmt, r))].map(l => l.split('\t'))))
    return
  }
  lines(x, rows.map(r => template(fmt, r)))
}
/** 100m, 1g, 512k or plain bytes. */
export const bytesOf = (s: string | undefined) => { const m = s?.match(/^(\d+(?:\.\d+)?)([bkmg])?/i); return m ? Math.round(Number(m[1]) * { b: 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[(m[2] ?? 'b').toLowerCase() as 'b']) : 0 }
export const mib = (n: number) => n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)}GiB` : `${(n / 1024 ** 2).toFixed(2)}MiB`
export const topRows = (c: Container, now: number) => [['UID', 'PID', 'PPID', 'C', 'STIME', 'TTY', 'TIME', 'CMD'], ...c.procs.map(p => [p.user, String(p.pid), p.pid === 1 ? '0' : '1', '0', new Date(c.startedAt).toISOString().slice(11, 16), '?', new Date(Math.max(0, now - c.startedAt) / 100).toISOString().slice(11, 19), p.argv.join(' ')])]
