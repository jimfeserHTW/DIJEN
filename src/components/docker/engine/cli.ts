// The `docker` command and the terminal around it. The terminal is itself a shell process, so pipes,
// `&&` and `docker rm -f $(docker ps -aq)` work without any special handling.
import { HEALTH_DEFAULTS, buildPaced, parseDuration } from './builder.ts'
import { composeMain, parseEnvFile } from './compose.ts'
import { Daemon, DockerError, PROJECT_DIR, hash, normRef, parseRestart, parsePorts, type Container, type CreateOpts, type DockerEvent, type Image, type MountSpec, type Network, type Proc } from './daemon.ts'
import { FsError, baseOf, diffTrees, dirOf, fileEntry, normPath, plant } from './fs.ts'
import { CATALOG, baseTree, emptyConfig, type Health } from './images.ts'
import { newProcState, programs, runScript, splitWords, type Ctx, type Gen } from './shell.ts'
import { CliError, HelpRequest, LOG_FLAGS, ago, alive, bytesOf, followLogs, formatted, lines, liveBlock, liveSinks, logWindow, mib, needArgs, note, parseFlags, parseTime, pause, plainSinks, portsText, printLines, pullImage, pullMs, shortCmd, size, stamp, statusText, stopAll, table, template, topRows, waitUntil, type Flags, type Kind } from './util.ts'

export type Chunk = { text: string; err: boolean; live?: number }
/** Add new terminal output to a log. A live chunk replaces its earlier version, like a redrawn progress display. */
export function mergeChunks<T extends Chunk>(log: T[], out: T[]): T[] {
  const merged = [...log]
  next: for (const c of out) {
    if (c.live !== undefined) for (let i = merged.length - 1; i >= 0; i--) if (merged[i].live === c.live) { merged[i] = c; continue next }
    merged.push(c)
  }
  return merged
}
type Session = { ctr: Container; ctx: Ctx; main: boolean; proc: Proc | null; done: boolean; code: number }

const RUN_FLAGS: Record<string, Kind> = {
  'detach|d': 'b', 'interactive|i': 'b', 'tty|t': 'b', rm: 'b', name: 's', 'publish|p': 'm', 'publish-all|P': 'b', expose: 'm', 'env|e': 'm', 'env-file': 'm', 'volume|v': 'm', mount: 'm', tmpfs: 'm',
  network: 's', net: 's', 'network-alias': 'm', restart: 's', 'workdir|w': 's', 'user|u': 's', entrypoint: 's', 'hostname|h': 's', 'label|l': 'm', 'memory|m': 's', cpus: 's', 'read-only': 'b', init: 'b', privileged: 'b',
  pull: 's', platform: 's', 'stop-signal': 's', 'stop-timeout': 's', 'log-driver': 's', 'log-opt': 'm', 'health-cmd': 's', 'health-interval': 's', 'health-timeout': 's', 'health-retries': 's', 'health-start-period': 's', 'no-healthcheck': 'b',
  'add-host': 'm', link: 'm', dns: 'm', 'cap-add': 'm', 'cap-drop': 'm', 'security-opt': 'm', ulimit: 'm', 'sig-proxy': 'b', quiet: 'b',
}
const volSize = (t: Map<string, { data: string }>) => [...t.values()].reduce((n, e) => n + e.data.length, 0)
const writable = (c: Container, d: Daemon) => { const base = d.images.get(c.imageId)?.tree; return [...c.tree].reduce((n, [k, e]) => n + (base?.get(k) === e ? 0 : e.data.length), 0) }
const ctrRow = (c: Container, d: Daemon, full: boolean) => {
  const now = d.clock()
  return { Size: `${size(writable(c, d))} (virtual ${size(d.images.get(c.imageId)?.size ?? 0)})`, ID: full ? c.id : c.id.slice(0, 12), Image: c.image, Command: shortCmd(c, d, full), CreatedAt: new Date(c.created).toISOString(), RunningFor: ago(now - c.created), Ports: portsText(c), State: c.status, Status: statusText(c, now), Names: c.name, Labels: Object.entries(c.labels).map(([k, v]) => `${k}=${v}`).join(','), Mounts: c.mountSpecs.map(m => m.source).join(','), Networks: [...c.nets.keys()].join(',') }
}
const imgRow = (d: Daemon, i: Image, tag: string) => {
  const k = tag.lastIndexOf(':')
  return { ID: i.id.slice(0, 12), Repository: tag ? tag.slice(0, k) : '<none>', Tag: tag ? tag.slice(k + 1) : '<none>', CreatedSince: ago(d.clock() - i.created), CreatedAt: new Date(i.created).toISOString(), Size: size(i.size) }
}
function inspectCtr(c: Container, d: Daemon) {
  return {
    Id: c.id, Created: new Date(c.created).toISOString(), Path: d.argvOf(c)[0], Args: d.argvOf(c).slice(1), Name: `/${c.name}`, Image: `sha256:${c.imageId}`, RestartCount: c.restarts,
    State: { Status: c.status, Running: c.status === 'running', Paused: c.status === 'paused', Restarting: c.status === 'restarting', Dead: false, Pid: alive(c) ? 4242 : 0, ExitCode: c.exitCode, Error: c.error, StartedAt: c.startedAt ? new Date(c.startedAt).toISOString() : '0001-01-01T00:00:00Z', FinishedAt: c.finishedAt ? new Date(c.finishedAt).toISOString() : '0001-01-01T00:00:00Z', ...(c.health ? { Health: { Status: c.health.status, FailingStreak: c.health.failing, Log: c.health.log.map(l => ({ Start: new Date(l.t).toISOString(), ExitCode: l.code, Output: l.out })) } } : {}) },
    HostConfig: { RestartPolicy: { Name: c.opts.restart ?? 'no' }, AutoRemove: !!c.opts.rm, ReadonlyRootfs: !!c.opts.readOnly, NetworkMode: [...c.nets.keys()][0], PortBindings: Object.fromEntries(c.bound.map(b => [`${b.port}/${b.proto}`, [{ HostIp: b.ip, HostPort: String(b.host) }]])), Memory: bytesOf(c.opts.memory), NanoCpus: Math.round(Number(c.opts.cpus ?? 0) * 1e9), LogConfig: { Type: c.opts.logDriver ?? 'json-file' } },
    Mounts: c.mountSpecs.map(m => ({ Type: m.type, Name: m.type === 'volume' ? m.source : undefined, Source: m.type === 'volume' ? `/var/lib/docker/volumes/${m.source}/_data` : m.source, Destination: m.target, RW: !m.ro })),
    Config: { Hostname: c.hostname, User: c.opts.user ?? c.config.User, Tty: !!c.opts.tty, OpenStdin: !!c.opts.stdin, Env: [...c.config.Env, ...(c.opts.env ?? [])], Cmd: c.opts.cmd ?? c.config.Cmd, Image: c.image, WorkingDir: c.opts.workdir ?? c.config.WorkingDir, Entrypoint: c.opts.entrypoint ?? c.config.Entrypoint, Labels: c.labels, ExposedPorts: Object.fromEntries(c.config.ExposedPorts.map(p => [p, {}])) },
    NetworkSettings: { Ports: Object.fromEntries(c.bound.map(b => [`${b.port}/${b.proto}`, [{ HostIp: b.ip, HostPort: String(b.host) }]])), IPAddress: c.nets.get('bridge')?.ip ?? '', Networks: Object.fromEntries([...c.nets].map(([n, e]) => [n, { Aliases: e.aliases, IPAddress: alive(c) ? e.ip : '', NetworkID: d.networks.get(n)?.id, Gateway: d.networks.get(n)?.gateway }])) },
  }
}
const inspectImg = (i: Image, d: Daemon) => ({ Id: `sha256:${i.id}`, RepoTags: d.tagsOf(i.id), Created: new Date(i.created).toISOString(), Size: i.size, Architecture: 'amd64', Os: 'linux', Config: i.config, RootFS: { Type: 'layers', Layers: i.layers.map(l => `sha256:${l.id}`) } })
const inspectNet = (n: { id: string; name: string; driver: string; subnet: string; gateway: string; internal: boolean; labels: object }, d: Daemon) => ({ Name: n.name, Id: n.id, Scope: 'local', Driver: n.driver, Internal: n.internal, IPAM: { Config: n.subnet ? [{ Subnet: n.subnet, Gateway: n.gateway }] : [] }, Labels: n.labels, Containers: Object.fromEntries(d.netUsers(n as never).map(c => [c.id, { Name: c.name, IPv4Address: `${c.nets.get(n.name)?.ip}/16` }])) })
const inspectVol = (v: { name: string; labels: object; created: number }) => ({ Name: v.name, Driver: 'local', Mountpoint: `/var/lib/docker/volumes/${v.name}/_data`, Labels: v.labels, Scope: 'local', CreatedAt: new Date(v.created).toISOString() })

