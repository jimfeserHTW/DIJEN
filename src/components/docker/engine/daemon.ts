// The simulated Docker daemon: images, containers, networks, volumes and a virtual clock that drives all processes.
// Nothing runs in the background. Each call first catches the world up to "now", so idle sandboxes cost nothing.
import { Fs, FsError, dirEntry, dirOf, fileEntry, newTree, normPath, plant, type Mount, type Tree } from './fs.ts'
import { CATALOG, emptyConfig, materialize, type Health, type ImageConfig } from './images.ts'
import { ExitEx, NetError, exec, findExe, newProcState, runFile, type Ctx, type Gen, type Host, type HttpReq, type HttpRes } from './shell.ts'
import './programs.ts'
import './servers.ts'

export class DockerError extends Error {
  code: number
  constructor(m: string, code = 1) { super(m); this.code = code }
}
export type Layer = { id: string; createdBy: string; size: number; created: number }
export type Image = { id: string; tree: Tree; config: ImageConfig; layers: Layer[]; created: number; size: number }
export type LogLine = { seq: number; t: number; stream: 'stdout' | 'stderr'; text: string }
export type Proc = { pid: number; argv: string[]; c: Ctx; gen: Gen; wakeAt: number; busy: boolean; done: boolean; code: number; user: string }
export type PortSpec = { ip: string; host: number | null; port: number; proto: string }
export type MountSpec = { type: 'volume' | 'bind' | 'tmpfs'; source: string; target: string; ro: boolean; create?: boolean; labels?: Record<string, string> }
export type CreateOpts = {
  image: string; name?: string; cmd?: string[]; entrypoint?: string[]; env?: string[]; workdir?: string; user?: string; hostname?: string
  labels?: Record<string, string>; ports?: PortSpec[]; publishAll?: boolean; expose?: string[]; mounts?: MountSpec[]
  networks?: { name: string; aliases?: string[] }[]; networkMode?: string; restart?: string; rm?: boolean; tty?: boolean; stdin?: boolean
  health?: Health | null; readOnly?: boolean; stopSignal?: string; stopTimeout?: number; logDriver?: string; memory?: string; cpus?: string; links?: string[]
}
export type HealthState = { status: 'starting' | 'healthy' | 'unhealthy'; failing: number; nextAt: number; startedAt: number; log: { t: number; code: number; out: string }[] }
export type Container = {
  id: string; name: string; opts: CreateOpts; image: string; imageId: string; config: ImageConfig; labels: Record<string, string>
  tree: Tree; fs: Fs; created: number; status: 'created' | 'running' | 'paused' | 'restarting' | 'exited' | 'dead'
  exitCode: number; startedAt: number; finishedAt: number; error: string; restarts: number; restartAt: number | null; manualStop: boolean
  /** A stop is under way: SIGKILL follows at this time unless the process exits first. */
  killAt: number | null
  procs: Proc[]; nextPid: number; logs: LogLine[]; logSeq: number; partial: { stdout: string; stderr: string }
  nets: Map<string, { ip: string; aliases: string[] }>; bound: PortSpec[]; health: HealthState | null; mountSpecs: MountSpec[]; hostname: string; autoVolumes: string[]
}
export type Network = { id: string; name: string; driver: string; subnet: string; gateway: string; labels: Record<string, string>; internal: boolean; created: number }
export type Volume = { name: string; tree: Tree; labels: Record<string, string>; created: number; anonymous: boolean }
export type DockerEvent = { t: number; type: string; action: string; name: string; id: string }
export type PullPlan = { full: string; tag: string; path: string; size: number; digest: string; layers: { id: string; size: number }[]; pushed?: Image; make?: () => { tree: Tree; config: ImageConfig; size: number } }

export const PROJECT_DIR = '/home/user/sandbox'
const LOG_CAP = 50000
const WORDS_A = 'quirky happy brave calm eager swift bold keen jolly vivid'.split(' ')
const WORDS_B = 'turing hopper lovelace ritchie torvalds curie knuth dijkstra liskov shannon'.split(' ')

export function hash(s: string) {
  let out = '', h = 0x811c9dc5
  for (let round = 0; out.length < 64; round++) {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
    h = Math.imul(h ^ round, 16777619)
    out += (h >>> 0).toString(16).padStart(8, '0')
  }
  return out.slice(0, 64)
}
/** nginx -> nginx:latest, docker.io/library/nginx:1 -> nginx:1 */
export function normRef(ref: string) {
  if (!ref || /\s/.test(ref) || ref.startsWith('-') || ref.endsWith(':')) throw new DockerError('invalid reference format')
  const r = ref.replace(/^(docker\.io|index\.docker\.io)\//, '').replace(/^library\//, '')
  const name = r.split(':')[0]
  if (name !== name.toLowerCase()) throw new DockerError(`invalid reference format: repository name (${name}) must be lowercase`)
  if (!/^[a-z0-9]+([._/-]+[a-z0-9]+)*(:\d+\/[a-z0-9._/-]+)?$/.test(name)) throw new DockerError('invalid reference format')
  return /:[^/]+$/.test(r) ? r : `${r}:latest`
}
export function parsePorts(spec: string): PortSpec[] {
  const [addr, proto = 'tcp'] = spec.split('/')
  const parts = addr.split(':'), port = parts.pop()!, host = parts.pop() ?? '', ip = parts.join(':') || '0.0.0.0'
  if (parts.length > 1 || !['tcp', 'udp', 'sctp'].includes(proto)) throw new DockerError(`invalid proto or address: ${spec}`)
  const range = (s: string, what: string) => {
    const m = s.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) throw new DockerError(`invalid ${what}: ${s}`)
    const a = Number(m[1]), b = Number(m[2] ?? m[1])
    if (a < 1 || b > 65535 || b < a) throw new DockerError(`invalid ${what}: ${s}`)
    return Array.from({ length: b - a + 1 }, (_, i) => a + i)
  }
  const ports = range(port, 'containerPort'), hosts = host ? range(host, 'hostPort') : []
  if (hosts.length > 1 && hosts.length !== ports.length) throw new DockerError(`invalid ranges specified for container and host Ports: ${port} and ${host}`)
  return ports.map((p, i) => ({ ip, host: hosts[hosts.length > 1 ? i : 0] ?? null, port: p, proto }))
}

