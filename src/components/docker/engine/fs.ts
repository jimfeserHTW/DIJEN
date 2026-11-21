// In-memory file system. Entries are immutable, so copying a Tree is a cheap copy-on-write snapshot (image -> container).
export type Entry = { kind: 'file' | 'dir'; data: string; mode: number; uid: number }
export type Tree = Map<string, Entry>
export type Mount = { target: string; tree: Tree; sub: string; ro: boolean }
export class FsError extends Error {}

const MAX_FILE = 1 << 20

export const fileEntry = (data: string, mode = 0o644, uid = 0): Entry => ({ kind: 'file', data, mode, uid })
export const dirEntry = (mode = 0o755, uid = 0): Entry => ({ kind: 'dir', data: '', mode, uid })
export const newTree = (): Tree => new Map([['/', dirEntry()]])

export function normPath(p: string, cwd = '/') {
  const out: string[] = []
  for (const s of (p.startsWith('/') ? p : `${cwd}/${p}`).split('/')) {
    if (s === '..') out.pop()
    else if (s && s !== '.') out.push(s)
  }
  return '/' + out.join('/')
}
export const dirOf = (p: string) => normPath(p + '/..')
export const baseOf = (p: string) => normPath(p).split('/').pop() || '/'
const under = (p: string, dir: string) => dir === '/' ? p !== '/' : p.startsWith(dir + '/')

/** Raw insert that creates missing parents. For building images and volumes, no permission checks. */
export function plant(tree: Tree, path: string, e: Entry) {
  const p = normPath(path)
  for (let d = dirOf(p); !tree.has(d); d = dirOf(d)) tree.set(d, dirEntry())
  tree.set(p, e)
}

const mayWrite = (e: Entry, uid: number) => uid === 0 || (e.uid === uid && !!(e.mode & 0o200)) || !!(e.mode & 0o002)

export class Fs {
  root: Tree
  mounts: Mount[]
  readOnly: boolean
  constructor(root: Tree, mounts: Mount[] = [], readOnly = false) { this.root = root; this.mounts = mounts; this.readOnly = readOnly }

  /** Which tree and key a path lands on, after applying the longest matching mount. */
  at(path: string) {
    const p = normPath(path)
    let best: Mount | null = null
    for (const m of this.mounts) if ((p === m.target || under(p, m.target)) && (!best || m.target.length > best.target.length)) best = m
    if (!best) return { tree: this.root, key: p, ro: this.readOnly }
    return { tree: best.tree, key: normPath(best.sub + '/' + p.slice(best.target.length)), ro: best.ro }
  }
  get(p: string) { const a = this.at(p); return a.tree.get(a.key) }
  need(p: string) { const e = this.get(p); if (!e) throw new FsError(`${p}: No such file or directory`); return e }
  read(p: string) { const e = this.need(p); if (e.kind === 'dir') throw new FsError(`${p}: Is a directory`); return e.data }

