// A small POSIX shell. Every process in the simulation (container PID 1, RUN steps, healthchecks, the terminal itself)
// is a generator: it yields how many virtual milliseconds it wants to sleep and returns its exit code.
import { Fs, FsError, normPath, type Entry } from './fs.ts'

export type Gen<T = number> = Generator<number, T, void>
export type Listen = { port: number; http: boolean; root: string | null; name: string; body?: string; handle?: (r: HttpReq) => HttpRes }
/** Shared by a process and its subshells. */
export type ProcState = { signal: string | null; handles: boolean; listen: Listen | null; waiting: boolean; exited: number | null; port: number }
export type HttpReq = { method: string; host: string; port: number; path: string; agent: string }
export type HttpRes = { status: number; body: string; type: string }
export class NetError extends Error {
  kind: 'dns' | 'refused' | 'empty' | 'timeout'
  constructor(kind: NetError['kind'], m = '') { super(m); this.kind = kind }
}
export interface Host {
  now(): number
  http(c: Ctx, r: HttpReq): HttpRes
  resolve(c: Ctx, name: string): string | null
  spawn(c: Ctx, argv: string[], gen: Gen): number
  ps(c: Ctx): string[][]
  kill(c: Ctx, pid: number, sig: string): boolean
  docker?(argv: string[], c: Ctx): Gen
}
export type Ctx = {
  fs: Fs; env: Map<string, string>; cwd: string; uid: number; user: string; hostname: string; host: Host; p: ProcState
  out(s: string): void; err(s: string): void; stdin: string | null; tty: boolean
  last: number; args: string[]; argv0: string; traps: Map<string, string>; errexit: boolean; quiet: number; depth: number
}
export const newProcState = (): ProcState => ({ signal: null, handles: false, listen: null, waiting: false, exited: null, port: 0 })

export class ExitEx { code: number; constructor(code: number) { this.code = code } }
class SyntaxErr extends Error {}

// ---- syntax tree ----
type Part = { k: 'lit'; v: string; q: boolean } | { k: 'var'; name: string; op?: string; arg?: Word; q: boolean } | { k: 'sub'; src: Node; q: boolean } | { k: 'arith'; src: string; q: boolean }
type Word = Part[]
type Redir = { op: string; fd: number; target: Word | null }
type Node =
  | { k: 'list'; items: { n: Node; bg: boolean }[] }
  | { k: 'and'; l: Node; op: string; r: Node }
  | { k: 'pipe'; cmds: Node[]; neg: boolean }
  | { k: 'cmd'; assign: [string, Word][]; words: Word[]; redirs: Redir[] }
  | { k: 'if'; arms: [Node, Node][]; other: Node | null }
  | { k: 'while'; cond: Node; body: Node; until: boolean }
  | { k: 'for'; name: string; words: Word[] | null; body: Node }
  | { k: 'group'; body: Node; sub: boolean; redirs: Redir[] }
type Tok = { t: 'word'; w: Word } | { t: 'op'; v: string; fd?: number }

function closing(s: string, from: number, open: string, close: string) {
  let depth = 0, q = ''
  for (let i = from; i < s.length; i++) {
    const c = s[i]
    if (c === '\\' && q !== "'") { i++; continue }
    if (q) { if (c === q) q = ''; continue }
    if (c === '"' || c === "'") q = c
    else if (c === open) depth++
    else if (c === close && --depth === 0) return i
  }
  throw new SyntaxErr(`unterminated ${open}`)
}