function parseMountFlag(s: string): MountSpec {
  const o = Object.fromEntries(s.split(',').map(p => { const [k, ...v] = p.split('='); return [k, v.join('=') || 'true'] }))
  const target = o.target ?? o.destination ?? o.dst
  if (!target) throw new CliError(`invalid argument "${s}" for "--mount" flag: target is required`)
  const type = o.type ?? 'volume'
  if (!['volume', 'bind', 'tmpfs'].includes(type)) throw new CliError(`invalid argument "${s}" for "--mount" flag: type must be volume, bind or tmpfs`)
  return { type, source: o.source ?? o.src ?? '', target, ro: !!(o.readonly ?? o.ro) } as MountSpec
}
function parseVolumeFlag(s: string, d: Daemon): MountSpec {
  const p = s.split(':')
  if (p.length > 3) throw new CliError(`invalid volume specification: '${s}'`)
  if (p.length === 1) { if (!s.startsWith('/')) throw new CliError(`docker: Error response from daemon: invalid volume specification: '${s}': invalid mount config for type "volume": invalid mount path: '${s}' mount path must be absolute.`); return { type: 'volume', source: d.id('anon'), target: s, ro: false } }
  if (!p[1].startsWith('/')) throw new CliError(`invalid volume specification: '${s}': invalid mount config: mount path must be absolute`)
  const ro = p[2]?.split(',').includes('ro') ?? false
  return /^[./~]/.test(p[0]) ? { type: 'bind', source: p[0], target: p[1], ro, create: true } : { type: 'volume', source: p[0], target: p[1], ro }
}
function createOptions(d: Daemon, x: Ctx, f: Flags, image: string, cmd: string[]): CreateOpts {
  const env = [...(f['env-file'] ?? []).flatMap((file: string) => {
    const e = d.hostFs.get(normPath(file, x.cwd))
    if (!e) throw new CliError(`docker: open ${file}: no such file or directory`)
    return Object.entries(parseEnvFile(e.data)).map(([k, v]) => `${k}=${v}`)
  }), ...(f.env ?? []).flatMap((e: string) => e.includes('=') ? [e] : x.env.has(e) ? [`${e}=${x.env.get(e)}`] : [])]
  let health: Health | null | undefined
  if (f['no-healthcheck']) health = { ...HEALTH_DEFAULTS, test: ['NONE'] }
  else if (f['health-cmd']) health = { test: ['CMD-SHELL', f['health-cmd']], interval: parseDuration(f['health-interval'] ?? '') || HEALTH_DEFAULTS.interval, timeout: parseDuration(f['health-timeout'] ?? '') || HEALTH_DEFAULTS.timeout, retries: Number(f['health-retries'] ?? 3), startPeriod: parseDuration(f['health-start-period'] ?? '') }
  const net = f.network ?? f.net
  const ports = (f.publish ?? []).flatMap((p: string) => { try { return parsePorts(p) } catch (e) { throw new CliError(`docker: ${(e as Error).message}`) } })
  return {
    image, name: f.name, cmd: cmd.length ? cmd : undefined, entrypoint: f.entrypoint === undefined ? undefined : f.entrypoint ? [f.entrypoint] : [], env, workdir: f.workdir, user: f.user, hostname: f.hostname,
    labels: Object.fromEntries((f.label ?? []).map((l: string) => { const [k, ...v] = l.split('='); return [k, v.join('=')] })), ports, publishAll: f['publish-all'], expose: f.expose,
    mounts: [...(f.volume ?? []).map((v: string) => parseVolumeFlag(v, d)), ...(f.mount ?? []).map(parseMountFlag), ...(f.tmpfs ?? []).map((t: string) => ({ type: 'tmpfs', source: '', target: t.split(':')[0], ro: false }))],
    networks: net && !['host', 'none', 'bridge'].includes(net) ? [{ name: net, aliases: f['network-alias'] ?? [] }] : undefined, networkMode: ['host', 'none', 'bridge'].includes(net) ? net : undefined,
    restart: f.restart, rm: f.rm, tty: f.tty, stdin: f.interactive, health, readOnly: f['read-only'], stopSignal: f['stop-signal'], stopTimeout: f['stop-timeout'] === undefined ? undefined : Number(f['stop-timeout']), logDriver: f['log-driver'], memory: f.memory, cpus: f.cpus, links: f.link,
  }
}
const SHELLS = new Set(['sh', 'bash', 'ash', 'dash'])
const MEM_TOTAL = 8160437862
const SEARCH: Record<string, [string, number]> = {
  'hello-world': ['Hello World! (an example of minimal Dockerizing)', 2500], alpine: ['A minimal Docker image based on Alpine Linux', 11000], busybox: ['The Swiss Army Knife of Embedded Linux', 3400], debian: ['Debian is a Linux distribution', 5100], ubuntu: ['Ubuntu is a Debian-based Linux operating system', 17000],
  nginx: ['Official build of Nginx.', 20500], httpd: ['The Apache HTTP Server Project', 4800], node: ['Node.js is a JavaScript-based platform', 13800], python: ['Python is an interpreted programming language', 10000], redis: ['Redis is the world’s fastest data platform', 13000],
  postgres: ['The PostgreSQL object-relational database system', 14000], mysql: ['MySQL is a widely used, open-source database', 15500], mariadb: ['MariaDB Server is a high performing open source database', 6000], mongo: ['MongoDB document databases', 10500],
}
const MEMORY: Record<string, number> = { nginx: 6, 'httpd-foreground': 9, 'redis-server': 10, postgres: 32, mysqld: 410, mariadbd: 95, mongod: 160, node: 48, python3: 14, python: 14 }
/** Illustrative but plausible numbers: they depend on the program, uptime and traffic, and drift a little over time. */
function statsRow(c: Container, d: Daemon) {
  const base = { Container: c.name, ID: c.id.slice(0, 12), Name: c.name }
  if (c.status !== 'running') return { ...base, CPUPerc: '--', MemUsage: '-- / --', MemPerc: '--', NetIO: '--', BlockIO: '--', PIDs: '--' }
  const now = d.clock(), seed = parseInt(c.id.slice(0, 4), 16), wave = (Math.sin(now / 1700 + seed) + 1) / 2, warmup = now - c.startedAt < 3000 ? 12 : 0
  const used = ((MEMORY[baseOf(d.argvOf(c)[0] ?? '')] ?? 1.2) + c.procs.length * 0.4 + wave * 0.3) * 1024 ** 2, limit = bytesOf(c.opts.memory) || MEM_TOTAL
  return { ...base, CPUPerc: `${(warmup + 0.02 + wave * 0.2).toFixed(2)}%`, MemUsage: `${mib(used)} / ${mib(limit)}`, MemPerc: `${(used / limit * 100).toFixed(2)}%`, NetIO: `${size(180 * (c.logs.length + 4))} / ${size(90 * c.logs.length)}`, BlockIO: `${size(4096 * 256)} / ${size(4096 * c.logs.length)}`, PIDs: String(c.procs.length) }
}

export class Terminal {
  d: Daemon
  private buf: Chunk[] = []
  private shell: Ctx
  private fg: Proc | null = null
  private session: Session | null = null
  private user = ''

  constructor(files: Record<string, string>, now: () => number = Date.now) {
    this.d = new Daemon(now)
    for (const [k, e] of baseTree('alpine')) if (!this.d.hostFs.root.has(k) || k === '/') this.d.hostFs.root.set(k, e)
    for (const b of ['docker', 'curl', 'help', 'clear', 'bash']) plant(this.d.hostFs.root, `/bin/${b}`, fileEntry(`\0bin:${b}`, 0o755))
    for (const [k, v] of Object.entries(files)) this.write(k, v)
    this.shell = {
      fs: this.d.hostFs, env: new Map([['PATH', '/usr/local/bin:/usr/bin:/bin'], ['HOME', '/home/user'], ['PWD', PROJECT_DIR], ['USER', 'user']]), cwd: PROJECT_DIR, uid: 0, user: 'user', hostname: 'sandbox',
      host: this.d.machine((argv, c) => this.docker(argv, c)), p: newProcState(), out: s => this.emit(s, false), err: s => this.emit(s, true), stdin: null, tty: true, last: 0, args: [], argv0: 'sh', traps: new Map(), errexit: false, quiet: 0, depth: 0,
    }
    plainSinks.set(this.shell.err, s => this.emit(s, false))
    liveSinks.set(this.shell.err, (id, text) => { const old = this.buf.find(c => c.live === id); if (old) old.text = text; else this.buf.push({ text, err: false, live: id }) })
  }
  private emit(text: string, err: boolean) { if (text) this.buf.push({ text, err }) }

