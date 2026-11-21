// Server software of the simulated images: how each one boots, what it logs, when it accepts connections,
// and the small client tools people use to talk to it. Data written by a server lands in its data directory,
// so it survives exactly as long as the container or volume holding that directory.
import { baseOf, dirOf, normPath } from './fs.ts'
import { NetError, programs, type Ctx, type Gen, type HttpReq, type HttpRes } from './shell.ts'

/** Delay before the line, the text ({t} = timestamp, {v} = version, {port}), and its stream (default stdout). */
type Line = [ms: number, text: string, err?: 1]
type Server = {
  versionEnv: string
  /** Output of `<server> --version`. */
  about: string
  stamp: (d: Date) => string
  /** A file that exists once the data directory has been initialized. */
  dataFile?: (c: Ctx) => string
  /** Why an uninitialized server refuses to start. */
  refuse?: (c: Ctx, now: string) => string | null
  init?: Line[]; resume?: Line[]; boot: Line[]; stop: Line[]
  portFlag?: string
  handler?: (c: Ctx) => (r: HttpReq) => HttpRes
}

const iso = (d: Date) => d.toISOString()
const reply = (o: unknown): HttpRes => ({ status: 200, body: JSON.stringify(o), type: 'application/json' })
const pgData = (c: Ctx) => c.env.get('PGDATA') ?? '/var/lib/postgresql/data'
const has = (c: Ctx, ...names: string[]) => names.some(n => c.env.get(n))
const mysqlEntry = (kind: 'MySQL' | 'MariaDB', ...rest: Line[]): Line[] => [
  [60, `{t} [Note] [Entrypoint]: Entrypoint script for ${kind} Server {v} started.`], [80, `{t} [Note] [Entrypoint]: Switching to dedicated user 'mysql'`], ...rest,
]