function lex(s: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  const dollar = (q: boolean, into: Word) => {
    const n = s[i + 1] ?? ''
    if (s.startsWith('$((', i)) { const e = closing(s, i + 1, '(', ')'); into.push({ k: 'arith', src: s.slice(i + 3, e - 1), q }); i = e + 1; return }
    if (n === '(') { const e = closing(s, i + 1, '(', ')'); into.push({ k: 'sub', src: parse(s.slice(i + 2, e)), q }); i = e + 1; return }
    if (n === '{') {
      const e = closing(s, i + 1, '{', '}'), body = s.slice(i + 2, e)
      const m = body.match(/^(#?)([A-Za-z_]\w*|[0-9@*?#$!])(?:(:-|:=|:\+|:\?|-|=|\+|\?)([\s\S]*))?$/)
      if (!m) throw new SyntaxErr(`bad substitution`)
      into.push({ k: 'var', name: m[2], op: m[1] ? 'len' : m[3], arg: m[3] ? wordOf(m[4]) : undefined, q }); i = e + 1; return
    }
    const m = s.slice(i + 1).match(/^([A-Za-z_]\w*|[0-9@*?#$!])/)
    if (m) { into.push({ k: 'var', name: m[1], q }); i += 1 + m[1].length; return }
    into.push({ k: 'lit', v: '$', q: true }); i++
  }
  const dq = (into: Word) => {
    i++
    let lit = ''
    const flush = () => { if (lit) { into.push({ k: 'lit', v: lit, q: true }); lit = '' } }
    for (;;) {
      if (i >= s.length) throw new SyntaxErr('unterminated quoted string')
      const c = s[i]
      if (c === '"') { i++; break }
      if (c === '\\' && '$"\\`\n'.includes(s[i + 1] ?? ' ')) { if (s[i + 1] !== '\n') lit += s[i + 1]; i += 2; continue }
      if (c === '$') { flush(); dollar(true, into); continue }
      if (c === '`') { flush(); const e = s.indexOf('`', i + 1); if (e < 0) throw new SyntaxErr('unterminated `'); into.push({ k: 'sub', src: parse(s.slice(i + 1, e)), q: true }); i = e + 1; continue }
      lit += c; i++
    }
    flush()
    into.push({ k: 'lit', v: '', q: true })
  }
  while (i < s.length) {
    const c = s[i]
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue }
    if (c === '\\' && s[i + 1] === '\n') { i += 2; continue }
    if (c === '#') { while (i < s.length && s[i] !== '\n') i++; continue }
    const io = s.slice(i).match(/^(\d?)(>>|>&|<<|>|<|&>)(\d?)/)
    if (io && (io[1] || !/\d/.test(c))) {
      if (io[2] === '<<') throw new SyntaxErr('here-documents are not supported in this simulation')
      if (io[2] === '>&') { toks.push({ t: 'op', v: `>&${io[3] || '1'}`, fd: Number(io[1] || 1) }); i += io[0].length; continue }
      toks.push({ t: 'op', v: io[2], fd: io[1] ? Number(io[1]) : io[2] === '<' ? 0 : 1 }); i += io[1].length + io[2].length; continue
    }
    const op = ['&&', '||', ';', '\n', '&', '|', '(', ')'].find(o => s.startsWith(o, i))
    if (op) { toks.push({ t: 'op', v: op }); i += op.length; continue }
    const w: Word = []
    let lit = ''
    const flush = () => { if (lit) { w.push({ k: 'lit', v: lit, q: false }); lit = '' } }
    while (i < s.length && !' \t\r\n;&|<>()'.includes(s[i])) {
      const d = s[i]
      if (d === '\\') { if (s[i + 1] === '\n') { i += 2; continue } flush(); w.push({ k: 'lit', v: s[i + 1] ?? '', q: true }); i += 2 }
      else if (d === "'") { flush(); const e = s.indexOf("'", i + 1); if (e < 0) throw new SyntaxErr('unterminated quoted string'); w.push({ k: 'lit', v: s.slice(i + 1, e), q: true }); i = e + 1 }
      else if (d === '"') { flush(); dq(w) }
      else if (d === '$') { flush(); dollar(false, w) }
      else if (d === '`') { flush(); const e = s.indexOf('`', i + 1); if (e < 0) throw new SyntaxErr('unterminated `'); w.push({ k: 'sub', src: parse(s.slice(i + 1, e)), q: false }); i = e + 1 }
      else { lit += d; i++ }
    }
    flush()
    toks.push({ t: 'word', w })
  }
  return toks
}
/** The word after `:-` etc. It behaves like double-quoted text. */
function wordOf(s: string): Word { const t = lex(`"${s.replace(/"/g, '\\"')}"`)[0]; return t?.t === 'word' ? t.w : [] }

const litOf = (w: Word) => w.length === 1 && w[0].k === 'lit' && !w[0].q ? w[0].v : null
const REDIR = new Set(['>', '>>', '<', '&>'])

export function parse(src: string): Node {
  const toks = lex(src)
  let i = 0
  const peek = () => toks[i]
  const isOp = (v: string) => { const t = toks[i]; return t?.t === 'op' && t.v === v }
  const isKw = (v: string) => { const t = toks[i]; return t?.t === 'word' && litOf(t.w) === v }
  const fail = (): never => { const t = toks[i]; throw new SyntaxErr(`syntax error: unexpected ${!t ? 'end of file' : t.t === 'op' ? `"${t.v === '\n' ? 'newline' : t.v}"` : `"${litOf(t.w) ?? 'word'}"`}`) }
  const kw = (v: string) => { if (!isKw(v)) fail(); i++ }
  const nl = () => { while (isOp('\n') || isOp(';')) i++ }
  const list = (stop: string[]): Node => {
    const items: { n: Node; bg: boolean }[] = []
    for (;;) {
      nl()
      if (i >= toks.length || isOp(')') || stop.some(isKw)) break
      const n = andOr(); let bg = false
      if (isOp('&')) { bg = true; i++ } else if (!isOp(';') && !isOp('\n') && i < toks.length && !isOp(')') && !stop.some(isKw)) fail()
      items.push({ n, bg })
    }
    return { k: 'list', items }
  }
  const andOr = (): Node => {
    let l = pipe()
    while (isOp('&&') || isOp('||')) { const op = (toks[i++] as { v: string }).v; while (isOp('\n')) i++; l = { k: 'and', l, op, r: pipe() } }
    return l
  }
  const pipe = (): Node => {
    let neg = false
    if (isKw('!')) { neg = true; i++ }
    const cmds = [command()]
    while (isOp('|')) { i++; while (isOp('\n')) i++; cmds.push(command()) }
    return cmds.length === 1 && !neg ? cmds[0] : { k: 'pipe', cmds, neg }
  }
  const redirs = (into: Redir[]) => {
    for (;;) {
      const t = peek()
      if (t?.t !== 'op') return
      if (t.v.startsWith('>&')) { into.push({ op: t.v, fd: t.fd ?? 1, target: null }); i++; continue }
      if (!REDIR.has(t.v)) return
      i++
      const w = peek()
      if (w?.t !== 'word') fail()
      into.push({ op: t.v, fd: t.fd ?? 1, target: (w as { w: Word }).w }); i++
    }
  }
  const command = (): Node => {
    if (isOp('(')) { i++; const body = list([]); if (!isOp(')')) fail(); i++; const r: Redir[] = []; redirs(r); return { k: 'group', body, sub: true, redirs: r } }
    if (isKw('{')) { i++; const body = list(['}']); kw('}'); const r: Redir[] = []; redirs(r); return { k: 'group', body, sub: false, redirs: r } }
    if (isKw('if')) {
      i++
      const arms: [Node, Node][] = []
      let other: Node | null = null
      for (;;) {
        const c = list(['then']); kw('then')
        arms.push([c, list(['elif', 'else', 'fi'])])
        if (isKw('elif')) { i++; continue }
        if (isKw('else')) { i++; other = list(['fi']) }
        kw('fi'); return { k: 'if', arms, other }
      }
    }
    if (isKw('while') || isKw('until')) { const until = isKw('until'); i++; const cond = list(['do']); kw('do'); const body = list(['done']); kw('done'); return { k: 'while', cond, body, until } }
    if (isKw('for')) {
      i++
      const t = peek(); const name = t?.t === 'word' ? litOf(t.w) : null
      if (!name) fail()
      i++; nl()
      let words: Word[] | null = null
      if (isKw('in')) { i++; words = []; for (let t = peek(); t?.t === 'word'; t = peek()) { words.push(t.w); i++ } }
      nl(); kw('do'); const body = list(['done']); kw('done')
      return { k: 'for', name: name!, words, body }
    }
    const n: Extract<Node, { k: 'cmd' }> = { k: 'cmd', assign: [], words: [], redirs: [] }
    for (;;) {
      redirs(n.redirs)
      const t = peek()
      if (t?.t !== 'word') break
      const h = t.w[0]
      const m = !n.words.length && h?.k === 'lit' && !h.q ? h.v.match(/^([A-Za-z_]\w*)=(.*)$/s) : null
      if (m) n.assign.push([m[1], [{ k: 'lit', v: m[2], q: true }, ...t.w.slice(1)]])
      else n.words.push(t.w)
      i++
    }
    if (!n.words.length && !n.assign.length && !n.redirs.length) fail()
    return n
  }
  const ast = list([])
  if (i < toks.length) fail()
  return ast
}

/** Split a string like a shell would, without expanding anything (compose `command: a "b c"`). */
export function splitWords(s: string): string[] {
  return lex(s).flatMap(t => t.t === 'word' ? [t.w.map(p => p.k === 'lit' ? p.v : '$').join('')] : [])
}

// ---- expansion ----
function arith(src: string, c: Ctx): number {
  const toks = src.replace(/\$?([A-Za-z_]\w*)/g, (_, n) => String(parseInt(c.env.get(n) ?? '0') || 0)).match(/\d+|[-+*/%()]/g) ?? []
  let i = 0
  const atom = (): number => {
    const t = toks[i++]
    if (t === '(') { const v = sum(); i++; return v }
    if (t === '-') return -atom()
    return Number(t ?? 0)
  }
  const prod = () => { let v = atom(); while ('*/%'.includes(toks[i] ?? ' ')) { const o = toks[i++], r = atom(); if (o !== '*' && !r) throw new SyntaxErr('division by zero'); v = o === '*' ? v * r : o === '/' ? Math.trunc(v / r) : v % r } return v }
  const sum = (): number => { let v = prod(); while (toks[i] === '+' || toks[i] === '-') v = toks[i++] === '+' ? v + prod() : v - prod(); return v }
  return sum()
}
function special(name: string, c: Ctx): string | undefined {
  if (name === '?') return String(c.last)
  if (name === '$') return '1'
  if (name === '!') return '0'
  if (name === '#') return String(c.args.length)
  if (name === '@' || name === '*') return c.args.join(' ')
  if (name === '0') return c.argv0
  if (/^\d+$/.test(name)) return c.args[Number(name) - 1]
  return c.env.get(name)
}
function* joined(w: Word, c: Ctx): Gen<string> {
  let s = ''
  for (const p of w) s += p.k === 'lit' ? p.v : yield* value(p, c)
  return s
}
function* value(p: Exclude<Part, { k: 'lit' }>, c: Ctx): Gen<string> {
  if (p.k === 'arith') return String(arith(p.src, c))
  if (p.k === 'sub') {
    let buf = ''
    const sub: Ctx = { ...c, env: new Map(c.env), out: s => { buf += s } }
    try { c.last = yield* run(p.src, sub) } catch (e) { if (e instanceof ExitEx) c.last = e.code; else throw e }
    return buf.replace(/\n+$/, '')
  }
  const v = special(p.name, c)
  if (p.op === 'len') return String((v ?? '').length)
  const empty = p.op?.startsWith(':') ? !v : v === undefined
  const arg = p.arg ?? []
  switch (p.op?.replace(':', '')) {
    case '-': return empty ? yield* joined(arg, c) : v!
    case '=': { if (!empty) return v!; const d = yield* joined(arg, c); c.env.set(p.name, d); return d }
    case '+': return empty ? '' : yield* joined(arg, c)
    case '?': { if (!empty) return v!; c.err(`${c.argv0}: ${p.name}: ${(yield* joined(arg, c)) || 'parameter not set'}\n`); throw new ExitEx(2) }
  }
  return v ?? ''
}
function glob(pat: string, c: Ctx): string[] {
  const abs = pat.startsWith('/')
  let found = [abs ? '/' : '']
  for (const seg of pat.split('/').filter(Boolean)) {
    const next: string[] = []
    for (const base of found) {
      const dir = normPath(base || '.', c.cwd)
      if (!/[*?]/.test(seg)) { const p = base ? `${base.replace(/\/$/, '')}/${seg}` : seg; if (c.fs.get(normPath(p, c.cwd))) next.push(p); continue }
      const re = new RegExp('^' + seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
      let names: string[] = []
      try { names = c.fs.list(dir) } catch { /* not a directory: no match */ }
      for (const n of names) if (re.test(n) && (seg[0] === '.' || n[0] !== '.')) next.push(base ? `${base.replace(/\/$/, '')}/${n}` : n)
    }
    found = next
  }
  return found.filter(Boolean)
}
function* fields(w: Word, c: Ctx): Gen<string[]> {
  const out: string[] = []
  let cur = '', has = false, star = false
  const flush = () => {
    if (has) { const m = star ? glob(cur, c) : []; if (m.length) out.push(...m); else out.push(cur) }
    cur = ''; has = false; star = false
  }
  for (const [i, p] of w.entries()) {
    if (p.k === 'lit') {
      cur += i === 0 && !p.q && (p.v === '~' || p.v.startsWith('~/')) ? (c.env.get('HOME') ?? '/') + p.v.slice(1) : p.v
      has = true
      if (!p.q && /[*?]/.test(p.v)) star = true
      continue
    }
    if (p.k === 'var' && p.name === '@' && p.q) { c.args.forEach((a, n) => { if (n) flush(); cur += a; has = true }); continue }
    const v = yield* value(p, c)
    if (p.q) { cur += v; has = true; continue }
    v.split(/[ \t\n]+/).forEach((b, n) => { if (n) flush(); if (b) { cur += b; has = true } })
  }
  flush()
  return out
}

// ---- execution ----
/** Run pending traps. A pending INT without a trap ends the process (Ctrl+C in the terminal). */
function* checkSignal(c: Ctx): Gen<void> {
  const s = c.p.signal
  if (!s || c.p.handles) return
  const trap = c.traps.get(s)
  if (trap !== undefined) { c.p.signal = null; if (trap) yield* runScript(trap, c, true) }
  else if (s === 'INT') { c.p.signal = null; throw new ExitEx(130) }
}
function* withRedirs(rs: Redir[], c: Ctx, body: () => Gen): Gen {
  const saved = { out: c.out, err: c.err, stdin: c.stdin }
  try {
    for (const r of rs) {
      if (r.op.startsWith('>&')) { const to = r.op.endsWith('2') ? c.err : c.out; if (r.fd === 2) c.err = to; else c.out = to; continue }
      const name = yield* joined(r.target!, c), path = normPath(name, c.cwd)
      if (r.op === '<') { try { c.stdin = c.fs.read(path) } catch (e) { c.err(`${c.argv0}: can't open ${name}: no such file\n`); return e instanceof FsError ? 1 : 2 } continue }
      let sink: (s: string) => void
      if (path === '/dev/null') sink = () => {}
      else if (path === '/dev/stdout') sink = saved.out
      else if (path === '/dev/stderr') sink = saved.err
      else {
        try { c.fs.write(path, '', c.uid, r.op === '>>') } catch (e) { if (!(e instanceof FsError)) throw e; c.err(`${c.argv0}: can't create ${name}: ${e.message.split(': ').pop()}\n`); return 1 }
        if (r.op !== '>>') c.fs.write(path, '', c.uid)
        sink = s => c.fs.write(path, s, c.uid, true)
      }
      if (r.op === '&>') { c.out = sink; c.err = sink } else if (r.fd === 2) c.err = sink; else c.out = sink
    }
    return yield* body()
  } finally { Object.assign(c, saved) }
}
function* guarded(n: Node, c: Ctx): Gen { c.quiet++; try { return yield* run(n, c) } finally { c.quiet-- } }

export function* run(n: Node, c: Ctx): Gen {
  switch (n.k) {
    case 'list': {
      let r = 0
      for (const { n: item, bg } of n.items) {
        if (bg) { const sub: Ctx = { ...c, env: new Map(c.env), p: newProcState() }; c.host.spawn(sub, ['sh'], run(item, sub)); r = 0; c.last = 0; continue }
        r = yield* run(item, c)
        c.last = r
        yield* checkSignal(c)
        if (c.errexit && r && !c.quiet) throw new ExitEx(r)
      }
      return r
    }
    case 'and': {
      const l = yield* guarded(n.l, c)
      c.last = l
      if (n.op === '&&' ? l !== 0 : l === 0) return l
      return yield* run(n.r, c)
    }
    case 'pipe': {
      let input: string | null = c.stdin, code = 0
      for (const [i, cmd] of n.cmds.entries()) {
        let buf = ''
        const last = i === n.cmds.length - 1
        const sub: Ctx = { ...c, env: new Map(c.env), stdin: input, out: last ? c.out : s => { buf += s } }
        try { code = yield* run(cmd, sub) } catch (e) { if (e instanceof ExitEx) code = e.code; else throw e }
        input = buf
      }
      return n.neg ? Number(!code) : code
    }
    case 'if': {
      for (const [cond, body] of n.arms) if ((yield* guarded(cond, c)) === 0) return yield* run(body, c)
      return n.other ? yield* run(n.other, c) : 0
    }
    case 'while': {
      let r = 0
      try {
        while (((yield* guarded(n.cond, c)) === 0) !== n.until) {
          try { r = yield* run(n.body, c) } catch (e) { if (e instanceof LoopCtl && e.next) continue; throw e }
          yield 5 // even a busy loop takes virtual time, so it can never freeze the browser
          yield* checkSignal(c)
        }
      } catch (e) { if (!(e instanceof LoopCtl)) throw e }
      return r
    }
    case 'for': {
      let r = 0
      const items: string[] = []
      if (n.words) for (const w of n.words) items.push(...yield* fields(w, c))
      else items.push(...c.args)
      try {
        for (const v of items) {
          c.env.set(n.name, v)
          try { r = yield* run(n.body, c) } catch (e) { if (e instanceof LoopCtl && e.next) continue; throw e }
          yield* checkSignal(c)
        }
      } catch (e) { if (!(e instanceof LoopCtl)) throw e }
      return r
    }
    case 'group': return yield* withRedirs(n.redirs, c, function* () {
      if (!n.sub) return yield* run(n.body, c)
      const sub: Ctx = { ...c, env: new Map(c.env) }
      try { return yield* run(n.body, sub) } catch (e) { if (e instanceof ExitEx) return e.code; throw e }
    })
    case 'cmd': {
      const argv: string[] = []
      for (const w of n.words) argv.push(...yield* fields(w, c))
      const vals: [string, string][] = []
      for (const [k, w] of n.assign) vals.push([k, yield* joined(w, c)])
      return yield* withRedirs(n.redirs, c, function* () {
        if (!argv.length) { for (const [k, v] of vals) c.env.set(k, v); return 0 }
        if (!vals.length) return yield* exec(argv, c)
        const env = c.env
        c.env = new Map([...env, ...vals])
        try { return yield* exec(argv, c) } finally { c.env = env }
      })
    }
  }
}
class LoopCtl { next: boolean; constructor(next: boolean) { this.next = next } }

export type Program = (argv: string[], c: Ctx) => number | Gen
/** Executables behind the `\0bin:<name>` marker files, filled in by programs.ts. */
export const programs: Record<string, Program> = {}

export function findExe(name: string, c: Pick<Ctx, 'fs' | 'cwd' | 'env'>): { path: string; e: Entry } | null {
  const dirs = name.includes('/') ? [''] : (c.env.get('PATH') ?? '').split(':').filter(Boolean)
  for (const d of dirs) {
    const path = normPath(d ? `${d}/${name}` : name, c.cwd), e = c.fs.get(path)
    if (e?.kind === 'file') return { path, e }
  }
  return null
}

function* call(p: Program, argv: string[], c: Ctx): Gen {
  try { const r = p(argv, c); return typeof r === 'number' ? r : yield* r }
  catch (e) { if (e instanceof FsError) { c.err(`${argv[0]}: ${e.message}\n`); return 1 } throw e }
}
/** Start an executable file: a simulated binary (marker) or a script. */
export function* runFile(path: string, e: Entry, argv: string[], c: Ctx): Gen {
  const d = e.data
  if (d.startsWith('\0')) {
    const [kind, ...rest] = d.slice(1).split(':')
    const p = kind === 'bin' ? programs[rest[0]] ?? builtins[rest[0]] : programs[`@${kind}`]
    return yield* call(p ?? (() => 0), kind === 'bin' ? argv : [argv[0], rest.join(':'), ...argv.slice(1)], c)
  }
  const m = d.match(/^#!\s*(\S+)(?:\s+(\S+))?/)
  if (m) {
    const interp = m[1].endsWith('/env') ? findExe(m[2] ?? '', c) : c.fs.get(m[1])?.kind === 'file' ? { path: m[1], e: c.fs.get(m[1])! } : null
    if (!interp) { c.err(`${c.argv0}: ${argv[0]}: not found\n`); return 127 }
    if (!interp.e.data.match(/^\0bin:(sh|bash|ash|dash)/)) return yield* runFile(interp.path, interp.e, [m[1].split('/').pop()!, path, ...argv.slice(1)], c)
  }
  const sub: Ctx = { ...c, env: new Map(c.env), args: argv.slice(1), argv0: path, traps: c.depth ? new Map() : c.traps, errexit: false, quiet: 0, depth: c.depth + 1 }
  return yield* runScript(d, sub)
}
export function* exec(argv: string[], c: Ctx): Gen {
  const name = argv[0], b = builtins[name]
  if (b) return yield* call(b, argv, c)
  const f = findExe(name, c)
  if (!f) { c.err(`${c.argv0}: ${name}: not found\n`); return 127 }
  if (!(f.e.mode & 0o111)) { c.err(`${c.argv0}: ${name}: Permission denied\n`); return 126 }
  return yield* runFile(f.path, f.e, argv, c)
}
/** Parse and run shell source. `exit` ends it. nested: traps and `.` keep running in the caller. */
export function* runScript(src: string, c: Ctx, nested = false): Gen {
  if (c.depth > 40) { c.err(`${c.argv0}: recursion too deep\n`); return 2 }
  let ast: Node
  try { ast = parse(src) } catch (e) { if (!(e instanceof SyntaxErr)) throw e; c.err(`${c.argv0}: ${e.message}\n`); return 2 }
  if (nested) return yield* run(ast, c)
  let code: number
  try { code = yield* run(ast, c) } catch (e) { if (!(e instanceof ExitEx)) throw e; code = e.code; c.p.exited = code }
  const onExit = c.traps.get('EXIT')
  if (onExit) { c.traps.delete('EXIT'); try { yield* runScript(onExit, c, true) } catch (e) { if (!(e instanceof ExitEx)) throw e } }
  return code
}

export function testExpr(a: string[], c: Ctx): boolean {
  if (a[0] === '!') return !testExpr(a.slice(1), c)
  const andAt = a.indexOf('-a'), orAt = a.indexOf('-o')
  if (orAt > 0) return testExpr(a.slice(0, orAt), c) || testExpr(a.slice(orAt + 1), c)
  if (andAt > 0) return testExpr(a.slice(0, andAt), c) && testExpr(a.slice(andAt + 1), c)
  if (a.length === 0) return false
  if (a.length === 1) return a[0] !== ''
  if (a.length === 2) {
    const e = c.fs.get(normPath(a[1], c.cwd))
    switch (a[0]) {
      case '-z': return a[1] === ''
      case '-n': return a[1] !== ''
      case '-e': return !!e
      case '-f': return e?.kind === 'file'
      case '-d': return e?.kind === 'dir'
      case '-s': return !!e && e.data.length > 0
      case '-x': return !!e && !!(e.mode & 0o111)
      case '-r': case '-w': return !!e
    }
    return false
  }
  const [l, op, r] = a, x = Number(l), y = Number(r)
  switch (op) {
    case '=': case '==': return l === r
    case '!=': return l !== r
    case '-eq': return x === y
    case '-ne': return x !== y
    case '-lt': return x < y
    case '-le': return x <= y
    case '-gt': return x > y
    case '-ge': return x >= y
  }
  return false
}
const printf = (a: string[]) => {
  let i = 1
  const esc = (s: string) => s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\')
  return esc(a[0] ?? '').replace(/%(-?\d*)([sdf%])/g, (_, w, t) => {
    if (t === '%') return '%'
    const v = a[i++] ?? (t === 's' ? '' : '0'), s = t === 's' ? v : String(t === 'd' ? Math.trunc(Number(v)) || 0 : Number(v).toFixed(6))
    const n = Math.abs(parseInt(w) || 0)
    return w.startsWith('-') ? s.padEnd(n) : s.padStart(n)
  })
}
const builtins: Record<string, Program> = {
  ':': () => 0,
  true: () => 0,
  false: () => 1,
  echo: (a, c) => {
    let args = a.slice(1), nl = true, esc = false
    while (/^-[ne]+$/.test(args[0] ?? '')) { if (args[0].includes('n')) nl = false; if (args[0].includes('e')) esc = true; args = args.slice(1) }
    const s = args.join(' ')
    c.out((esc ? s.replace(/\\n/g, '\n').replace(/\\t/g, '\t') : s) + (nl ? '\n' : ''))
    return 0
  },
  printf: (a, c) => { c.out(printf(a.slice(1))); return 0 },
  pwd: (_, c) => { c.out(c.cwd + '\n'); return 0 },
  cd: (a, c) => {
    const t = normPath(a[1] === '-' ? c.env.get('OLDPWD') ?? c.cwd : a[1] ?? c.env.get('HOME') ?? '/', c.cwd), e = c.fs.get(t)
    if (!e) { c.err(`${c.argv0}: cd: can't cd to ${a[1]}: No such file or directory\n`); return 2 }
    if (e.kind !== 'dir') { c.err(`${c.argv0}: cd: can't cd to ${a[1]}: Not a directory\n`); return 2 }
    c.env.set('OLDPWD', c.cwd); c.env.set('PWD', t); c.cwd = t
    return 0
  },
  export: (a, c) => { for (const s of a.slice(1)) { const i = s.indexOf('='); if (i > 0) c.env.set(s.slice(0, i), s.slice(i + 1)) } return 0 },
  readonly: (a, c) => builtins.export(a, c),
  local: (a, c) => builtins.export(a, c),
  unset: (a, c) => { a.slice(1).forEach(k => c.env.delete(k)); return 0 },
  set: (a, c) => {
    for (const f of a.slice(1)) { if (/^-\w*e/.test(f)) c.errexit = true; if (/^\+\w*e/.test(f)) c.errexit = false }
    if (a.length === 1) for (const [k, v] of c.env) c.out(`${k}=${v}\n`)
    return 0
  },
  shift: (a, c) => { c.args = c.args.slice(Number(a[1] ?? 1)); return 0 },
  exit: (a, c) => { throw new ExitEx(a[1] === undefined ? c.last : Number(a[1]) & 255) },
  break: () => { throw new LoopCtl(false) },
  continue: () => { throw new LoopCtl(true) },
  test: (a, c) => Number(!testExpr(a.slice(1), c)),
  '[': (a, c) => {
    if (a[a.length - 1] !== ']') { c.err(`${c.argv0}: [: missing ]\n`); return 2 }
    return Number(!testExpr(a.slice(1, -1), c))
  },
  trap: (a, c) => {
    for (const s of a.slice(2)) c.traps.set(s === '0' ? 'EXIT' : s.replace(/^SIG/, ''), a[1] === '-' ? '' : a[1])
    return 0
  },
  wait: () => 0,
  read: (a, c) => {
    const text = c.stdin ?? ''
    if (!text) return 1
    const i = text.indexOf('\n')
    c.stdin = i < 0 ? '' : text.slice(i + 1)
    const names = a.slice(1).filter(x => !x.startsWith('-')), vals = (i < 0 ? text : text.slice(0, i)).trim().split(/\s+/)
    names.forEach((n, k) => c.env.set(n, k === names.length - 1 ? vals.slice(k).join(' ') : vals[k] ?? ''))
    return 0
  },
  exec: function* (a, c) {
    if (a.length < 2) return 0
    throw new ExitEx(yield* exec(a.slice(1), c))
  },
  eval: function* (a, c) { return yield* runScript(a.slice(1).join(' '), c, true) },
  '.': function* (a, c) {
    const p = normPath(a[1] ?? '', c.cwd), e = c.fs.get(p)
    if (!e) { c.err(`${c.argv0}: .: ${a[1]}: not found\n`); return 2 }
    return yield* runScript(e.data, c, true)
  },
  source: (a, c) => builtins['.'](a, c),
  command: function* (a, c) {
    if (a[1] !== '-v') return yield* exec(a.slice(1), c)
    if (builtins[a[2]]) { c.out(a[2] + '\n'); return 0 }
    const f = findExe(a[2] ?? '', c)
    if (!f) return 1
    c.out(f.path + '\n'); return 0
  },
}