const isUp = (c: Container) => c.status === 'running' || c.status === 'paused'
const envMap = (list: string[]) => new Map(list.map(e => { const i = e.indexOf('='); return (i < 0 ? [e, ''] : [e.slice(0, i), e.slice(i + 1)]) as [string, string] }))

export class Daemon {
  images = new Map<string, Image>()
  tags = new Map<string, string>()
  containers = new Map<string, Container>()
  networks = new Map<string, Network>()
  volumes = new Map<string, Volume>()
  events: DockerEvent[] = []
  buildCache = new Map<string, { tree: Tree; config: ImageConfig; layer: Layer | null }>()
  hostProcs: Proc[] = []
  /** What `docker push` uploaded. */
  registry = new Map<string, Image>()
  /** Payloads of the files written by `docker save` and `docker export`. */
  archives = new Map<string, { images: Image[]; tags: string[]; tree?: Tree }>()
  /** Virtual time the last drive() consumed: what a RUN step costs. */
  lastDrive = 0
  /** The machine Docker runs on. The workspace files live here; bind mounts point into it. */
  hostFs: Fs
  workspace: Tree = newTree()
  private realNow: () => number
  private t: number
  private n = 0
  private rr = 0

  constructor(now: () => number = Date.now) {
    this.realNow = now
    this.t = now()
    const root = newTree()
    plant(root, PROJECT_DIR, dirEntry())
    this.hostFs = new Fs(root, [{ target: PROJECT_DIR, tree: this.workspace, sub: '/', ro: false }])
    for (const [name, driver, subnet] of [['bridge', 'bridge', '172.17.0.0/16'], ['host', 'host', ''], ['none', 'null', '']]) this.addNetwork(name, driver, subnet)
  }

  // ---- clock ----
  clock() { return this.realNow() }
  /** Catch all processes up to the current time. */
  sync() { this.advance(this.clock()) }
  private nextEvent() {
    let at = Infinity, run: (() => void) | null = null
    const see = (t: number, f: () => void) => { if (t < at) { at = t; run = f } }
    for (const p of this.hostProcs) if (!p.busy && !p.done) see(p.wakeAt, () => this.step(p, null))
    for (const c of this.containers.values()) {
      if (c.restartAt !== null) see(c.restartAt, () => this.autoRestart(c))
      if (c.status !== 'running') continue
      if (c.killAt !== null) see(c.killAt, () => { c.manualStop = true; this.finish(c, 137) })
      if (c.health) see(c.health.nextAt, () => this.probe(c))
      for (const p of c.procs) if (!p.busy && !p.done) see(p.wakeAt, () => this.step(p, c))
    }
    return { at, run: run as (() => void) | null }
  }
  private advance(to: number) {
    for (let i = 0; i < 100000; i++) {
      const e = this.nextEvent()
      if (!e.run || e.at > to) break
      this.t = Math.max(this.t, e.at)
      e.run()
    }
    this.t = Math.max(this.t, to)
  }
  private step(p: Proc, c: Container | null) {
    p.busy = true
    let r: IteratorResult<number, number>
    try { r = p.gen.next() } catch (e) {
      if (e instanceof ExitEx) r = { done: true, value: e.code }
      else { p.c.err(`${p.argv[0]}: ${e instanceof FsError ? e.message : 'internal error: ' + (e as Error).message}\n`); r = { done: true, value: 1 } }
    }
    p.busy = false
    if (!r.done) { p.wakeAt = this.t + r.value; return }
    p.done = true; p.code = r.value; p.wakeAt = Infinity
    if (c && p.pid === 1) this.finish(c, r.value)
    else if (c) c.procs = c.procs.filter(x => x !== p)
    else this.hostProcs = this.hostProcs.filter(x => x !== p)
  }
  /** Run a generator to its end outside the clock (RUN steps, healthchecks). Null when it exceeds the budget. */
  drive(gen: Gen, budgetMs: number): number | null {
    let spent = 0
    try {
      for (;;) {
        const r = gen.next()
        this.lastDrive = spent
        if (r.done) return r.value
        spent += r.value
        if (spent > budgetMs) return null
      }
    } catch (e) { if (e instanceof ExitEx) return e.code; if (e instanceof FsError) return 1; throw e }
  }
  event(type: string, action: string, name: string, id = '') { this.events.push({ t: this.clock(), type, action, name, id }); if (this.events.length > 2000) this.events.shift() }
  id(seed: string) { return hash(`${seed}/${++this.n}`) }