const SERVERS: Record<string, Server> = {
  nginx: {
    versionEnv: 'NGINX_VERSION', about: 'nginx version: nginx/{v}', stamp: d => iso(d).slice(0, 19).replace(/-/g, '/').replace('T', ' '),
    boot: [
      [20, '/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration'],
      [10, '/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/'],
      [10, '/docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh'],
      [20, '10-listen-on-ipv6-by-default.sh: info: Getting the checksum of /etc/nginx/conf.d/default.conf'],
      [10, '10-listen-on-ipv6-by-default.sh: info: Enabled listen on IPv6 in /etc/nginx/conf.d/default.conf'],
      [10, '/docker-entrypoint.sh: Sourcing /docker-entrypoint.d/15-local-resolvers.envsh'],
      [10, '/docker-entrypoint.sh: Launching /docker-entrypoint.d/20-envsubst-on-templates.sh'],
      [10, '/docker-entrypoint.sh: Launching /docker-entrypoint.d/30-tune-worker-processes.sh'],
      [10, '/docker-entrypoint.sh: Configuration complete; ready for start up'],
      [20, '{t} [notice] 1#1: using the "epoll" event method', 1], [0, '{t} [notice] 1#1: nginx/{v}', 1],
      [0, '{t} [notice] 1#1: OS: Linux 6.10.0', 1], [0, '{t} [notice] 1#1: start worker processes', 1], [10, '{t} [notice] 1#1: start worker process 29', 1],
    ],
    stop: [[30, '{t} [notice] 1#1: signal 3 (SIGQUIT) received, shutting down', 1], [60, '{t} [notice] 29#29: gracefully shutting down', 1], [20, '{t} [notice] 29#29: exiting', 1], [10, '{t} [notice] 1#1: worker process 29 exited with code 0', 1], [0, '{t} [notice] 1#1: exit', 1]],
  },
  'httpd-foreground': {
    versionEnv: 'HTTPD_VERSION', about: 'Server version: Apache/{v} (Unix)', stamp: d => `${d.toUTCString().slice(0, 3)} ${d.toUTCString().slice(8, 11)} ${d.toUTCString().slice(5, 7)} ${iso(d).slice(11, 23)}000 ${d.getUTCFullYear()}`,
    boot: [
      [40, "AH00558: httpd: Could not reliably determine the server's fully qualified domain name, using 172.17.0.2. Set the 'ServerName' directive globally to suppress this message", 1],
      [40, '[{t}] [mpm_event:notice] [pid 1:tid 1] AH00489: Apache/{v} (Unix) configured -- resuming normal operations', 1],
      [10, "[{t}] [core:notice] [pid 1:tid 1] AH00094: Command line: 'httpd -D FOREGROUND'", 1],
    ],
    stop: [[80, '[{t}] [mpm_event:notice] [pid 1:tid 1] AH00492: caught SIGWINCH, shutting down gracefully', 1]],
  },
  'redis-server': {
    versionEnv: 'REDIS_VERSION', about: 'Redis server v={v} sha=00000000:0 malloc=jemalloc-5.3.0 bits=64', stamp: d => `${d.toUTCString().slice(5, 16)} ${iso(d).slice(11, 23)}`, portFlag: '--port',
    boot: [
      [30, '1:C {t} * oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo'], [0, '1:C {t} * Redis version={v}, bits=64, commit=00000000, modified=0, pid=1, just started'],
      [0, '1:C {t} # Warning: no config file specified, using the default config. In order to specify a config file use redis-server /path/to/redis.conf'],
      [20, '1:M {t} * monotonic clock: POSIX clock_gettime'], [20, '1:M {t} * Running mode=standalone, port={port}.'], [30, '1:M {t} * Server initialized'], [20, '1:M {t} * Ready to accept connections tcp'],
    ],
    stop: [[20, '1:signal-handler ({t}) Received SIGTERM scheduling shutdown...'], [80, '1:M {t} # User requested shutdown...'], [20, '1:M {t} * Saving the final RDB snapshot before exiting.'], [60, '1:M {t} * DB saved on disk'], [10, '1:M {t} # Redis is now ready to exit, bye bye...']],
    handler: c => redis(c),
  },
  postgres: {
    versionEnv: 'PG_VERSION', about: 'postgres (PostgreSQL) {v}', stamp: d => `${iso(d).slice(0, 23).replace('T', ' ')} UTC`, portFlag: '-p',
    dataFile: c => `${pgData(c)}/PG_VERSION`,
    refuse: c => has(c, 'POSTGRES_PASSWORD', 'POSTGRES_PASSWORD_FILE') || c.env.get('POSTGRES_HOST_AUTH_METHOD') === 'trust' ? null : `Error: Database is uninitialized and superuser password is not specified.
       You must specify POSTGRES_PASSWORD to a non-empty value for the
       superuser. For example, "-e POSTGRES_PASSWORD=password" on "docker run".

       You may also use "POSTGRES_HOST_AUTH_METHOD=trust" to allow all
       connections without a password. This is *not* recommended.

       See PostgreSQL documentation about "trust":
       https://www.postgresql.org/docs/current/auth-trust.html
`,
    init: [
      [100, 'The files belonging to this database system will be owned by user "postgres".'], [0, 'This user must also own the server process.'], [0, ''],
      [0, 'The database cluster will be initialized with locale "en_US.utf8".'], [0, 'The default database encoding has accordingly been set to "UTF8".'], [0, ''],
      [150, 'fixing permissions on existing directory /var/lib/postgresql/data ... ok'], [100, 'creating subdirectories ... ok'], [150, 'selecting dynamic shared memory implementation ... posix'],
      [100, 'selecting default max_connections ... 100'], [100, 'selecting default shared_buffers ... 128MB'], [50, 'selecting default time zone ... Etc/UTC'], [100, 'creating configuration files ... ok'],
      [450, 'running bootstrap script ... ok'], [500, 'performing post-bootstrap initialization ... ok'], [200, 'syncing data to disk ... ok'], [0, ''], [50, 'PostgreSQL init process complete; ready for start up.'], [0, ''],
    ],
    resume: [[60, ''], [20, 'PostgreSQL Database directory appears to contain a database; Skipping initialization'], [0, '']],
    boot: [
      [120, '{t} [1] LOG:  starting PostgreSQL {v} on x86_64-pc-linux-gnu, compiled by gcc, 64-bit', 1], [20, '{t} [1] LOG:  listening on IPv4 address "0.0.0.0", port {port}', 1], [0, '{t} [1] LOG:  listening on IPv6 address "::", port {port}', 1],
      [10, '{t} [1] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.{port}"', 1], [60, '{t} [29] LOG:  database system was shut down at {t}', 1], [90, '{t} [1] LOG:  database system is ready to accept connections', 1],
    ],
    stop: [[20, '{t} [1] LOG:  received fast shutdown request', 1], [20, '{t} [1] LOG:  aborting any active transactions', 1], [60, '{t} [27] LOG:  shutting down', 1], [120, '{t} [1] LOG:  database system is shut down', 1]],
    handler: c => sqlServer(c, `${pgData(c)}/base.json`),
  },
  mysqld: {
    versionEnv: 'MYSQL_VERSION', about: 'mysqld  Ver {v} for Linux on x86_64 (MySQL Community Server - GPL)', stamp: iso, portFlag: '--port',
    dataFile: () => '/var/lib/mysql/ibdata1',
    refuse: (c, now) => has(c, 'MYSQL_ROOT_PASSWORD', 'MYSQL_ALLOW_EMPTY_PASSWORD', 'MYSQL_RANDOM_ROOT_PASSWORD') ? null : `${now} [ERROR] [Entrypoint]: Database is uninitialized and password option is not specified
    You need to specify one of the following as an environment variable:
    - MYSQL_ROOT_PASSWORD
    - MYSQL_ALLOW_EMPTY_PASSWORD
    - MYSQL_RANDOM_ROOT_PASSWORD
`,
    init: mysqlEntry('MySQL', [200, '{t} [Note] [Entrypoint]: Initializing database files'], [3200, '{t} [Note] [Entrypoint]: Database files initialized'], [300, '{t} [Note] [Entrypoint]: Starting temporary server'], [1800, '{t} [Note] [Entrypoint]: Temporary server started.'], [500, '{t} [Note] [Entrypoint]: Stopping temporary server'], [700, '{t} [Note] [Entrypoint]: Temporary server stopped'], [0, ''], [0, '{t} [Note] [Entrypoint]: MySQL init process done. Ready for start up.'], [0, '']),
    resume: mysqlEntry('MySQL'),
    boot: [[200, '{t} 0 [System] [MY-015015] [Server] MySQL Server - start.'], [250, '{t} 0 [System] [MY-010116] [Server] /usr/sbin/mysqld (mysqld {v}) starting as process 1'], [700, '{t} 1 [System] [MY-013577] [InnoDB] InnoDB initialization has ended.'], [300, "{t} 0 [System] [MY-010931] [Server] /usr/sbin/mysqld: ready for connections. Version: '{v}'  socket: '/var/run/mysqld/mysqld.sock'  port: {port}  MySQL Community Server - GPL."]],
    stop: [[100, '{t} 0 [System] [MY-013172] [Server] Received SHUTDOWN from user <via user signal>. Shutting down mysqld (Version: {v}).'], [900, '{t} 0 [System] [MY-010910] [Server] /usr/sbin/mysqld: Shutdown complete (mysqld {v})  MySQL Community Server - GPL.']],
    handler: c => sqlServer(c, '/var/lib/mysql/db.json'),
  },
  mariadbd: {
    versionEnv: 'MARIADB_VERSION', about: 'mariadbd  Ver {v}-MariaDB for debian-linux-gnu on x86_64', stamp: d => iso(d).slice(0, 19).replace('T', ' '), portFlag: '--port',
    dataFile: () => '/var/lib/mysql/ibdata1',
    refuse: (c, now) => has(c, 'MARIADB_ROOT_PASSWORD', 'MYSQL_ROOT_PASSWORD', 'MARIADB_ALLOW_EMPTY_ROOT_PASSWORD', 'MYSQL_ALLOW_EMPTY_PASSWORD', 'MARIADB_RANDOM_ROOT_PASSWORD', 'MYSQL_RANDOM_ROOT_PASSWORD') ? null : `${now}+00:00 [ERROR] [Entrypoint]: Database is uninitialized and password option is not specified
\tYou need to specify one of MARIADB_ROOT_PASSWORD, MARIADB_ROOT_PASSWORD_HASH, MARIADB_ALLOW_EMPTY_ROOT_PASSWORD and MARIADB_RANDOM_ROOT_PASSWORD
`,
    init: mysqlEntry('MariaDB', [200, '{t} [Note] [Entrypoint]: Initializing database files'], [1500, '{t} [Note] [Entrypoint]: Database files initialized'], [200, '{t} [Note] [Entrypoint]: Starting temporary server'], [800, '{t} [Note] [Entrypoint]: Temporary server started.'], [300, '{t} [Note] [Entrypoint]: Stopping temporary server'], [300, '{t} [Note] [Entrypoint]: Temporary server stopped'], [0, ''], [0, '{t} [Note] [Entrypoint]: MariaDB init process done. Ready for start up.'], [0, '']),
    resume: mysqlEntry('MariaDB'),
    boot: [[150, '{t} 0 [Note] Starting MariaDB {v}-MariaDB source revision as process 1'], [350, '{t} 0 [Note] InnoDB: Buffer pool(s) load completed'], [100, "{t} 0 [Note] mariadbd: ready for connections.\nVersion: '{v}-MariaDB'  socket: '/run/mysqld/mysqld.sock'  port: {port}  mariadb.org binary distribution"]],
    stop: [[100, '{t} 0 [Note] mariadbd (initiated by: unknown): Normal shutdown'], [500, '{t} 0 [Note] mariadbd: Shutdown complete']],
    handler: c => sqlServer(c, '/var/lib/mysql/db.json'),
  },
  mongod: {
    versionEnv: 'MONGO_VERSION', about: 'db version v{v}', stamp: iso, portFlag: '--port',
    boot: [
      [150, '{"t":{"$date":"{t}"},"s":"I","c":"CONTROL","id":23285,"ctx":"main","msg":"Automatically disabling TLS 1.0"}'], [300, '{"t":{"$date":"{t}"},"s":"I","c":"CONTROL","id":4615611,"ctx":"initandlisten","msg":"MongoDB starting","attr":{"pid":1,"port":{port},"dbPath":"/data/db","architecture":"64-bit"}}'],
      [700, '{"t":{"$date":"{t}"},"s":"I","c":"STORAGE","id":22430,"ctx":"initandlisten","msg":"WiredTiger message"}'], [300, '{"t":{"$date":"{t}"},"s":"I","c":"NETWORK","id":23016,"ctx":"listener","msg":"Waiting for connections","attr":{"port":{port},"ssl":"off"}}'],
    ],
    stop: [[50, '{"t":{"$date":"{t}"},"s":"I","c":"CONTROL","id":23377,"ctx":"SignalHandler","msg":"Received signal","attr":{"signal":15,"error":"Terminated"}}'], [400, '{"t":{"$date":"{t}"},"s":"I","c":"CONTROL","id":23138,"ctx":"SignalHandler","msg":"Shutting down","attr":{"exitCode":0}}']],
  },
}

