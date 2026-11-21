// `docker compose`: loads and validates a compose file, then reconciles it against the daemon.
// Like the real tool it keeps no state of its own: the labels on the containers are its memory.
import { parse as parseYaml } from 'yaml'
import { buildPaced, HEALTH_DEFAULTS, parseDuration } from './builder.ts'
import { DockerError, PROJECT_DIR, hash, normRef, parsePorts, parseRestart, type Container, type CreateOpts, type Image, type Daemon, type MountSpec, type PortSpec } from './daemon.ts'
import { baseOf, dirOf, normPath } from './fs.ts'
import type { Health } from './images.ts'
import { ExitEx, splitWords, type Ctx, type Gen } from './shell.ts'
import { CliError, LOG_FLAGS, Progress, ago, alive, followLogs, formatted, logWindow, needArgs, note, parseFlags, pause, portsText, printLines, pullMs, shortCmd, statusText, stopAll, table, topRows, waitUntil, type Flags } from './util.ts'

type Dep = { name: string; condition: string; required: boolean }
export type Service = {
  name: string; image?: string; build?: { context: string; dockerfile: string; args: Record<string, string>; target?: string }
  deps: Dep[]; replicas: number; profiles: string[]; pullPolicy: string; containerName?: string
  create: Omit<CreateOpts, 'image' | 'name' | 'networks'>; nets: { key: string; aliases: string[] }[]; networkMode?: string
}
export type Project = {
  name: string; file: string; services: Map<string, Service>; warnings: string[]
  networks: Map<string, { name: string; external: boolean; driver: string; internal: boolean; labels: Record<string, string> }>
  volumes: Map<string, { name: string; external: boolean; labels: Record<string, string> }>
}
const FILES = ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml']
const TOP = new Set('version name include services networks volumes secrets configs models'.split(' '))
const SERVICE_KEYS = new Set('annotations attach blkio_config build cap_add cap_drop cgroup cgroup_parent command configs container_name cpu_count cpu_percent cpu_period cpu_quota cpu_rt_period cpu_rt_runtime cpu_shares cpus cpuset credential_spec depends_on deploy develop device_cgroup_rules devices dns dns_opt dns_search domainname entrypoint env_file environment expose extends external_links extra_hosts gpus group_add healthcheck hostname image init ipc isolation labels label_file links logging mac_address mem_limit mem_reservation mem_swappiness memswap_limit models network_mode networks oom_kill_disable oom_score_adj pid pids_limit platform ports post_start pre_stop privileged profiles provider pull_policy read_only restart runtime scale secrets security_opt shm_size stdin_open stop_grace_period stop_signal storage_opt sysctls tmpfs tty ulimits use_api_socket user userns_mode uts volumes volumes_from working_dir'.split(' '))
const STRINGS = ['image', 'container_name', 'hostname', 'working_dir', 'user', 'restart', 'network_mode', 'stop_signal', 'pull_policy', 'stop_grace_period']
const LISTS = ['ports', 'volumes', 'expose', 'profiles', 'tmpfs']
const BOOLS = ['read_only', 'tty', 'stdin_open', 'init', 'privileged']
const LABEL = 'com.docker.compose'
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const scalar = (v: unknown) => v === null || v === undefined ? '' : String(v)

export function parseEnvFile(text: string) {
  const out: Record<string, string> = {}
  for (const raw of text.split('\n')) {
    const l = raw.trim().replace(/^export\s+/, '')
    if (!l || l.startsWith('#')) continue
    const i = l.indexOf('=')
    if (i < 1) throw new DockerError(`unexpected character in variable name "${l}"`)
    out[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}
function interpolate(v: any, env: Map<string, string>, warn: (s: string) => void, path: string): any {
  if (Array.isArray(v)) return v.map((x, i) => interpolate(x, env, warn, `${path}.${i}`))
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, interpolate(x, env, warn, path ? `${path}.${k}` : k)]))
  if (typeof v !== 'string') return v
  const re = /\$(\$|[A-Za-z_]\w*|\{([A-Za-z_]\w*)(?:(:?[-+?])((?:[^{}]|\{[^}]*\})*))?\}|\{?)/g
  return v.replace(re, (m, body, braced, op, arg) => {
    if (body === '$') return '$'
    if (body === '' || body === '{') throw new DockerError(`invalid interpolation format for ${path}: "${v}"; you may need to escape any $ with another $`)
    const name = braced ?? body, val = env.get(name)
    const empty = op?.startsWith(':') ? !val : val === undefined
    const sub = () => interpolate(arg ?? '', env, warn, path)
    switch (op?.slice(-1)) {
      case '-': return empty ? sub() : val
      case '+': return empty ? '' : sub()
      case '?': if (empty) throw new DockerError(`required variable ${name} is missing a value${arg ? `: ${sub()}` : ''}`); return val
    }
    if (val === undefined) warn(`The "${name}" variable is not set. Defaulting to a blank string.`)
    return val ?? ''
  })
}
const toEnv = (v: unknown, env: Map<string, string>, where: string): string[] => {
  if (v === undefined || v === null) return []
  const pick = (k: string, x: unknown) => x === null || x === undefined ? (env.has(k) ? [`${k}=${env.get(k)}`] : []) : [`${k}=${scalar(x)}`]
  if (Array.isArray(v)) return v.flatMap(s => { const t = String(s), i = t.indexOf('='); return i < 0 ? pick(t, null) : [t] })
  if (isObj(v)) return Object.entries(v).flatMap(([k, x]) => pick(k, x))
  throw new DockerError(`${where} must be a mapping or a list`)
}
const toLabels = (v: unknown): Record<string, string> => Array.isArray(v) ? Object.fromEntries(v.map(s => { const [k, ...r] = String(s).split('='); return [k, r.join('=')] })) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scalar(x)])) : {}
const toArgv = (v: unknown, where: string): string[] | undefined => {
  if (v === undefined || v === null) return undefined
  if (typeof v === 'string') return splitWords(v)
  if (Array.isArray(v)) return v.map(String)
  throw new DockerError(`${where} must be a string or a list`)
}

