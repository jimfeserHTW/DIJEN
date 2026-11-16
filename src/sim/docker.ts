// A tiny in-memory Docker CLI. State is mutated in place; run() returns the text a terminal would print.
export type Ctr = {
  id: string; name: string; image: string; cmd: string
  status: 'running' | 'exited'; ports: string[]; env: string[]; vols: string[]; net: string; logs: string[]
}
export type State = { images: string[]; containers: Ctr[]; volumes: string[]; networks: string[]; n: number }

export const initial = (): State => ({ images: [], containers: [], volumes: [], networks: ['bridge', 'host', 'none'], n: 0 })

type Img = { service?: string[]; cmd: string; size: string }
const CATALOG: Record<string, Img> = {
  'hello-world': { cmd: '"/hello"', size: '13.3kB' },
  alpine: { cmd: '"/bin/sh"', size: '8.83MB' },
  busybox: { cmd: '"sh"', size: '4.26MB' },
  ubuntu: { cmd: '"/bin/bash"', size: '78.1MB' },
  node: { cmd: '"node"', size: '1.1GB' },
  python: { cmd: '"python3"', size: '1.02GB' },
  nginx: { cmd: '"/docker-entrypoint.…"', size: '192MB', service: ['/docker-entrypoint.sh: Configuration complete; ready for start up', 'nginx: worker process started', 'GET / 200 – "Welcome to nginx!"'] },
  redis: { cmd: '"docker-entrypoint.s…"', size: '117MB', service: ['* Ready to accept connections tcp'] },
  postgres: { cmd: '"docker-entrypoint.s…"', size: '456MB', service: ['database system is ready to accept connections'] },
  mysql: { cmd: '"docker-entrypoint.s…"', size: '859MB', service: ['ready for connections. port: 3306'] },
}
const NAMES = ['quirky_turing', 'happy_hopper', 'brave_lovelace', 'calm_ritchie', 'eager_torvalds', 'swift_curie']

const hex = (n: number) => { let x = (n + 1) * 2654435761 >>> 0, s = ''; while (s.length < 64) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; s += x.toString(16).padStart(8, '0') } return s }
const norm = (img: string) => (img.includes(':') ? img : `${img}:latest`)
const repo = (img: string) => img.split(':')[0]
export const table = (rows: string[][]) => {
  const w = rows[0].map((_, i) => Math.max(...rows.map(r => (r[i] ?? '').length)) + 3)
  return rows.map(r => r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(w[i]))).join('')).join('\n')
}

