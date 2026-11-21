// The executables found in simulated images. Real tools are reduced to the options people actually type.
// Servers and their clients live in servers.ts.
import { baseOf, dirOf, normPath } from './fs.ts'
import { ExitEx, NetError, findExe, programs, runFile, runScript, type Ctx, type Gen, type HttpRes } from './shell.ts'

const p = (c: Ctx, s: string) => normPath(s, c.cwd)
/** Split argv into single-letter flags and operands (`-la` -> l, a). */
function opts(a: string[], withValue = '') {
  const f = new Map<string, string>(), rest: string[] = []
  for (let i = 1; i < a.length; i++) {
    const s = a[i]
    if (s === '--') { rest.push(...a.slice(i + 1)); break }
    if (s.startsWith('--')) { const [k, v] = s.slice(2).split('='); f.set(k, v ?? ''); continue }
    if (s.length < 2 || s[0] !== '-') { rest.push(s); continue }
    for (let k = 1; k < s.length; k++) {
      if (!withValue.includes(s[k])) { f.set(s[k], ''); continue }
      f.set(s[k], s.slice(k + 1) || a[++i] || ''); break
    }
  }
  return { f, rest }
}
/** Sleep that Ctrl+C can interrupt. */
export function* nap(c: Ctx, ms: number): Gen<void> {
  yield ms
  if (c.p.signal === 'INT') { c.p.signal = null; throw new ExitEx(130) }
}
/** `-n 5` or the classic `-5`. */
const lineCount = (a: string[], f: Map<string, string>) => Number(f.get('n') ?? a.find(s => /^-\d+$/.test(s))?.slice(1) ?? 10)
const inputs = (files: string[], c: Ctx, name: string, each: (text: string, file: string) => void) => {
  let code = 0
  if (!files.length) { each(c.stdin ?? '', '-'); return 0 }
  for (const f of files) {
    if (f === '-') { each(c.stdin ?? '', '-'); continue }
    const e = c.fs.get(p(c, f))
    if (!e) { c.err(`${name}: ${f}: No such file or directory\n`); code = 1 }
    else if (e.kind === 'dir') { c.err(`${name}: ${f}: Is a directory\n`); code = 1 }
    else each(e.data, f)
  }
  return code
}
const linesOf = (s: string) => { const l = s.split('\n'); if (l[l.length - 1] === '') l.pop(); return l }
const owner = (c: Ctx, uid: number) => (c.fs.get('/etc/passwd')?.data ?? '').split('\n').map(l => l.split(':')).find(r => Number(r[2]) === uid)?.[0] ?? String(uid)
const modeStr = (kind: string, m: number) => (kind === 'dir' ? 'd' : '-') + [6, 3, 0].map(s => { const b = (m >> s) & 7; return (b & 4 ? 'r' : '-') + (b & 2 ? 'w' : '-') + (b & 1 ? 'x' : '-') }).join('')
const pkgOk = (c: Ctx, tool: string): boolean => {
  if (c.host.resolve(c, 'registry.internet')) return true
  c.err(`${tool}: network is unreachable\n`)
  return false
}
const stub = (c: Ctx, name: string) => { c.fs.mkdir('/usr/bin', 0, true); c.fs.write(`/usr/bin/${name}`, `\0bin:${programs[name] ? name : 'true'}`, 0, false, 0o755); c.fs.patch(`/usr/bin/${name}`, { mode: 0o755 }) }
// shortcut: package names are only checked against this list; extend it when lessons need more packages
const PACKAGES = new Set(['curl', 'wget', 'bash', 'git', 'vim', 'nano', 'jq', 'less', 'tar', 'gzip', 'zip', 'unzip', 'make', 'gcc', 'g++', 'python3', 'nodejs', 'npm', 'openssl', 'ca-certificates', 'tzdata', 'htop', 'iputils-ping', 'net-tools', 'dnsutils', 'build-base', 'libc-dev', 'musl-dev', 'procps'])