/** Find, parse and validate the compose file. Every problem raises the message Compose would print. */
export function loadProject(d: Daemon, c: Ctx, g: Flags): Project {
  const dir = g.project_directory ? normPath(g.project_directory, c.cwd) : c.cwd
  const file = g.file?.[0] ? normPath(g.file[0], c.cwd) : FILES.map(f => `${dir}/${f}`).find(f => d.hostFs.get(f))
  if (!file) throw new CliError('no configuration file provided: not found', 1)
  const entry = d.hostFs.get(file)
  if (entry?.kind !== 'file') throw new CliError(`open ${file}: no such file or directory`, 1)
  const root = g.project_directory ? dir : dirOf(file)
  const short = file
  const fail = (m: string): never => { throw new DockerError(`validating ${short}: ${m}`) }
  let doc: any
  try { doc = parseYaml(entry.data, { merge: true }) } catch (e: any) {
    const line = e.linePos?.[0]?.line
    throw new DockerError(`yaml: ${line ? `line ${line}: ` : ''}${String(e.message).split('\n')[0].replace(/ at line \d+, column \d+:?$/, '')}`)
  }
  if (doc === null || doc === undefined) throw new DockerError('empty compose file')
  if (!isObj(doc)) fail('top-level object must be a mapping')
  for (const k of Object.keys(doc)) if (!TOP.has(k) && !k.startsWith('x-')) fail(`additional properties '${k}' not allowed`)
  if (doc.include) throw new DockerError('`include` is not available in this simulation')

  const warnings: string[] = [], warn = (s: string) => { if (!warnings.includes(s)) warnings.push(s) }
  const envFile = g.env_file ? normPath(g.env_file, c.cwd) : `${root}/.env`
  if (g.env_file && !d.hostFs.get(envFile)) throw new CliError(`couldn't find env file: ${envFile}`, 1)
  const env = new Map([...Object.entries(parseEnvFile(d.hostFs.get(envFile)?.data ?? '')), ...c.env])
  doc = interpolate(doc, env, warn, '')
  if ('version' in doc) warn(`${short}: the attribute \`version\` is obsolete, it will be ignored, please remove it to avoid potential confusion`)
  const name = String(g.project_name ?? doc.name ?? env.get('COMPOSE_PROJECT_NAME') ?? baseOf(root)).toLowerCase().replace(/[^a-z0-9_-]/g, '')
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) throw new DockerError(`invalid project name "${name}": must consist only of lowercase alphanumeric characters, hyphens, and underscores as well as start with a letter or number`)
  if (doc.services !== undefined && doc.services !== null && !isObj(doc.services)) fail('services must be a mapping')

  const networks: Project['networks'] = new Map(), volumes: Project['volumes'] = new Map()
  for (const [k, raw] of Object.entries<any>(doc.networks ?? {})) {
    const n = raw ?? {}
    networks.set(k, { name: n.name ?? (n.external ? k : `${name}_${k}`), external: !!n.external, driver: n.driver ?? 'bridge', internal: !!n.internal, labels: toLabels(n.labels) })
  }
  for (const [k, raw] of Object.entries<any>(doc.volumes ?? {})) {
    const v = raw ?? {}
    volumes.set(k, { name: v.name ?? (v.external ? k : `${name}_${k}`), external: !!v.external, labels: toLabels(v.labels) })
  }

  const services: Project['services'] = new Map()
  for (const [sn, raw] of Object.entries<any>(doc.services ?? {})) {
    const at = `services.${sn}`
    if (!/^[a-zA-Z0-9._-]+$/.test(sn)) fail(`services must only contain [a-zA-Z0-9._-]: "${sn}"`)
    if (!isObj(raw)) fail(`${at} must be a mapping`)
    for (const k of Object.keys(raw)) if (!SERVICE_KEYS.has(k) && !k.startsWith('x-')) fail(`${at} additional properties '${k}' not allowed`)
    for (const k of STRINGS) if (raw[k] !== undefined && typeof raw[k] !== 'string' && typeof raw[k] !== 'number') fail(`${at}.${k} must be a string`)
    for (const k of LISTS) if (raw[k] !== undefined && !Array.isArray(raw[k]) && !(k === 'tmpfs' && typeof raw[k] === 'string')) fail(`${at}.${k} must be a array`)
    for (const k of BOOLS) if (raw[k] !== undefined && typeof raw[k] !== 'boolean') fail(`${at}.${k} must be a boolean`)
    if (raw.extends) throw new DockerError(`${at}: \`extends\` is not available in this simulation`)
    if (!raw.image && !raw.build) throw new DockerError(`service "${sn}" has neither an image nor a build context specified: invalid compose project`)
    if (raw.network_mode && raw.networks) throw new DockerError(`service ${sn} declares mutually exclusive \`network_mode\` and \`networks\`: invalid compose project`)
    parseRestart(raw.restart)

    let bld: Service['build']
    if (raw.build) {
      const b = typeof raw.build === 'string' ? { context: raw.build } : raw.build
      if (!isObj(b)) fail(`${at}.build must be a string or a mapping`)
      const argEnv = toEnv(b.args, env, `${at}.build.args`)
      bld = { context: normPath(b.context ?? '.', root), dockerfile: b.dockerfile ?? 'Dockerfile', args: Object.fromEntries(argEnv.map(e => { const i = e.indexOf('='); return [e.slice(0, i), e.slice(i + 1)] })), target: b.target }
    }
    const ports: PortSpec[] = []
    for (const [i, p] of (raw.ports ?? []).entries()) {
      if (isObj(p)) {
        if (!p.target) fail(`${at}.ports.${i} target is required`)
        ports.push(...parsePorts(`${p.host_ip ? p.host_ip + ':' : ''}${p.published ? p.published + ':' : ''}${p.target}/${p.protocol ?? 'tcp'}`))
      } else ports.push(...parsePorts(String(p)))
    }
    const mounts: MountSpec[] = []
    const volLabels = (k: string) => ({ [`${LABEL}.project`]: name, [`${LABEL}.volume`]: k })
    const named = (k: string) => {
      const v = volumes.get(k)
      if (!v) throw new DockerError(`service "${sn}" refers to undefined volume ${k}: invalid compose project`)
      return v.name
    }
    for (const v of raw.volumes ?? []) {
      if (isObj(v)) {
        if (!v.target) fail(`${at}.volumes target is required`)
        const type = v.type ?? 'volume'
        if (!['volume', 'bind', 'tmpfs'].includes(type)) throw new DockerError(`${at}: unsupported volume type ${type}`)
        mounts.push(type === 'bind' ? { type, source: normPath(v.source ?? '.', root), target: v.target, ro: !!v.read_only, create: v.bind?.create_host_path !== false }
          : type === 'tmpfs' ? { type, source: '', target: v.target, ro: false }
          : v.source ? { type, source: named(v.source), target: v.target, ro: !!v.read_only, labels: volLabels(v.source) } : { type, source: hash(`${name}/${sn}/${v.target}`), target: v.target, ro: !!v.read_only })
        continue
      }
      const parts = String(v).split(':')
      if (parts.length > 3) throw new DockerError(`invalid spec: ${v}: too many colons`)
      const [src, tgt, mode] = parts.length === 1 ? ['', parts[0], ''] : parts
      if (!tgt?.startsWith('/')) throw new DockerError(`invalid mount path: '${tgt ?? ''}' mount path must be absolute`)
      const ro = mode?.split(',').includes('ro') ?? false
      if (!src) mounts.push({ type: 'volume', source: hash(`${name}/${sn}/${tgt}`), target: tgt, ro })
      else if (/^[./~]/.test(src)) mounts.push({ type: 'bind', source: normPath(src, root), target: tgt, ro, create: true })
      else mounts.push({ type: 'volume', source: named(src), target: tgt, ro, labels: volLabels(src) })
    }
    for (const t of [raw.tmpfs ?? []].flat()) mounts.push({ type: 'tmpfs', source: '', target: String(t), ro: false })

    const nets: Service['nets'] = []
    if (Array.isArray(raw.networks)) for (const k of raw.networks) nets.push({ key: String(k), aliases: [] })
    else if (isObj(raw.networks)) for (const [k, v] of Object.entries<any>(raw.networks)) nets.push({ key: k, aliases: (v?.aliases ?? []).map(String) })
    else if (raw.networks !== undefined) fail(`${at}.networks must be a array or a mapping`)
    if (!nets.length && !raw.network_mode) nets.push({ key: 'default', aliases: [] })
    for (const n of nets) {
      if (n.key === 'default' && !networks.has('default')) networks.set('default', { name: `${name}_default`, external: false, driver: 'bridge', internal: false, labels: {} })
      if (!networks.has(n.key)) throw new DockerError(`service "${sn}" refers to undefined network ${n.key}: invalid compose project`)
    }
    let health: Health | null | undefined
    if (raw.healthcheck) {
      const h = raw.healthcheck
      if (h.disable) health = null
      else {
        const t = h.test
        if (t === undefined) fail(`${at}.healthcheck.test is required`)
        const test = typeof t === 'string' ? ['CMD-SHELL', t] : t.map(String)
        if (!['CMD', 'CMD-SHELL', 'NONE'].includes(test[0])) throw new DockerError(`${at}.healthcheck.test must start either by "CMD", "CMD-SHELL" or "NONE"`)
        health = { test, interval: parseDuration(h.interval ?? '') || HEALTH_DEFAULTS.interval, timeout: parseDuration(h.timeout ?? '') || HEALTH_DEFAULTS.timeout, retries: h.retries ?? HEALTH_DEFAULTS.retries, startPeriod: parseDuration(h.start_period ?? '') }
      }
    }
    const fileEnv: string[] = []
    for (const e of [raw.env_file ?? []].flat()) {
      const p = typeof e === 'string' ? e : e.path, full = normPath(p, root), f = d.hostFs.get(full)
      if (!f) { if (typeof e === 'object' && e.required === false) continue; throw new DockerError(`env file ${full} not found: stat ${full}: no such file or directory`) }
      fileEnv.push(...Object.entries(parseEnvFile(f.data)).map(([k, v]) => `${k}=${v}`))
    }
    const dep = raw.depends_on
    const deps: Dep[] = Array.isArray(dep) ? dep.map(n => ({ name: String(n), condition: 'service_started', required: true })) : isObj(dep) ? Object.entries<any>(dep).map(([n, v]) => ({ name: n, condition: v?.condition ?? 'service_started', required: v?.required !== false })) : []
    for (const x of deps) if (!['service_started', 'service_healthy', 'service_completed_successfully'].includes(x.condition)) fail(`${at}.depends_on.${x.name}.condition must be one of "service_started", "service_healthy", "service_completed_successfully"`)
    const replicas = Number(raw.deploy?.replicas ?? raw.scale ?? 1)
    if (raw.container_name && replicas > 1) throw new DockerError(`services.${sn}: can't set container_name and ${sn} as container name must be unique: invalid compose project`)
    services.set(sn, {
      name: sn, image: raw.image === undefined ? undefined : String(raw.image), build: bld, deps, replicas, profiles: (raw.profiles ?? []).map(String), pullPolicy: raw.pull_policy ?? 'missing', containerName: raw.container_name, nets, networkMode: raw.network_mode,
      create: {
        cmd: toArgv(raw.command, `${at}.command`), entrypoint: toArgv(raw.entrypoint, `${at}.entrypoint`), env: [...fileEnv, ...toEnv(raw.environment, env, `${at}.environment`)],
        workdir: raw.working_dir, user: raw.user === undefined ? undefined : String(raw.user), hostname: raw.hostname, labels: toLabels(raw.labels), ports, expose: (raw.expose ?? []).map(String), mounts,
        restart: raw.restart, tty: raw.tty, stdin: raw.stdin_open, health, readOnly: raw.read_only, stopSignal: raw.stop_signal, stopTimeout: raw.stop_grace_period ? parseDuration(String(raw.stop_grace_period)) / 1000 : undefined, logDriver: raw.logging?.driver,
        networkMode: raw.network_mode,
      },
    })
  }
  for (const s of services.values()) for (const x of s.deps) if (!services.has(x.name)) throw new DockerError(`service "${s.name}" depends on undefined service "${x.name}": invalid compose project`)
  const trail: string[] = [], done = new Set<string>()
  const visit = (n: string) => {
    if (trail.includes(n)) throw new DockerError(`dependency cycle detected: ${[...trail.slice(trail.indexOf(n)), n].join(' -> ')}`)
    if (done.has(n)) return
    trail.push(n)
    services.get(n)!.deps.forEach(x => visit(x.name))
    trail.pop(); done.add(n)
  }
  for (const n of services.keys()) visit(n)
  return { name, file, services, warnings, networks, volumes }
}