  // ---- images ----
  findImage(ref: string): Image | undefined {
    const bare = ref.replace(/^sha256:/, '')
    if (/^[0-9a-f]{4,64}$/.test(bare)) for (const i of this.images.values()) if (i.id.startsWith(bare)) return i
    try { return this.images.get(this.tags.get(normRef(ref)) ?? '') } catch { return undefined }
  }
  tagsOf(id: string) { return [...this.tags].filter(([, v]) => v === id).map(([k]) => k) }
  tag(ref: string, id: string) { this.tags.set(normRef(ref), id); this.event('image', 'tag', ref) }
  addImage(tree: Tree, config: ImageConfig, layers: Layer[]) {
    const id = hash(JSON.stringify(config) + layers.map(l => l.id).join())
    const size = layers.reduce((a, l) => a + l.size, 0)
    if (!this.images.has(id)) this.images.set(id, { id, tree, config, layers, created: this.clock(), size })
    return this.images.get(id)!
  }
  /** Ask the simulated registry about an image. Throws what a failed pull reports; changes nothing. */
  resolve(ref: string): PullPlan {
    const full = normRef(ref), i = full.lastIndexOf(':'), repo = full.slice(0, i), tag = full.slice(i + 1)
    const pushed = this.registry.get(full)
    const known = !!CATALOG[repo] || [...this.registry.keys()].some(k => k.startsWith(`${repo}:`))
    if (!known) throw new DockerError(`pull access denied for ${repo}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied`)
    const m = pushed ? null : materialize(repo, tag)
    if (!pushed && !m) throw new DockerError(`manifest for ${full} not found: manifest unknown: manifest unknown`)
    const size = pushed?.size ?? m!.size, n = Math.min(5, 1 + Math.floor(size / 8e7))
    const weights = Array.from({ length: n }, (_, k) => parseInt(hash(`${full}#w${k}`).slice(0, 2), 16) + 40), sum = weights.reduce((a, b) => a + b, 0)
    return {
      full, tag, path: repo.includes('/') ? repo : `library/${repo}`, size, digest: hash(full), pushed,
      layers: weights.map((w, k) => ({ id: hash(`${full}#${k}`).slice(0, 12), size: Math.round(size * w / sum) })),
      make: m ? () => m : undefined,
    }
  }
  /** Store an image from the registry. The waiting is up to the caller. */
  pull(ref: string): Image {
    const plan = this.resolve(ref), local = this.findImage(plan.full)
    if (local && (!plan.pushed || plan.pushed.id === local.id)) return local
    let image = plan.pushed
    if (image) this.images.set(image.id, image)
    else {
      const m = plan.make!()
      const layers: Layer[] = [0, 1].map(n => ({ id: hash(`${plan.full}#${n}`), createdBy: n ? `CMD ${JSON.stringify(m.config.Cmd)}` : `ADD rootfs.tar.gz / # ${plan.full.split(':')[0]}`, size: n ? 0 : m.size, created: this.clock() }))
      image = this.addImage(m.tree, m.config, layers)
    }
    this.tags.set(plan.full, image.id)
    this.event('image', 'pull', plan.full, image.id)
    return image
  }
  removeImage(ref: string, force = false): string[] {
    const img = this.findImage(ref)
    if (!img) throw new DockerError(`No such image: ${ref}`)
    const short = img.id.slice(0, 12), users = [...this.containers.values()].filter(c => c.imageId === img.id)
    const byId = img.id.startsWith(ref.replace(/^sha256:/, ''))
    const tags = this.tagsOf(img.id), out: string[] = []
    if (byId && tags.length > 1 && !force) throw new DockerError(`conflict: unable to delete ${short} (must be forced) - image is referenced in multiple repositories`)
    const running = users.find(isUp)
    if (running && (force || byId)) throw new DockerError(`conflict: unable to delete ${short} (cannot be forced) - image is being used by running container ${running.id.slice(0, 12)}`)
    if (users.length && !force) throw new DockerError(`conflict: unable to remove repository reference "${ref}" (must force) - container ${users[0].id.slice(0, 12)} is using its referenced image ${short}`)
    for (const t of byId ? tags : [normRef(ref)]) { this.tags.delete(t); out.push(`Untagged: ${t}`) }
    if (!this.tagsOf(img.id).length && !users.length) { this.images.delete(img.id); out.push(`Deleted: sha256:${img.id}`); this.event('image', 'delete', short) }
    return out
  }

