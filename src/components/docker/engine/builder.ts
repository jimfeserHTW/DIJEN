// `docker build`: parses a Dockerfile and really executes it against the in-memory file system, with a layer cache.
import { DockerError, hash, normRef, type Daemon, type Image, type Layer } from './daemon.ts'
import { ExitEx, exec, newProcState, type Ctx, type Gen } from './shell.ts'
import { liveBlock, note as noteLine, pause, pullMs } from './util.ts'
import { Fs, FsError, baseOf, dirEntry, newTree, normPath, plant, type Tree } from './fs.ts'
import { emptyConfig, type Health, type ImageConfig } from './images.ts'

export type Ins = { op: string; raw: string; args: string; flags: Record<string, string>; line: number; end: number }
export type BuildOpts = { context: string; file: string; tag?: string[]; args?: Record<string, string>; target?: string; noCache?: boolean; pull?: boolean; quiet?: boolean; trace?: BuildStep[] }
/** What a build did, with how long each step takes. */
export type BuildStep = { text: string; ms: number }

const KNOWN = new Set(['FROM', 'RUN', 'CMD', 'LABEL', 'MAINTAINER', 'EXPOSE', 'ENV', 'ADD', 'COPY', 'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK', 'SHELL'])
const DEFAULT_ARGS = new Set(['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy'])

class BuildError extends Error {
  ins: Ins | null; logs: string
  constructor(m: string, ins: Ins | null = null, logs = '') { super(m); this.ins = ins; this.logs = logs }
}