/** Selected services plus their dependencies, dependencies first. Profiled services need their profile. */
function ordered(p: Project, names: string[], profiles: string[], withDeps = true) {
  for (const n of names) if (!p.services.has(n)) throw new DockerError(`no such service: ${n}`)
  const on = (s: Service) => !s.profiles.length || s.profiles.some(x => profiles.includes(x)) || names.includes(s.name)
  const out: Service[] = []
  const add = (n: string) => {
    const s = p.services.get(n)!
    if (out.includes(s)) return
    if (withDeps) s.deps.forEach(x => add(x.name))
    out.push(s)
  }
  for (const s of p.services.values()) if ((names.length ? names.includes(s.name) : on(s))) add(s.name)
  return out
}
const projectCtrs = (d: Daemon, name: string, all = true) => [...d.containers.values()].filter(c => c.labels[`${LABEL}.project`] === name && (all || alive(c)))
const svcOf = (c: Container) => c.labels[`${LABEL}.service`]
const numOf = (c: Container) => Number(c.labels[`${LABEL}.container-number`] ?? 1)
const label = (c: Container) => c.labels[`${LABEL}.oneoff`] === 'True' ? c.name : `${svcOf(c)}-${numOf(c)}`
const imageName = (p: Project, s: Service) => s.image ?? `${p.name}-${s.name}`
const rowOf = (c: Container) => `Container ${c.name}`