  // ---- networks and volumes ----
  private netCount = 0
  private addNetwork(name: string, driver: string, subnet: string, labels: Record<string, string> = {}, internal = false) {
    const n: Network = { id: this.id(`net/${name}`), name, driver, subnet, gateway: subnet.replace(/0\/\d+$/, '1'), labels, internal, created: this.clock() }
    this.networks.set(name, n)
    return n
  }
  createNetwork(name: string, driver = 'bridge', labels: Record<string, string> = {}, internal = false) {
    if (this.networks.has(name)) throw new DockerError(`network with name ${name} already exists`)
    if (driver !== 'bridge') throw new DockerError(`plugin "${driver}" not found`)
    this.event('network', 'create', name)
    return this.addNetwork(name, driver, `172.${18 + this.netCount++}.0.0/16`, labels, internal)
  }
  findNetwork(ref: string) {
    const n = this.networks.get(ref) ?? [...this.networks.values()].find(x => x.id.startsWith(ref))
    if (!n) throw new DockerError(`network ${ref} not found`)
    return n
  }
  netUsers(n: Network) { return [...this.containers.values()].filter(c => isUp(c) && c.nets.has(n.name)) }
  removeNetwork(ref: string) {
    const n = this.findNetwork(ref)
    if (['bridge', 'host', 'none'].includes(n.name)) throw new DockerError(`${n.name} is a pre-defined network and cannot be removed`)
    if (this.netUsers(n).length) throw new DockerError(`error while removing network: network ${n.name} id ${n.id.slice(0, 12)} has active endpoints`)
    for (const c of this.containers.values()) c.nets.delete(n.name)
    this.networks.delete(n.name)
    this.event('network', 'destroy', n.name)
  }
  connect(c: Container, ref: string, aliases: string[] = []) {
    const n = this.findNetwork(ref)
    if (c.nets.has(n.name)) throw new DockerError(`endpoint with name ${c.name} already exists in network ${n.name}`)
    c.nets.set(n.name, { ip: isUp(c) && n.driver === 'bridge' ? this.freeIp(n) : '', aliases })
  }
  /** Addresses belong to running containers only: Docker hands them out at start and takes them back at stop. */
  private freeIp(n: Network) {
    const used = new Set(this.netUsers(n).map(c => c.nets.get(n.name)!.ip))
    for (let host = 2; ; host++) { const ip = n.subnet.replace(/0\.0\/\d+$/, `${host >> 8}.${host & 255}`); if (!used.has(ip)) return ip }
  }
  createVolume(name: string, labels: Record<string, string> = {}, anonymous = false) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) throw new DockerError(`create ${name}: "${name}" includes invalid characters for a local volume name, only "[a-zA-Z0-9][a-zA-Z0-9_.-]" are allowed. If you intended to pass a host directory, use absolute path`)
    let v = this.volumes.get(name)
    if (!v) { v = { name, tree: newTree(), labels, created: this.clock(), anonymous }; this.volumes.set(name, v); this.event('volume', 'create', name) }
    return v
  }
  volumeUsers(name: string) { return [...this.containers.values()].filter(c => c.mountSpecs.some(m => m.type === 'volume' && m.source === name)) }
  removeVolume(name: string) {
    if (!this.volumes.has(name)) throw new DockerError(`get ${name}: no such volume`)
    const u = this.volumeUsers(name)
    if (u.length) throw new DockerError(`remove ${name}: volume is in use - [${u.map(c => c.id).join(', ')}]`)
    this.volumes.delete(name)
    this.event('volume', 'destroy', name)
  }

  // ---- containers ----
  find(ref: string): Container {
    const all = [...this.containers.values()]
    const c = all.find(x => x.name === ref.replace(/^\//, '')) ?? all.find(x => x.id === ref) ?? (ref.length >= 1 ? all.find(x => x.id.startsWith(ref)) : undefined)
    if (!c) throw new DockerError(`No such container: ${ref}`)
    return c
  }
  private autoName() {
    for (;;) {
      const i = this.n++, name = `${WORDS_A[i % 10]}_${WORDS_B[Math.floor(i / 10) % 10]}${i >= 100 ? i : ''}`
      if (![...this.containers.values()].some(c => c.name === name)) return name
    }
  }
  create(o: CreateOpts): Container {
    const img = this.findImage(o.image)
    if (!img) throw new DockerError(`No such image: ${normRef(o.image)}`)
    const all = [...this.containers.values()]
    if (o.name) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(o.name)) throw new DockerError(`Invalid container name (${o.name}), only [a-zA-Z0-9][a-zA-Z0-9_.-]+ are allowed`)
      const dup = all.find(c => c.name === o.name)
      if (dup) throw new DockerError(`Conflict. The container name "/${o.name}" is already in use by container "${dup.id}". You have to remove (or rename) that container to be able to reuse that name.`)
    }
    if (o.restart && o.restart !== 'no' && o.rm) throw new DockerError('Conflicting options: --restart and --rm')
    parseRestart(o.restart)
    const mode = o.networkMode ?? ''
    const nets = o.networks?.length ? o.networks : [{ name: mode || 'bridge' }]
    for (const n of nets) this.findNetwork(n.name)
    const id = this.id(`ctr/${o.name}`)
    const tree = new Map(img.tree)
    const c: Container = {
      id, name: o.name || this.autoName(), opts: o, image: o.image, imageId: img.id, config: img.config, labels: { ...img.config.Labels, ...o.labels }, tree,
      fs: new Fs(tree, [], !!o.readOnly), created: this.clock(), status: 'created', exitCode: 0, startedAt: 0, finishedAt: 0, error: '', restarts: 0, restartAt: null, manualStop: false, killAt: null,
      procs: [], nextPid: 1, logs: [], logSeq: 0, partial: { stdout: '', stderr: '' }, nets: new Map(), bound: [], health: null, mountSpecs: [], hostname: o.hostname || id.slice(0, 12), autoVolumes: [],
    }
    this.setupMounts(c, img)
    for (const n of nets) this.connect(c, n.name, n.aliases)
    this.containers.set(id, c)
    this.event('container', 'create', c.name, c.id)
    return c
  }
  private setupMounts(c: Container, img: Image) {
    const specs = [...(c.opts.mounts ?? [])], seen = new Set<string>()
    for (const s of specs) {
      s.target = normPath(s.target)
      if (seen.has(s.target)) throw new DockerError(`Duplicate mount point: ${s.target}`)
      seen.add(s.target)
    }
    for (const t of img.config.Volumes) if (!seen.has(normPath(t))) { const source = this.id('anon'); specs.push({ type: 'volume', source, target: normPath(t), ro: false }); c.autoVolumes.push(source) }
    for (const s of specs) {
      let m: Mount
      if (s.type === 'volume') {
        const fresh = !this.volumes.has(s.source) || this.volumes.get(s.source)!.tree.size === 1
        const v = this.createVolume(s.source, s.labels, c.autoVolumes.includes(s.source))
        // an empty volume is seeded with what the image has at that path
        if (fresh) for (const [k, e] of img.tree) if (k.startsWith(s.target + '/')) plant(v.tree, k.slice(s.target.length), e)
        m = { target: s.target, tree: v.tree, sub: '/', ro: s.ro }
      } else if (s.type === 'tmpfs') m = { target: s.target, tree: newTree(), sub: '/', ro: false }
      else {
        const src = normPath(s.source, PROJECT_DIR), a = this.hostFs.at(src)
        if (!a.tree.has(a.key)) {
          if (!s.create) throw new DockerError(`invalid mount config for type "bind": bind source path does not exist: ${src}`)
          plant(a.tree, a.key, dirEntry())
        }
        m = { target: s.target, tree: a.tree, sub: a.key, ro: s.ro }
        s.source = src
      }
      const isFile = m.tree.get(m.sub)?.kind === 'file'
      if (!c.tree.has(s.target)) plant(c.tree, s.target, isFile ? fileEntry('') : dirEntry())
      c.fs.mounts.push(m)
    }
    c.mountSpecs = specs
  }
  private userOf(c: Container, spec: string) {
    const name = spec.split(':')[0]
    if (!name) return { uid: 0, user: 'root', home: '/root' }
    const row = (c.fs.get('/etc/passwd')?.data ?? '').split('\n').map(l => l.split(':')).find(r => r[0] === name || r[2] === name)
    if (row) return { uid: Number(row[2]), user: row[0], home: row[5] }
    if (/^\d+$/.test(name)) return { uid: Number(name), user: name, home: '/' }
    throw new DockerError(`unable to find user ${name}: no matching entries in passwd file`)
  }
  private ctx(c: Container, o: { env?: string[]; user?: string; workdir?: string; tty?: boolean; out?: (s: string) => void; err?: (s: string) => void }): Ctx {
    const u = this.userOf(c, o.user ?? c.opts.user ?? c.config.User)
    const env = new Map([['HOSTNAME', c.hostname], ['HOME', u.home], ...envMap(c.config.Env), ...envMap(c.opts.env ?? []), ...envMap(o.env ?? [])])
    const tty = !!o.tty
    const out = o.out ?? (s => this.emit(c, 'stdout', s))
    const p = newProcState()
    p.port = parseInt(c.config.ExposedPorts[0] ?? '') || 0
    return {
      fs: c.fs, env, cwd: normPath(o.workdir ?? c.opts.workdir ?? c.config.WorkingDir ?? '/'), uid: u.uid, user: u.user, hostname: c.hostname, host: this.hostFor(c), p,
      out, err: o.err ?? (tty ? out : s => this.emit(c, 'stderr', s)), stdin: null, tty, last: 0, args: [], argv0: 'sh', traps: new Map(), errexit: false, quiet: 0, depth: 0,
    }
  }
  private emit(c: Container, stream: 'stdout' | 'stderr', s: string) {
    if (c.opts.logDriver === 'none') return
    const parts = (c.partial[stream] + s).split('\n')
    c.partial[stream] = parts.pop()!
    for (const text of parts) this.addLog(c, stream, text)
  }
  private addLog(c: Container, stream: 'stdout' | 'stderr', text: string) {
    c.logs.push({ seq: c.logSeq++, t: this.t, stream, text: text.replace(/\r$/, '') })
    if (c.logs.length > LOG_CAP) c.logs.splice(0, LOG_CAP / 10) // only a browser memory guard: nothing normal gets near it
  }
  private flush(c: Container) {
    for (const s of ['stdout', 'stderr'] as const) if (c.partial[s]) { this.addLog(c, s, c.partial[s]); c.partial[s] = '' }
  }
  private oci(c: Container, m: string, code: number): never {
    c.error = m; c.exitCode = code
    throw new DockerError(`failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: ${m}: unknown`, code)
  }
  argvOf(c: Container) { return [...(c.opts.entrypoint ?? c.config.Entrypoint ?? []), ...(c.opts.cmd ?? (c.opts.entrypoint ? [] : c.config.Cmd ?? []))] }
  private usedPort(host: number, proto: string, ip: string, self: Container) {
    return [...this.containers.values()].some(o => o !== self && isUp(o) && o.bound.some(b => b.host === host && b.proto === proto && (b.ip === ip || b.ip === '0.0.0.0' || ip === '0.0.0.0')))
  }
  private bindPorts(c: Container) {
    if (c.nets.has('host') || c.nets.has('none')) { c.bound = []; return }
    const specs = [...(c.opts.ports ?? [])]
    if (c.opts.publishAll) for (const e of [...c.config.ExposedPorts, ...(c.opts.expose ?? [])]) { const [p, proto = 'tcp'] = e.split('/'); if (!specs.some(s => s.port === Number(p))) specs.push({ ip: '0.0.0.0', host: null, port: Number(p), proto }) }
    let free = 32768
    c.bound = specs.map(s => {
      let host = s.host
      if (host === null) { while (this.usedPort(free, s.proto, s.ip, c)) free++; host = free++ }
      else if (this.usedPort(host, s.proto, s.ip, c)) { c.bound = []; c.error = 'port is already allocated'; throw new DockerError(`driver failed programming external connectivity on endpoint ${c.name} (${c.id.slice(0, 12)}): Bind for ${s.ip}:${host} failed: port is already allocated`) }
      return { ...s, host }
    })
  }
  start(c: Container) {
    this.sync()
    if (isUp(c)) return
    this.t = Math.max(this.t, this.clock())
    this.boot(c)
    this.sync()
  }
  /** Start at the current event time, so automatic restarts land when they were due and not "now". */
  private boot(c: Container) {
    c.restartAt = null
    const argv = this.argvOf(c)
    if (!argv.length) throw new DockerError('no command specified')
    let ctx: Ctx
    try { ctx = this.ctx(c, { tty: c.opts.tty }) } catch (e) { return this.oci(c, (e as Error).message, 126) }
    if (c.opts.stdin) ctx.tty = true // an open stdin keeps a shell waiting for input, with or without a terminal
    if (ctx.cwd !== '/' && !c.fs.get(ctx.cwd)) plant(c.tree, ctx.cwd, dirEntry())
    const f = findExe(argv[0], ctx)
    if (!f) this.oci(c, argv[0].includes('/') ? `exec: "${argv[0]}": stat ${argv[0]}: no such file or directory` : `exec: "${argv[0]}": executable file not found in $PATH`, 127)
    if (!(f!.e.mode & 0o111)) this.oci(c, `exec: "${argv[0]}": permission denied`, 126)
    this.bindPorts(c)
    for (const [name, ep] of c.nets) ep.ip = this.networks.get(name)?.driver === 'bridge' ? this.freeIp(this.networks.get(name)!) : ''
    plantHosts(c, this)
    const plain = !f!.e.data.startsWith('\0') && !f!.e.data.startsWith('#!')
    const gen: Gen = plain ? (function* () { ctx.err(`exec ${argv[0]}: exec format error\n`); return 1 })() : runFile(f!.path, f!.e, argv, ctx)
    c.status = 'running'; c.startedAt = this.t; c.exitCode = 0; c.error = ''; c.manualStop = false; c.nextPid = 1
    c.procs = []
    this.addProc(c, ctx, argv, gen)
    const h = c.opts.health === undefined ? c.config.Healthcheck : c.opts.health
    c.health = h && h.test[0] !== 'NONE' ? { status: 'starting', failing: 0, nextAt: this.t + h.interval, startedAt: this.t, log: [] } : null
    this.event('container', 'start', c.name, c.id)
  }
  private addProc(c: Container, ctx: Ctx, argv: string[], gen: Gen) {
    const p: Proc = { pid: c.nextPid++, argv, c: ctx, gen, wakeAt: this.t, busy: false, done: false, code: 0, user: ctx.user }
    c.procs.push(p)
    return p
  }
  /** The main process ended (or was killed): the whole container goes down with it. */
  private finish(c: Container, code: number) {
    for (const p of c.procs) { p.done = true; p.wakeAt = Infinity }
    c.procs = []
    this.flush(c)
    c.status = 'exited'; c.exitCode = code; c.finishedAt = this.t; c.health = null; c.bound = []
    for (const ep of c.nets.values()) ep.ip = ''
    this.event('container', 'die', c.name, c.id)
    if (c.killAt !== null) { c.killAt = null; this.event('container', 'stop', c.name, c.id) }
    const pol = parseRestart(c.opts.restart)
    const again = !c.manualStop && (pol.name === 'always' || pol.name === 'unless-stopped' || (pol.name === 'on-failure' && code !== 0 && (!pol.max || c.restarts < pol.max)))
    if (again) { c.status = 'restarting'; c.restartAt = this.t + Math.min(100 * 2 ** c.restarts, 60000); return }
    if (c.opts.rm) this.drop(c, true)
  }
  private autoRestart(c: Container) {
    c.restartAt = null; c.restarts++; c.status = 'exited'
    try { this.boot(c) } catch (e) { c.error = (e as Error).message }
  }
  private drop(c: Container, volumes: boolean) {
    this.containers.delete(c.id)
    if (volumes) for (const v of c.autoVolumes) if (!this.volumeUsers(v).length) this.volumes.delete(v)
    this.event('container', 'destroy', c.name, c.id)
  }
  private killNow(c: Container, code: number) { c.manualStop = true; this.t = Math.max(this.t, this.clock()); this.finish(c, code) }
  /** Deliver a signal to PID 1. Like in a real container, PID 1 ignores signals it has no handler for. */
  signal(c: Container, sig: string) {
    const s = sig.replace(/^SIG/, '').toUpperCase(), main = c.procs.find(p => p.pid === 1)
    if (!main) return
    if (s === 'KILL') return this.killNow(c, 137)
    if (main.c.p.handles) { main.c.p.signal = s; main.wakeAt = this.t }
    else if (main.c.traps.has(s) || anyTrap(main.c, s)) main.c.p.signal = s
  }
  /** Begin a stop: signal now, SIGKILL when the grace period ends. The daemon finishes it even if the client gives up. True when there is something to wait for. */
  stop(c: Container, timeout?: number) {
    this.sync()
    if (c.status === 'restarting') {
      c.restartAt = null; c.status = 'exited'; c.manualStop = true
      if (c.opts.rm) this.drop(c, true)
      return false
    }
    if (c.status === 'paused') c.status = 'running'
    if (c.status !== 'running') return false
    c.manualStop = true
    const grace = timeout ?? c.opts.stopTimeout ?? 10
    c.killAt = grace < 0 ? Infinity : this.clock() + grace * 1000
    this.signal(c, c.opts.stopSignal || c.config.StopSignal || 'TERM')
    this.sync()
    return c.status === 'running'
  }
  kill(c: Container, sig = 'KILL') {
    this.sync()
    if (!isUp(c)) throw new DockerError(`cannot kill container: ${c.name}: container ${c.id} is not running`)
    c.status = 'running'
    c.manualStop = true
    this.signal(c, sig)
    this.sync()
    this.event('container', 'kill', c.name, c.id)
  }
  pause(c: Container) {
    this.sync()
    if (c.status === 'paused') throw new DockerError(`container ${c.id} is already paused`)
    if (c.status !== 'running') throw new DockerError(`container ${c.id} is not running`)
    c.status = 'paused'; this.event('container', 'pause', c.name, c.id)
  }
  unpause(c: Container) {
    if (c.status !== 'paused') throw new DockerError(`container ${c.id} is not paused`)
    c.status = 'running'; this.event('container', 'unpause', c.name, c.id); this.sync()
  }
  remove(c: Container, o: { force?: boolean; volumes?: boolean } = {}) {
    this.sync()
    if ((isUp(c) || c.status === 'restarting') && !o.force) throw new DockerError(`cannot remove container "/${c.name}": container is ${c.status}: stop the container before removing or force remove`)
    if (isUp(c)) this.killNow(c, 137)
    c.restartAt = null
    if (this.containers.has(c.id)) this.drop(c, !!o.volumes)
  }
  /** Start an extra process in a running container. The caller polls proc.done. */
  exec(c: Container, argv: string[], o: { env?: string[]; user?: string; workdir?: string; tty?: boolean; out(s: string): void; err(s: string): void }) {
    this.sync()
    if (c.status === 'paused') throw new DockerError(`container ${c.id} is paused, unpause the container before exec`)
    if (c.status !== 'running') throw new DockerError(`container ${c.id} is not running`)
    const ctx = this.ctx(c, o)
    if (o.workdir && !c.fs.get(ctx.cwd)) throw new DockerError(`OCI runtime exec failed: exec failed: unable to start container process: chdir to cwd ("${ctx.cwd}") set in config.json failed: no such file or directory: unknown`, 126)
    const f = findExe(argv[0], ctx)
    if (!f) throw new DockerError(`OCI runtime exec failed: exec failed: unable to start container process: exec: "${argv[0]}": executable file not found in $PATH: unknown`, 127)
    if (!(f.e.mode & 0o111)) throw new DockerError(`OCI runtime exec failed: exec failed: unable to start container process: exec: "${argv[0]}": permission denied: unknown`, 126)
    this.t = Math.max(this.t, this.clock())
    return { proc: this.addProc(c, ctx, argv, runFile(f.path, f.e, argv, ctx)), ctx }
  }
  /** Shell lines typed into an interactive session run as a process over that session's context. */
  execLine(c: Container, ctx: Ctx, gen: Gen) { this.t = Math.max(this.t, this.clock()); return this.addProc(c, ctx, ['sh'], gen) }
  /** The terminal's own shell process. */
  hostProc(c: Ctx, argv: string[], gen: Gen) {
    const p: Proc = { pid: 0, argv, c, gen, wakeAt: this.clock(), busy: false, done: false, code: 0, user: 'user' }
    this.t = Math.max(this.t, this.clock())
    this.hostProcs.push(p)
    return p
  }
  endMain(c: Container, code: number) { if (isUp(c)) { c.manualStop = true; this.t = Math.max(this.t, this.clock()); this.finish(c, code) } }
  commit(c: Container, ref: string | undefined, o: { cmd?: string[]; message?: string } = {}) {
    const base = this.images.get(c.imageId)
    const config: ImageConfig = { ...(base?.config ?? emptyConfig()), Cmd: o.cmd ?? c.opts.cmd ?? base?.config.Cmd ?? null, Env: [...(base?.config.Env ?? []), ...(c.opts.env ?? [])] }
    const size = [...c.tree].reduce((a, [k, e]) => a + (base?.tree.get(k) === e ? 0 : e.data.length), 0)
    const layer: Layer = { id: this.id('commit'), createdBy: o.message ?? 'docker commit', size, created: this.clock() }
    const img = this.addImage(new Map(c.tree), config, [...(base?.layers ?? []), layer])
    if (ref) this.tag(ref, img.id)
    return img
  }

  // ---- healthchecks ----
  private probe(c: Container) {
    const h = c.health!, spec = (c.opts.health === undefined ? c.config.Healthcheck : c.opts.health)!
    h.nextAt = this.t + spec.interval
    let out = ''
    let code: number
    try {
      const ctx = this.ctx(c, { out: s => { out += s }, err: s => { out += s } })
      const argv = spec.test[0] === 'CMD-SHELL' ? [...c.config.Shell, spec.test[1]] : spec.test.slice(1)
      code = this.drive(exec(argv, ctx), spec.timeout) ?? -1
    } catch (e) { out = (e as Error).message; code = 1 }
    h.log = [...h.log.slice(-4), { t: this.t, code, out }]
    if (code === 0) { h.failing = 0; if (h.status !== 'healthy') this.event('container', 'health_status: healthy', c.name, c.id); h.status = 'healthy'; return }
    if (h.status === 'starting' && this.t - h.startedAt < spec.startPeriod) return
    if (++h.failing >= spec.retries && h.status !== 'unhealthy') { h.status = 'unhealthy'; this.event('container', 'health_status: unhealthy', c.name, c.id) }
  }

  // ---- network traffic ----
  private peers(c: Container) { return [...this.containers.values()].filter(o => o.status !== 'created' && isUp(o) && [...o.nets.keys()].some(n => c.nets.has(n))) }
  private lookup(c: Container, name: string): { target: Container; ip: string } | null {
    if (c.nets.has('none')) return null
    const hits: { target: Container; ip: string }[] = []
    for (const o of this.peers(c)) for (const [net, ep] of o.nets) {
      if (!c.nets.has(net) || net === 'host') continue
      const dnsOk = net !== 'bridge'
      const linked = c.opts.links?.some(l => { const [ctr, alias = ctr] = l.split(':'); return (o.name === ctr || o.id.startsWith(ctr)) && (name === alias || name === ctr) })
      if (ep.ip === name || linked || (dnsOk && (o.name === name || o.hostname === name || o.id.startsWith(name) || ep.aliases.includes(name)))) hits.push({ target: o, ip: ep.ip })
    }
    return hits.length ? hits[this.rr++ % hits.length] : null
  }
  private internet(name: string) { return /\.[a-z]{2,}$/i.test(name) && !/^\d+\./.test(name) }
  private serve(target: Container, port: number, r: HttpReq, client: string): HttpRes {
    if (target.status === 'paused') throw new NetError('timeout')
    const srv = target.procs.find(p => p.c.p.listen?.port === port)
    const l = srv?.c.p.listen
    if (!srv || !l) throw new NetError('refused')
    if (r.method === 'PING') throw new NetError('empty')
    if (r.method === 'SQL' || r.method === 'RESP') { if (l.handle) return l.handle(r); throw new NetError('empty') } // a database protocol reaching the wrong server
    if (!l.http) throw new NetError('empty')
    const clock = new Date(this.clock()).toUTCString().slice(5, 25).replace(/ /g, (_, i) => (i === 11 ? ':' : '/'))
    const log = (status: number, size: number) => srv.c.out(`${client} - - [${clock} +0000] "${r.method} ${r.path} HTTP/1.1" ${status} ${size} "-" "${r.agent}"${l.name === 'nginx' ? ' "-"' : ''}\n`)
    if (!l.root) { const body = l.body ?? `Hello from ${l.name}\n`; log(200, body.length); return { status: 200, body, type: 'text/plain' } }
    const clean = normPath(decodeURI(r.path.split('?')[0]))
    let path = normPath(l.root + clean), e = target.fs.get(path)
    if (e?.kind === 'dir') { path = `${path}/index.html`.replace('//', '/'); e = target.fs.get(path) }
    const fail = (status: number, why: string) => {
      const body = `<html><head><title>${status}</title></head><body><h1>${status}</h1></body></html>\n`
      const when = new Date(this.clock()).toISOString().slice(0, 19).replace(/-/g, '/').replace('T', ' ')
      srv.c.err(`${l.name === 'nginx' ? `${when} [error] 29#29: *1 ` : `${l.name}: `}${why}, client: ${client}, server: localhost, request: "${r.method} ${r.path} HTTP/1.1", host: "${r.host}"\n`); log(status, body.length)
      return { status, body, type: 'text/html' }
    }
    if (!e) return fail(404, `open() "${path}" failed (2: No such file or directory)`)
    if (!(e.mode & 0o004)) return fail(403, `open() "${path}" failed (13: Permission denied)`)
    log(200, e.data.length)
    return { status: 200, body: r.method === 'HEAD' ? '' : e.data, type: path.endsWith('.html') ? 'text/html' : 'text/plain' }
  }
  private hostHttp(r: HttpReq): HttpRes {
    if (!['localhost', '127.0.0.1', '0.0.0.0'].includes(r.host)) {
      if (this.internet(r.host)) return { status: 200, body: '<html><body>simulated internet</body></html>\n', type: 'text/html' }
      throw new NetError('dns')
    }
    for (const c of this.containers.values()) {
      if (!isUp(c)) continue
      const b = c.bound.find(x => x.host === r.port && x.proto === 'tcp')
      if (b) return this.serve(c, b.port, r, '172.17.0.1')
      if (c.nets.has('host') && c.procs.some(p => p.c.p.listen?.port === r.port)) return this.serve(c, r.port, r, '127.0.0.1')
    }
    throw new NetError('refused')
  }
  private hostFor(c: Container): Host {
    const self = this
    const ipOf = () => [...c.nets.values()].find(n => n.ip)?.ip ?? '127.0.0.1'
    return {
      now: () => self.clock(),
      http(_ctx, r) {
        if (['localhost', '127.0.0.1', c.hostname].includes(r.host)) return self.serve(c, r.port, r, '127.0.0.1')
        const hit = self.lookup(c, r.host)
        if (hit) return self.serve(hit.target, r.port, r, ipOf())
        if (self.internet(r.host) && !c.nets.has('none')) return { status: 200, body: '<html><body>simulated internet</body></html>\n', type: 'text/html' }
        throw new NetError('dns')
      },
      resolve(_ctx, name) {
        if (name === 'localhost') return '127.0.0.1'
        if (name === c.hostname || name === c.name) return ipOf()
        return self.lookup(c, name)?.ip ?? (self.internet(name) && !c.nets.has('none') ? '93.184.216.34' : null)
      },
      spawn(ctx, argv, gen) { return self.addProc(c, ctx, argv, gen).pid },
      ps: () => c.procs.filter(p => !p.done).map(p => [String(p.pid), p.user, p.argv.join(' ')]),
      kill(_ctx, pid, sig) {
        const p = c.procs.find(x => x.pid === pid)
        if (!p) return false
        if (pid === 1) { self.signal(c, sig); return true }
        p.done = true; p.wakeAt = Infinity; c.procs = c.procs.filter(x => x !== p)
        return true
      },
    }
  }
  /** Network and clock as seen from the machine itself (the terminal, docker build). */
  machine(docker?: Host['docker']): Host {
    const self = this
    return {
      now: () => self.clock(),
      http: (_c, r) => self.hostHttp(r),
      resolve: (_c, name) => ['localhost', '127.0.0.1'].includes(name) ? '127.0.0.1' : self.internet(name) ? '93.184.216.34' : null,
      spawn(c, argv, gen) { self.hostProc(c, argv, gen); return 0 },
      ps: () => [],
      kill: () => false,
      docker,
    }
  }
}