/** Output of a command executed inside a container (docker run <img> <cmd>, docker exec). */
function inside(image: string, args: string[]): string {
  const [c, ...rest] = args
  if (!c) return ''
  if (c === 'echo') return rest.join(' ').replace(/^["']|["']$/g, '')
  if (c === 'ls') return 'bin  dev  etc  home  lib  proc  root  tmp  usr  var'
  if (c === 'pwd') return '/'
  if (c === 'whoami') return 'root'
  if (c === 'hostname') return hex(image.length).slice(0, 12)
  if (c === 'cat' && rest[0] === '/etc/os-release') return image.startsWith('ubuntu') ? 'PRETTY_NAME="Ubuntu 24.04 LTS"' : 'PRETTY_NAME="Alpine Linux v3.20"'
  if (c === 'sh' || c === 'bash') return '[simulation] interactive shells are not available here – pass a command instead, e.g. `echo hi`.'
  return `OCI runtime exec failed: exec: "${c}": executable file not found in $PATH`
}

function parseRun(args: string[]) {
  const o = { d: false, rm: false, name: '', ports: [] as string[], env: [] as string[], vols: [] as string[], net: 'bridge', image: '', cmd: [] as string[] }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (o.image) { o.cmd.push(a); continue }
    if (a === '-d' || a === '--detach') o.d = true
    else if (a === '--rm') o.rm = true
    else if (['-it', '-i', '-t', '-dit'].includes(a)) { if (a === '-dit') o.d = true }
    else if (a === '--name') o.name = args[++i] ?? ''
    else if (a === '-p' || a === '--publish') o.ports.push(args[++i] ?? '')
    else if (a === '-e' || a === '--env') o.env.push(args[++i] ?? '')
    else if (a === '-v' || a === '--volume') o.vols.push(args[++i] ?? '')
    else if (a === '--network') o.net = args[++i] ?? 'bridge'
    else if (a.startsWith('-')) throw new Error(`unknown flag: ${a}\nSee 'docker run --help'.`)
    else o.image = a
  }
  return o
}

const pull = (s: State, img: string): string => {
  const ref = norm(img), r = repo(img)
  if (!CATALOG[r]) throw new Error(`pull access denied for ${r}, repository does not exist or may require 'docker login'`)
  if (s.images.includes(ref)) return ''
  s.images.push(ref)
  return `Unable to find image '${ref}' locally\n${ref.split(':')[1]}: Pulling from library/${r}\nDigest: sha256:${hex(s.n++).slice(0, 24)}…\nStatus: Downloaded newer image for ${ref}\n`
}

const find = (s: State, ref: string) => s.containers.find(c => c.name === ref || c.id.startsWith(ref))
const need = (s: State, ref?: string) => {
  if (!ref) throw new Error('"docker" requires at least 1 argument.')
  const c = find(s, ref)
  if (!c) throw new Error(`No such container: ${ref}`)
  return c
}

export function run(s: State, line: string): string {
  const t = line.trim().replace(/\s+/g, ' ')
  if (!t) return ''
  if (t === 'help' || t === 'docker' || t === 'docker --help') return 'Supported: docker run | ps | images | pull | stop | start | restart | rm | rmi | logs | exec | volume | network | version\nTip: type `clear` to empty the screen.'
  const [bin, cmd, ...args] = t.split(' ')
  if (bin !== 'docker') return `zsh: command not found: ${bin}\nThis sandbox only knows \`docker …\`. Type \`help\`.`
  try {
    switch (cmd) {
      case 'version': return 'Client: Docker Engine - Community\n Version:           27.3.1 (simulated)'
      case 'compose': return 'Compose has its own lab – open the Compose chapter. Here you can use plain `docker …` commands.'
      case 'build': return 'Building images is covered in the Dockerfile lab – open the Dockerfile chapter.'
      case 'pull': { if (!args[0]) throw new Error('"docker pull" requires 1 argument.'); const out = pull(s, args[0]); return out || `Status: Image is up to date for ${norm(args[0])}` }
      case 'images': return table([['REPOSITORY', 'TAG', 'IMAGE ID', 'SIZE'], ...s.images.map((i, k) => [repo(i), i.split(':')[1], hex(k + 40).slice(0, 12), CATALOG[repo(i)].size])])
      case 'rmi': {
        const ref = norm(args[0] ?? '')
        if (!s.images.includes(ref)) throw new Error(`No such image: ${args[0]}`)
        const user = s.containers.find(c => norm(c.image) === ref)
        if (user) throw new Error(`conflict: unable to remove repository reference "${args[0]}" (must force) - container ${user.id.slice(0, 12)} is using its referenced image`)
        s.images = s.images.filter(i => i !== ref)
        return `Untagged: ${ref}\nDeleted: sha256:${hex(7).slice(0, 24)}…`
      }
      case 'run': {
        const o = parseRun(args)
        if (!o.image) throw new Error('"docker run" requires at least 1 argument.')
        if (o.net !== 'bridge' && !s.networks.includes(o.net)) throw new Error(`network ${o.net} not found`)
        const img = CATALOG[repo(o.image)]
        if (!img) throw new Error(`pull access denied for ${repo(o.image)}, repository does not exist or may require 'docker login'`)
        if (o.name && find(s, o.name)) throw new Error(`Conflict. The container name "/${o.name}" is already in use. You have to remove (or rename) that container to be able to reuse that name.`)
        for (const p of o.ports) {
          const hostPort = (q: string) => q.split(':').slice(-2)[0] // "8080:80" and "0.0.0.0:8080:80" -> 8080
          const host = hostPort(p)
          const clash = s.containers.find(c => c.status === 'running' && c.ports.some(q => hostPort(q) === host))
          if (clash) throw new Error(`Bind for 0.0.0.0:${host} failed: port is already allocated (used by ${clash.name})`)
        }
        const out = pull(s, o.image)
        const id = hex(s.n++)
        const name = o.name || NAMES[s.containers.length % NAMES.length] + (s.containers.length >= NAMES.length ? s.n : '')
        const argsText = o.cmd.join(' ')
        const service = !!img.service && !o.cmd.length
        const logs = service ? img.service! : o.image.startsWith('hello-world') ? ['Hello from Docker!', 'This message shows that your installation appears to be working correctly.'] : [inside(o.image, o.cmd)]
        const c: Ctr = { id, name, image: o.image, cmd: argsText ? `"${argsText}"` : img.cmd, status: service && o.d ? 'running' : 'exited', ports: o.ports.map(p => p.includes(':') ? `0.0.0.0:${p}` : p), env: o.env, vols: o.vols, net: o.net, logs }
        if (!o.rm || (service && o.d)) s.containers.push(c)
        if (service && o.d) return out + id
        if (service) return out + logs.join('\n') + '\n[simulation] a foreground server would block your terminal here (Ctrl+C stops it). Use -d to run it in the background.'
        return out + logs.join('\n')
      }
      case 'ps': {
        const all = args.includes('-a') || args.includes('--all')
        const rows = s.containers.filter(c => all || c.status === 'running').map(c => [c.id.slice(0, 12), c.image, c.cmd, 'moments ago', c.status === 'running' ? 'Up 5 seconds' : 'Exited (0) 2 seconds ago', c.ports.map(p => p.replace(/:(\d+)$/, '->$1/tcp')).join(', '), c.name])
        return table([['CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'PORTS', 'NAMES'], ...rows])
      }
      case 'stop': case 'kill': { const c = need(s, args[0]); c.status = 'exited'; return c.name }
      case 'start': case 'restart': { const c = need(s, args[0]); c.status = 'running'; return c.name }
      case 'rm': {
        const force = args.includes('-f'); const ref = args.find(a => !a.startsWith('-'))
        const c = need(s, ref)
        if (c.status === 'running' && !force) throw new Error(`cannot remove container "${c.name}": container is running: stop the container before removing or force remove`)
        s.containers = s.containers.filter(x => x !== c); return c.name
      }
      case 'logs': { const c = need(s, args[0]); return c.logs.join('\n') || '(no output)' }
      case 'exec': {
        const rest = args.filter(a => !['-it', '-i', '-t'].includes(a)); const c = need(s, rest[0])
        if (c.status !== 'running') throw new Error(`container ${c.id} is not running`)
        return inside(c.image, rest.slice(1))
      }
      case 'volume': {
        if (args[0] === 'create') { if (!args[1]) throw new Error('"docker volume create" requires a name here.'); if (!s.volumes.includes(args[1])) s.volumes.push(args[1]); return args[1] }
        if (args[0] === 'ls') return table([['DRIVER', 'VOLUME NAME'], ...s.volumes.map(v => ['local', v])])
        if (args[0] === 'rm') { if (!s.volumes.includes(args[1])) throw new Error(`get ${args[1]}: no such volume`); s.volumes = s.volumes.filter(v => v !== args[1]); return args[1] }
        break
      }
      case 'network': {
        if (args[0] === 'create') { if (!args[1]) throw new Error('"docker network create" requires a name.'); s.networks.push(args[1]); return hex(s.n++).slice(0, 12) }
        if (args[0] === 'ls') return table([['NETWORK ID', 'NAME', 'DRIVER', 'SCOPE'], ...s.networks.map((n, i) => [hex(i + 90).slice(0, 12), n, n === 'host' || n === 'none' ? n : 'bridge', 'local'])])
        if (args[0] === 'rm') { s.networks = s.networks.filter(n => n !== args[1]); return args[1] }
        break
      }
    }
  } catch (e) { return `Error response from daemon: ${(e as Error).message}` }
  return `docker: '${cmd ?? ''}' is not supported in this sandbox. Type \`help\` for the list.`
}