function createOpts(p: Project, s: Service, n: number, imageId: string, name: string, oneoff = false): CreateOpts {
  const cfg = hash(JSON.stringify({ c: s.create, n: s.nets, i: imageId }))
  const net = s.networkMode?.replace(/^bridge$/, 'bridge')
  return {
    ...s.create, mounts: s.create.mounts?.map(m => ({ ...m })), image: imageName(p, s), name,
    labels: { ...s.create.labels, [`${LABEL}.project`]: p.name, [`${LABEL}.service`]: s.name, [`${LABEL}.container-number`]: String(n), [`${LABEL}.oneoff`]: oneoff ? 'True' : 'False', [`${LABEL}.config-hash`]: cfg, [`${LABEL}.project.config_files`]: p.file, [`${LABEL}.project.working_dir`]: dirOf(p.file), [`${LABEL}.image`]: `sha256:${imageId}` },
    networks: net ? undefined : s.nets.map(x => ({ name: p.networks.get(x.key)!.name, aliases: [s.name, ...x.aliases] })), networkMode: net,
  }
}
function wantsPull(d: Daemon, p: Project, s: Service, f: Flags) {
  if (s.build) return false
  const ref = imageName(p, s), have = !!d.findImage(ref), never = s.pullPolicy === 'never' || f.pull === 'never'
  if (never && !have) throw new DockerError(`No such image: ${normRef(ref)}`)
  return !never && (!have || s.pullPolicy === 'always' || f.pull === 'always')
}
function* pullJob(d: Daemon, x: Ctx, prog: Progress, p: Project, s: Service): Gen<void> {
  const ref = imageName(p, s)
  let bytes: number
  try { bytes = d.resolve(ref).size } catch (e) { prog.set(s.name, 'Error', true, true); throw e }
  prog.set(s.name, 'Pulling', false)
  yield* pause(x, d.findImage(ref) ? 400 : pullMs(bytes))
  d.pull(ref)
  prog.set(s.name, 'Pulled')
}
function* pullAll(d: Daemon, x: Ctx, p: Project, list: Service[], g: Flags): Gen<void> {
  if (!list.length) return
  const prog = new Progress(d, x, 'Pulling', g.progress)
  try { yield* prog.run(list.map(s => pullJob(d, x, prog, p, s))) } finally { prog.finish() }
}
const buildOf = (p: Project, s: Service, f: Flags) => ({ context: s.build!.context, file: s.build!.dockerfile, tag: [imageName(p, s)], args: { ...s.build!.args, ...f.args }, target: s.build!.target, noCache: f.no_cache, pull: f.pull_base, quiet: f.quiet })
/** Pull what is missing (side by side), then build what has to be built. Returns the services that were built. */
function* ensureImages(d: Daemon, x: Ctx, p: Project, list: Service[], g: Flags, f: Flags): Gen<Service[]> {
  yield* pullAll(d, x, p, list.filter(s => wantsPull(d, p, s, f)), g)
  const built: Service[] = []
  for (const s of list) {
    if (!s.build || !(f.build || s.pullPolicy === 'build' || !d.findImage(imageName(p, s)))) continue
    if (f.no_build) throw new DockerError(`image ${normRef(imageName(p, s))} not found and --no-build is set`)
    yield* buildPaced(d, x, buildOf(p, s, f))
    built.push(s)
  }
  return built
}
function* ensureInfra(d: Daemon, x: Ctx, p: Project, used: Service[], prog: Progress): Gen<void> {
  const nets = new Set(used.flatMap(s => s.nets.map(n => n.key))), vols = new Set(used.flatMap(s => (s.create.mounts ?? []).filter(m => m.type === 'volume').map(m => m.source)))
  for (const [k, n] of p.networks) {
    if (!nets.has(k) || d.networks.has(n.name)) continue
    if (n.external) throw new DockerError(`network ${n.name} declared as external, but could not be found`)
    prog.set(`Network ${n.name}`, 'Creating', false)
    yield* pause(x, 120)
    d.createNetwork(n.name, n.driver, { ...n.labels, [`${LABEL}.project`]: p.name, [`${LABEL}.network`]: k }, n.internal)
    prog.set(`Network ${n.name}`, 'Created')
  }
  for (const [k, v] of p.volumes) {
    if (!vols.has(v.name) || d.volumes.has(v.name)) continue
    if (v.external) throw new DockerError(`external volume "${v.name}" not found`)
    d.createVolume(v.name, { ...v.labels, [`${LABEL}.project`]: p.name, [`${LABEL}.volume`]: k })
    prog.set(`Volume "${v.name}"`, 'Created')
  }
}
/** Hold a service back until the containers it depends on meet their `depends_on` condition. */
function* waitDeps(d: Daemon, x: Ctx, p: Project, s: Service, prog: Progress): Gen<void> {
  for (const dep of s.deps) {
    for (const c of projectCtrs(d, p.name).filter(k => svcOf(k) === dep.name && k.labels[`${LABEL}.oneoff`] !== 'True')) {
      if (dep.condition === 'service_healthy') {
        if (!c.opts.health && !c.config.Healthcheck) throw new DockerError(`container ${c.name} has no healthcheck configured`)
        const health = (): string | undefined => c.health?.status
        if (health() === 'healthy') continue
        prog.set(rowOf(c), 'Waiting', false)
        yield* waitUntil(d, x, () => health() === 'healthy' || health() === 'unhealthy' || !alive(c), 600000)
        if (health() === 'healthy') { prog.set(rowOf(c), 'Healthy'); continue }
        prog.set(rowOf(c), 'Error', true, true)
        if (dep.required) throw new DockerError(`dependency failed to start: container ${c.name} ${alive(c) ? 'is unhealthy' : `exited (${c.exitCode})`}`)
      } else if (dep.condition === 'service_completed_successfully') {
        prog.set(rowOf(c), 'Waiting', false)
        yield* waitUntil(d, x, () => !alive(c), 600000)
        if (c.exitCode === 0) { prog.set(rowOf(c), 'Exited'); continue }
        prog.set(rowOf(c), 'Error', true, true)
        if (dep.required) throw new DockerError(`service "${dep.name}" didn't complete successfully: exit ${c.exitCode}`)
      }
    }
  }
}
/** Visit containers along the dependency graph, unrelated services at the same time: dependencies first going up, dependents first going down. */
function* walk(d: Daemon, x: Ctx, p: Project | null, list: Container[], dir: 'up' | 'down', prog: Progress, job: (c: Container) => Gen<void>): Gen<void> {
  const left = new Map<string, number>()
  for (const c of list) left.set(svcOf(c), (left.get(svcOf(c)) ?? 0) + 1)
  const first = (svc: string) => !p ? [] : dir === 'up' ? (p.services.get(svc)?.deps ?? []).map(k => k.name) : [...p.services.values()].filter(s => s.deps.some(k => k.name === svc)).map(s => s.name)
  yield* prog.run(list.map(c => (function* (): Gen<void> {
    const before = first(svcOf(c))
    yield* waitUntil(d, x, () => before.every(n => !left.get(n)), Infinity)
    yield* job(c)
    left.set(svcOf(c), left.get(svcOf(c))! - 1)
  })()))
}
function* removeCtrs(d: Daemon, x: Ctx, list: Container[], prog: Progress, t?: number): Gen<void> {
  for (const c of list) prog.set(rowOf(c), 'Stopping', false)
  yield* stopAll(d, x, list, t)
  for (const c of list) { d.remove(c, { force: true, volumes: true }); prog.set(rowOf(c), 'Removed') }
}

