// Simulated `docker build` + `docker run` for a pasted Dockerfile.
export const CONTEXT_FILES = ['package.json', 'package-lock.json', 'server.js', 'index.html']
const KNOWN = new Set(['FROM', 'RUN', 'CMD', 'LABEL', 'EXPOSE', 'ENV', 'ADD', 'COPY', 'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK', 'SHELL'])
const LAYERS = new Set(['FROM', 'RUN', 'COPY', 'ADD', 'WORKDIR'])

type Ins = { op: string; arg: string; line: number }

export function parse(text: string): Ins[] {
  const out: Ins[] = []
  let buf = '', start = 0
  text.split('\n').forEach((raw, i) => {
    const l = raw.trim()
    if (!buf && (!l || l.startsWith('#'))) return
    if (!buf) start = i + 1
    buf += (buf ? ' ' : '') + l.replace(/\\$/, '').trim()
    if (l.endsWith('\\')) return
    const [op, ...rest] = buf.split(/\s+/)
    out.push({ op: op.toUpperCase(), arg: rest.join(' '), line: start })
    buf = ''
  })
  return out
}

const cmdText = (arg: string) => { try { const a = JSON.parse(arg); return Array.isArray(a) ? a.join(' ') : arg } catch { return arg } }

export function build(text: string, tag = 'myapp:latest') {
  const ins = parse(text)
  const err = (m: string) => ({ ok: false as const, out: `[+] Building 0.4s (2/2) FAILED\nERROR: ${m}`, warnings: [] as string[], ins })
  if (!ins.length) return err('failed to solve: the Dockerfile cannot be empty')
  for (const i of ins) if (!KNOWN.has(i.op)) return err(`dockerfile parse error on line ${i.line}: unknown instruction: ${i.op}`)
  const first = ins.find(i => i.op !== 'ARG')
  if (first?.op !== 'FROM') return err('failed to solve: no build stage in current context (the first instruction must be FROM)')
  for (const i of ins) {
    if (i.op === 'FROM' && !i.arg) return err(`dockerfile parse error on line ${i.line}: FROM requires either one or three arguments`)
    if ((i.op === 'COPY' || i.op === 'ADD') && !i.arg.includes('--from')) {
      const parts = i.arg.split(' ').filter(p => !p.startsWith('--'))
      if (parts.length < 2) return err(`dockerfile parse error on line ${i.line}: ${i.op} requires at least two arguments`)
      for (const src of parts.slice(0, -1)) {
        if (src === '.' || src === './' || src.includes('*')) continue
        if (!CONTEXT_FILES.includes(src.replace(/^\.\//, ''))) return err(`failed to compute cache key: "/${src}" not found: not found\n(the build context only contains: ${CONTEXT_FILES.join(', ')})`)
      }
    }
    if (i.op === 'RUN' && !i.arg) return err(`dockerfile parse error on line ${i.line}: RUN requires at least one argument`)
  }

  const warnings: string[] = []
  const from = ins.find(i => i.op === 'FROM')!.arg.split(' ')[0]
  if (!from.includes(':') && from !== 'scratch') warnings.push(`FROM ${from} has no tag – you get "latest", which changes over time. Pin a version.`)
  else if (from.endsWith(':latest')) warnings.push(`FROM ${from}: "latest" is not reproducible. Pin a version.`)
  if (!ins.some(i => i.op === 'CMD' || i.op === 'ENTRYPOINT')) warnings.push('No CMD or ENTRYPOINT: the container will only run the base image default.')
  const copyAll = ins.findIndex(i => i.op === 'COPY' && /^\.\s+\S+/.test(i.arg))
  const install = ins.findIndex(i => i.op === 'RUN' && /(npm (ci|install)|pip install)/.test(i.arg))
  if (copyAll >= 0 && install > copyAll) warnings.push('`COPY . .` comes before the dependency install: every code change re-runs the install. Copy package.json first.')

  const steps = ins.filter(i => LAYERS.has(i.op))
  const lines = [`[+] Building 3.1s (${steps.length + 3}/${steps.length + 3}) FINISHED`, ' => [internal] load build definition from Dockerfile', ' => [internal] load .dockerignore']
  steps.forEach((s, k) => lines.push(` => [${k + 1}/${steps.length}] ${s.op} ${s.arg}`.slice(0, 90) + (s.op === 'RUN' ? '  (2.4s)' : '')))
  lines.push(' => exporting to image', ` => => naming to docker.io/library/${tag}`)
  return { ok: true as const, out: lines.join('\n'), warnings, ins }
}

export function runImage(ins: Ins[]) {
  const last = [...ins].reverse().find(i => i.op === 'CMD' || i.op === 'ENTRYPOINT')
  const expose = ins.find(i => i.op === 'EXPOSE')?.arg
  if (!last) return 'container exited (0): no CMD set, so only the base image default ran.'
  const c = cmdText(last.arg)
  const port = expose?.split('/')[0] ?? '3000'
  if (/node/.test(c)) return `$ ${c}\nServer listening on http://0.0.0.0:${port}` + (expose ? `\n(port ${expose} is documented by EXPOSE – publish it with: docker run -p ${port}:${port} myapp)` : '\n(no EXPOSE: the app still listens, but the Dockerfile does not document the port)')
  if (/nginx/.test(c)) return `$ ${c}\nnginx: worker process started`
  return `$ ${c}\n(process exited with code 0)`
}