// ---- small arithmetic, used by `SELECT 1+1`, `print(2*3)` and `console.log(2*3)` ----
function calc(src: string): number | null {
  if (!/^[\d\s+\-*/%().]+$/.test(src) || !/\d/.test(src)) return null
  let i = 0
  const ws = () => { while (src[i] === ' ') i++ }
  const atom = (): number => {
    ws()
    if (src[i] === '-') { i++; return -atom() }
    if (src[i] === '(') { i++; const v = sum(); ws(); if (src[i++] !== ')') throw 0; return v }
    const m = src.slice(i).match(/^\d+(\.\d+)?/)
    if (!m) throw 0
    i += m[0].length
    return Number(m[0])
  }
  const product = (): number => { let v = atom(); for (ws(); i < src.length && '*/%'.includes(src[i]); ws()) { const op = src[i++], r = atom(); v = op === '*' ? v * r : op === '/' ? v / r : v % r } return v }
  const sum = (): number => { let v = product(); for (ws(); i < src.length && '+-'.includes(src[i]); ws()) { const op = src[i++], r = product(); v = op === '+' ? v + r : v - r } return v }
  try { const v = sum(); ws(); return i === src.length ? v : null } catch { return null }
}
const unquote = (s: string) => { const m = s.trim().match(/^(['"`])([\s\S]*)\1$/); return m ? m[2] : null }

// ---- client side helpers ----
function cliArgs(a: string[], valued: Record<string, string>, attached = '') {
  const o: Record<string, string> = {}, rest: string[] = []
  const longs = new Set(Object.values(valued))
  for (let i = 1; i < a.length; i++) {
    const s = a[i]
    const long = s.match(/^--([\w-]+)(?:=(.*))?$/)
    if (long) { if (long[2] !== undefined) o[long[1]] = long[2]; else if (longs.has(long[1]) || long[1] === 'eval') o[long[1]] = a[++i] ?? ''; else o[long[1]] = ''; continue }
    if (s.length > 1 && s[0] === '-') {
      const k = s[1]
      if (attached.includes(k)) o[k] = s.slice(2)
      else if (valued[k]) o[valued[k]] = s.slice(2) || (a[++i] ?? '')
      else o[s.slice(1)] = ''
      continue
    }
    rest.push(s)
  }
  return { o, rest }
}
function ask(c: Ctx, host: string, port: number, method: string, path: string): { data?: any; fail?: string } {
  try { return { data: JSON.parse(c.host.http(c, { method, host, port, path, agent: baseOf(c.argv0) }).body) } }
  catch (e) { if (e instanceof NetError) return { fail: e.kind }; throw e }
}
function reachable(c: Ctx, host: string, port: number) {
  try { c.host.http(c, { method: 'PING', host, port, path: '/', agent: 'probe' }); return null }
  catch (e) { if (!(e instanceof NetError)) throw e; return e.kind === 'empty' ? null : e.kind }
}

// ---- redis ----
function redis(c: Ctx) {
  const file = normPath('dump.rdb', c.cwd)
  return (r: HttpReq): HttpRes => {
    const [cmd = '', ...a] = JSON.parse(r.path) as string[]
    const db: Record<string, string> = JSON.parse(c.fs.get(file)?.data ?? '{}')
    const save = () => c.fs.write(file, JSON.stringify(db))
    const bump = (by: number) => { const n = Number(db[a[0]] ?? 0); if (!Number.isInteger(n)) return reply({ e: 'ERR value is not an integer or out of range' }); db[a[0]] = String(n + by); save(); return reply({ i: n + by }) }
    switch (cmd.toUpperCase()) {
      case 'PING': return reply(a[0] ? { s: a[0] } : { p: 'PONG' })
      case 'SET': if (a.length < 2) break; db[a[0]] = a[1]; save(); return reply({ p: 'OK' })
      case 'GET': if (!a.length) break; return reply(a[0] in db ? { s: db[a[0]] } : { n: 1 })
      case 'DEL': { let n = 0; for (const k of a) if (k in db) { delete db[k]; n++ } save(); return reply({ i: n }) }
      case 'EXISTS': return reply({ i: a.filter(k => k in db).length })
      case 'INCR': return bump(1)
      case 'DECR': return bump(-1)
      case 'DBSIZE': return reply({ i: Object.keys(db).length })
      case 'KEYS': { const re = new RegExp(`^${(a[0] ?? '*').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`); return reply({ a: Object.keys(db).filter(k => re.test(k)) }) }
      case 'FLUSHALL': case 'FLUSHDB': c.fs.write(file, '{}'); return reply({ p: 'OK' })
      case 'SAVE': return reply({ p: 'OK' })
      default: return reply({ e: `ERR unknown command '${cmd}', with args beginning with: ${a.map(x => `'${x}'`).join(' ')}` })
    }
    return reply({ e: `ERR wrong number of arguments for '${cmd.toLowerCase()}' command` })
  }
}

// ---- a very small SQL engine shared by the PostgreSQL and MySQL images ----
type Table = { cols: string[]; auto: string[]; rows: string[][] }
type SqlResult = { cols?: string[]; rows?: string[][]; tag?: string; error?: { kind: 'table' | 'exists' | 'syntax' | 'column'; name: string } }
function splitTop(s: string, sep: string) {
  const out: string[] = []
  let cur = '', depth = 0, q = ''
  for (const ch of s) {
    if (q) { if (ch === q) q = '' } else if (ch === "'" || ch === '"' || ch === '`') q = ch
    else if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === sep && !q && !depth) { out.push(cur); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}
const sqlValue = (s: string) => { const t = s.trim(); return /^null$/i.test(t) ? '' : unquote(t) ?? t }
const ident = (s: string) => s.trim().replace(/^["`]|["`]$/g, '').toLowerCase()
function sqlServer(c: Ctx, file: string) {
  return (r: HttpReq): HttpRes => {
    const { q, user, db: dbName, password } = JSON.parse(r.path) as { q: string; user: string; db: string; password?: string }
    const pg = file.endsWith('base.json')
    if (pg) {
      const owner = c.env.get('POSTGRES_USER') ?? 'postgres', home = c.env.get('POSTGRES_DB') ?? owner
      if (user !== owner) return reply({ fatal: `role "${user}" does not exist` })
      if (dbName !== home && dbName !== 'postgres') return reply({ fatal: `database "${dbName}" does not exist` })
    } else {
      const root = c.env.get('MARIADB_ROOT_PASSWORD') ?? c.env.get('MYSQL_ROOT_PASSWORD') ?? '', other = c.env.get('MARIADB_USER') ?? c.env.get('MYSQL_USER'), otherPw = c.env.get('MARIADB_PASSWORD') ?? c.env.get('MYSQL_PASSWORD') ?? ''
      const ok = user === 'root' ? (password ?? '') === root : user === other && (password ?? '') === otherPw
      if (!ok) return reply({ denied: true })
    }
    const db: Record<string, Table> = JSON.parse(c.fs.get(file)?.data ?? '{}')
    const out: SqlResult[] = []
    for (const stmt of splitTop(q, ';').map(s => s.trim()).filter(Boolean)) {
      const res = runStatement(stmt, db, { pg, user, db: dbName })
      out.push(res)
      if (res.error) break
    }
    c.fs.write(file, JSON.stringify(db))
    return reply({ results: out })
  }
}
function runStatement(s: string, db: Record<string, Table>, who: { pg: boolean; user: string; db: string }): SqlResult {
  const bad = (word: string): SqlResult => ({ error: { kind: 'syntax', name: word } })
  const missing = (name: string): SqlResult => ({ error: { kind: 'table', name } })
  const where = (t: Table, text?: string) => {
    const tests = (text ? text.split(/\s+and\s+/i) : []).map(p => { const m = p.match(/^\s*([\w"`]+)\s*=\s*(.+?)\s*$/); return m ? [t.cols.indexOf(ident(m[1])), sqlValue(m[2])] as const : null })
    return tests.some(x => !x || x[0] < 0) ? null : (row: string[]) => tests.every(x => row[x![0]] === x![1])
  }
  let m: RegExpMatchArray | null
  if ((m = s.match(/^create\s+table\s+(if\s+not\s+exists\s+)?([\w"`.]+)\s*\(([\s\S]*)\)\s*$/i))) {
    const name = ident(m[2])
    if (db[name]) return m[1] ? { tag: 'CREATE TABLE' } : { error: { kind: 'exists', name } }
    const defs = splitTop(m[3], ',').map(d => d.trim()).filter(d => !/^(primary|unique|foreign|constraint|key|check|index)\b/i.test(d))
    db[name] = { cols: defs.map(d => ident(d.split(/\s+/)[0])), auto: defs.filter(d => /\b(serial|bigserial|auto_increment)\b/i.test(d)).map(d => ident(d.split(/\s+/)[0])), rows: [] }
    return { tag: 'CREATE TABLE' }
  }
  if ((m = s.match(/^drop\s+table\s+(if\s+exists\s+)?([\w"`.]+)\s*$/i))) {
    const name = ident(m[2])
    if (!db[name] && !m[1]) return missing(name)
    delete db[name]
    return { tag: 'DROP TABLE' }
  }
  if ((m = s.match(/^insert\s+into\s+([\w"`.]+)\s*(?:\(([^)]*)\))?\s*values\s*([\s\S]+)$/i))) {
    const t = db[ident(m[1])]
    if (!t) return missing(ident(m[1]))
    const tuples = splitTop(m[3], ','), inner = (tuple: string) => splitTop(tuple.trim().replace(/^\(|\)$/g, ''), ',')
    const cols = m[2] ? m[2].split(',').map(ident) : inner(tuples[0]).length === t.cols.length ? t.cols : t.cols.filter(k => !t.auto.includes(k))
    const unknown = cols.find(k => !t.cols.includes(k))
    if (unknown) return { error: { kind: 'column', name: unknown } }
    for (const tuple of tuples) {
      const vals = inner(tuple).map(sqlValue)
      if (vals.length !== cols.length) return bad(tuple.trim().slice(0, 20))
      t.rows.push(t.cols.map(k => { const i = cols.indexOf(k); return i >= 0 ? vals[i] : t.auto.includes(k) ? String(t.rows.length + 1) : '' }))
    }
    return { tag: `INSERT 0 ${tuples.length}` }
  }
  if ((m = s.match(/^delete\s+from\s+([\w"`.]+)(?:\s+where\s+([\s\S]+))?$/i))) {
    const t = db[ident(m[1])]
    if (!t) return missing(ident(m[1]))
    const hit = where(t, m[2])
    if (!hit) return bad(m[2])
    const before = t.rows.length
    t.rows = t.rows.filter(r => !hit(r))
    return { tag: `DELETE ${before - t.rows.length}` }
  }
  if ((m = s.match(/^update\s+([\w"`.]+)\s+set\s+([\s\S]+?)(?:\s+where\s+([\s\S]+))?$/i))) {
    const t = db[ident(m[1])]
    if (!t) return missing(ident(m[1]))
    const hit = where(t, m[3])
    if (!hit) return bad(m[3])
    const sets = splitTop(m[2], ',').map(p => { const [k, ...v] = p.split('='); return [t.cols.indexOf(ident(k)), sqlValue(v.join('='))] as const })
    if (sets.some(([i]) => i < 0)) return bad(m[2])
    let n = 0
    for (const row of t.rows) if (hit(row)) { n++; for (const [i, v] of sets) row[i] = v }
    return { tag: `UPDATE ${n}` }
  }
  if (/^show\s+tables$/i.test(s)) return { cols: [`Tables_in_${who.db}`], rows: Object.keys(db).map(k => [k]) }
  if ((m = s.match(/^select\s+([\s\S]+?)\s+from\s+([\w"`.]+)(?:\s+where\s+([\s\S]+?))?(?:\s+order\s+by\s+([\w"`]+)(\s+desc)?)?(?:\s+limit\s+(\d+))?$/i))) {
    const t = db[ident(m[2])]
    if (!t) return missing(ident(m[2]))
    const hit = where(t, m[3])
    if (!hit) return bad(m[3])
    if (/^count\(\*\)$/i.test(m[1].trim())) return { cols: [who.pg ? 'count' : 'count(*)'], rows: [[String(t.rows.filter(hit).length)]] }
    const cols = m[1].trim() === '*' ? t.cols : m[1].split(',').map(ident), idx = cols.map(k => t.cols.indexOf(k))
    const unknown = cols.find((_, i) => idx[i] < 0)
    if (unknown) return { error: { kind: 'column', name: unknown } }
    let rows = t.rows.filter(hit)
    if (m[4]) { const k = t.cols.indexOf(ident(m[4])); rows = [...rows].sort((a, b) => a[k].localeCompare(b[k], undefined, { numeric: true })); if (m[5]) rows.reverse() }
    if (m[6]) rows = rows.slice(0, Number(m[6]))
    return { cols, rows: rows.map(r => idx.map(i => r[i])) }
  }
  if ((m = s.match(/^select\s+([\s\S]+)$/i))) {
    const cols: string[] = [], row: string[] = []
    for (const part of splitTop(m[1], ',')) {
      const e = part.trim(), fn = e.toLowerCase().replace(/\s/g, '')
      const known: Record<string, [string, string]> = {
        'version()': ['version', who.pg ? 'PostgreSQL (simulated)' : 'simulated'], 'current_database()': ['current_database', who.db], 'database()': ['database()', who.db], current_user: ['current_user', who.user], 'user()': ['user()', `${who.user}@localhost`], 'now()': ['now', new Date().toISOString()],
      }
      const n = calc(e), text = unquote(e)
      if (known[fn]) { cols.push(known[fn][0]); row.push(known[fn][1]) }
      else if (n !== null) { cols.push(who.pg ? '?column?' : e); row.push(String(n)) }
      else if (text !== null) { cols.push(who.pg ? '?column?' : text); row.push(text) }
      else return who.pg ? { error: { kind: 'column', name: e } } : bad(e)
    }
    return { cols, rows: [row] }
  }
  return bad(s.split(/\s+/)[0])
}
const numeric = (rows: string[][], i: number) => rows.length > 0 && rows.every(r => /^-?\d+(\.\d+)?$/.test(r[i]))
function psqlTable(cols: string[], rows: string[][]) {
  const w = cols.map((k, i) => Math.max(k.length, ...rows.map(r => r[i].length)))
  const cell = (v: string, i: number) => numeric(rows, i) ? v.padStart(w[i]) : v.padEnd(w[i])
  const head = cols.map((k, i) => { const left = Math.floor((w[i] - k.length) / 2); return ' '.repeat(left) + k + ' '.repeat(w[i] - k.length - left) })
  return ` ${head.join(' | ')} \n${w.map(n => '-'.repeat(n + 2)).join('+')}\n${rows.map(r => ` ${r.map(cell).join(' | ')} \n`).join('')}(${rows.length} row${rows.length === 1 ? '' : 's'})\n\n`
}
function mysqlTable(cols: string[], rows: string[][]) {
  const w = cols.map((k, i) => Math.max(k.length, ...rows.map(r => r[i].length))), bar = `+${w.map(n => '-'.repeat(n + 2)).join('+')}+\n`
  const line = (r: string[], pad: (v: string, i: number) => string) => `| ${r.map(pad).join(' | ')} |\n`
  return rows.length ? bar + line(cols, (v, i) => v.padEnd(w[i])) + bar + rows.map(r => line(r, (v, i) => numeric(rows, i) ? v.padStart(w[i]) : v.padEnd(w[i]))).join('') + bar : ''
}

// ---- programs ----
Object.assign(programs, {
  /** A server: refuses bad configuration, initializes its data directory, boots, and only then accepts connections. */
  '@svc': function* (a: string[], c: Ctx): Gen {
    const [defaultPort, kind, root] = a[1].split(':'), name = baseOf(a[0]), s = SERVERS[name], args = a.slice(2)
    const version = c.env.get(s.versionEnv) ?? ''
    if (args.some(x => ['-v', '-V', '--version'].includes(x))) { (name === 'nginx' ? c.err : c.out)(`${s.about.replace('{v}', version)}\n`); return 0 }
    if (name === 'nginx' && args.includes('-t')) { c.err('nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful\n'); return 0 }
    if (name === 'nginx' && args.includes('-s')) { c.host.kill(c, 1, args[args.indexOf('-s') + 1] === 'reload' ? 'HUP' : 'QUIT'); return 0 }
    const flagAt = s.portFlag ? args.indexOf(s.portFlag) : -1
    const port = Number(flagAt >= 0 ? args[flagAt + 1] : defaultPort)
    const stamp = () => s.stamp(new Date(c.host.now()))
    const say = ([, text, err]: Line) => (err ? c.err : c.out)(`${text.replace(/\{t\}/g, stamp()).replace(/\{v\}/g, version).replace(/\{port\}/g, String(port))}\n`)
    c.p.handles = true
    const stopping = () => !!c.p.signal && c.p.signal !== 'HUP'
    function* play(lines: Line[], always = false): Gen<boolean> {
      for (const l of lines) {
        if (l[0]) yield l[0]
        if (!always && stopping()) return false
        say(l)
      }
      return true
    }
    const data = s.dataFile?.(c), fresh = !!data && !c.fs.get(data)
    if (fresh) {
      const why = s.refuse?.(c, stamp())
      if (why) { c.err(why); return 1 }
    }
    let up = yield* play((fresh ? s.init : s.resume) ?? [])
    if (up && fresh && data) { c.fs.mkdir(dirOf(data), c.uid, true); c.fs.write(data, `${version}\n`, c.uid) }
    if (up) up = yield* play(s.boot)
    if (up) {
      c.p.listen = { port, http: kind === 'http', root: root || null, name, handle: s.handler?.(c) }
      while (!stopping()) {
        c.p.signal = null
        yield Infinity
        if (c.p.signal === 'HUP') c.err(`${stamp()} [notice] 1#1: signal 1 (SIGHUP) received, reconfiguring\n`)
      }
    }
    c.p.listen = null
    c.p.signal = null
    yield* play(s.stop, true)
    return 0
  },
  /** A language runtime. Scripts are not interpreted, but their literal output, port and response are honoured. */
  '@run': function* (a: string[], c: Ctx): Gen {
    const name = baseOf(a[0]), args = a.slice(2), py = name.startsWith('python')
    const version = c.env.get(py ? 'PYTHON_VERSION' : 'NODE_VERSION') ?? ''
    if (args.some(x => ['-v', '--version', '-V'].includes(x))) { c.out(py ? `Python ${version}\n` : `v${version}\n`); return 0 }
    const printed = (src: string) => {
      for (const m of src.matchAll(/(?:console\.log|print)\(([^\n]*)\)\s*;?\s*$/gm)) {
        const parts = splitTop(m[1], ',').map(p => unquote(p.replace(/^\s*f(?=['"])/, '')) ?? calc(p.trim())).filter(v => v !== null)
        if (parts.length) c.out(parts.map(String).join(' ') + '\n')
      }
    }
    const inline = args.findIndex(x => ['-e', '-c', '-p', '--eval'].includes(x))
    if (inline >= 0) { printed(args[inline] === '-p' ? `console.log(${args[inline + 1] ?? ''})` : args[inline + 1] ?? ''); return 0 }
    const script = args.find(x => !x.startsWith('-'))
    if (!script) { if (c.tty) yield Infinity; return 0 }
    const file = c.fs.get(normPath(script, c.cwd))
    if (file?.kind !== 'file') {
      c.err(py ? `${name}: can't open file '${normPath(script, c.cwd)}': [Errno 2] No such file or directory\n` : `node:internal/modules/cjs/loader:1228\n  throw err;\n  ^\n\nError: Cannot find module '${normPath(script, c.cwd)}'\n`)
      return py ? 2 : 1
    }
    const src = file.data, declared = src.match(/\.listen\(\s*(\d+)/)?.[1] ?? src.match(/\bport\s*[=:]\s*(\d+)/i)?.[1]
    const port = Number(c.env.get('PORT') ?? declared ?? c.p.port)
    printed(src)
    if (!port && !/\b(setInterval|while\s+True|serve_forever)\b/.test(src)) return 0
    c.p.handles = true
    if (port) c.p.listen = { port, http: true, root: null, name, body: src.match(/(?:res\.(?:end|send)\(|return\s+)\s*(['"`])(.*?)\1/)?.[2] }
    yield Infinity
    c.p.listen = null
    return 0
  },
  pg_isready: (a: string[], c: Ctx) => {
    const { o } = cliArgs(a, { h: 'host', p: 'port', U: 'username', d: 'dbname', t: 'timeout' }), port = Number(o.port ?? 5432)
    const where = o.host ? `${o.host}:${port}` : `/var/run/postgresql:${port}`, fail = reachable(c, o.host ?? 'localhost', port)
    if ('q' in o || 'quiet' in o) return fail ? 2 : 0
    c.out(`${where} - ${fail ? 'no response' : 'accepting connections'}\n`)
    return fail ? 2 : 0
  },
  mysqladmin: (a: string[], c: Ctx) => {
    const { o, rest } = cliArgs(a, { h: 'host', P: 'port', u: 'user' }, 'p'), host = o.host ?? 'localhost', fail = reachable(c, host, Number(o.port ?? 3306))
    if (fail) { c.err(`${baseOf(a[0])}: connect to server at '${host}' failed\nerror: 'Can't connect to MySQL server on '${host}' (111)'\n`); return 1 }
    if (rest[0] === 'ping' || !rest.length) c.out('mysqld is alive\n')
    return 0
  },
  mongosh: (a: string[], c: Ctx) => {
    const { o, rest } = cliArgs(a, { host: 'host', port: 'port' }), uri = rest[0]?.match(/^mongodb:\/\/(?:[^@/]*@)?([^:/]+)(?::(\d+))?/)
    const host = uri?.[1] ?? o.host ?? 'localhost', port = Number(uri?.[2] ?? o.port ?? 27017)
    if (reachable(c, host, port)) { c.err(`MongoNetworkError: connect ECONNREFUSED ${host}:${port}\n`); return 1 }
    if (o.eval === undefined) { c.err('mongosh: interactive mode is not available in this sandbox, use --eval\n'); return 1 }
    c.out(/\.ok\b/.test(o.eval) ? '1\n' : '{ ok: 1 }\n')
    return 0
  },
  'redis-cli': (a: string[], c: Ctx) => {
    const { o, rest } = cliArgs(a, { h: 'host', p: 'port', a: 'pass', n: 'db' }), host = o.host ?? '127.0.0.1', port = Number(o.port ?? 6379)
    if (!rest.length) { c.err('redis-cli: interactive mode is not available in this sandbox, pass a command: redis-cli PING\n'); return 1 }
    const { data: r, fail } = ask(c, host, port, 'RESP', JSON.stringify(rest))
    if (fail || !r) { c.err(`Could not connect to Redis at ${host}:${port}: ${fail === 'dns' ? 'Name does not resolve' : 'Connection refused'}\n`); return 1 }
    const raw = !c.tty || 'raw' in o
    if (r.e !== undefined) { c.out(raw ? `${r.e}\n` : `(error) ${r.e}\n`); return raw ? 1 : 0 }
    if (r.p !== undefined) c.out(`${r.p}\n`)
    else if (r.s !== undefined) c.out(raw ? `${r.s}\n` : `"${r.s}"\n`)
    else if (r.i !== undefined) c.out(raw ? `${r.i}\n` : `(integer) ${r.i}\n`)
    else if (r.a !== undefined) c.out(raw ? r.a.map((k: string) => `${k}\n`).join('') : r.a.length ? r.a.map((k: string, i: number) => `${i + 1}) "${k}"\n`).join('') : '(empty array)\n')
    else c.out(raw ? '\n' : '(nil)\n')
    return 0
  },
  psql: (a: string[], c: Ctx) => {
    const { o, rest } = cliArgs(a, { U: 'username', d: 'dbname', h: 'host', p: 'port', c: 'command', f: 'file' })
    const user = o.username ?? c.env.get('PGUSER') ?? c.user, db = o.dbname ?? rest[0] ?? c.env.get('PGDATABASE') ?? user, port = Number(o.port ?? 5432)
    const q = o.command ?? (o.file ? c.fs.get(normPath(o.file, c.cwd))?.data : undefined) ?? c.stdin
    const place = o.host ? `at "${o.host}", port ${port}` : `on socket "/var/run/postgresql/.s.PGSQL.${port}"`
    const { data, fail } = ask(c, o.host ?? 'localhost', port, 'SQL', JSON.stringify({ q: q ?? '', user, db }))
    if (fail === 'dns') { c.err(`psql: error: could not translate host name "${o.host}" to address: Name or service not known\n`); return 2 }
    if (fail || !data) { c.err(`psql: error: connection to server ${place} failed: ${o.host ? 'Connection refused\n\tIs the server running on that host and accepting TCP/IP connections?' : 'No such file or directory\n\tIs the server running locally and accepting connections on that socket?'}\n`); return 2 }
    if (data.fatal) { c.err(`psql: error: connection to server ${place} failed: FATAL:  ${data.fatal}\n`); return 2 }
    if (q === undefined || q === null) { c.err('psql: interactive mode is not available in this sandbox, use -c "SELECT 1"\n'); return 1 }
    for (const r of data.results as SqlResult[]) {
      if (r.error) {
        const { kind, name } = r.error
        c.err(`ERROR:  ${kind === 'table' ? `relation "${name}" does not exist` : kind === 'exists' ? `relation "${name}" already exists` : kind === 'column' ? `column "${name}" does not exist` : `syntax error at or near "${name}"`}\n`)
        return 1
      }
      c.out(r.tag ? `${r.tag}\n` : psqlTable(r.cols!, r.rows!))
    }
    return 0
  },
  mysql: (a: string[], c: Ctx) => {
    const { o, rest } = cliArgs(a, { u: 'user', h: 'host', P: 'port', e: 'execute', D: 'database' }, 'p'), port = Number(o.port ?? 3306), host = o.host ?? 'localhost'
    const user = o.user ?? 'root', db = o.database ?? rest[0] ?? '', password = o.p ?? o.password ?? c.env.get('MYSQL_PWD'), q = o.execute ?? c.stdin
    const { data, fail } = ask(c, host, port, 'SQL', JSON.stringify({ q: q ?? '', user, db, password }))
    if (fail || !data) { c.err(`ERROR 2002 (HY000): Can't connect to ${o.host ? `MySQL server on '${host}:${port}' (111)` : "local MySQL server through socket '/var/run/mysqld/mysqld.sock' (2)"}\n`); return 1 }
    if (data.denied) { c.err(`ERROR 1045 (28000): Access denied for user '${user}'@'${host}' (using password: ${password ? 'YES' : 'NO'})\n`); return 1 }
    if (q === undefined || q === null) { c.err('mysql: interactive mode is not available in this sandbox, use -e "SELECT 1"\n'); return 1 }
    for (const r of data.results as SqlResult[]) {
      if (r.error) {
        const { kind, name } = r.error
        c.err(kind === 'table' ? `ERROR 1146 (42S02) at line 1: Table '${db}.${name}' doesn't exist\n` : kind === 'exists' ? `ERROR 1050 (42S01) at line 1: Table '${name}' already exists\n` : kind === 'column' ? `ERROR 1054 (42S22) at line 1: Unknown column '${name}' in 'field list'\n` : `ERROR 1064 (42000) at line 1: You have an error in your SQL syntax near '${name}'\n`)
        return 1
      }
      if (r.cols) c.out(mysqlTable(r.cols, r.rows!))
    }
    return 0
  },
})
