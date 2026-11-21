// The simulated registry. Images are described by data only: a base system plus marker files for their software.
import { dirEntry, fileEntry, newTree, plant, type Tree } from './fs.ts'

export type Health = { test: string[]; interval: number; timeout: number; retries: number; startPeriod: number }
export type ImageConfig = {
  Cmd: string[] | null; Entrypoint: string[] | null; Env: string[]; WorkingDir: string; User: string
  ExposedPorts: string[]; Volumes: string[]; Labels: Record<string, string>; StopSignal: string; Shell: string[]; Healthcheck: Health | null
}
export const emptyConfig = (): ImageConfig => ({ Cmd: null, Entrypoint: null, Env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'], WorkingDir: '', User: '', ExposedPorts: [], Volumes: [], Labels: {}, StopSignal: '', Shell: ['/bin/sh', '-c'], Healthcheck: null })

const CORE = 'echo printf pwd test cat ls mkdir rmdir touch rm cp mv chmod chown env printenv whoami id hostname uname nproc sleep date head tail wc grep sed tee seq basename dirname which ps kill true false'.split(' ')
const OS: Record<string, { bins: string[]; pretty: string }> = {
  alpine: { bins: [...CORE, 'sh', 'ash', 'wget', 'ping', 'nslookup', 'getent', 'apk'], pretty: 'Alpine Linux v3.20' },
  busybox: { bins: [...CORE, 'sh', 'ash', 'wget', 'ping', 'nslookup'], pretty: 'BusyBox' },
  debian: { bins: [...CORE, 'sh', 'dash', 'bash', 'getent', 'apt-get', 'apt'], pretty: 'Debian GNU/Linux 12 (bookworm)' },
  ubuntu: { bins: [...CORE, 'sh', 'dash', 'bash', 'getent', 'apt-get', 'apt'], pretty: 'Ubuntu 24.04 LTS' },
}
export function baseTree(os: string, users: [string, number][] = []): Tree {
  const t = newTree()
  for (const d of ['/bin', '/usr/bin', '/usr/sbin', '/usr/local/bin', '/sbin', '/etc', '/home', '/root', '/var', '/var/log', '/opt', '/srv', '/mnt', '/proc', '/sys', '/dev']) plant(t, d, dirEntry())
  plant(t, '/tmp', dirEntry(0o777))
  for (const b of OS[os].bins) plant(t, `/bin/${b}`, fileEntry(`\0bin:${b}`, 0o755))
  const all: [string, number][] = [['root', 0], ['nobody', 65534], ...users]
  plant(t, '/etc/passwd', fileEntry(all.map(([n, u]) => `${n}:x:${u}:${u}:${n}:${u ? `/home/${n}` : '/root'}:/bin/sh`).join('\n') + '\n'))
  plant(t, '/etc/os-release', fileEntry(`PRETTY_NAME="${OS[os].pretty}"\n`))
  for (const [n, u] of users) plant(t, `/home/${n}`, dirEntry(0o755, u))
  return t
}

type Spec = {
  tags: RegExp; size: number; os?: (tag: string) => string | null
  cmd?: string[]; entrypoint?: string[]; ports?: string[]; env?: string[]; workdir?: string; volumes?: string[]; stop?: string
  files?: Record<string, string>; exe?: Record<string, string>; users?: [string, number][]
  /** Version variable the official image sets, with the version of its `latest` tag. */
  ver?: [string, string]
}
const flavour = (fallback: string) => (tag: string) => tag.includes('alpine') ? 'alpine' : fallback
const svc = (port: number, kind: 'http' | 'tcp', root = '') => `\0svc:${port}:${kind}:${root}`
const v = String.raw
const HELLO = `\nHello from Docker!\nThis message shows that your installation appears to be working correctly.\n\nTo generate this message, Docker took the following steps:\n 1. The Docker client contacted the Docker daemon.\n 2. The Docker daemon pulled the "hello-world" image from the Docker Hub.\n 3. The Docker daemon created a new container from that image which runs the\n    executable that produces the output you are currently reading.\n 4. The Docker daemon streamed that output to the Docker client, which sent it\n    to your terminal.\n`
const page = (t: string) => `<!doctype html>\n<html><head><title>${t}</title></head><body><h1>${t}</h1></body></html>\n`
const NUM = v`\d+(\.\d+){0,2}`
const tagRe = (ver: string, extra = '') => new RegExp(`^(latest|alpine[\\d.]*|slim|bookworm${extra}|(${ver})(-(alpine[\\d.]*|slim|bookworm))?)$`)

export const CATALOG: Record<string, Spec> = {
  'hello-world': { tags: /^(latest|linux)$/, size: 0.0133, os: () => null, cmd: ['/hello'], exe: { '/hello': `\0print:${HELLO.replace(/\n/g, '\\n')}` } },
  alpine: { tags: /^(latest|edge|3(\.\d+){0,2})$/, size: 8.83, os: () => 'alpine', cmd: ['/bin/sh'] },
  busybox: { tags: /^(latest|stable|1(\.\d+){0,2})$/, size: 4.26, os: () => 'busybox', cmd: ['sh'] },
  debian: { tags: /^(latest|stable|bookworm|bullseye|trixie|bookworm-slim|\d+(\.\d+)?(-slim)?)$/, size: 117, os: () => 'debian', cmd: ['bash'] },
  ubuntu: { tags: /^(latest|rolling|noble|jammy|\d\d\.\d\d)$/, size: 78.1, os: () => 'ubuntu', cmd: ['/bin/bash'] },
  nginx: { ver: ['NGINX_VERSION', '1.27.2'], tags: tagRe('1(\\.\\d+){0,2}', '|stable|mainline'), size: 192, cmd: ['nginx', '-g', 'daemon off;'], ports: ['80/tcp'], stop: 'SIGQUIT', exe: { '/usr/sbin/nginx': svc(80, 'http', '/usr/share/nginx/html'), '/usr/bin/curl': '\0bin:curl' }, files: { '/usr/share/nginx/html/index.html': page('Welcome to nginx!') } },
  httpd: { ver: ['HTTPD_VERSION', '2.4.62'], tags: tagRe('2(\\.\\d+){0,2}'), size: 148, cmd: ['httpd-foreground'], ports: ['80/tcp'], stop: 'SIGWINCH', workdir: '/usr/local/apache2', exe: { '/usr/local/bin/httpd-foreground': svc(80, 'http', '/usr/local/apache2/htdocs') }, files: { '/usr/local/apache2/htdocs/index.html': page('It works!') } },
  node: { tags: tagRe(NUM, '|lts'), size: 1100, cmd: ['node'], ver: ['NODE_VERSION', '22.11.0'], users: [['node', 1000]], exe: { '/usr/local/bin/node': '\0run:', '/usr/local/bin/npm': '\0bin:npm' } },
  python: { tags: tagRe(NUM), size: 1020, cmd: ['python3'], ver: ['PYTHON_VERSION', '3.13.0'], exe: { '/usr/local/bin/python3': '\0run:', '/usr/local/bin/python': '\0run:', '/usr/local/bin/pip': '\0bin:pip', '/usr/local/bin/pip3': '\0bin:pip3' } },
  redis: { ver: ['REDIS_VERSION', '7.4.1'], tags: tagRe(NUM), size: 117, cmd: ['redis-server'], ports: ['6379/tcp'], workdir: '/data', volumes: ['/data'], users: [['redis', 999]], exe: { '/usr/local/bin/redis-server': svc(6379, 'tcp'), '/usr/local/bin/redis-cli': '\0bin:redis-cli' } },
  postgres: { ver: ['PG_VERSION', '17.0'], tags: tagRe(NUM), size: 456, cmd: ['postgres'], ports: ['5432/tcp'], stop: 'SIGINT', volumes: ['/var/lib/postgresql/data'], users: [['postgres', 999]], env: ['PGDATA=/var/lib/postgresql/data'], exe: { '/usr/local/bin/postgres': svc(5432, 'tcp'), '/usr/local/bin/pg_isready': '\0bin:pg_isready', '/usr/local/bin/psql': '\0bin:psql' } },
  mysql: { ver: ['MYSQL_VERSION', '9.1.0'], tags: /^(latest|lts|\d+(\.\d+){0,2})$/, size: 859, cmd: ['mysqld'], ports: ['3306/tcp'], volumes: ['/var/lib/mysql'], users: [['mysql', 999]], exe: { '/usr/local/bin/mysqld': svc(3306, 'tcp'), '/usr/local/bin/mysqladmin': '\0bin:mysqladmin', '/usr/local/bin/mysql': '\0bin:mysql' } },
  mariadb: { ver: ['MARIADB_VERSION', '11.5.2'], tags: /^(latest|lts|\d+(\.\d+){0,2})$/, size: 407, cmd: ['mariadbd'], ports: ['3306/tcp'], volumes: ['/var/lib/mysql'], users: [['mysql', 999]], exe: { '/usr/local/bin/mariadbd': svc(3306, 'tcp'), '/usr/local/bin/mariadb-admin': '\0bin:mysqladmin', '/usr/local/bin/mariadb': '\0bin:mysql', '/usr/local/bin/healthcheck.sh': '\0bin:mysqladmin' } },
  mongo: { ver: ['MONGO_VERSION', '8.0.3'], tags: /^(latest|\d+(\.\d+){0,2})$/, size: 855, cmd: ['mongod'], ports: ['27017/tcp'], volumes: ['/data/db', '/data/configdb'], users: [['mongodb', 999]], exe: { '/usr/local/bin/mongod': svc(27017, 'tcp'), '/usr/local/bin/mongosh': '\0bin:mongosh' } },
}

/** Build the file system and config of a catalog image. Null when repo or tag do not exist. */
export function materialize(repo: string, tag: string) {
  const s = CATALOG[repo]
  if (!s || !s.tags.test(tag)) return null
  const os = s.os ? s.os(tag) : flavour('debian')(tag)
  const tree = os ? baseTree(os, s.users) : newTree()
  for (const [p, d] of Object.entries(s.exe ?? {})) plant(tree, p, fileEntry(d, 0o755))
  for (const [p, d] of Object.entries(s.files ?? {})) plant(tree, p, fileEntry(d))
  for (const d of [s.workdir, ...(s.volumes ?? [])]) if (d) plant(tree, d, dirEntry())
  const cfg = emptyConfig()
  cfg.Cmd = s.cmd ?? null; cfg.Entrypoint = s.entrypoint ?? null
  cfg.Env.push(...(s.env ?? []))
  if (s.ver) {
    // node:20 means 20.x: keep the full default when the tag agrees with it, otherwise trust the tag
    const wanted = /^\d/.test(tag) ? tag.split('-')[0] : s.ver[1], parts = s.ver[1].split('.').length
    cfg.Env.push(`${s.ver[0]}=${s.ver[1].startsWith(`${wanted}.`) ? s.ver[1] : [...wanted.split('.'), '0', '0'].slice(0, Math.max(parts, wanted.split('.').length)).join('.')}`)
  }
  cfg.WorkingDir = s.workdir ?? ''
  cfg.ExposedPorts = s.ports ?? []; cfg.Volumes = s.volumes ?? []; cfg.StopSignal = s.stop ?? ''
  const size = Math.round(s.size * (os === 'alpine' && repo !== 'alpine' ? 0.25 : 1) * 1e6)
  return { tree, config: cfg, size }
}