  list(p: string) {
    const a = this.at(p), e = a.tree.get(a.key)
    if (!e) throw new FsError(`${p}: No such file or directory`)
    if (e.kind !== 'dir') throw new FsError(`${p}: Not a directory`)
    const names = new Set<string>()
    for (const k of a.tree.keys()) if (under(k, a.key)) names.add(k.slice(a.key === '/' ? 1 : a.key.length + 1).split('/')[0])
    const here = normPath(p)
    for (const m of this.mounts) if (dirOf(m.target) === here && m.target !== '/') names.add(baseOf(m.target))
    return [...names].sort()
  }
  /** Every entry below a directory (or the file itself), with paths relative to it. */
  walk(p: string): [string, Entry][] {
    const a = this.at(p), e = a.tree.get(a.key)
    if (!e) throw new FsError(`${p}: No such file or directory`)
    const out: [string, Entry][] = [['', e]]
    if (e.kind === 'dir') for (const [k, v] of a.tree) if (under(k, a.key)) out.push([k.slice(a.key === '/' ? 1 : a.key.length + 1), v])
    return out
  }
  private parent(p: string, uid: number) {
    const a = this.at(p)
    if (a.ro) throw new FsError(`${p}: Read-only file system`)
    const d = this.get(dirOf(p))
    if (!d) throw new FsError(`${p}: No such file or directory`)
    if (d.kind !== 'dir') throw new FsError(`${p}: Not a directory`)
    if (!mayWrite(d, uid)) throw new FsError(`${p}: Permission denied`)
    return a
  }
  write(p: string, data: string, uid = 0, append = false, mode = 0o644) {
    const cur = this.get(p)
    if (cur?.kind === 'dir') throw new FsError(`${p}: Is a directory`)
    if (cur && !mayWrite(cur, uid)) throw new FsError(`${p}: Permission denied`)
    const a = cur ? this.at(p) : this.parent(p, uid)
    if (a.ro) throw new FsError(`${p}: Read-only file system`)
    const next = (append && cur ? cur.data : '') + data
    if (next.length > MAX_FILE) throw new FsError(`${p}: No space left on device`)
    a.tree.set(a.key, cur ? { ...cur, data: next } : fileEntry(next, mode, uid))
  }
  mkdir(p: string, uid = 0, parents = false) {
    const cur = this.get(p)
    if (cur) { if (parents && cur.kind === 'dir') return; throw new FsError(`${p}: File exists`) }
    if (parents && normPath(p) !== '/' && !this.get(dirOf(p))) this.mkdir(dirOf(p), uid, true)
    const a = this.parent(p, uid)
    a.tree.set(a.key, dirEntry(0o755, uid))
  }
  remove(p: string, uid = 0, recursive = false) {
    const e = this.need(p), a = this.parent(p, uid)
    if (this.mounts.some(m => m.target === normPath(p))) throw new FsError(`${p}: Resource busy`)
    if (e.kind === 'dir') {
      if (!recursive) throw new FsError(`${p}: Is a directory`)
      for (const k of [...a.tree.keys()]) if (under(k, a.key)) a.tree.delete(k)
    }
    a.tree.delete(a.key)
  }
  /** Replace an entry's metadata (chmod, chown). */
  patch(p: string, change: Partial<Entry>, uid = 0) {
    const e = this.need(p), a = this.at(p)
    if (a.ro) throw new FsError(`${p}: Read-only file system`)
    if (uid !== 0 && e.uid !== uid) throw new FsError(`${p}: Operation not permitted`)
    a.tree.set(a.key, { ...e, ...change })
  }
  /** Copy a file or directory, keeping modes (cp, COPY, docker cp). */
  copyFrom(src: Fs, from: string, to: string, uid = 0) {
    for (const [rel, e] of src.walk(from)) {
      const t = rel ? `${to}/${rel}` : to
      if (e.kind === 'dir') { this.mkdir(t, uid, true); continue }
      if (!this.get(dirOf(t))) this.mkdir(dirOf(t), uid, true)
      this.write(t, e.data, uid, false, e.mode)
      if (uid === 0) this.patch(t, { mode: e.mode })
    }
  }
}

/** What changed between an image and a container, as `docker diff` reports it. */
export function diffTrees(base: Tree, cur: Tree, hidden: (path: string) => boolean = () => false) {
  const out: [string, string][] = []
  for (const [k, v] of cur) { if (hidden(k)) continue; const b = base.get(k); if (!b) out.push(['A', k]); else if (b !== v) out.push(['C', k]) }
  for (const k of base.keys()) if (!cur.has(k) && !hidden(k)) out.push(['D', k])
  // like the real `docker diff`: a directory counts as changed when something below it did
  const seen = new Set(out.map(([, k]) => k))
  for (const [, k] of [...out]) for (let d = dirOf(k); d !== '/' && !seen.has(d); d = dirOf(d)) { seen.add(d); out.push(['C', d]) }
  return out.sort((a, b) => a[1].localeCompare(b[1]))
}