function* up(d: Daemon, x: Ctx, p: Project, g: Flags, argv: string[]): Gen {
  const { f, rest } = parseFlags(argv, { 'detach|d': 'b', build: 'b', 'no-build': 'b', 'force-recreate': 'b', 'no-recreate': 'b', 'remove-orphans': 'b', 'no-deps': 'b', 'no-start': 'b', wait: 'b', 'wait-timeout': 's', 'timeout|t': 's', scale: 'm', pull: 's', 'abort-on-container-exit': 'b', 'exit-code-from': 's', 'no-log-prefix': 'b', 'no-color': 'b', 'quiet-pull': 'b', 'always-recreate-deps': 'b', 'renew-anon-volumes|V': 'b', attach: 'm', 'no-attach': 'm', 'attach-dependencies': 'b', 'timestamps': 'b', 'yes|y': 'b', menu: 'b', 'watch|w': 'b' }, 'docker compose up')
  if (f.detach && (f['abort-on-container-exit'] || f['exit-code-from'])) throw new CliError('--abort-on-container-exit and --detach are incompatible', 1)
  if (f['force-recreate'] && f['no-recreate']) throw new CliError('--force-recreate and --no-recreate are incompatible', 1)
  const list = ordered(p, rest, g.profile ?? [], !f['no-deps'])
  if (!list.length) throw new CliError('no service selected', 1)
  const scale = new Map<string, number>((f.scale ?? []).map((s: string) => { const [k, v] = s.split('='); if (!p.services.has(k)) throw new DockerError(`no such service: ${k}`); return [k, Number(v)] as [string, number] }))
  const timeout = f.timeout === undefined ? undefined : Number(f.timeout), noStart = !!f['no-start']
  const started: Container[] = [], cursor = new Map<string, number>()
  let built: Service[]
  try { built = yield* ensureImages(d, x, p, list, g, { build: f.build, no_build: f['no-build'], pull: f.pull }) }
  catch (e) { if (e instanceof ExitEx) note(x, 'canceled\n'); throw e }
  const prog = new Progress(d, x, 'Running', g.progress), done = new Set<string>(), wanted = new Set(list.map(s => s.name))
  const service = function* (s: Service): Gen<void> {
    for (const dep of s.deps) if (wanted.has(dep.name)) yield* waitUntil(d, x, () => done.has(dep.name), Infinity)
    if (!noStart) yield* waitDeps(d, x, p, s, prog)
    const img = d.findImage(imageName(p, s))!, want = scale.get(s.name) ?? s.replicas
    const have = projectCtrs(d, p.name).filter(c => svcOf(c) === s.name && c.labels[`${LABEL}.oneoff`] !== 'True').sort((a, b) => numOf(a) - numOf(b))
    yield* removeCtrs(d, x, have.slice(want), prog, timeout)
    for (let n = 1; n <= want; n++) {
      const name = s.containerName ?? `${p.name}-${s.name}-${n}`, cur = have.find(c => numOf(c) === n), o = createOpts(p, s, n, img.id, name), row = `Container ${name}`
      let ctr = cur, recreated = false
      if (cur && (f['force-recreate'] || (cur.labels[`${LABEL}.config-hash`] !== o.labels![`${LABEL}.config-hash`] && !f['no-recreate']))) {
        prog.set(row, 'Recreate', false)
        yield* stopAll(d, x, [cur], timeout)
        d.remove(cur, { force: true })
        ctr = undefined; recreated = true
      }
      const fresh = !ctr
      if (fresh) { prog.set(row, recreated ? 'Recreate' : 'Creating', false); yield* pause(x, 80) }
      ctr ??= d.create(o)
      cursor.set(ctr.id, fresh ? 0 : ctr.logSeq)
      started.push(ctr)
      if (noStart) { prog.set(row, recreated ? 'Recreated' : fresh ? 'Created' : 'Running'); continue }
      if (ctr.status === 'running') { prog.set(row, 'Running'); continue }
      prog.set(row, recreated ? 'Recreate' : 'Starting', false)
      try { d.start(ctr) } catch (e) { prog.set(row, 'Error', true, true); throw e }
      yield* pause(x, 300) // runc, network namespace and port proxy take a moment
      prog.set(row, recreated ? 'Recreated' : 'Started')
    }
    done.add(s.name)
  }
  try {
    for (const s of built) prog.set(`Service ${s.name}`, 'Built')
    yield* ensureInfra(d, x, p, list, prog)
    const known = new Set(p.services.keys())
    const orphans = projectCtrs(d, p.name).filter(c => !known.has(svcOf(c)) && c.labels[`${LABEL}.oneoff`] !== 'True')
    if (orphans.length && f['remove-orphans']) yield* removeCtrs(d, x, orphans, prog, timeout)
    else if (orphans.length) x.err(`level=warning msg="Found orphan containers ([${orphans.map(c => c.name).join(' ')}]) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up."\n`)
    yield* prog.run(list.map(service))
    if (f.wait && !noStart) yield* prog.run(started.map(c => (function* (): Gen<void> {
      const row = rowOf(c)
      prog.set(row, 'Waiting', false)
      const ok = yield* waitUntil(d, x, () => !alive(c) || (c.health ? c.health.status !== 'starting' : c.status === 'running'), Number(f['wait-timeout'] ?? 600) * 1000)
      if (!ok || !alive(c) || c.health?.status === 'unhealthy') { prog.set(row, 'Error', true, true); throw new DockerError(`container ${c.name} ${!alive(c) ? `exited (${c.exitCode})` : 'is unhealthy'}`) }
      prog.set(row, c.health ? 'Healthy' : 'Started')
    })()))
  } catch (e) {
    prog.finish()
    if (e instanceof ExitEx) note(x, 'canceled\n')
    throw e
  }
  prog.finish()
  if (noStart || f.wait || f.detach) return 0

  const width = Math.max(...started.map(c => label(c).length))
  x.out(`Attaching to ${started.map(label).join(', ')}\n`)
  let code = 0, stopNow = false, stopping = false
  const reported = new Set<string>()
  const onExit = (c: Container) => {
    if (reported.has(c.id)) return
    reported.add(c.id)
    x.out(`${label(c)} exited with code ${c.exitCode}\n`)
    if (svcOf(c) === f['exit-code-from']) code = c.exitCode
    if (f['abort-on-container-exit'] || f['exit-code-from']) stopNow = true
  }
  const prefix = f['no-log-prefix'] ? undefined : (c: Container) => `${label(c).padEnd(width)}  | `
  const live = () => started.filter(c => d.containers.has(c.id))
  const targets = () => { if (stopNow && !stopping) { stopping = true; live().forEach(c => d.stop(c, timeout)) } return started }
  const r = yield* followLogs(d, x, targets, cursor, { prefix }, onExit)
  if (r !== 130) return code
  x.out('Gracefully stopping... (press Ctrl+C again to force)\n')
  const halt = new Progress(d, x, 'Stopping', g.progress)
  try {
    yield* walk(d, x, p, live(), 'down', halt, function* (c) { halt.set(rowOf(c), 'Stopping', false); yield* stopAll(d, x, [c], timeout); halt.set(rowOf(c), 'Stopped') })
  } catch (e) {
    if (!(e instanceof ExitEx)) throw e
    for (const c of live()) { if (c.status === 'running' || c.status === 'paused') { d.kill(c); halt.set(rowOf(c), 'Killed') } }
  }
  halt.finish()
  yield* followLogs(d, x, () => started, cursor, { prefix }, onExit) // the shutdown messages belong to the log too
  return 130
}
function* down(d: Daemon, x: Ctx, name: string, p: Project | null, f: Flags, g: Flags): Gen<void> {
  const t = f.timeout === undefined ? undefined : Number(f.timeout), prog = new Progress(d, x, 'Running', g.progress)
  const known = p ? new Set(p.services.keys()) : null, images = new Set<string>()
  const mine = projectCtrs(d, name).filter(c => !known || known.has(svcOf(c)) || f['remove-orphans'])
  for (const c of mine) images.add(c.image)
  try {
    yield* walk(d, x, p, mine, 'down', prog, function* (c) {
      prog.set(rowOf(c), 'Stopping', false)
      yield* stopAll(d, x, [c], t)
      prog.set(rowOf(c), 'Removing', false)
      yield* pause(x, 60)
      d.remove(c, { force: true, volumes: f.volumes })
      prog.set(rowOf(c), 'Removed')
    })
    if (f.volumes) for (const v of [...d.volumes.values()]) if (v.labels[`${LABEL}.project`] === name && !d.volumeUsers(v.name).length) { d.removeVolume(v.name); prog.set(`Volume ${v.name}`, 'Removed') }
    for (const n of [...d.networks.values()]) {
      if (n.labels[`${LABEL}.project`] !== name || d.netUsers(n).length) continue
      prog.set(`Network ${n.name}`, 'Removing', false)
      yield* pause(x, 100)
      d.removeNetwork(n.name)
      prog.set(`Network ${n.name}`, 'Removed')
    }
    if (f.rmi) {
      if (!['all', 'local'].includes(f.rmi)) throw new CliError(`invalid value for --rmi: "${f.rmi}"`, 1)
      for (const i of images) { const local = p ? [...p.services.values()].some(s => s.build && imageName(p, s) === i) : false; if ((f.rmi === 'all' || local) && d.findImage(i)) { d.removeImage(i); prog.set(`Image ${i}`, 'Removed') } }
    }
  } finally { prog.finish() }
  if (!prog.size) x.err(`Warning: No resource found to remove for project "${name}".\n`)
}
function ctrFor(d: Daemon, p: Project, svc: string, index = 1) {
  if (!p.services.has(svc)) throw new DockerError(`no such service: ${svc}`)
  const c = projectCtrs(d, p.name).find(k => svcOf(k) === svc && numOf(k) === index && k.labels[`${LABEL}.oneoff`] !== 'True')
  if (!c) throw new DockerError(`service "${svc}" is not running`)
  return c
}