  // ---- workspace files, shared with the editor ----
  write(name: string, data: string) { const k = normPath(name), e = this.d.workspace.get(k); this.d.workspace.set(k, e ? { ...e, data } : fileEntry(data)) }
  read(name: string) { return this.d.workspace.get(normPath(name))?.data ?? '' }

  // ---- terminal I/O ----
  get busy() { return !!this.session?.proc || (!!this.fg && !this.session) }
  get prompt() { return this.session ? `${this.session.ctx.cwd} # ` : '$ ' }
  /** Run one typed line. Output arrives through tick(). */
  input(line: string) {
    if (this.busy) return
    const s = this.session
    if (s) { s.ctx.p.exited = null; s.proc = this.d.execLine(s.ctr, s.ctx, runScript(line, s.ctx)) }
    else { this.shell.p.signal = null; this.fg = this.d.hostProc(this.shell, ['sh'], runScript(line, this.shell)) }
    this.pump()
  }
  /** Ctrl+C: reaches the foreground command. */
  interrupt() {
    this.emit('^C\n', false)
    const s = this.session
    if (s?.proc) { s.proc.done = true; s.proc.wakeAt = Infinity; s.ctr.procs = s.ctr.procs.filter(p => p !== s.proc); s.proc = null; return }
    if (s) return
    if (this.fg) { this.fg.c.p.signal = 'INT'; this.fg.wakeAt = this.d.clock() }
    this.pump()
  }
  private pump() {
    this.d.sync()
    const s = this.session
    if (s) {
      if (s.proc?.done) s.proc = null
      const gone = !this.d.containers.has(s.ctr.id) || !alive(s.ctr)
      if (!s.proc && (s.ctx.p.exited !== null || gone)) {
        s.code = s.ctx.p.exited ?? s.ctr.exitCode
        s.done = true
        this.session = null
        if (s.main) this.d.endMain(s.ctr, s.code)
        this.d.sync()
      }
    }
    if (this.fg?.done) { this.fg = null; this.shell.p.exited = null }
  }
  /** Advance the simulation and collect new output. */
  tick(): Chunk[] { this.pump(); const out = this.buf; this.buf = []; return out }