export function parseRestart(p = 'no') {
  const [name, max] = p.split(':')
  if (!['no', '', 'always', 'unless-stopped', 'on-failure'].includes(name)) throw new DockerError(`invalid restart policy: unknown policy '${name}'; use one of 'no', 'always', 'on-failure', or 'unless-stopped'`)
  if (max && (name !== 'on-failure' || !/^\d+$/.test(max))) throw new DockerError(`invalid restart policy: maximum retry count can only be used with 'on-failure'`)
  return { name, max: Number(max ?? 0) }
}
const anyTrap = (c: Ctx, s: string) => c.traps.has(`SIG${s}`)
function plantHosts(c: Container, d: Daemon) {
  const lines = ['127.0.0.1\tlocalhost', ...[...c.nets.values()].filter(n => n.ip).map(n => `${n.ip}\t${c.hostname}`)]
  plant(c.tree, '/etc/hosts', fileEntry(lines.join('\n') + '\n'))
  plant(c.tree, '/etc/hostname', fileEntry(c.hostname + '\n'))
  plant(c.tree, dirOf('/etc/resolv.conf') + '/resolv.conf', fileEntry(`nameserver ${[...c.nets.keys()].some(n => d.networks.get(n)?.name !== 'bridge') ? '127.0.0.11' : '8.8.8.8'}\n`))
}