export function parseDockerfile(text: string): Ins[] {
  const out: Ins[] = [], lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const first = lines[i].trim()
    if (!first || first.startsWith('#')) continue
    const start = i
    let buf = ''
    for (; i < lines.length; i++) {
      const l = lines[i].trim()
      if (i > start && (l.startsWith('#') || !l)) continue
      if (!l.endsWith('\\')) { buf += l; break }
      buf += l.slice(0, -1).trimEnd() + ' '
    }
    const m = buf.match(/^(\S+)\s*([\s\S]*)$/)!
    const op = m[1].toUpperCase()
    if (!KNOWN.has(op)) throw new BuildError(`dockerfile parse error on line ${start + 1}: unknown instruction: ${m[1]}`, { op, raw: buf, args: '', flags: {}, line: start + 1, end: i + 1 })
    let args = m[2]
    const flags: Record<string, string> = {}
    if (['FROM', 'COPY', 'ADD', 'HEALTHCHECK', 'RUN'].includes(op)) for (let f = args.match(/^--([a-z-]+)(?:=(\S*))?\s*/); f; f = args.match(/^--([a-z-]+)(?:=(\S*))?\s*/)) { flags[f[1]] = f[2] ?? ''; args = args.slice(f[0].length) }
    out.push({ op, raw: buf, args, flags, line: start + 1, end: Math.min(i, lines.length - 1) + 1 })
  }
  return out
}
function subst(s: string, vars: Map<string, string>) {
  return s.replace(/\\\$/g, '\0').replace(/\$(?:\{([A-Za-z_]\w*)(?::?([-+])([^}]*))?\}|([A-Za-z_]\w*))/g, (_, a, op, def, b) => {
    const v = vars.get(a ?? b)
    return op === '-' ? v || def : op === '+' ? (v ? def : '') : v ?? ''
  }).replace(/\0/g, '$')
}
const jsonArr = (s: string): string[] | null => { try { const a = JSON.parse(s); return Array.isArray(a) && a.every(x => typeof x === 'string') ? a : null } catch { return null } }
/** KEY=VALUE pairs with quotes; the old `KEY value` form as a fallback. */
function pairs(s: string, i: Ins) {
  const out: [string, string][] = []
  if (!/^\S+=/.test(s)) { const m = s.match(/^(\S+)\s+([\s\S]+)$/); if (!m) throw new BuildError(`${i.op} must have two arguments`, i); return [[m[1], m[2]]] as [string, string][] }
  for (const m of s.matchAll(/([^\s=]+)=("(?:[^"\\]|\\.)*"|'[^']*'|\S*)/g)) out.push([m[1], m[2].replace(/^(["'])([\s\S]*)\1$/, '$2').replace(/\\"/g, '"')])
  return out
}
export const parseDuration = (s: string) => {
  let ms = 0
  for (const m of s.matchAll(/(\d*\.?\d+)(ms|s|m|h)/g)) ms += Number(m[1]) * { ms: 1, s: 1000, m: 60000, h: 3600000 }[m[2] as 'ms']!
  return ms
}
export const HEALTH_DEFAULTS = { interval: 30000, timeout: 30000, retries: 3, startPeriod: 0 }

type Stage = { name: string; tree: Tree; config: ImageConfig; layers: Layer[]; key: string; vars: Map<string, string> }

export function build(d: Daemon, o: BuildOpts, print: (s: string) => void): Image {
  const started = d.clock()
  const steps: string[] = []
  const note = (s: string, ms = 40) => { steps.push(` => ${s}`); o.trace?.push({ text: ` => ${s}`, ms }) }
  const secs = () => ((d.clock() - started) / 1000 + 0.2).toFixed(1)
  const dfPath = normPath(o.file, normPath(o.context, '/home/user/sandbox'))
  const ctxPath = normPath(o.context, '/home/user/sandbox')
  let text = ''
  const fail = (e: BuildError) => {
    print(`[+] Building ${secs()}s (${steps.length}/${steps.length + 1}) FINISHED\n${steps.join('\n')}${steps.length ? '\n' : ''}`)
    if (e.ins && ['RUN', 'COPY', 'ADD'].includes(e.ins.op)) note(`ERROR ${e.ins.raw}`, 0)
    if (e.logs) print(e.logs.split('\n').filter(Boolean).map(l => `#0 0.100 ${l}\n`).join(''))
    let snippet = ''
    if (e.ins) {
      const src = text.split('\n'), from = Math.max(e.ins.line - 2, 0), to = Math.min(e.ins.end + 1, src.length)
      const body = src.slice(from, to).map((l, k) => { const n = from + k + 1; return `${n >= e.ins!.line && n <= e.ins!.end ? '>>>' : '   '} ${String(n).padStart(3)} | ${l}` })
      snippet = `Dockerfile:${e.ins.line}\n${'-'.repeat(20)}\n${body.join('\n')}\n${'-'.repeat(20)}\n`
    }
    return new DockerError(`${snippet}ERROR: failed to solve: ${e.message}`)
  }
  try {
    const f = d.hostFs.get(dfPath)
    if (!d.hostFs.get(ctxPath)) throw new BuildError(`unable to prepare context: path "${o.context}" not found`)
    if (f?.kind !== 'file') throw new BuildError(`failed to read dockerfile: open ${baseOf(dfPath)}: no such file or directory`)
    text = f.data
    note(`[internal] load build definition from ${baseOf(dfPath)}`)
    note(`=> transferring dockerfile: ${text.length}B`)
    const ins = parseDockerfile(text)
    if (!ins.length) throw new BuildError('the Dockerfile cannot be empty')
    const firstReal = ins.find(i => i.op !== 'ARG')
    if (firstReal?.op !== 'FROM') throw new BuildError('no build stage in current context', firstReal)
    note('[internal] load .dockerignore')

    // what the daemon may read: the context minus .dockerignore
    const ignoreText = d.hostFs.get(`${ctxPath}/.dockerignore`)?.data ?? ''
    const rules = ignoreText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => ({ neg: l.startsWith('!'), re: new RegExp('^' + l.replace(/^!/, '').replace(/^\/|\/$/g, '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\0').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\0/g, '.*') + '(/.*)?$') }))
    const context = newTree()
    for (const [rel, e] of d.hostFs.walk(ctxPath)) {
      if (!rel) continue
      let skip = false
      for (const r of rules) if (r.re.test(rel)) skip = !r.neg
      if (!skip) plant(context, rel, e)
    }
    const ctxFs = new Fs(context)
    let contextNoted = false

    const metaArgs = new Map<string, string>()
    const given = new Map(Object.entries(o.args ?? {}))
    const used = new Set<string>()
    for (const i of ins) {
      if (i.op === 'FROM') break
      const [k, ...v] = i.args.split('=')
      metaArgs.set(k, given.get(k) ?? v.join('='))
      used.add(k)
    }
    const froms = ins.filter(i => i.op === 'FROM')
    const stageRefs = froms.map(i => subst(i.args, metaArgs).split(/\s+/))
    froms.forEach((i, k) => {
      const w = stageRefs[k]
      if (!w[0] || (w.length !== 1 && (w.length !== 3 || w[1].toUpperCase() !== 'AS'))) throw new BuildError(`dockerfile parse error on line ${i.line}: FROM requires either one or three arguments`, i)
      if (w[0] === '' || /\$/.test(i.args) && !w[0]) throw new BuildError('base name should not be blank', i)
    })
    const names = stageRefs.map(w => w[2]?.toLowerCase())
    if (o.target && !names.includes(o.target.toLowerCase())) throw new BuildError(`target stage "${o.target}" could not be found`)
    const lastIdx = o.target ? names.indexOf(o.target.toLowerCase()) : froms.length - 1

    // only the stages the target really depends on get built, like BuildKit does
    const needed = new Set<number>([lastIdx])
    const stageIns = (k: number) => ins.slice(ins.indexOf(froms[k]) + 1, froms[k + 1] ? ins.indexOf(froms[k + 1]) : undefined)
    const stageOf = (ref: string) => /^\d+$/.test(ref) ? Number(ref) : names.indexOf(ref.toLowerCase())
    for (let k = lastIdx; k >= 0; k--) {
      if (!needed.has(k)) continue
      const base = stageOf(stageRefs[k][0])
      if (base >= 0 && base < k) needed.add(base)
      for (const i of stageIns(k)) if (i.flags.from !== undefined) { const s = stageOf(i.flags.from); if (s >= 0 && s < k) needed.add(s) }
    }
    const total = [...needed].reduce((a, k) => a + 1 + stageIns(k).filter(i => ['RUN', 'COPY', 'ADD', 'WORKDIR'].includes(i.op)).length, 0)
    let stepNo = 0
    const label = () => `[${++stepNo}/${total}]`
    const stages: (Stage | null)[] = []

    for (let k = 0; k <= lastIdx; k++) {
      if (!needed.has(k)) { stages.push(null); continue }
      const from = froms[k], ref = stageRefs[k][0]
      let st: Stage, pulled = 60
      const prev = stageOf(ref)
      if (ref.toLowerCase() === 'scratch') st = { name: names[k] ?? '', tree: newTree(), config: { ...emptyConfig(), Cmd: null }, layers: [], key: 'scratch', vars: new Map() }
      else if (prev >= 0 && prev < k && stages[prev]) { const s = stages[prev]!; st = { ...s, name: names[k] ?? '', tree: new Map(s.tree), config: structuredClone(s.config), layers: [...s.layers], vars: new Map() } }
      else {
        let img = o.pull ? undefined : d.findImage(ref)
        note(`[internal] load metadata for docker.io/library/${ref.includes(':') ? ref : ref + ':latest'}`, 350)
        if (!img) {
          try { img = d.pull(ref); pulled = pullMs(img.size) } catch (e) {
            if (!(e instanceof DockerError)) throw e
            throw new BuildError(`${ref}: failed to resolve source metadata for docker.io/library/${normRef(ref)}: ${e.message}`, from)
          }
        }
        st = { name: names[k] ?? '', tree: new Map(img.tree), config: structuredClone(img.config), layers: [...img.layers], key: img.id, vars: new Map() }
      }
      note(`${label()} FROM ${ref}${names[k] ? ` AS ${names[k]}` : ''}`, pulled)
      const envOf = () => new Map([...st.vars, ...st.config.Env.map(e => { const n = e.indexOf('='); return [e.slice(0, n), e.slice(n + 1)] as [string, string] })])
      const cwd = () => st.config.WorkingDir || '/'
      const setEnv = (key: string, val: string) => { st.config.Env = [...st.config.Env.filter(e => !e.startsWith(key + '=')), `${key}=${val}`] }
      /** One layer: reuse it from the cache or compute it. */
      const layer = (i: Ins, title: string, salt: string, change: (fs: Fs) => void, keep = true) => {
        let stepMs = i.op === 'RUN' ? 150 : 80
        const key = hash(`${st.key}|${i.raw}|${salt}|${[...st.vars].join()}`)
        const hit = !o.noCache ? d.buildCache.get(key) : undefined
        if (hit) { st.tree = new Map(hit.tree); st.config = structuredClone(hit.config); if (hit.layer) st.layers = [...st.layers, hit.layer]; note(`CACHED ${title}`, 0) }
        else {
          const base = new Map(st.tree), fs = new Fs(st.tree)
          d.lastDrive = 0
          change(fs)
          stepMs += d.lastDrive
          let size = 0
          for (const [p, e] of st.tree) if (base.get(p) !== e) size += e.data.length
          const l: Layer | null = keep ? { id: hash(`layer/${key}`), createdBy: i.raw, size, created: d.clock() } : null
          if (l) st.layers = [...st.layers, l]
          d.buildCache.set(key, { tree: new Map(st.tree), config: structuredClone(st.config), layer: l })
          note(title, stepMs)
        }
        st.key = key
      }
      for (const i of stageIns(k)) {
        const vars = envOf(), arg = ['RUN', 'CMD', 'ENTRYPOINT', 'HEALTHCHECK', 'SHELL', 'ONBUILD'].includes(i.op) ? i.args : subst(i.args, vars)
        const req = (ok: unknown, m: string) => { if (!ok) throw new BuildError(m, i) }
        const meta = (fn: () => void) => { fn(); st.key = hash(`${st.key}|${i.raw}`) }
        switch (i.op) {
          case 'ARG': {
            req(arg, `dockerfile parse error on line ${i.line}: ARG requires exactly one argument`)
            const [n, ...v] = arg.split('='), val = given.get(n) ?? (v.length ? v.join('=') : metaArgs.get(n))
            used.add(n)
            if (val !== undefined) st.vars.set(n, val)
            break
          }
          case 'ENV': req(arg, `dockerfile parse error on line ${i.line}: ENV must have two arguments`); meta(() => { for (const [a, b] of pairs(arg, i)) setEnv(a, b) }); break
          case 'LABEL': req(arg, `dockerfile parse error on line ${i.line}: LABEL requires at least one argument`); meta(() => { for (const [a, b] of pairs(arg, i)) st.config.Labels[a] = b }); break
          case 'MAINTAINER': meta(() => { st.config.Labels.maintainer = arg }); break
          case 'EXPOSE': {
            req(arg, `dockerfile parse error on line ${i.line}: EXPOSE requires at least one argument`)
            for (const p of arg.split(/\s+/)) req(/^\d+(-\d+)?(\/(tcp|udp|sctp))?$/.test(p), `invalid containerPort: ${p}`)
            meta(() => { for (const p of arg.split(/\s+/)) { const v = p.includes('/') ? p : `${p}/tcp`; if (!st.config.ExposedPorts.includes(v)) st.config.ExposedPorts = [...st.config.ExposedPorts, v] } })
            break
          }
          case 'USER': req(arg, `dockerfile parse error on line ${i.line}: USER requires exactly one argument`); meta(() => { st.config.User = arg }); break
          case 'STOPSIGNAL': meta(() => { st.config.StopSignal = arg }); break
          case 'VOLUME': meta(() => { st.config.Volumes = [...st.config.Volumes, ...(jsonArr(arg) ?? arg.split(/\s+/))] }); break
          case 'SHELL': { const a = jsonArr(arg); req(a?.length, 'SHELL requires the arguments to be in JSON form'); meta(() => { st.config.Shell = a! }); break }
          case 'ONBUILD': break
          case 'CMD': case 'ENTRYPOINT': {
            const v = jsonArr(arg) ?? [...st.config.Shell, arg]
            meta(() => { if (i.op === 'CMD') st.config.Cmd = v; else { st.config.Entrypoint = v; st.config.Cmd = null } })
            break
          }
          case 'HEALTHCHECK': {
            if (/^NONE$/i.test(arg)) { meta(() => { st.config.Healthcheck = { ...HEALTH_DEFAULTS, test: ['NONE'] } }); break }
            const m = arg.match(/^CMD\s+([\s\S]+)$/i)
            req(m, `dockerfile parse error on line ${i.line}: Unknown type "${arg.split(' ')[0]}" in HEALTHCHECK (try CMD)`)
            const a = jsonArr(m![1]), h: Health = {
              test: a ? ['CMD', ...a] : ['CMD-SHELL', m![1]], interval: parseDuration(i.flags.interval ?? '') || HEALTH_DEFAULTS.interval,
              timeout: parseDuration(i.flags.timeout ?? '') || HEALTH_DEFAULTS.timeout, retries: Number(i.flags.retries ?? HEALTH_DEFAULTS.retries), startPeriod: parseDuration(i.flags['start-period'] ?? ''),
            }
            meta(() => { st.config.Healthcheck = h })
            break
          }
          case 'WORKDIR': {
            req(arg, `dockerfile parse error on line ${i.line}: WORKDIR requires exactly one argument`)
            const to = normPath(arg, cwd())
            layer(i, `${label()} WORKDIR ${arg}`, '', () => { if (!st.tree.has(to)) plant(st.tree, to, dirEntry()) })
            st.config.WorkingDir = to
            break
          }
          case 'COPY': case 'ADD': {
            const a = jsonArr(arg) ?? arg.split(/\s+/).filter(Boolean)
            req(a.length >= 2, `dockerfile parse error on line ${i.line}: ${i.op} requires at least two arguments, but only one was provided. Destination could not be determined`)
            const dest = a[a.length - 1], srcs = a.slice(0, -1)
            let src = ctxFs
            let srcName = 'context'
            if (i.flags.from !== undefined) {
              const s = stageOf(i.flags.from)
              if (s >= 0 && s < k && stages[s]) { src = new Fs(stages[s]!.tree); srcName = `stage-${s}` }
              else {
                req(s < 0 || s >= k ? !(s >= k) : true, `invalid from flag value ${i.flags.from}: invalid reference format`)
                const img = d.findImage(i.flags.from) ?? (() => { try { return d.pull(i.flags.from) } catch (e) { throw new BuildError(`${i.flags.from}: failed to resolve source metadata: ${(e as Error).message}`, i) } })()
                src = new Fs(img.tree); srcName = img.id
              }
            } else if (!contextNoted) { note('[internal] load build context'); note(`=> transferring context: ${[...context.values()].reduce((n, e) => n + e.data.length, 0)}B`); contextNoted = true }
            const matches: string[] = []
            for (const s of srcs) {
              req(!/^https?:\/\//.test(s) || i.op === 'ADD', 'source can\'t be a URL for COPY')
              req(!/^https?:\/\//.test(s), `failed to load ${s}: remote ADD is not available in this simulation`)
              const p = normPath(s)
              if (/[*?]/.test(s)) {
                const re = new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$')
                const hit = [...src.root.keys()].filter(x => re.test(x))
                req(hit.length, `failed to compute cache key: failed to calculate checksum of ref: "${p}": not found`)
                matches.push(...hit)
              } else { req(src.get(p), `failed to compute cache key: failed to calculate checksum of ref: "${p}": not found`); matches.push(p) }
            }
            const toDir = dest.endsWith('/')
            req(matches.length === 1 || toDir, `When using ${i.op} with more than one source file, the destination must be a directory and end with a /`)
            const target = normPath(dest, cwd())
            const sum = hash(matches.map(m => src.walk(m).map(([r, e]) => `${r}:${e.mode}:${e.data}`).join('|')).join('||') + srcName)
            let uid = 0
            if (i.flags.chown) {
              const who = i.flags.chown.split(':')[0], row = (st.tree.get('/etc/passwd')?.data ?? '').split('\n').map(l => l.split(':')).find(r => r[0] === who || r[2] === who)
              req(row || /^\d+$/.test(who), `failed to copy files: unable to convert uid/gid chown string to host mapping: can't find uid for user ${who}: no such user: ${who}`)
              uid = Number(row?.[2] ?? who)
            }
            const mode = i.flags.chmod ? parseInt(i.flags.chmod, 8) : null
            layer(i, `${label()} ${i.op} ${a.join(' ')}`, sum, () => {
              for (const m of matches) {
                const isDir = src.get(m)!.kind === 'dir'
                const base = isDir ? target : toDir || st.tree.get(target)?.kind === 'dir' ? `${target}/${baseOf(m)}` : target
                for (const [rel, e] of src.walk(m)) plant(st.tree, rel ? `${base}/${rel}` : base, { ...e, uid, mode: mode !== null && e.kind === 'file' ? mode : e.mode })
              }
            })
            break
          }
          case 'RUN': {
            req(arg, `dockerfile parse error on line ${i.line}: RUN requires at least one argument`)
            const argv = jsonArr(arg) ?? [...st.config.Shell, arg]
            const shown = jsonArr(arg) ? arg : `${st.config.Shell.join(' ')} ${arg}`
            layer(i, `${label()} RUN ${arg}`, '', fs => {
              let logs = ''
              const add = (s: string) => { logs += s }
              const user = st.config.User.split(':')[0]
              const row = (st.tree.get('/etc/passwd')?.data ?? '').split('\n').map(l => l.split(':')).find(r => r[0] === user || r[2] === user)
              if (user && !row) throw new BuildError(`unable to find user ${user}: no matching entries in passwd file`, i)
              const c: Ctx = {
                fs, env: vars, cwd: cwd(), uid: Number(row?.[2] ?? 0), user: row?.[0] ?? 'root', hostname: 'buildkitsandbox', host: i.flags.network === 'none' ? { ...d.machine(), resolve: () => null } : d.machine(),
                p: newProcState(), out: add, err: add, stdin: null, tty: false, last: 0, args: [], argv0: st.config.Shell[0] ?? 'sh', traps: new Map(), errexit: false, quiet: 0, depth: 0,
              }
              if (!c.fs.get(c.cwd)) plant(st.tree, c.cwd, dirEntry())
              if (!st.tree.has(argv[0]) && argv[0].startsWith('/')) throw new BuildError(`process "${shown}" did not complete successfully: failed to create shim task: exec: "${argv[0]}": stat ${argv[0]}: no such file or directory`, i)
              let code: number | null
              try { code = d.drive(exec(argv, c), 600000) } catch (e) { if (e instanceof FsError) { logs += e.message + '\n'; code = 1 } else throw e }
              if (code === null) throw new BuildError(`process "${shown}" did not finish: it would block forever`, i, logs)
              if (code) throw new BuildError(`process "${shown}" did not complete successfully: exit code: ${code}`, i, logs)
              if (logs.trim()) for (const l of logs.trimEnd().split('\n')) steps.push(`    ${l}`)
            })
            break
          }
        }
      }
      stages.push(st)
    }

    const unused = [...given.keys()].filter(k => !used.has(k) && !DEFAULT_ARGS.has(k))
    const st = stages[lastIdx]!
    const img = d.addImage(st.tree, st.config, st.layers)
    note('exporting to image', 120)
    note(`=> writing image sha256:${img.id}`, 60)
    for (const t of o.tag ?? []) { d.tag(t, img.id); note(`=> naming to docker.io/library/${normRef(t)}`) }
    d.event('image', 'build', img.id.slice(0, 12))
    if (!o.quiet) print(`[+] Building ${secs()}s (${stepNo + 3}/${stepNo + 3}) FINISHED\n${steps.join('\n')}\n`)
    if (unused.length) print(`[Warning] One or more build-args [${unused.join(' ')}] were not consumed\n`)
    return img
  } catch (e) {
    if (e instanceof BuildError) throw fail(e)
    if (e instanceof DockerError) throw fail(new BuildError(e.message))
    throw e
  }
}

/** build() as the user experiences it: steps take their time, the display updates, Ctrl+C leaves nothing behind. */
export function* buildPaced(d: Daemon, x: Ctx, o: BuildOpts): Gen<Image> {
  const trace: BuildStep[] = [], images = new Set(d.images.keys()), tags = new Map(d.tags), cached = new Set(d.buildCache.keys())
  let after = '', img: Image | undefined, failure: unknown
  try { img = build(d, { ...o, trace }, s => { if (!s.startsWith('[+] Building')) after += s }) } catch (e) { failure = e }
  const block = liveBlock(x), start = d.clock(), top = trace.filter(s => !s.text.startsWith(' => =>')).length
  const render = (shown: number, spent: number[], done: boolean) => {
    const rows = trace.slice(0, shown).map((s, i) => `${s.text}${i < spent.length ? `  ${(spent[i] / 1000).toFixed(1)}s` : ''}`)
    const count = trace.slice(0, spent.length).filter(s => !s.text.startsWith(' => =>')).length
    return `[+] Building ${((d.clock() - start) / 1000).toFixed(1)}s (${count}/${top})${done ? ' FINISHED' : ''}\n${rows.join('\n')}\n`
  }
  const spent: number[] = []
  try {
    for (let i = 0; i < trace.length; i++) {
      const from = d.clock()
      for (let left = trace[i].ms; left > 0; left -= 100) { if (!o.quiet) block.draw(render(i + 1, spent, false)); yield* pause(x, Math.min(left, 100)) }
      spent.push(d.clock() - from)
    }
  } catch (e) {
    if (!(e instanceof ExitEx)) throw e
    for (const id of d.images.keys()) if (!images.has(id)) d.images.delete(id)
    d.tags.clear(); for (const [k, v] of tags) d.tags.set(k, v)
    for (const k of d.buildCache.keys()) if (!cached.has(k)) d.buildCache.delete(k) // steps the user never saw finish
    if (!o.quiet) block.end(render(spent.length, spent, false))
    noteLine(x, 'ERROR: failed to solve: Canceled: context canceled\n')
    throw e
  }
  if (!o.quiet) block.end(render(trace.length, spent, true))
  if (after) noteLine(x, after)
  if (failure) throw failure
  return img!
}