export type ComposeApi = {
  docker(argv: string[], x: Ctx): Gen
  exec(c: Container, argv: string[], f: Flags, x: Ctx): Gen
  attach(c: Container, x: Ctx, interactive: boolean, cursor: number): Gen
}
const GLOBAL = { 'file|f': 'm', 'project-name|p': 's', profile: 'm', 'project-directory': 's', 'env-file': 's', ansi: 's', progress: 's', 'all-resources': 'b', parallel: 's', compatibility: 'b', 'dry-run': 'b', 'version|v': 'b' } as const

export function* composeMain(d: Daemon, x: Ctx, argv: string[], api: ComposeApi): Gen {
  const { f: gf, rest } = parseFlags(argv, { ...GLOBAL }, 'docker compose', true)
  const [cmd, ...args] = rest
  const g: Flags = { file: gf.file, project_name: gf['project-name'], profile: gf.profile, project_directory: gf['project-directory'], env_file: gf['env-file'], progress: gf.progress ?? (gf.ansi === 'never' ? 'plain' : undefined) }
  if (gf.version || cmd === 'version') { x.out('Docker Compose version v2.30.3 (simulated)\n'); return 0 }
  if (!cmd || cmd === 'help') { x.out('Usage:  docker compose [OPTIONS] COMMAND\n\nCommands:\n  attach build commit config cp create down events exec export images kill logs ls pause port ps pull restart rm run scale start stats stop top unpause up version volumes wait watch\n'); return 0 }
  if (cmd === 'ls') {
    const { f } = parseFlags(args, { 'all|a': 'b', 'quiet|q': 'b', format: 's', filter: 'm' }, 'docker compose ls')
    const names = [...new Set([...d.containers.values()].map(c => c.labels[`${LABEL}.project`]).filter(Boolean))]
    const rows = names.map(n => { const cs = projectCtrs(d, n), up = cs.filter(c => c.status === 'running').length; return { n, cs, up } }).filter(r => f.all || r.up)
    if (f.quiet) { rows.forEach(r => x.out(r.n + '\n')); return 0 }
    x.out(table([['NAME', 'STATUS', 'CONFIG FILES'], ...rows.map(r => [r.n, r.up ? `running(${r.up})` : `exited(${r.cs.length})`, r.cs[0].labels[`${LABEL}.project.config_files`]])]))
    return 0
  }
  const p = loadProject(d, x, g)
  for (const w of p.warnings) note(x, `level=warning msg="${w.replace(/"/g, '\\"')}"\n`)
  const pick = (names: string[]) => {
    for (const n of names) if (!p.services.has(n)) throw new DockerError(`no such service: ${n}`)
    return projectCtrs(d, p.name).filter(c => c.labels[`${LABEL}.oneoff`] !== 'True' && (!names.length || names.includes(svcOf(c)))).sort((a, b) => svcOf(a).localeCompare(svcOf(b)) || numOf(a) - numOf(b))
  }
  const each = (names: string[], busy: string, verb: string, fn: (c: Container) => void) => {
    const prog = new Progress(d, x, busy, g.progress)
    for (const c of pick(names)) { fn(c); prog.set(rowOf(c), verb) }
    prog.finish()
    return 0
  }
  const graph = function* (list: Container[], dir: 'up' | 'down', busy: string, job: (c: Container, prog: Progress) => Gen<void>): Gen {
    const prog = new Progress(d, x, busy, g.progress)
    try { yield* walk(d, x, p, list, dir, prog, c => job(c, prog)) } finally { prog.finish() }
    return 0
  }
  const timeoutOf = (f: Flags) => f.timeout === undefined ? undefined : Number(f.timeout)
  const starting = function* (c: Container, prog: Progress, verb: string): Gen<void> {
    const s = p.services.get(svcOf(c))
    if (s) yield* waitDeps(d, x, p, s, prog)
    prog.set(rowOf(c), verb === 'Started' ? 'Starting' : 'Restarting', false)
    c.restarts = 0
    d.start(c)
    yield* pause(x, 300)
    prog.set(rowOf(c), verb)
  }
  switch (cmd) {
    case 'up': return yield* up(d, x, p, g, args)
    case 'down': {
      const { f } = parseFlags(args, { 'volumes|v': 'b', 'remove-orphans': 'b', rmi: 's', 'timeout|t': 's' }, 'docker compose down')
      yield* down(d, x, p.name, p, f, g)
      return 0
    }
    case 'config': {
      const { f } = parseFlags(args, { 'quiet|q': 'b', services: 'b', volumes: 'b', networks: 'b', format: 's', 'no-interpolate': 'b', 'resolve-image-digests': 'b' }, 'docker compose config')
      if (f.quiet) return 0
      if (f.services) { for (const s of p.services.keys()) x.out(s + '\n'); return 0 }
      if (f.volumes) { for (const s of p.volumes.keys()) x.out(s + '\n'); return 0 }
      if (f.networks) { for (const s of p.networks.keys()) x.out(s + '\n'); return 0 }
      const o: string[] = [`name: ${p.name}`, 'services:']
      for (const s of ordered(p, [], g.profile ?? [])) {
        o.push(`  ${s.name}:`)
        if (s.build) o.push('    build:', `      context: ${s.build.context}`, `      dockerfile: ${s.build.dockerfile}`)
        if (s.image) o.push(`    image: ${s.image}`)
        if (s.create.cmd) o.push('    command:', ...s.create.cmd.map(a => `      - ${a}`))
        if (s.create.env?.length) o.push('    environment:', ...s.create.env.map(e => `      ${e.replace('=', ': ')}`))
        if (s.deps.length) o.push('    depends_on:', ...s.deps.flatMap(x => [`      ${x.name}:`, `        condition: ${x.condition}`]))
        if (s.create.ports?.length) o.push('    ports:', ...s.create.ports.flatMap(b => [`      - mode: ingress`, `        target: ${b.port}`, ...(b.host ? [`        published: "${b.host}"`] : []), `        protocol: ${b.proto}`]))
        if (s.create.mounts?.length) o.push('    volumes:', ...s.create.mounts.flatMap(m => [`      - type: ${m.type}`, `        source: ${m.source}`, `        target: ${m.target}`]))
        if (s.nets.length) o.push('    networks:', ...s.nets.map(n => `      ${n.key}: null`))
      }
      if (p.networks.size) o.push('networks:', ...[...p.networks].flatMap(([k, n]) => [`  ${k}:`, `    name: ${n.name}`]))
      if (p.volumes.size) o.push('volumes:', ...[...p.volumes].flatMap(([k, v]) => [`  ${k}:`, `    name: ${v.name}`]))
      x.out(o.join('\n') + '\n')
      return 0
    }
    case 'build': {
      const { f, rest: names } = parseFlags(args, { 'no-cache': 'b', pull: 'b', 'quiet|q': 'b', 'build-arg': 'm', progress: 's', push: 'b' }, 'docker compose build')
      const extra = Object.fromEntries((f['build-arg'] ?? []).map((a: string) => { const i = a.indexOf('='); return [a.slice(0, i), a.slice(i + 1)] }))
      for (const s of ordered(p, names, g.profile ?? [], false)) if (s.build) { yield* buildPaced(d, x, buildOf(p, s, { args: extra, no_cache: f['no-cache'], pull_base: f.pull, quiet: f.quiet })); note(x, ` ✔ Service ${s.name}  Built\n`) }
      return 0
    }
    case 'pull': {
      const { rest: names } = parseFlags(args, { 'quiet|q': 'b', 'ignore-pull-failures': 'b', 'include-deps': 'b', policy: 's', 'ignore-buildable': 'b' }, 'docker compose pull')
      yield* pullAll(d, x, p, ordered(p, names, g.profile ?? [], false).filter(s => s.image && !s.build), g)
      return 0
    }
    case 'create': {
      const r = up(d, x, p, g, ['--no-start', ...args])
      return yield* r
    }
    case 'ps': {
      const { f, rest: names } = parseFlags(args, { 'all|a': 'b', 'quiet|q': 'b', services: 'b', status: 'm', filter: 'm', format: 's', orphans: 'b', 'no-trunc': 'b' }, 'docker compose ps')
      const now = d.clock(), wantedStatus = [...(f.status ?? []), ...(f.filter ?? []).filter((s: string) => s.startsWith('status=')).map((s: string) => s.slice(7))]
      const list = pick(names).filter(c => (f.all || alive(c) || wantedStatus.length) && (!wantedStatus.length || wantedStatus.includes(c.status)))
      if (f.quiet) { list.forEach(c => x.out(c.id + '\n')); return 0 }
      if (f.services) { [...new Set(list.map(svcOf))].forEach(s => x.out(s + '\n')); return 0 }
      const rows = list.map(c => ({ ID: c.id.slice(0, 12), Name: c.name, Names: c.name, Image: c.image, Command: shortCmd(c, d, !!f['no-trunc']), Project: p.name, Service: svcOf(c), RunningFor: ago(now - c.created), CreatedAt: new Date(c.created).toISOString(), State: c.status, Status: statusText(c, now), Health: c.health?.status ?? '', ExitCode: c.exitCode, Ports: portsText(c), Labels: Object.entries(c.labels).map(([k, v]) => `${k}=${v}`).join(',') }))
      if (f.format && f.format !== 'table') { formatted(x, f.format, rows, { Name: 'NAME', RunningFor: 'CREATED' }); return 0 }
      x.out(table([['NAME', 'IMAGE', 'COMMAND', 'SERVICE', 'CREATED', 'STATUS', 'PORTS'], ...rows.map(r => [r.Name, r.Image, r.Command, r.Service, r.RunningFor, r.Status, r.Ports])]))
      return 0
    }
    case 'logs': {
      const { f, rest: names } = parseFlags(args, { ...LOG_FLAGS, 'no-color': 'b', 'no-log-prefix': 'b', 'index': 's' }, 'docker compose logs')
      d.sync()
      const list = pick(names), width = Math.max(0, ...list.map(c => label(c).length))
      const view = { prefix: f['no-log-prefix'] ? undefined : (c: Container) => `${label(c).padEnd(width)}  | `, timestamps: f.timestamps }
      const win = logWindow(f, d.clock())
      printLines(list.flatMap(c => win(c.logs).map(l => ({ c, l }))), x, view)
      if (!f.follow) return 0
      const cursor = new Map(list.map(c => [c.id, c.logSeq]))
      const r = yield* followLogs(d, x, () => pick(names).filter(c => d.containers.has(c.id)), cursor, view)
      return r
    }
    case 'start': return yield* graph(pick(parseFlags(args, {}, 'docker compose start').rest).filter(c => !alive(c)), 'up', 'Running', function* (c, prog) { yield* starting(c, prog, 'Started') })
    case 'stop': { const { f, rest: n } = parseFlags(args, { 'timeout|t': 's' }, 'docker compose stop'); return yield* graph(pick(n), 'down', 'Stopping', function* (c, prog) { prog.set(rowOf(c), 'Stopping', false); yield* stopAll(d, x, [c], timeoutOf(f)); prog.set(rowOf(c), 'Stopped') }) }
    case 'restart': {
      const { f, rest: n } = parseFlags(args, { 'timeout|t': 's', 'no-deps': 'b' }, 'docker compose restart'), list = pick(n)
      yield* graph(list, 'down', 'Stopping', function* (c, prog) { prog.set(rowOf(c), 'Stopping', false); yield* stopAll(d, x, [c], timeoutOf(f)); prog.set(rowOf(c), 'Stopped') })
      return yield* graph(list.filter(c => d.containers.has(c.id)), 'up', 'Restarting', function* (c, prog) { yield* starting(c, prog, 'Restarted') })
    }
    case 'kill': { const { f, rest: n } = parseFlags(args, { 'signal|s': 's', 'remove-orphans': 'b' }, 'docker compose kill'); return each(n, 'Killing', 'Killed', c => { if (alive(c)) d.kill(c, f.signal) }) }
    case 'pause': return each(parseFlags(args, {}, 'docker compose pause').rest, 'Pausing', 'Paused', c => { if (c.status === 'running') d.pause(c) })
    case 'unpause': return each(parseFlags(args, {}, 'docker compose unpause').rest, 'Unpausing', 'Unpaused', c => { if (c.status === 'paused') d.unpause(c) })
    case 'rm': {
      const { f, rest: n } = parseFlags(args, { 'force|f': 'b', 'stop|s': 'b', 'volumes|v': 'b' }, 'docker compose rm')
      const list = pick(n).filter(c => f.stop || !alive(c))
      if (f.stop) yield* stopAll(d, x, list)
      if (!list.length) { x.err('No stopped containers\n'); return 0 }
      if (!f.force) x.err(`Going to remove ${list.map(c => c.name).join(', ')}\n`)
      const prog = new Progress(d, x, 'Removing', g.progress)
      for (const c of list) { d.remove(c, { volumes: f.volumes }); prog.set(rowOf(c), 'Removed') }
      prog.finish()
      return 0
    }
    case 'exec': {
      const { f, rest: r } = parseFlags(args, { 'detach|d': 'b', 'env|e': 'm', 'user|u': 's', 'workdir|w': 's', 'index': 's', 'no-TTY|T': 'b', 'interactive|i': 'b', 'tty|t': 'b', privileged: 'b' }, 'docker compose exec', true)
      needArgs(r, 2, 'docker compose exec')
      return yield* api.exec(ctrFor(d, p, r[0], Number(f.index ?? 1)), r.slice(1), { ...f, interactive: !f['no-TTY'], tty: !f['no-TTY'] }, x)
    }
    case 'run': {
      const { f, rest: r } = parseFlags(args, { 'detach|d': 'b', rm: 'b', 'env|e': 'm', 'user|u': 's', 'workdir|w': 's', name: 's', entrypoint: 's', 'no-deps': 'b', build: 'b', 'publish|p': 'm', 'service-ports|P': 'b', 'no-TTY|T': 'b', 'interactive|i': 'b', 'volume|v': 'm', 'label|l': 'm', 'quiet-pull': 'b', 'remove-orphans': 'b', 'use-aliases': 'b' }, 'docker compose run', true)
      needArgs(r, 1, 'docker compose run')
      const s = p.services.get(r[0])
      if (!s) throw new DockerError(`no such service: ${r[0]}`)
      const deps = f['no-deps'] ? [] : ordered(p, [s.name], []).filter(o => o !== s)
      if (deps.length) yield* up(d, x, p, g, ['--detach', '--no-recreate', ...deps.map(k => k.name)])
      yield* ensureImages(d, x, p, [s], g, { build: f.build })
      const prog = new Progress(d, x, 'Running', g.progress)
      yield* ensureInfra(d, x, p, [s], prog)
      yield* waitDeps(d, x, p, s, prog)
      prog.finish()
      const img = d.findImage(imageName(p, s))!
      const o = createOpts(p, s, 1, img.id, f.name ?? `${p.name}-${s.name}-run-${d.id('run').slice(0, 12)}`, true)
      if (r.length > 1) o.cmd = r.slice(1)
      if (f.entrypoint) o.entrypoint = splitWords(f.entrypoint)
      o.env = [...(o.env ?? []), ...(f.env ?? [])]
      o.user = f.user ?? o.user; o.workdir = f.workdir ?? o.workdir
      if (!f['service-ports']) o.ports = (f.publish ?? []).flatMap(parsePorts)
      o.rm = f.rm; o.restart = undefined
      o.tty = !f['no-TTY']; o.stdin = !f['no-TTY'] && !f.detach
      const c = d.create(o)
      d.start(c)
      yield* pause(x, 300)
      if (f.detach) { x.out(c.name + '\n'); return 0 }
      return yield* api.attach(c, x, !f['no-TTY'], 0)
    }
    case 'images': {
      const { f, rest: n } = parseFlags(args, { 'quiet|q': 'b', format: 's' }, 'docker compose images')
      const list = pick(n)
      if (f.quiet) { list.forEach(c => x.out(c.imageId + '\n')); return 0 }
      x.out(table([['CONTAINER', 'REPOSITORY', 'TAG', 'IMAGE ID', 'SIZE'], ...list.map(c => { const i = normRef(c.image), k = i.lastIndexOf(':'); return [c.name, i.slice(0, k), i.slice(k + 1), c.imageId.slice(0, 12), `${Math.round((d.images.get(c.imageId)?.size ?? 0) / 1e6)}MB`] })]))
      return 0
    }
    case 'top': {
      for (const c of pick(parseFlags(args, {}, 'docker compose top').rest).filter(k => k.status === 'running')) x.out(`${c.name}\n${table(topRows(c, d.clock()))}\n`)
      return 0
    }
    case 'cp': {
      const { f, rest: r } = parseFlags(args, { 'archive|a': 'b', 'follow-link|L': 'b', index: 's', all: 'b' }, 'docker compose cp')
      needArgs(r, 2, 'docker compose cp', 2)
      const side = (s: string) => { const m = s.match(/^([a-zA-Z0-9][\w.-]*):(.*)$/); return m ? `${ctrFor(d, p, m[1], Number(f.index ?? 1)).name}:${m[2]}` : s }
      return yield* api.docker(['cp', side(r[0]), side(r[1])], x)
    }
    case 'events': {
      const { f } = parseFlags(args, { json: 'b', since: 's', until: 's' }, 'docker compose events')
      const names = pick([]).flatMap(c => ['--filter', `container=${c.name}`])
      return yield* api.docker(['events', ...names, ...(f.json ? ['--format', 'json'] : []), ...(f.since ? ['--since', f.since] : []), ...(f.until ? ['--until', f.until] : [])], x)
    }
    case 'wait': {
      const { f, rest: n } = parseFlags(args, { 'down-project': 'b' }, 'docker compose wait')
      needArgs(n, 1, 'docker compose wait')
      const list = pick(n)
      if (!list.length) throw new DockerError(`no containers for project "${p.name}"`)
      yield* waitUntil(d, x, () => list.every(c => !alive(c)), Infinity)
      for (const c of list) x.out(`${c.exitCode}\n`)
      if (f['down-project']) yield* down(d, x, p.name, p, {}, g)
      return 0
    }
    case 'attach': {
      const { f, rest: r } = parseFlags(args, { index: 's', 'no-stdin': 'b', 'sig-proxy': 'b', 'detach-keys': 's' }, 'docker compose attach')
      needArgs(r, 1, 'docker compose attach', 1)
      const c = ctrFor(d, p, r[0], Number(f.index ?? 1))
      return yield* api.attach(c, x, true, c.logSeq)
    }
    case 'stats': {
      const { f, rest: n } = parseFlags(args, { 'all|a': 'b', 'no-stream': 'b', 'no-trunc': 'b', format: 's' }, 'docker compose stats')
      const list = pick(n).filter(c => f.all || c.status === 'running').map(c => c.name)
      return yield* api.docker(['stats', ...(f['no-stream'] ? ['--no-stream'] : []), ...(f.format ? ['--format', f.format] : []), ...list], x)
    }
    case 'volumes': {
      const { f, rest: n } = parseFlags(args, { 'quiet|q': 'b', format: 's' }, 'docker compose volumes')
      const list = [...p.volumes.values()].filter(v => d.volumes.has(v.name) && (!n.length || n.some(k => p.services.get(k)?.create.mounts?.some(m => m.source === v.name))))
      if (f.quiet) { list.forEach(v => x.out(v.name + '\n')); return 0 }
      x.out(table([['DRIVER', 'VOLUME NAME'], ...list.map(v => ['local', v.name])]))
      return 0
    }
    case 'scale': {
      const { f, rest: r } = parseFlags(args, { 'no-deps': 'b' }, 'docker compose scale')
      needArgs(r, 1, 'docker compose scale')
      for (const a of r) if (!/^[^=]+=\d+$/.test(a)) throw new CliError(`invalid replica count: ${a}`, 1)
      return yield* up(d, x, p, g, ['--detach', '--no-recreate', ...(f['no-deps'] ? ['--no-deps'] : []), ...r.flatMap(a => ['--scale', a]), ...r.map(a => a.split('=')[0])])
    }
    case 'commit': { const { f, rest: r } = parseFlags(args, { 'author|a': 's', 'message|m': 's', 'pause|p': 'b', 'change|c': 'm', index: 's' }, 'docker compose commit'); needArgs(r, 1, 'docker compose commit', 2); return yield* api.docker(['commit', ...(f.message ? ['-m', f.message] : []), ctrFor(d, p, r[0], Number(f.index ?? 1)).name, ...r.slice(1)], x) }
    case 'export': { const { f, rest: r } = parseFlags(args, { 'output|o': 's', index: 's' }, 'docker compose export'); needArgs(r, 1, 'docker compose export', 1); return yield* api.docker(['export', ...(f.output ? ['-o', f.output] : []), ctrFor(d, p, r[0], Number(f.index ?? 1)).name], x) }
    case 'watch': throw new CliError("none of the selected services is configured for watch, consider setting a 'develop' section", 1)
    case 'port': {
      const { f, rest: r } = parseFlags(args, { protocol: 's', index: 's' }, 'docker compose port')
      needArgs(r, 2, 'docker compose port', 2)
      const c = ctrFor(d, p, r[0], Number(f.index ?? 1)), b = c.bound.find(k => k.port === Number(r[1]) && k.proto === (f.protocol ?? 'tcp'))
      if (!b) throw new DockerError(`no port ${r[1]}/${f.protocol ?? 'tcp'} for container ${c.name}`)
      x.out(`${b.ip}:${b.host}\n`)
      return 0
    }
  }
  throw new CliError(`unknown docker command: "compose ${cmd}"`, 1)
}