type Url = { host: string; port: number; path: string; https: boolean }
function parseUrl(s: string): Url | null {
  const m = s.match(/^(?:(https?):\/\/)?([^/:?#\s]+)(?::(\d+))?([/?][^#\s]*)?/i)
  if (!m) return null
  const https = m[1]?.toLowerCase() === 'https'
  return { host: m[2], port: Number(m[3] ?? (https ? 443 : 80)), path: m[4]?.startsWith('/') ? m[4] : `/${m[4] ?? ''}`, https }
}
const REASON: Record<number, string> = { 200: 'OK', 403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error' }

Object.assign(programs, {
  sh: shell, bash: shell, ash: shell, dash: shell,
  cat: (a: string[], c: Ctx) => { const { rest } = opts(a); return inputs(rest, c, 'cat', t => c.out(t)) },
  ls: (a: string[], c: Ctx) => {
    const { f, rest } = opts(a), targets = rest.length ? rest : ['.']
    let code = 0
    const row = (path: string, name: string) => {
      if (!f.has('l')) return name
      const e = c.fs.need(path), d = new Date(c.host.now()).toUTCString().slice(5, 22)
      return `${modeStr(e.kind, e.mode)} 1 ${owner(c, e.uid).padEnd(8)} ${owner(c, e.uid).padEnd(8)} ${String(e.data.length).padStart(8)} ${d} ${name}`
    }
    for (const t of targets) {
      const path = p(c, t), e = c.fs.get(path)
      if (!e) { c.err(`ls: ${t}: No such file or directory\n`); code = 2; continue }
      if (targets.length > 1 && e.kind === 'dir') c.out(`${t}:\n`)
      if (e.kind === 'file' || f.has('d')) { c.out(row(path, t) + '\n'); continue }
      const names = c.fs.list(path).filter(n => f.has('a') || f.has('A') || n[0] !== '.')
      if (f.has('a')) names.unshift('.', '..')
      for (const n of names) c.out(row(n === '.' || n === '..' ? path : `${path}/${n}`, n) + '\n')
    }
    return code
  },
  mkdir: (a: string[], c: Ctx) => { const { f, rest } = opts(a, 'm'); if (!rest.length) { c.err('mkdir: missing operand\n'); return 1 } rest.forEach(d => c.fs.mkdir(p(c, d), c.uid, f.has('p'))); return 0 },
  rmdir: (a: string[], c: Ctx) => { for (const d of a.slice(1)) { if (c.fs.list(p(c, d)).length) { c.err(`rmdir: ${d}: Directory not empty\n`); return 1 } c.fs.remove(p(c, d), c.uid, true) } return 0 },
  touch: (a: string[], c: Ctx) => { for (const t of opts(a).rest) if (!c.fs.get(p(c, t))) c.fs.write(p(c, t), '', c.uid); return 0 },
  rm: (a: string[], c: Ctx) => {
    const { f, rest } = opts(a), rec = f.has('r') || f.has('R') || f.has('recursive')
    let code = 0
    for (const t of rest) {
      if (!c.fs.get(p(c, t))) { if (!f.has('f')) { c.err(`rm: can't remove '${t}': No such file or directory\n`); code = 1 } continue }
      c.fs.remove(p(c, t), c.uid, rec)
    }
    return code
  },
  cp: (a: string[], c: Ctx) => copy(a, c, false),
  mv: (a: string[], c: Ctx) => copy(a, c, true),
  chmod: (a: string[], c: Ctx) => {
    const { rest } = opts(a), [m, ...files] = rest
    for (const t of files) {
      const path = p(c, t), e = c.fs.need(path)
      let mode = e.mode
      if (/^[0-7]+$/.test(m)) mode = parseInt(m, 8)
      else for (const part of m.split(',')) {
        const r = part.match(/^([ugoa]*)([+-=])([rwx]*)$/)
        if (!r) { c.err(`chmod: invalid mode '${m}'\n`); return 1 }
        const bits = (r[3].includes('r') ? 4 : 0) | (r[3].includes('w') ? 2 : 0) | (r[3].includes('x') ? 1 : 0), who = r[1] || 'a'
        const mask = (who.includes('u') || who.includes('a') ? bits << 6 : 0) | (who.includes('g') || who.includes('a') ? bits << 3 : 0) | (who.includes('o') || who.includes('a') ? bits : 0)
        mode = r[2] === '+' ? mode | mask : r[2] === '-' ? mode & ~mask : mask
      }
      c.fs.patch(path, { mode }, c.uid)
    }
    return 0
  },
  chown: (a: string[], c: Ctx) => {
    const { f, rest } = opts(a), [who, ...files] = rest, name = who.split(':')[0]
    const row = (c.fs.get('/etc/passwd')?.data ?? '').split('\n').map(l => l.split(':')).find(r => r[0] === name || r[2] === name)
    if (!row) { c.err(`chown: unknown user ${name}\n`); return 1 }
    if (c.uid !== 0) { c.err('chown: Operation not permitted\n'); return 1 }
    for (const t of files) for (const [rel] of f.has('R') ? c.fs.walk(p(c, t)) : [['']]) c.fs.patch(rel ? `${p(c, t)}/${rel}` : p(c, t), { uid: Number(row[2]) })
    return 0
  },
  env: function* (a: string[], c: Ctx): Gen {
    let i = 1
    const env = new Map(c.env)
    for (; a[i]?.includes('='); i++) { const k = a[i].indexOf('='); env.set(a[i].slice(0, k), a[i].slice(k + 1)) }
    if (a[i]) {
      const sub: Ctx = { ...c, env }, f = findExe(a[i], sub)
      if (!f) { c.err(`env: can't execute '${a[i]}': No such file or directory\n`); return 127 }
      return yield* runFile(f.path, f.e, a.slice(i), sub)
    }
    for (const [k, v] of env) c.out(`${k}=${v}\n`)
    return 0
  },
  printenv: (a: string[], c: Ctx) => {
    if (a[1]) { const v = c.env.get(a[1]); if (v === undefined) return 1; c.out(v + '\n'); return 0 }
    for (const [k, v] of c.env) c.out(`${k}=${v}\n`)
    return 0
  },
  whoami: (_: string[], c: Ctx) => { c.out(c.user + '\n'); return 0 },
  id: (_: string[], c: Ctx) => { c.out(`uid=${c.uid}(${c.user}) gid=${c.uid}(${c.user}) groups=${c.uid}(${c.user})\n`); return 0 },
  hostname: (_: string[], c: Ctx) => { c.out(c.hostname + '\n'); return 0 },
  uname: (a: string[], c: Ctx) => { c.out((a[1] === '-a' ? `Linux ${c.hostname} 6.10.0 #1 SMP x86_64 Linux` : a[1] === '-m' ? 'x86_64' : a[1] === '-r' ? '6.10.0' : 'Linux') + '\n'); return 0 },
  nproc: (_: string[], c: Ctx) => { c.out('4\n'); return 0 },
  sleep: function* (a: string[], c: Ctx): Gen {
    const s = a[1]
    if (s === 'infinity') { yield Infinity; return 0 }
    const m = s?.match(/^(\d*\.?\d+)([smhd]?)$/)
    if (!m) { c.err(`sleep: invalid number '${s ?? ''}'\n`); return 1 }
    yield* nap(c, Number(m[1]) * ({ '': 1, s: 1, m: 60, h: 3600, d: 86400 } as Record<string, number>)[m[2]] * 1000)
    return 0
  },
  date: (a: string[], c: Ctx) => {
    const d = new Date(c.host.now()), iso = d.toISOString(), fmt = a.find(x => x.startsWith('+'))
    if (!fmt) { c.out(d.toUTCString().replace('GMT', 'UTC') + '\n'); return 0 }
    const map: Record<string, string> = { Y: iso.slice(0, 4), m: iso.slice(5, 7), d: iso.slice(8, 10), H: iso.slice(11, 13), M: iso.slice(14, 16), S: iso.slice(17, 19), s: String(Math.floor(+d / 1000)), F: iso.slice(0, 10), T: iso.slice(11, 19), '%': '%' }
    c.out(fmt.slice(1).replace(/%(.)/g, (_, k) => map[k] ?? `%${k}`) + '\n')
    return 0
  },
  head: (a: string[], c: Ctx) => { const { f, rest } = opts(a, 'n'); return inputs(rest, c, 'head', t => { for (const l of linesOf(t).slice(0, lineCount(a, f))) c.out(l + '\n') }) },
  tail: (a: string[], c: Ctx) => { const { f, rest } = opts(a, 'n'); return inputs(rest, c, 'tail', t => { const n = lineCount(a, f); for (const l of n ? linesOf(t).slice(-n) : []) c.out(l + '\n') }) },
  wc: (a: string[], c: Ctx) => {
    const { f, rest } = opts(a)
    return inputs(rest, c, 'wc', (t, n) => {
      const nums = [f.has('l') && linesOf(t).length, f.has('w') && (t.trim() ? t.trim().split(/\s+/).length : 0), f.has('c') && t.length].filter(x => x !== false)
      c.out([...(nums.length ? nums : [linesOf(t).length, t.trim() ? t.trim().split(/\s+/).length : 0, t.length]), ...(n === '-' ? [] : [n])].join(' ') + '\n')
    })
  },
  grep: (a: string[], c: Ctx) => {
    const { f, rest } = opts(a, 'e'), pat = f.get('e') ?? rest.shift()
    if (pat === undefined) { c.err('Usage: grep PATTERN [FILE]...\n'); return 2 }
    let re: RegExp
    try { re = new RegExp(f.has('F') ? pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pat, f.has('i') ? 'i' : '') } catch { c.err(`grep: bad regex '${pat}'\n`); return 2 }
    let hits = 0
    const code = inputs(rest, c, 'grep', (t, n) => linesOf(t).forEach((l, i) => {
      if (re.test(l) === f.has('v')) return
      hits++
      if (!f.has('q') && !f.has('c')) c.out(`${rest.length > 1 ? n + ':' : ''}${f.has('n') ? i + 1 + ':' : ''}${l}\n`)
    }))
    if (f.has('c')) c.out(hits + '\n')
    return code || (hits ? 0 : 1)
  },
  sed: (a: string[], c: Ctx) => {
    const { f, rest } = opts(a, 'e'), expr = f.get('e') ?? rest.shift() ?? ''
    const d = expr[1], m = expr[0] === 's' && d ? expr.slice(2).split(d) : null
    if (!m || m.length < 2) { c.err(`sed: unsupported expression '${expr}' (only s/a/b/ is simulated)\n`); return 1 }
    const re = new RegExp(m[0], m[2]?.includes('g') ? 'g' : '')
    const edit = (t: string) => linesOf(t).map(l => l.replace(re, m[1].replace(/&/g, '$&')) + '\n').join('')
    return inputs(rest, c, 'sed', (t, n) => { if (f.has('i') && n !== '-') c.fs.write(p(c, n), edit(t), c.uid); else c.out(edit(t)) })
  },
  tee: (a: string[], c: Ctx) => { const { f, rest } = opts(a), t = c.stdin ?? ''; c.out(t); rest.forEach(n => c.fs.write(p(c, n), t, c.uid, f.has('a'))); return 0 },
  seq: (a: string[], c: Ctx) => {
    const n = a.slice(1).map(Number), [from, step, to] = n.length === 1 ? [1, 1, n[0]] : n.length === 2 ? [n[0], 1, n[1]] : n
    for (let i = from, k = 0; (step > 0 ? i <= to : i >= to) && k < 100000; i += step, k++) c.out(i + '\n')
    return 0
  },
  basename: (a: string[], c: Ctx) => { c.out(baseOf(a[1] ?? '').replace(new RegExp(`${(a[2] ?? '').replace(/\W/g, '\\$&')}$`), '') + '\n'); return 0 },
  dirname: (a: string[], c: Ctx) => { c.out((a[1]?.includes('/') ? dirOf(a[1]) : '.') + '\n'); return 0 },
  which: (a: string[], c: Ctx) => { const f = findExe(a[1] ?? '', c); if (!f) return 1; c.out(f.path + '\n'); return 0 },
  ps: (_: string[], c: Ctx) => { c.out('PID   USER     COMMAND\n'); for (const [pid, user, cmd] of c.host.ps(c)) c.out(`${pid.padEnd(5)} ${user.padEnd(8)} ${cmd}\n`); return 0 },
  kill: (a: string[], c: Ctx) => {
    const sig = (a.find(x => /^-[A-Z0-9]/.test(x))?.slice(1) ?? 'TERM').replace(/^SIG/, '').replace(/^9$/, 'KILL').replace(/^15$/, 'TERM')
    let code = 0
    for (const t of a.slice(1).filter(x => !x.startsWith('-'))) if (!c.host.kill(c, Number(t), sig)) { c.err(`kill: can't kill pid ${t}: No such process\n`); code = 1 }
    return code
  },
  curl: (raw: string[], c: Ctx) => {
    // long options that take a separate value
    const a = raw.filter((s, i) => !/^--(max-time|connect-timeout|retry|retry-delay)$/.test(s) && !/^--(max-time|connect-timeout|retry|retry-delay)$/.test(raw[i - 1] ?? ''))
    const { f, rest } = opts(a, 'oXdHwAmu'), fail = f.has('f') || f.has('fail') || f.has('fail-with-body')
    const silent = f.has('s') || f.has('silent'), showErr = !silent || f.has('S') || f.has('show-error')
    const u = rest[0] && parseUrl(rest[0])
    if (!u) { c.err('curl: try \'curl --help\' for more information\n'); return 2 }
    const die = (code: number, m: string) => { if (showErr) c.err(`curl: (${code}) ${m}\n`); return code }
    let r: HttpRes
    try { r = c.host.http(c, { method: f.get('X') ?? (f.has('I') ? 'HEAD' : f.has('d') ? 'POST' : 'GET'), host: u.host, port: u.port, path: u.path, agent: 'curl/8.7.1' }) }
    catch (e) {
      if (!(e instanceof NetError)) throw e
      if (e.kind === 'dns') return die(6, `Could not resolve host: ${u.host}`)
      if (e.kind === 'empty') return die(52, 'Empty reply from server')
      if (e.kind === 'timeout') return die(28, `Failed to connect to ${u.host} port ${u.port} after 3000 ms: Timeout was reached`)
      return die(7, `Failed to connect to ${u.host} port ${u.port} after 0 ms: Couldn't connect to server`)
    }
    if (fail && r.status >= 400) return die(22, `The requested URL returned error: ${r.status}`)
    const head = `HTTP/1.1 ${r.status} ${REASON[r.status] ?? ''}\r\nContent-Type: ${r.type}\r\nContent-Length: ${r.body.length}\r\n\r\n`
    if (f.has('I') || f.has('i')) c.out(head)
    if (f.has('I')) return 0
    if (f.has('o')) { if (f.get('o') !== '/dev/null') c.fs.write(p(c, f.get('o')!), r.body, c.uid) } else c.out(r.body)
    if (f.has('w')) c.out(f.get('w')!.replace(/%\{http_code\}/g, String(r.status)).replace(/\\n/g, '\n'))
    return 0
  },
  wget: (a: string[], c: Ctx) => {
    const { f, rest } = opts(a, 'OTt'), u = rest[0] && parseUrl(rest[0])
    if (!u) { c.err('wget: missing URL\n'); return 1 }
    const quiet = f.has('q') || f.has('quiet')
    let r: HttpRes
    try { r = c.host.http(c, { method: f.has('spider') ? 'HEAD' : 'GET', host: u.host, port: u.port, path: u.path, agent: 'Wget' }) }
    catch (e) {
      if (!(e instanceof NetError)) throw e
      c.err(e.kind === 'dns' ? `wget: bad address '${u.host}:${u.port}'\n` : e.kind === 'empty' ? 'wget: error getting response\n' : `wget: can't connect to remote host: Connection refused\n`)
      return e.kind === 'dns' ? 4 : 1
    }
    if (r.status >= 400) { c.err(`wget: server returned error: HTTP/1.1 ${r.status} ${REASON[r.status] ?? ''}\n`); return 8 }
    if (f.has('spider')) return 0
    const to = f.get('O') ?? (baseOf(u.path) === '/' ? 'index.html' : baseOf(u.path))
    if (to === '-') c.out(r.body); else c.fs.write(p(c, to), r.body, c.uid)
    if (!quiet && to !== '-') c.err(`saving to '${to}'\n`)
    return 0
  },
  ping: function* (a: string[], c: Ctx): Gen {
    const { f, rest } = opts(a, 'cWi'), host = rest[0]
    if (!host) { c.err('ping: usage error: Destination address required\n'); return 1 }
    const ip = c.host.resolve(c, host)
    if (!ip) { c.err(`ping: bad address '${host}'\n`); return 1 }
    const n = Number(f.get('c') ?? Infinity)
    c.out(`PING ${host} (${ip}): 56 data bytes\n`)
    for (let i = 0; i < n; i++) { c.out(`64 bytes from ${ip}: seq=${i} ttl=64 time=0.08 ms\n`); if (i + 1 < n) yield* nap(c, 1000) }
    c.out(`\n--- ${host} ping statistics ---\n${n} packets transmitted, ${n} packets received, 0% packet loss\n`)
    return 0
  },
  nslookup: (a: string[], c: Ctx) => {
    const ip = c.host.resolve(c, a[1] ?? '')
    if (!ip) { c.err(`** server can't find ${a[1]}: NXDOMAIN\n`); return 1 }
    c.out(`Server:\t\t127.0.0.11\nAddress:\t127.0.0.11:53\n\nName:\t${a[1]}\nAddress: ${ip}\n`)
    return 0
  },
  getent: (a: string[], c: Ctx) => { const ip = c.host.resolve(c, a[2] ?? ''); if (!ip) return 2; c.out(`${ip}  ${a[2]}\n`); return 0 },
  apk: function* (a: string[], c: Ctx): Gen {
    const { rest } = opts(a), [cmd, ...pkgs] = rest
    if (cmd === 'update' || cmd === 'upgrade') { c.out('OK: 25 distinct packages available\n'); return 0 }
    if (cmd !== 'add') { c.err(`apk: unsupported command '${cmd ?? ''}' in this simulation\n`); return 1 }
    if (c.uid) { c.err('ERROR: Unable to lock database: Permission denied\n'); return 99 }
    if (!pkgOk(c, 'apk')) return 1
    yield 1200
    const bad = pkgs.filter(x => !PACKAGES.has(x))
    if (bad.length) { c.err(`ERROR: unable to select packages:\n${bad.map(x => `  ${x} (no such package):\n    required by: world[${x}]\n`).join('')}`); return bad.length }
    pkgs.forEach((x, i) => { c.out(`(${i + 1}/${pkgs.length}) Installing ${x}\n`); stub(c, x) })
    c.out('OK: installed\n')
    return 0
  },
  'apt-get': apt, apt,
  npm: function* (a: string[], c: Ctx): Gen {
    const { rest, f } = opts(a), [cmd, script] = rest
    const pj = c.fs.get(p(c, 'package.json'))
    const noPkg = () => { c.err(`npm error code ENOENT\nnpm error path ${p(c, 'package.json')}\nnpm error enoent Could not read package.json\n`); return 254 }
    if (cmd === '-v' || f.has('v') || f.has('version')) { c.out('10.8.2\n'); return 0 }
    if (!pj) return noPkg()
    let json: { scripts?: Record<string, string>; dependencies?: Record<string, string> }
    try { json = JSON.parse(pj.data) } catch { c.err('npm error code EJSONPARSE\nnpm error JSON.parse Invalid package.json\n'); return 1 }
    if (cmd === 'install' || cmd === 'i' || cmd === 'ci') {
      if (cmd === 'ci' && !c.fs.get(p(c, 'package-lock.json'))) { c.err('npm error code EUSAGE\nnpm error The `npm ci` command can only install with an existing package-lock.json\n'); return 1 }
      if (!pkgOk(c, 'npm')) return 1
      yield 2500
      c.fs.mkdir(p(c, 'node_modules'), c.uid, true)
      c.fs.write(p(c, 'node_modules/.package-lock.json'), '{}\n', c.uid)
      c.out(`\nadded ${Object.keys(json.dependencies ?? {}).length} packages in 3s\n`)
      return 0
    }
    const name = cmd === 'run' ? script : cmd
    const line = json.scripts?.[name ?? '']
    if (!line) { c.err(`npm error Missing script: "${name ?? ''}"\n`); return 1 }
    c.out(`\n> ${name}\n> ${line}\n\n`)
    return yield* runScript(line, { ...c, env: new Map(c.env), traps: new Map(), depth: c.depth + 1 })
  },
  pip: pip, pip3: pip,
  docker: function* (a: string[], c: Ctx): Gen {
    if (!c.host.docker) { c.err(`${c.argv0}: docker: not found\n`); return 127 }
    return yield* c.host.docker(a.slice(1), c)
  },

  // ---- marker files ----
  '@print': (a: string[], c: Ctx) => { c.out(a[1].replace(/\\n/g, '\n')); return 0 },
})

function* shell(a: string[], c: Ctx): Gen {
  const sub: Ctx = { ...c, env: new Map(c.env), traps: c.depth ? new Map() : c.traps, errexit: false, quiet: 0, depth: c.depth + 1, argv0: a[0].startsWith('/') ? a[0] : `/bin/${a[0]}` }
  let i = 1
  for (; a[i]?.startsWith('-') && a[i] !== '-c' && !/^-\w*c$/.test(a[i]); i++) if (a[i].includes('e')) sub.errexit = true
  if (a[i] && /^-\w*c$/.test(a[i])) {
    if (a[i].includes('e')) sub.errexit = true
    if (a[i + 1] === undefined) { c.err(`${sub.argv0}: -c requires an argument\n`); return 2 }
    if (a[i + 2]) sub.argv0 = a[i + 2]
    sub.args = a.slice(i + 3)
    return yield* runScript(a[i + 1], sub)
  }
  if (a[i]) {
    const e = c.fs.get(p(c, a[i]))
    if (e?.kind !== 'file') { c.err(`${sub.argv0}: can't open '${a[i]}': No such file or directory\n`); return 127 }
    sub.args = a.slice(i + 1); sub.argv0 = a[i]
    return yield* runScript(e.data, sub)
  }
  if (c.stdin !== null) return yield* runScript(c.stdin, sub)
  if (!c.tty) return 0 // no terminal attached: the shell reads EOF and exits at once, just like the real thing
  c.p.waiting = true
  yield Infinity
  return c.p.exited ?? 0
}
function copy(a: string[], c: Ctx, move: boolean) {
  const { f, rest } = opts(a), name = move ? 'mv' : 'cp'
  if (rest.length < 2) { c.err(`${name}: missing destination\n`); return 1 }
  const to = rest.pop()!, target = p(c, to), isDir = c.fs.get(target)?.kind === 'dir'
  if (rest.length > 1 && !isDir) { c.err(`${name}: target '${to}' is not a directory\n`); return 1 }
  for (const s of rest) {
    const from = p(c, s), e = c.fs.get(from)
    if (!e) { c.err(`${name}: can't stat '${s}': No such file or directory\n`); return 1 }
    if (e.kind === 'dir' && !move && !(f.has('r') || f.has('R') || f.has('a'))) { c.err(`${name}: omitting directory '${s}'\n`); return 1 }
    c.fs.copyFrom(c.fs, from, isDir ? `${target}/${baseOf(from)}` : target, c.uid)
    if (move) c.fs.remove(from, c.uid, true)
  }
  return 0
}
function* apt(a: string[], c: Ctx): Gen {
  const { rest } = opts(a), [cmd, ...pkgs] = rest, mark = '/var/lib/apt/lists/ready'
  if (c.uid) { c.err('E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\n'); return 100 }
  if (cmd === 'update') { if (!pkgOk(c, 'apt-get')) return 100; yield 1800; c.fs.mkdir(dirOf(mark), 0, true); c.fs.write(mark, ''); c.out('Reading package lists...\n'); return 0 }
  if (cmd === 'clean' || cmd === 'upgrade') return 0
  if (cmd !== 'install') { c.err(`E: Invalid operation ${cmd ?? ''}\n`); return 100 }
  c.out('Reading package lists...\n')
  const bad = pkgs.find(x => !PACKAGES.has(x) || !c.fs.get(mark))
  if (bad) { c.err(`E: Unable to locate package ${bad}\n`); return 100 }
  yield 1500
  for (const x of pkgs) { c.out(`Setting up ${x} ...\n`); stub(c, x) }
  return 0
}
function* pip(a: string[], c: Ctx): Gen {
  const { f, rest } = opts(a, 'r')
  if (rest[0] !== 'install') { c.err(`ERROR: unknown command "${rest[0] ?? ''}"\n`); return 1 }
  const req = f.get('r')
  if (req && !c.fs.get(p(c, req))) { c.err(`ERROR: Could not open requirements file: [Errno 2] No such file or directory: '${req}'\n`); return 1 }
  if (!pkgOk(c, 'pip')) return 1
  yield 2000
  c.out('Successfully installed packages\n')
  return 0
}