  // ---- docker ----
  private *docker(argv: string[], x: Ctx): Gen {
    try { return yield* this.dispatch(argv, x) } catch (e) {
      if (e instanceof HelpRequest) { x.out(e.text); return 0 }
      if (e instanceof CliError) { x.err(e.message + '\n'); return e.code }
      if (e instanceof DockerError) { x.err(/^(Dockerfile:|ERROR:|no such service|service "|validating |yaml:|dependency |invalid |empty compose|required variable|network .* declared|external volume)/.test(e.message) ? `${e.message}\n` : `Error response from daemon: ${e.message}\n`); return e.code }
      if (e instanceof FsError) { x.err(`Error: ${e.message}\n`); return 1 }
      throw e
    }
  }
  private *ensureImage(ref: string, x: Ctx, policy = 'missing'): Gen {
    normRef(ref)
    if (policy === 'never') { if (!this.d.findImage(ref)) throw new DockerError(`No such image: ${normRef(ref)}`); return 0 }
    if (this.d.findImage(ref) && policy !== 'always') return 0
    if (policy !== 'always') note(x, `Unable to find image '${normRef(ref)}' locally\n`)
    yield* pullImage(this.d, x, ref)
    return 0
  }
  private openSession(ctr: Container, ctx: Ctx, main: boolean) {
    ctx.out = s => this.emit(s, false); ctx.err = s => this.emit(s, true); ctx.tty = true
    const s: Session = { ctr, ctx, main, proc: null, done: false, code: 0 }
    this.session = s
    return s
  }
  private *attach(c: Container, x: Ctx, interactive: boolean, cursor: number): Gen {
    const d = this.d
    const main = c.procs.find(p => p.pid === 1)
    if (interactive && main?.c.p.waiting) {
      const out = main.c.out, err = main.c.err
      const s = this.openSession(c, main.c, true)
      while (!s.done) yield 30
      main.c.out = out; main.c.err = err
      return s.code
    }
    // keeps reading after removal: with --rm a fast container is already gone, its output must still appear
    const seen = new Map([[c.id, cursor]])
    const r = yield* followLogs(d, x, () => [c], seen, {})
    if (r !== 130) return c.exitCode
    d.stop(c, 1) // like --sig-proxy: the interrupt reaches the container, which gets a moment to shut down
    yield* followLogs(d, x, () => [c], seen, {})
    return 130
  }
  private *execIn(c: Container, argv: string[], f: Flags, x: Ctx): Gen {
    const d = this.d
    const wantShell = (f.interactive || f.tty) && SHELLS.has(baseOf(argv[0])) && argv.length === 1
    const { proc, ctx } = d.exec(c, argv, { env: f.env, user: f.user, workdir: f.workdir, tty: wantShell || !!f.tty, out: x.out, err: x.err })
    if (f.detach) return 0
    d.sync()
    if (wantShell) {
      const s = this.openSession(c, ctx, false)
      while (!s.done) yield 30
      if (!proc.done) ctx.host.kill(ctx, proc.pid, 'KILL')
      return s.code
    }
    while (!proc.done) {
      if (x.p.signal === 'INT') { x.p.signal = null; ctx.host.kill(ctx, proc.pid, 'KILL'); return 130 }
      if (!alive(c)) return 137
      yield 30
      d.sync()
    }
    return proc.code
  }

  private *dispatch(argv: string[], x: Ctx): Gen {
    const d = this.d
    d.sync()
    const [first, ...rest] = argv
    const flags = (spec: Record<string, Kind>, cmd: string, stop = false, args = rest) => parseFlags(args, spec, `docker ${cmd}`, stop)
    if (!first || first === '--help' || first === '-h' || first === 'help') { x.out(USAGE); return 0 }
    if (first === '--version' || first === '-v') { x.out('Docker version 27.3.1, build simulated\n'); return 0 }
    if (first.startsWith('-')) throw new CliError(`unknown flag: ${first}\nSee 'docker --help'.`)
    // `docker container ls`, `docker image rm` and friends map onto the short forms
    let cmd = first, args = rest
    if ((first === 'buildx' || first === 'builder') && rest[0] === 'build') { cmd = 'build'; args = rest.slice(1) }
    if (first === 'container' || first === 'image') {
      if (!rest[0]) { x.out(USAGE); return 0 }
      const sub = rest[0]
      cmd = first === 'image' ? ({ ls: 'images', list: 'images', rm: 'rmi', remove: 'rmi', prune: 'image-prune', inspect: 'image-inspect', save: 'save', load: 'load', import: 'import' } as Record<string, string>)[sub] ?? sub
        : ({ ls: 'ps', list: 'ps', prune: 'container-prune', remove: 'rm' } as Record<string, string>)[sub] ?? sub
      args = rest.slice(1)
    }
    const f1 = (spec: Record<string, Kind>, stop = false) => flags(spec, cmd, stop, args)
    const forEach = (names: string[], fn: (c: Container) => void) => {
      let code = 0
      for (const n of names) {
        try { fn(d.find(n)); x.out(n + '\n') }
        catch (e) { if (!(e instanceof DockerError)) throw e; x.err(`Error response from daemon: ${e.message}\n`); code = 1 }
      }
      return code
    }
    switch (cmd) {
      case 'compose': return yield* composeMain(d, x, args, { docker: (a, ctx) => this.dispatch(a, ctx), exec: (c, a, f, ctx) => this.execIn(c, a, f, ctx), attach: (c, ctx, i, cur) => this.attach(c, ctx, i, cur) })
      case 'version': {
        const { f } = f1({ 'format|f': 's' })
        const info = { Client: { Version: '27.3.1', ApiVersion: '1.47', GitCommit: 'simulated', GoVersion: 'go1.22.7', Os: 'linux', Arch: 'amd64' }, Server: { Version: '27.3.1', ApiVersion: '1.47', MinAPIVersion: '1.24', GitCommit: 'simulated', GoVersion: 'go1.22.7', Os: 'linux', Arch: 'amd64', KernelVersion: '6.10.0' } }
        if (f.format) { x.out(template(f.format, info) + '\n'); return 0 }
        x.out(`Client: Docker Engine - Community\n Version:           ${info.Client.Version} (simulated)\n API version:       ${info.Client.ApiVersion}\n Go version:        ${info.Client.GoVersion}\n OS/Arch:           linux/amd64\n\nServer: Docker Engine - Community\n Engine:\n  Version:          ${info.Server.Version} (simulated)\n  API version:      ${info.Server.ApiVersion} (minimum version ${info.Server.MinAPIVersion})\n  Go version:       ${info.Server.GoVersion}\n  OS/Arch:          linux/amd64\n`)
        return 0
      }
      case 'info': {
        const { f } = f1({ 'format|f': 's' })
        const all = [...d.containers.values()], running = all.filter(c => c.status === 'running').length, paused = all.filter(c => c.status === 'paused').length
        const info = { ID: hash('daemon').slice(0, 12), Containers: all.length, ContainersRunning: running, ContainersPaused: paused, ContainersStopped: all.length - running - paused, Images: d.images.size, Driver: 'overlay2', LoggingDriver: 'json-file', CgroupVersion: '2', KernelVersion: '6.10.0', OperatingSystem: 'Simulated Docker Engine', OSType: 'linux', Architecture: 'x86_64', NCPU: 8, MemTotal: MEM_TOTAL, Name: 'sandbox', ServerVersion: '27.3.1', DockerRootDir: '/var/lib/docker' }
        if (f.format) { x.out(template(f.format, info) + '\n'); return 0 }
        x.out(`Client:\n Version:    27.3.1 (simulated)\n Context:    default\n\nServer:\n Containers: ${info.Containers}\n  Running: ${running}\n  Paused: ${paused}\n  Stopped: ${info.ContainersStopped}\n Images: ${info.Images}\n Server Version: ${info.ServerVersion}\n Storage Driver: ${info.Driver} (in memory)\n Logging Driver: ${info.LoggingDriver}\n Cgroup Version: ${info.CgroupVersion}\n Kernel Version: ${info.KernelVersion}\n Operating System: ${info.OperatingSystem}\n CPUs: ${info.NCPU}\n Total Memory: ${mib(MEM_TOTAL)}\n Name: ${info.Name}\n Docker Root Dir: ${info.DockerRootDir}\n`)
        return 0
      }
      case 'run': case 'create': {
        const { f, rest: r } = f1(RUN_FLAGS, true)
        needArgs(r, 1, `docker ${cmd}`)
        const prefix = (e: DockerError) => new CliError(`docker: Error response from daemon: ${e.message}.\n\nRun 'docker ${cmd} --help' for more information`, e.code === 1 ? 125 : e.code)
        let c: Container
        try {
          yield* this.ensureImage(r[0], x, f.pull)
          c = d.create(createOptions(d, x, f, r[0], r.slice(1)))
        } catch (e) { if (e instanceof DockerError) throw prefix(e); throw e }
        if (cmd === 'create') { x.out(c.id + '\n'); return 0 }
        try { d.start(c) } catch (e) {
          if (!(e instanceof DockerError)) throw e
          if (f.rm) d.remove(c, { force: true })
          throw prefix(e)
        }
        yield* pause(x, 300) // runc, network namespace and port proxy take a moment
        if (f.detach) { x.out(c.id + '\n'); return 0 }
        return yield* this.attach(c, x, !!(f.interactive || f.tty), 0)
      }
      case 'start': {
        const { f, rest: r } = f1({ 'attach|a': 'b', 'interactive|i': 'b' })
        needArgs(r, 1, 'docker start')
        if (f.attach || f.interactive) { const c = d.find(r[0]), cur = c.logSeq; d.start(c); yield* pause(x, 300); return yield* this.attach(c, x, !!f.interactive, cur) }
        const code = forEach(r, c => d.start(c))
        yield* pause(x, 300)
        return code
      }
      case 'stop': case 'restart': {
        const { f, rest: r } = f1({ 'time|t': 's', 'timeout': 's', 'signal|s': 's' })
        needArgs(r, 1, `docker ${cmd}`)
        const t = f.time ?? f.timeout, sec = t === undefined ? undefined : Number(t)
        const found: Container[] = [], named = new Map<Container, string>()
        let code = 0
        for (const n of r) { try { const c = d.find(n); found.push(c); named.set(c, n) } catch (e) { if (!(e instanceof DockerError)) throw e; x.err(`Error response from daemon: ${e.message}\n`); code = 1 } }
        yield* stopAll(d, x, found, sec)
        for (const c of found) {
          if (cmd === 'restart' && d.containers.has(c.id)) { c.restarts = 0; try { d.start(c); yield* pause(x, 300) } catch (e) { if (!(e instanceof DockerError)) throw e; x.err(`Error response from daemon: ${e.message}\n`); code = 1; continue } }
          x.out(named.get(c) + '\n')
        }
        return code
      }
      case 'kill': { const { f, rest: r } = f1({ 'signal|s': 's' }); needArgs(r, 1, 'docker kill'); const code = forEach(r, c => d.kill(c, f.signal)); yield* pause(x, 80); return code }
      case 'pause': { const { rest: r } = f1({}); needArgs(r, 1, 'docker pause'); return forEach(r, c => d.pause(c)) }
      case 'unpause': { const { rest: r } = f1({}); needArgs(r, 1, 'docker unpause'); return forEach(r, c => d.unpause(c)) }
      case 'rm': { const { f, rest: r } = f1({ 'force|f': 'b', 'volumes|v': 'b', 'link|l': 'b' }); needArgs(r, 1, 'docker rm'); const code = forEach(r, c => d.remove(c, { force: f.force, volumes: f.volumes })); yield* pause(x, 80); return code }
      case 'rename': { const { rest: r } = f1({}); needArgs(r, 2, 'docker rename', 2); const c = d.find(r[0]); if ([...d.containers.values()].some(o => o.name === r[1])) throw new DockerError(`Error when allocating new name: Conflict. The container name "/${r[1]}" is already in use`); c.name = r[1]; return 0 }
      case 'wait': {
        const { rest: r } = f1({}); needArgs(r, 1, 'docker wait')
        const cs = r.map(n => d.find(n))
        yield* waitUntil(d, x, () => !cs.some(alive), Infinity)
        cs.forEach(c => x.out(c.exitCode + '\n'))
        return 0
      }
      case 'attach': { const { rest: r } = f1({ 'no-stdin': 'b', 'sig-proxy': 'b', 'detach-keys': 's' }); needArgs(r, 1, 'docker attach', 1); const c = d.find(r[0]); if (!alive(c)) throw new CliError('You cannot attach to a stopped container, start it first', 1); return yield* this.attach(c, x, true, c.logSeq) }
      case 'ps': {
        const { f } = f1({ 'all|a': 'b', 'quiet|q': 'b', 'latest|l': 'b', 'last|n': 's', 'size|s': 'b', 'no-trunc': 'b', 'filter|f': 'm', format: 's' })
        let list = [...d.containers.values()].sort((a, b) => b.created - a.created)
        const limited = f.latest || f.last !== undefined
        if (!f.all && !limited && !f.filter?.some((s: string) => s.startsWith('status='))) list = list.filter(c => c.status === 'running' || c.status === 'paused' || c.status === 'restarting')
        for (const s of f.filter ?? []) {
          const i = s.indexOf('='), k = s.slice(0, i), v = s.slice(i + 1)
          const test: Record<string, (c: Container) => boolean> = {
            name: c => c.name.includes(v), id: c => c.id.startsWith(v), status: c => c.status === v, ancestor: c => c.image === v || normRef(c.image) === normRef(v) || c.imageId.startsWith(v), network: c => c.nets.has(v), volume: c => c.mountSpecs.some(m => m.source === v), exited: c => c.status === 'exited' && c.exitCode === Number(v),
            label: c => { const [a, b] = v.split('='); return a in c.labels && (b === undefined || c.labels[a] === b) }, health: c => c.health?.status === v,
          }
          if (i < 0 || !test[k]) throw new DockerError(`invalid filter '${k || s}'`)
          list = list.filter(test[k])
        }
        if (f.latest) list = list.slice(0, 1)
        if (f.last !== undefined) list = list.slice(0, Number(f.last))
        if (f.quiet) { lines(x, list.map(c => f['no-trunc'] ? c.id : c.id.slice(0, 12))); return 0 }
        const rows = list.map(c => ctrRow(c, d, !!f['no-trunc']))
        if (f.format) { formatted(x, f.format, rows, { ID: 'CONTAINER ID', Names: 'NAMES', RunningFor: 'CREATED' }); return 0 }
        x.out(table([['CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'PORTS', 'NAMES', ...(f.size ? ['SIZE'] : [])], ...rows.map(r => [r.ID, r.Image, r.Command, r.RunningFor, r.Status, r.Ports, r.Names, ...(f.size ? [r.Size] : [])])]))
        return 0
      }
      case 'logs': {
        const { f, rest: r } = f1(LOG_FLAGS)
        needArgs(r, 1, 'docker logs', 1)
        const c = d.find(r[0])
        if (c.opts.logDriver === 'none') throw new DockerError('configured logging driver does not support reading')
        const view = { timestamps: f.timestamps, details: f.details }
        printLines(logWindow(f, d.clock())(c.logs).map(l => ({ c, l })), x, view)
        if (!f.follow || !alive(c)) return 0
        return yield* followLogs(d, x, () => [c], new Map([[c.id, c.logSeq]]), view)
      }
      case 'exec': {
        const { f, rest: r } = f1({ 'detach|d': 'b', 'interactive|i': 'b', 'tty|t': 'b', 'env|e': 'm', 'env-file': 'm', 'user|u': 's', 'workdir|w': 's', privileged: 'b' }, true)
        needArgs(r, 2, 'docker exec')
        return yield* this.execIn(d.find(r[0]), r.slice(1), f, x)
      }
      case 'inspect': case 'image-inspect': {
        const { f, rest: r } = f1({ 'format|f': 's', 'type': 's', 'size|s': 'b' })
        needArgs(r, 1, 'docker inspect')
        const out: any[] = []
        let code = 0
        for (const n of r) {
          let o: any
          const want = cmd === 'image-inspect' ? 'image' : f.type
          try { if (!want || want === 'container') o = inspectCtr(d.find(n), d) } catch { /* maybe an image */ }
          if (!o && (!want || want === 'image')) { const i = d.findImage(n); if (i) o = inspectImg(i, d) }
          if (!o && (!want || want === 'network') && d.networks.has(n)) o = inspectNet(d.networks.get(n)!, d)
          if (!o && (!want || want === 'volume') && d.volumes.has(n)) o = inspectVol(d.volumes.get(n)!)
          if (o) out.push(o); else { x.err(`Error: No such object: ${n}\n`); code = 1 }
        }
        if (f.format) lines(x, out.map(o => template(f.format, o)))
        else x.out(JSON.stringify(out, null, 4) + '\n')
        return code
      }
      case 'top': { const { rest: r } = f1({}, true); needArgs(r, 1, 'docker top'); const c = d.find(r[0]); if (c.status !== 'running') throw new DockerError(`container ${c.id} is not running`); x.out(table(topRows(c, d.clock()))); return 0 }
      case 'stats': {
        const { f, rest: r } = f1({ 'all|a': 'b', 'no-stream': 'b', format: 's', 'no-trunc': 'b' })
        const named = r.map(n => d.find(n))
        const render = () => {
          d.sync()
          const rows = (r.length ? named : [...d.containers.values()].filter(c => f.all || c.status === 'running')).map(c => statsRow(c, d))
          if (f.format && !f.format.startsWith('table')) return rows.map(o => template(f.format, o) + '\n').join('')
          if (f.format) { let out = ''; formatted({ ...x, out: s => { out += s } }, f.format, rows, { Name: 'NAME', ID: 'CONTAINER ID', CPUPerc: 'CPU %', MemUsage: 'MEM USAGE / LIMIT', MemPerc: 'MEM %', NetIO: 'NET I/O', BlockIO: 'BLOCK I/O', PIDs: 'PIDS' }); return out }
          return table([['CONTAINER ID', 'NAME', 'CPU %', 'MEM USAGE / LIMIT', 'MEM %', 'NET I/O', 'BLOCK I/O', 'PIDS'], ...rows.map(o => [o.ID, o.Name, o.CPUPerc, o.MemUsage, o.MemPerc, o.NetIO, o.BlockIO, o.PIDs])])
        }
        if (f['no-stream']) { yield* pause(x, 500); x.out(render()); return 0 }
        const block = liveBlock(x)
        for (;;) { if (block.tty) block.draw(render()); else x.out(render()); yield* pause(x, 1000) }
      }
      case 'port': {
        const { rest: r } = f1({}); needArgs(r, 1, 'docker port', 2)
        const c = d.find(r[0]), list = c.bound.filter(b => !r[1] || `${b.port}/${b.proto}` === (r[1].includes('/') ? r[1] : `${r[1]}/tcp`))
        if (r[1] && !list.length) throw new DockerError(`No public port '${r[1].includes('/') ? r[1] : r[1] + '/tcp'}' published for ${c.name}`)
        lines(x, list.map(b => r[1] ? `${b.ip}:${b.host}` : `${b.port}/${b.proto} -> ${b.ip}:${b.host}`))
        return 0
      }
      case 'diff': { const { rest: r } = f1({}); needArgs(r, 1, 'docker diff', 1); const c = d.find(r[0]), base = d.images.get(c.imageId)?.tree ?? new Map(); lines(x, diffTrees(base, c.tree, p => !p.startsWith('/etc/host') && p !== '/etc/resolv.conf').map(([k, p]) => `${k} ${p}`)); return 0 }
      case 'cp': {
        const { rest: r } = f1({ 'archive|a': 'b', 'follow-link|L': 'b', 'quiet|q': 'b' }); needArgs(r, 2, 'docker cp', 2)
        const side = (s: string) => { const m = s.match(/^([a-zA-Z0-9][\w.-]*):(.*)$/); return m ? { c: d.find(m[1]), fs: d.find(m[1]).fs, path: normPath(m[2] || '/') } : { c: null, fs: d.hostFs, path: normPath(s, x.cwd) } }
        const a = side(r[0]), b = side(r[1])
        if (!!a.c === !!b.c) throw new CliError('copying between containers is not supported', 1)
        if (!a.fs.get(a.path)) { if (a.c) throw new DockerError(`Could not find the file ${a.path} in container ${a.c.name}`); throw new CliError(`lstat ${a.path}: no such file or directory`, 1) }
        const to = b.fs.get(b.path)?.kind === 'dir' ? `${b.path}/${baseOf(a.path)}` : b.path
        if (!b.fs.get(dirOf(to))) throw new CliError(`no such directory: ${dirOf(to)}`, 1)
        b.fs.copyFrom(a.fs, a.path, to)
        x.err(`Successfully copied ${size(a.fs.walk(a.path).reduce((n, [, e]) => n + e.data.length, 0))} to ${r[1]}\n`)
        return 0
      }
      case 'commit': {
        const { f, rest: r } = f1({ 'message|m': 's', 'author|a': 's', 'pause|p': 'b', 'change|c': 'm' }); needArgs(r, 1, 'docker commit', 2)
        const cmdChange = (f.change ?? []).find((s: string) => s.startsWith('CMD '))?.slice(4)
        const i = d.commit(d.find(r[0]), r[1], { message: f.message, cmd: cmdChange ? splitWords(cmdChange.replace(/[[\],"]/g, ' ')) : undefined })
        x.out(`sha256:${i.id}\n`)
        return 0
      }
      case 'build': {
        const { f, rest: r } = f1({ 'tag|t': 'm', 'file|f': 's', 'build-arg': 'm', target: 's', 'no-cache': 'b', pull: 'b', 'quiet|q': 'b', progress: 's', platform: 's', label: 'm', network: 's', rm: 'b', load: 'b', push: 'b' })
        if (!r.length) throw new CliError(`ERROR: "docker buildx build" requires exactly 1 argument.\nSee 'docker buildx build --help'.\n\nUsage:  docker buildx build [OPTIONS] PATH | URL | -`, 1)
        needArgs(r, 1, 'docker build', 1)
        const ctx = normPath(r[0], x.cwd)
        const args = Object.fromEntries((f['build-arg'] ?? []).map((a: string) => { const i = a.indexOf('='); return i < 0 ? [a, x.env.get(a) ?? ''] : [a.slice(0, i), a.slice(i + 1)] }))
        for (const t of f.tag ?? []) normRef(t)
        const img = yield* buildPaced(d, x, { context: ctx, file: f.file ? normPath(f.file, x.cwd) : `${ctx}/Dockerfile`, tag: f.tag, args, target: f.target, noCache: f['no-cache'], pull: f.pull, quiet: f.quiet })
        if (f.quiet) x.out(`sha256:${img.id}\n`)
        return 0
      }
      case 'images': {
        const { f, rest: r } = f1({ 'all|a': 'b', 'quiet|q': 'b', 'digests': 'b', 'no-trunc': 'b', 'filter|f': 'm', format: 's' })
        let rows = [...d.images.values()].flatMap(i => { const t = d.tagsOf(i.id); return t.length ? t.map(n => ({ i, n })) : [{ i, n: '' }] }).sort((a, b) => b.i.created - a.i.created)
        if (r[0]) { const want = r[0]; rows = rows.filter(({ n }) => n.startsWith(want.includes(':') ? want : `${want}:`)) }
        for (const s of f.filter ?? []) { if (s === 'dangling=true') rows = rows.filter(x => !x.n); else if (s === 'dangling=false') rows = rows.filter(x => x.n); else if (s.startsWith('reference=')) rows = rows.filter(x => x.n.startsWith(s.slice(10).replace('*', ''))); else throw new DockerError(`invalid filter '${s}'`) }
        if (f.quiet) { lines(x, [...new Set(rows.map(({ i }) => i.id.slice(0, 12)))]); return 0 }
        const data = rows.map(({ i, n }) => imgRow(d, i, n))
        if (f.format) { formatted(x, f.format, data, { ID: 'IMAGE ID' }); return 0 }
        x.out(table([['REPOSITORY', 'TAG', 'IMAGE ID', 'CREATED', 'SIZE'], ...data.map(o => [o.Repository, o.Tag, o.ID, o.CreatedSince, o.Size])]))
        return 0
      }
      case 'pull': {
        const { f, rest: r } = f1({ 'all-tags|a': 'b', 'quiet|q': 'b', platform: 's' }); needArgs(r, 1, 'docker pull', 1)
        if (!r[0].includes(':') && !f.quiet) x.out('Using default tag: latest\n')
        yield* pullImage(d, x, r[0], { quiet: f.quiet, final: true, say: x.out })
        if (f.quiet) x.out(`docker.io/${d.resolve(r[0]).path}:${d.resolve(r[0]).tag}\n`)
        return 0
      }
      case 'push': {
        const { rest: r } = f1({ 'all-tags|a': 'b', 'quiet|q': 'b' }); needArgs(r, 1, 'docker push', 1)
        const img = d.findImage(r[0]), full = normRef(r[0]), repo = full.slice(0, full.lastIndexOf(':')), tag = full.slice(full.lastIndexOf(':') + 1)
        if (!img) throw new CliError(`An image does not exist locally with the tag: ${repo}`, 1)
        x.out(`The push refers to repository [docker.io/${repo.includes('/') ? repo : `library/${repo}`}]\n`)
        const ids = img.layers.filter(l => l.size).map(l => l.id.slice(0, 12)), block = liveBlock(x)
        block.draw(ids.map(i => `${i}: Preparing\n`).join(''))
        yield* pause(x, 300)
        if (!repo.includes('/') || repo.split('/')[0] !== this.user) { block.end(ids.map(i => `${i}: Waiting\n`).join('')); throw new CliError('denied: requested access to the resource is denied', 1) }
        const start = d.clock(), total = pullMs(img.size)
        while (d.clock() - start < total) { block.draw(ids.map(i => `${i}: Pushing [${'='.repeat(Math.floor((d.clock() - start) / total * 18)).padEnd(18)}]\n`).join('')); yield* pause(x, 100) }
        block.end(ids.map(i => `${i}: Pushed\n`).join(''))
        d.registry.set(full, img)
        x.out(`${tag}: digest: sha256:${hash(img.id)} size: ${1000 + img.layers.length * 256}\n`)
        return 0
      }
      case 'search': {
        const { f, rest: r } = f1({ limit: 's', 'filter|f': 'm', format: 's', 'no-trunc': 'b' }); needArgs(r, 1, 'docker search', 1)
        const hits = Object.keys(CATALOG).filter(n => n.includes(r[0].toLowerCase())).slice(0, Number(f.limit ?? 25)).map(n => [n, SEARCH[n]?.[0] ?? '', String(SEARCH[n]?.[1] ?? 0), '[OK]'])
        yield* pause(x, 400)
        x.out(table([['NAME', 'DESCRIPTION', 'STARS', 'OFFICIAL'], ...hits]))
        return 0
      }
      case 'login': {
        const { f, rest: r } = f1({ 'username|u': 's', 'password|p': 's', 'password-stdin': 'b' })
        const pw = f['password-stdin'] ? x.stdin?.trim() : f.password
        if (!f.username || !pw) throw new CliError('Error: Cannot perform an interactive login in this sandbox. Use: docker login -u NAME -p PASSWORD', 1)
        if (f.password) x.err('WARNING! Using --password via the CLI is insecure. Use --password-stdin.\n')
        yield* pause(x, 500)
        this.user = f.username
        x.out(`Login Succeeded${r[0] ? ` to ${r[0]}` : ''}\n`)
        return 0
      }
      case 'logout': { x.out(this.user ? 'Removing login credentials for https://index.docker.io/v1/\n' : 'Not logged in to https://index.docker.io/v1/\n'); this.user = ''; return 0 }
      case 'save': {
        const { f, rest: r } = f1({ 'output|o': 's', platform: 's' }); needArgs(r, 1, 'docker save')
        const images = r.map(n => { const i = d.findImage(n); if (!i) throw new DockerError(`reference does not exist: ${n}`); return i })
        const key = d.id('archive'), data = `docker-archive:${key}\n`
        d.archives.set(key, { images, tags: r.map(n => { try { return normRef(n) } catch { return '' } }) })
        yield* pause(x, Math.min(1500, 200 + images.reduce((n, i) => n + i.size, 0) / 300000))
        if (f.output) d.hostFs.write(normPath(f.output, x.cwd), data); else x.out(data)
        return 0
      }
      case 'export': {
        const { f, rest: r } = f1({ 'output|o': 's' }); needArgs(r, 1, 'docker export', 1)
        const c = d.find(r[0]), key = d.id('archive'), data = `docker-archive:${key}\n`
        d.archives.set(key, { images: [], tags: [], tree: new Map(c.tree) })
        yield* pause(x, 300)
        if (f.output) d.hostFs.write(normPath(f.output, x.cwd), data); else x.out(data)
        return 0
      }
      case 'load': case 'import': {
        const { f, rest: r } = cmd === 'load' ? f1({ 'input|i': 's', 'quiet|q': 'b', platform: 's' }) : f1({ 'change|c': 'm', 'message|m': 's', platform: 's' })
        const file = cmd === 'load' ? f.input : r[0] === '-' ? undefined : r[0]
        const text = file ? d.hostFs.get(normPath(file, x.cwd))?.data : x.stdin
        if (text === undefined || text === null) throw new CliError(`open ${file ?? '-'}: no such file or directory`, 1)
        const a = d.archives.get(text.trim().replace(/^docker-archive:/, ''))
        if (!a) throw new CliError('invalid tar header: this file is not an image archive', 1)
        yield* pause(x, 400)
        if (cmd === 'load') {
          if (!a.tree) { a.images.forEach((i, n) => { d.images.set(i.id, i); if (a.tags[n]) { d.tags.set(a.tags[n], i.id); if (!f.quiet) x.out(`Loaded image: ${a.tags[n]}\n`) } else x.out(`Loaded image ID: sha256:${i.id}\n`) }); return 0 }
          throw new CliError('open manifest.json: this archive holds a container file system, use docker import', 1)
        }
        if (!a.tree) throw new CliError('this archive holds images, use docker load', 1)
        const bytes = [...a.tree.values()].reduce((n, e) => n + e.data.length, 0)
        const img = d.addImage(new Map(a.tree), emptyConfig(), [{ id: d.id('import'), createdBy: f.message ?? 'Imported from -', size: bytes, created: d.clock() }])
        if (r[1]) d.tag(r[1], img.id)
        x.out(`sha256:${img.id}\n`)
        return 0
      }
      case 'update': {
        const { f, rest: r } = f1({ restart: 's', 'memory|m': 's', 'memory-swap': 's', cpus: 's', 'cpu-shares|c': 's', 'pids-limit': 's', 'memory-reservation': 's' }); needArgs(r, 1, 'docker update')
        if (f.restart !== undefined) parseRestart(f.restart)
        return forEach(r, c => { if (f.restart !== undefined) c.opts.restart = f.restart; if (f.memory !== undefined) c.opts.memory = f.memory; if (f.cpus !== undefined) c.opts.cpus = f.cpus })
      }
      case 'context': {
        const [sub = 'ls', name] = args
        if (sub === 'ls' || sub === 'list') { x.out(table([['NAME', 'DESCRIPTION', 'DOCKER ENDPOINT', 'ERROR'], ['default *', 'Current DOCKER_HOST based configuration', 'unix:///var/run/docker.sock', '']])); return 0 }
        if (sub === 'show') { x.out('default\n'); return 0 }
        if (sub === 'use') { if (name !== 'default') throw new CliError(`context "${name}" does not exist`, 1); x.out('default\nCurrent context is now "default"\n'); return 0 }
        throw new CliError(`docker context: unknown command: ${sub}`, 1)
      }
      case 'buildx': case 'builder': {
        const [sub] = args
        if (sub === 'version') { x.out('github.com/docker/buildx v0.18.0 simulated\n'); return 0 }
        if (sub === 'ls') { x.out(table([['NAME/NODE', 'DRIVER/ENDPOINT', 'STATUS', 'BUILDKIT', 'PLATFORMS'], ['default *', 'docker', '', '', ''], [' \\_ default', ' \\_ default', 'running', 'v0.16.0', 'linux/amd64']])); return 0 }
        if (sub === 'prune') { d.buildCache.clear(); x.out('Total:\t0B\n'); return 0 }
        throw new CliError(`docker ${cmd}: unknown command: ${sub ?? ''}`, 1)
      }
      case 'service': case 'stack': case 'node': case 'secret': case 'config':
        throw new DockerError('This node is not a swarm manager. Use "docker swarm init" or "docker swarm join" to connect this node to swarm and try again.')
      case 'tag': { const { rest: r } = f1({}); needArgs(r, 2, 'docker tag', 2); const i = d.findImage(r[0]); if (!i) throw new CliError(`Error response from daemon: No such image: ${r[0]}`, 1); d.tag(r[1], i.id); return 0 }
      case 'rmi': {
        const { f, rest: r } = f1({ 'force|f': 'b', 'no-prune': 'b' }); needArgs(r, 1, 'docker rmi')
        let code = 0
        for (const n of r) { try { lines(x, d.removeImage(n, f.force)) } catch (e) { if (!(e instanceof DockerError)) throw e; x.err(`Error response from daemon: ${e.message}\n`); code = 1 } }
        return code
      }
      case 'history': { const { rest: r } = f1({ 'no-trunc': 'b', 'quiet|q': 'b', 'human|H': 'b', format: 's' }); needArgs(r, 1, 'docker history', 1); const i = d.findImage(r[0]); if (!i) throw new DockerError(`No such image: ${r[0]}`); x.out(table([['IMAGE', 'CREATED', 'CREATED BY', 'SIZE'], ...[...i.layers].reverse().map((l, k) => [k ? '<missing>' : i.id.slice(0, 12), ago(d.clock() - l.created), l.createdBy.slice(0, 45), size(l.size)])])); return 0 }
      case 'network': return this.network(args, x)
      case 'volume': return this.volume(args, x)
      case 'system': case 'container-prune': case 'image-prune': return this.system(cmd, args, x)
      case 'events': {
        const { f } = f1({ since: 's', until: 's', 'filter|f': 'm', format: 's' })
        const now = d.clock(), since = f.since ? parseTime(f.since, now, 'since') : now, until = f.until ? parseTime(f.until, now, 'until') : Infinity
        const want = new Map<string, string[]>()
        for (const s of f.filter ?? []) { const i = s.indexOf('='); if (i < 0) throw new DockerError(`invalid filter '${s}'`); want.set(s.slice(0, i), [...(want.get(s.slice(0, i)) ?? []), s.slice(i + 1)]) }
        const match = (e: DockerEvent) => [...want].every(([k, v]) => k === 'type' ? v.includes(e.type) : k === 'event' ? v.some(a => e.action.startsWith(a)) : k === 'container' ? e.type === 'container' && v.some(a => e.name === a || e.id.startsWith(a)) : k === 'image' ? e.type === 'image' && v.some(a => e.name.startsWith(a)) : k === 'network' ? e.type === 'network' && v.includes(e.name) : k === 'volume' ? e.type === 'volume' && v.includes(e.name) : true)
        const print = (e: DockerEvent) => {
          const o = { Type: e.type, Action: e.action, Status: e.action, ID: e.id, id: e.id, Actor: { ID: e.id || e.name, Attributes: { name: e.name } }, scope: 'local', time: Math.floor(e.t / 1000), timeNano: e.t * 1e6 }
          if (f.format === 'json') x.out(JSON.stringify(o) + '\n')
          else if (f.format) x.out(template(f.format, o) + '\n')
          else x.out(`${stamp(e.t)} ${e.type} ${e.action} ${e.id || e.name} (name=${e.name})\n`)
        }
        let i = d.events.findIndex(e => e.t >= since)
        if (i < 0) i = d.events.length
        for (;;) {
          for (; i < d.events.length; i++) { const e = d.events[i]; if (e.t > until) return 0; if (match(e)) print(e) }
          if (d.clock() >= until) return 0
          yield* pause(x, 200); d.sync()
        }
      }
      case 'swarm': case 'plugin': case 'checkpoint':
        throw new CliError(`docker ${cmd}: not available in this simulation`, 1)
    }
    throw new CliError(`docker: '${first}' is not a docker command.\nSee 'docker --help'`, 1)
  }

  private network(args: string[], x: Ctx) {
    const d = this.d, [sub, ...a] = args
    const f1 = (spec: Record<string, Kind>) => parseFlags(a, spec, `docker network ${sub}`)
    switch (sub) {
      case 'create': { const { f, rest: r } = f1({ 'driver|d': 's', internal: 'b', label: 'm', subnet: 's', gateway: 's', attachable: 'b', ipv6: 'b' }); needArgs(r, 1, 'docker network create', 1); x.out(d.createNetwork(r[0], f.driver, Object.fromEntries((f.label ?? []).map((l: string) => l.split('='))), f.internal).id + '\n'); return 0 }
      case 'ls': case 'list': {
        const { f } = f1({ 'quiet|q': 'b', 'filter|f': 'm', format: 's', 'no-trunc': 'b' })
        const test: Record<string, (n: Network, v: string) => boolean> = { name: (n, v) => n.name.includes(v), driver: (n, v) => n.driver === v, id: (n, v) => n.id.startsWith(v), label: (n, v) => { const [a, b] = v.split('='); return a in n.labels && (b === undefined || n.labels[a] === b) }, scope: (_, v) => v === 'local', type: (n, v) => (v === 'builtin') === ['bridge', 'host', 'none'].includes(n.name) }
        let list = [...d.networks.values()]
        for (const s of f.filter ?? []) { const i = s.indexOf('='), k = s.slice(0, i); if (!test[k]) throw new DockerError(`invalid filter '${k}'`); list = list.filter(n => test[k](n, s.slice(i + 1))) }
        if (f.quiet) { lines(x, list.map(n => n.id.slice(0, 12))); return 0 }
        const rows = list.map(n => ({ ID: f['no-trunc'] ? n.id : n.id.slice(0, 12), Name: n.name, Driver: n.driver, Scope: 'local', Internal: n.internal, Labels: Object.entries(n.labels).map(([k, v]) => `${k}=${v}`).join(','), CreatedAt: new Date(n.created).toISOString() }))
        if (f.format) { formatted(x, f.format, rows, { ID: 'NETWORK ID' }); return 0 }
        x.out(table([['NETWORK ID', 'NAME', 'DRIVER', 'SCOPE'], ...rows.map(n => [n.ID, n.Name, n.Driver, n.Scope])]))
        return 0
      }
      case 'rm': case 'remove': { const { rest: r } = f1({ 'force|f': 'b' }); needArgs(r, 1, 'docker network rm'); for (const n of r) { d.removeNetwork(n); x.out(n + '\n') } return 0 }
      case 'inspect': { const { f, rest: r } = f1({ 'format|f': 's', 'verbose|v': 'b' }); needArgs(r, 1, 'docker network inspect'); const o = r.map(n => inspectNet(d.findNetwork(n), d)); if (f.format) lines(x, o.map(i => template(f.format, i))); else x.out(JSON.stringify(o, null, 4) + '\n'); return 0 }
      case 'connect': { const { f, rest: r } = f1({ alias: 'm', ip: 's' }); needArgs(r, 2, 'docker network connect', 2); d.connect(d.find(r[1]), r[0], f.alias ?? []); return 0 }
      case 'disconnect': { const { rest: r } = f1({ 'force|f': 'b' }); needArgs(r, 2, 'docker network disconnect', 2); const c = d.find(r[1]), n = d.findNetwork(r[0]); if (!c.nets.delete(n.name)) throw new DockerError(`container ${c.id} is not connected to network ${n.name}`); return 0 }
      case 'prune': { const { f } = f1({ 'force|f': 'b', filter: 'm' }); if (!f.force) return this.confirm(x); const gone = [...d.networks.values()].filter(n => !['bridge', 'host', 'none'].includes(n.name) && !d.netUsers(n).length); gone.forEach(n => d.removeNetwork(n.name)); if (gone.length) x.out(`Deleted Networks:\n${gone.map(n => n.name).join('\n')}\n`); return 0 }
    }
    throw new CliError(`docker network: unknown command: ${sub ?? ''}\nSee 'docker network --help'`, 1)
  }
  private volume(args: string[], x: Ctx) {
    const d = this.d, [sub, ...a] = args
    const f1 = (spec: Record<string, Kind>) => parseFlags(a, spec, `docker volume ${sub}`)
    switch (sub) {
      case 'create': { const { f, rest: r } = f1({ 'driver|d': 's', label: 'm', name: 's', 'opt|o': 'm' }); const n = r[0] ?? f.name ?? d.id('vol'); d.createVolume(n, Object.fromEntries((f.label ?? []).map((l: string) => l.split('=')))); x.out(n + '\n'); return 0 }
      case 'ls': case 'list': {
        const { f } = f1({ 'quiet|q': 'b', 'filter|f': 'm', format: 's', cluster: 'b' })
        let list = [...d.volumes.values()]
        for (const s of f.filter ?? []) {
          const i = s.indexOf('='), k = s.slice(0, i), v = s.slice(i + 1)
          if (k === 'dangling') list = list.filter(o => !d.volumeUsers(o.name).length === (v === 'true' || v === '1'))
          else if (k === 'name') list = list.filter(o => o.name.includes(v))
          else if (k === 'driver') list = list.filter(() => v === 'local')
          else if (k === 'label') { const [a, b] = v.split('='); list = list.filter(o => a in o.labels && (b === undefined || o.labels[a] === b)) }
          else throw new DockerError(`invalid filter '${k}'`)
        }
        if (f.quiet) { lines(x, list.map(v => v.name)); return 0 }
        const rows = list.map(v => ({ Name: v.name, Driver: 'local', Scope: 'local', Mountpoint: `/var/lib/docker/volumes/${v.name}/_data`, Labels: Object.entries(v.labels).map(([k, o]) => `${k}=${o}`).join(','), Size: size(volSize(v.tree)) }))
        if (f.format) { formatted(x, f.format, rows, { Name: 'VOLUME NAME' }); return 0 }
        x.out(table([['DRIVER', 'VOLUME NAME'], ...rows.map(v => [v.Driver, v.Name])]))
        return 0
      }
      case 'rm': case 'remove': { const { rest: r } = f1({ 'force|f': 'b' }); needArgs(r, 1, 'docker volume rm'); for (const n of r) { d.removeVolume(n); x.out(n + '\n') } return 0 }
      case 'inspect': { const { f, rest: r } = f1({ 'format|f': 's' }); needArgs(r, 1, 'docker volume inspect'); const o = r.map(n => { const v = d.volumes.get(n); if (!v) throw new DockerError(`get ${n}: no such volume`); return inspectVol(v) }); if (f.format) lines(x, o.map(i => template(f.format, i))); else x.out(JSON.stringify(o, null, 4) + '\n'); return 0 }
      case 'prune': { const { f } = f1({ 'force|f': 'b', 'all|a': 'b', filter: 'm' }); if (!f.force) return this.confirm(x); const gone = [...d.volumes.values()].filter(v => (f.all || v.anonymous) && !d.volumeUsers(v.name).length); gone.forEach(v => d.removeVolume(v.name)); x.out(`${gone.length ? `Deleted Volumes:\n${gone.map(v => v.name).join('\n')}\n\n` : ''}Total reclaimed space: 0B\n`); return 0 }
    }
    throw new CliError(`docker volume: unknown command: ${sub ?? ''}\nSee 'docker volume --help'`, 1)
  }
  private confirm(x: Ctx) { x.err('WARNING! This will remove data. There is no prompt in this sandbox: repeat the command with -f to confirm.\n'); return 1 }
  private pruneCtrs(x: Ctx) { const gone = [...this.d.containers.values()].filter(c => !alive(c)); gone.forEach(c => this.d.remove(c)); if (gone.length) x.out(`Deleted Containers:\n${gone.map(c => c.id).join('\n')}\n\n`) }
  private pruneImages(x: Ctx, all: boolean) {
    const d = this.d, used = new Set([...d.containers.values()].map(c => c.imageId))
    const gone = [...d.images.values()].filter(i => !used.has(i.id) && (all || !d.tagsOf(i.id).length))
    for (const i of gone) { for (const t of d.tagsOf(i.id)) d.tags.delete(t); d.images.delete(i.id) }
    if (gone.length) x.out(`Deleted Images:\n${gone.map(i => `deleted: sha256:${i.id}`).join('\n')}\n\n`)
    return gone.reduce((n, i) => n + i.size, 0)
  }
  private system(cmd: string, args: string[], x: Ctx) {
    const d = this.d
    if (cmd === 'container-prune') { const { f } = parseFlags(args, { 'force|f': 'b', filter: 'm' }, 'docker container prune'); if (!f.force) return this.confirm(x); this.pruneCtrs(x); x.out('Total reclaimed space: 0B\n'); return 0 }
    if (cmd === 'image-prune') { const { f } = parseFlags(args, { 'force|f': 'b', 'all|a': 'b', filter: 'm' }, 'docker image prune'); if (!f.force) return this.confirm(x); x.out(`Total reclaimed space: ${size(this.pruneImages(x, !!f.all))}\n`); return 0 }
    const [sub, ...a] = args
    if (sub === 'df') {
      const imgs = [...d.images.values()], ctrs = [...d.containers.values()], vols = [...d.volumes.values()], used = new Set(ctrs.map(c => c.imageId))
      const pct = (free: number, all: number) => `${size(free)} (${all ? Math.round(free / all * 100) : 0}%)`
      const imgAll = imgs.reduce((n, i) => n + i.size, 0), imgFree = imgs.filter(i => !used.has(i.id)).reduce((n, i) => n + i.size, 0)
      const ctrAll = ctrs.reduce((n, c) => n + writable(c, d), 0), ctrFree = ctrs.filter(c => !alive(c)).reduce((n, c) => n + writable(c, d), 0)
      const volAll = vols.reduce((n, v) => n + volSize(v.tree), 0), volFree = vols.filter(v => !d.volumeUsers(v.name).length).reduce((n, v) => n + volSize(v.tree), 0)
      x.out(table([['TYPE', 'TOTAL', 'ACTIVE', 'SIZE', 'RECLAIMABLE'], ['Images', String(imgs.length), String(used.size), size(imgAll), pct(imgFree, imgAll)], ['Containers', String(ctrs.length), String(ctrs.filter(alive).length), size(ctrAll), pct(ctrFree, ctrAll)], ['Local Volumes', String(vols.length), String(vols.filter(v => d.volumeUsers(v.name).length).length), size(volAll), pct(volFree, volAll)], ['Build Cache', String(d.buildCache.size), '0', '0B', '0B']]))
      return 0
    }
    if (sub === 'info') { x.out(`Containers: ${d.containers.size}\nImages: ${d.images.size}\n`); return 0 }
    if (sub === 'prune') {
      const { f } = parseFlags(a, { 'force|f': 'b', 'all|a': 'b', volumes: 'b', filter: 'm' }, 'docker system prune')
      if (!f.force) return this.confirm(x)
      this.pruneCtrs(x)
      for (const n of [...d.networks.values()]) if (!['bridge', 'host', 'none'].includes(n.name) && !d.netUsers(n).length) d.removeNetwork(n.name)
      if (f.volumes) for (const v of [...d.volumes.values()]) if (v.anonymous && !d.volumeUsers(v.name).length) d.removeVolume(v.name)
      const n = this.pruneImages(x, !!f.all)
      d.buildCache.clear()
      x.out(`Total reclaimed space: ${size(n)}\n`)
      return 0
    }
    throw new CliError(`docker system: unknown command: ${sub ?? ''}\nSee 'docker system --help'`, 1)
  }
}

const USAGE = `Usage:  docker [OPTIONS] COMMAND

Common commands:
  run build ps images pull exec logs stop start restart rm rmi compose

Containers:  create kill pause unpause rename update wait attach top stats port diff cp commit export inspect
Images:      tag push history save load import search login logout   image ls|rm|prune|inspect
Networks:    network create|ls|rm|inspect|connect|disconnect|prune
Volumes:     volume create|ls|rm|inspect|prune
System:      version info events context buildx system df|prune
`
programs.help = (_a: string[], c: Ctx) => {
  c.out(`This terminal talks to a simulated Docker daemon.

  docker compose up -d --build     build and start compose.yml
  docker compose logs -f           follow the logs (Ctrl+C stops following)
  docker build -t app . && docker run -d -p 8080:80 app
  curl localhost:8080              ask the published port
  docker exec -it <name> sh        open a shell in a container
  ls, cat, echo, grep ...          work on your project files
  clear                            empty the screen
`)
  return 0
}
programs.clear = () => 0
