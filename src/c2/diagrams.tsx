import { Stack, at, ctr, vm, css, type Block } from '../components/Stack.tsx'
import { Svg, Box, Arrow, Label, Zone, Wire, Ctr, Num, Tick, Take } from '../components/Svg.tsx'
import { Icon } from '../components/Icons.tsx'
import { Code, type Line } from '../components/Code.tsx'
import { Visuals } from '../components/Visuals.tsx'
import { t } from '../i18n.ts'
import './c2.css'

// Chapter 2 diagrams: VM versus container, own OS, place in the stack, platforms.
/* ── 5 · VM versus container ── */
export const VmVsContainer = () => (
  <div className="c2-vm">
    <div className="duo">
      <Stack size="s" title="Virtuelle Maschinen" sub="jede VM bootet ihren eigenen Kernel" rows={['hardware', 'kernel', 'hypervisor', [vm(1), vm(2), vm(3)]]} boundary={3} />
      <Stack d={3} size="s" title="Container" sub="alle teilen sich den Host-Kernel" rows={['hardware', 'kernel', 'engine', [ctr(1), ctr(2), ctr(3)]]} boundary={3} />
    </div>
    <div className="vis" style={css({ '--d': 8 })}>
      <Visuals v={{ kind: 'bars', legend: ['VM', 'Container'], rows: [{ label: 'Größe', a: 90, b: 15 }, { label: 'Startzeit', a: 85, b: 10 }] }} />
    </div>
  </div>
)

/* ── 6 · own operating system? ── */
const distro = (n: number, files: string): Block => ctr(n, [{ part: 'guestKernel', mark: 'gone', sub: 'gibt es nicht' }, { part: 'libs', label: files }, 'app'])
export const OwnOs = () => (
  <div className="c2-own">
    <Stack rows={['hardware', { part: 'kernel', sub: 'Linux · einer für alle Container', mark: 'focus' }, 'engine',
      [distro(1, 'Ubuntu-Dateien'), distro(2, 'Alpine-Dateien'), distro(3, 'Debian-Dateien')]]} boundary={3} />
    <div className="answer">
      <div style={at(5)}><span data-m="ok">✓</span><b>{t('Eigene Betriebssystem-Dateien')}</b><small>{t('Programme und Bibliotheken von Ubuntu, Alpine oder Debian')}</small></div>
      <div style={at(6)}><span data-m="bad">✗</span><b>{t('Eigener Kernel')}</b><small>{t('Alle Container nutzen den Kernel des Hosts')}</small></div>
    </div>
  </div>
)

/* ── 7 · where Docker sits ── */
export const Where = () => (
  <div className="c2-where">
    <Stack rows={['hardware', 'kernel', [{ part: 'engine', sub: 'Docker', w: 2 }, 'hostApps'], [ctr(1), ctr(2), null]]} roles={[
      { label: 'Betreiber', sub: 'stellt Rechner und Betriebssystem', from: 0, to: 1 },
      { label: 'Docker', sub: 'verwaltet Images und Container', from: 2, to: 2 },
      { label: 'Entwickler', sub: 'liefert, was im Container steckt', from: 3, to: 3 },
    ]} />
  </div>
)

/* ── 8 · Linux, macOS, Windows: inside the VM it is the same stack as on Linux ── */
const linuxVm = (sub: string): Block => ({ unit: 'Linux-VM', kind: 'vm', sub, rows: [{ part: 'guestKernel', sub: 'Linux', mark: 'focus' }, 'engine', [ctr(1, ['app']), ctr(2, ['app'])]] })
export const Platforms = () => (
  <div className="trio c2-plat">
    <Stack size="s" title="Linux" sub="wie auf allen anderen Folien" rows={[
      'hardware', { part: 'kernel', sub: 'Linux', mark: 'focus' }, 'engine', [ctr(1, ['app']), ctr(2, ['app'])],
    ]} />
    <Stack d={2} size="s" title="macOS" sub="Eine Engine startet eine Linux-VM" rows={[
      'hardware', { part: 'kernel', sub: 'macOS: kein Linux' }, { part: 'hypervisor', sub: 'von macOS' }, linuxVm('z. B. Docker Desktop, Colima'),
    ]} />
    <Stack d={4} size="s" title="Windows" sub="Eine Engine startet eine Linux-VM" rows={[
      'hardware', { part: 'kernel', sub: 'Windows: kein Linux' }, { part: 'hypervisor', sub: 'von Windows' }, linuxVm('z. B. Docker Desktop, WSL 2'),
    ]} />
  </div>
)


// The running example of this chapter: one command, followed through the whole system.

/* ═══ Docker im System ═══ */

/* The whole machine on one slide, at the level of this chapter: who runs, what the kernel adds, what lies on disk. */
export const SystemMap = () => (
  <div className="dg-col">
    <Svg w={1000} h={470} label="Ein Docker-Host: Programme im Userspace, Mechanismen im Kernel, Daten auf der Festplatte">
      <Zone x={0} y={0} w={1000} h={470} t="app" label="Docker Host · ein Linux-Rechner" />
      <Zone x={14} y={34} w={972} h={170} label="USERSPACE · hier laufen Programme" />
      <Box i={1} x={40} y={86} w={170} h={72} label="docker" sub="dein Befehl" size={17} />
      <Box i={2} x={290} y={86} w={210} h={72} t="engine" label="dockerd" sub="verwaltet alles" size={17} />
      <Arrow i={2} d="M212 122 H286" label="Auftrag" lx={249} ly={110} />
      <Zone i={3} x={580} y={46} w={390} h={146} t="app" label="Container" />
      <Box i={3} x={596} y={80} w={172} h={96} t="container" label="nginx" sub="web" size={17} />
      <Box i={3} x={782} y={80} w={172} h={96} t="container" label="mysqld" sub="db" size={17} />
      <Arrow i={3} d="M502 122 H576" label="startet" lx={539} ly={110} />
      <Zone i={4} x={14} y={214} w={972} h={116} t="kernel" label="KERNEL · hier entsteht die Isolation" />
      {([['Namespaces', 'wer was sieht'], ['cgroups', 'wer wie viel darf'], ['OverlayFS', 'Dateisystem aus Layern'], ['Netzwerk', 'Bridge und Ports']] as const).map(([l, s], k) => (
        <Box key={l} i={4} x={24 + k * 238} y={248} w={226} h={70} t="kchip" label={l} sub={s} size={15} />
      ))}
      <Arrow i={5} d="M850 194 V244" />
      <Zone i={6} x={14} y={340} w={972} h={118} t="reg" label="FESTPLATTE · bleibt nach einem Neustart" />
      {([['Images', 'Layer, nur lesbar'], ['Container', 'Schreibschicht und Logs'], ['Volumes', 'deine Daten']] as const).map(([l, s], k) => (
        <Box key={l} i={6} x={24 + k * 320} y={374} w={312} h={70} label={l} sub={s} size={16} />
      ))}
      <Arrow i={7} d="M494 160 V370" label="speichert" lx={484} ly={190} anchor="end" />
    </Svg>
    <Take i={8} label="Merke" text="`docker` gibt nur den Auftrag. `dockerd` führt ihn aus, und die eigentliche Isolation macht der Linux-Kernel." />
  </div>
)

/* How a typed command reaches the daemon. */
const apiLines: Line[] = [
  { t: 'docker run -d --name web nginx:1.27', k: 'cmd' },
  { t: '# der Client übersetzt das in HTTP-Anfragen:', k: 'note' },
  { t: 'POST /containers/create?name=web', n: 1 },
  { t: '  { "Image": "nginx:1.27", … }' },
  { t: '← 201 { "Id": "e5f6…" }', k: 'ok' },
  { t: 'POST /containers/e5f6…/start', n: 2 },
  { t: '← 204', k: 'ok' },
  { t: '# dieselbe Anfrage geht auch von Hand:', k: 'note' },
  { t: 'curl --unix-socket /var/run/docker.sock \\', k: 'cmd' },
  { t: '    http://localhost/containers/json', k: 'cont' },
]
export const ApiCall = () => (
  <div className="dg-split">
    <Code title="Terminal" lines={apiLines} />
    <div className="dg-col">
      <Svg w={600} h={440} label="Der Client spricht über die Socket-Datei mit dem Daemon">
        <Zone x={0} y={0} w={600} h={440} label="Host-Rechner" />
        <Box i={1} x={30} y={44} w={230} h={70} label="docker" sub="Client, endet nach dem Befehl" size={18} />
        <Box i={1} x={340} y={44} w={230} h={70} t="gone" label="Compose, Desktop, SDKs" sub="dieselbe Schnittstelle" size={15} />
        <Box i={2} x={30} y={190} w={540} h={70} t="reg" label="/var/run/docker.sock" sub="eine Datei als Tür: nur root und Gruppe docker dürfen hinein" size={17} mono />
        <Box i={4} x={30} y={330} w={540} h={80} t="engine" label="dockerd" sub="läuft dauerhaft im Hintergrund, als root" size={20} />
        <Arrow i={2} d="M110 116 V186" n={1} nx={110} ny={150} label="Anfragen" lx={130} ly={155} anchor="start" />
        <Arrow i={2} kind="mute" d="M455 116 V186" />
        <Arrow i={3} d="M110 262 V326" n={2} nx={110} ny={294} label="weitergereicht" lx={130} ly={299} anchor="start" />
        <Arrow i={5} kind="back" d="M470 328 V264" label="Antwort" lx={458} ly={299} anchor="end" />
      </Svg>
      <Take i={6} label="Achtung" text="Wer an den Socket kommt, steuert einen root-Prozess. Mitglied der Gruppe `docker` zu sein, ist praktisch root." />
    </div>
  </div>
)

/* ═══ Images ═══ */

/* docker pull: from the registry into the local store. */
export const Pull = () => (
  <div className="dg-col">
    <Svg w={1000} h={440} label="docker pull: Tag, Manifest, Layer, Prüfung und Ablage auf dem Host">
      <Zone x={0} y={0} w={440} h={440} t="reg" label="Registry · z. B. Docker Hub" />
      <g className="sl" style={at(0)}><Icon name="warehouse" x={362} y={8} s={60} /></g>
      <Box i={1} x={20} y={70} w={150} h={50} label="nginx:1.27" sub="Tag" size={15} mono />
      <Box i={2} x={20} y={160} w={190} h={78} label="Index" sub="eine Variante je Plattform" size={16} />
      <Box i={3} x={20} y={280} w={190} h={78} t="libs" label="Manifest" sub="linux/arm64, sha256:9c1…" size={16} />
      <Arrow i={2} d="M95 122 V156" />
      <Arrow i={3} d="M115 240 V276" label="passt zu mir" lx={127} ly={263} anchor="start" />
      <Box i={4} x={270} y={106} w={150} h={46} t="libs" label="Config" sub="CMD, ENV, Ports" size={14} />
      {['Layer 3', 'Layer 2', 'Layer 1'].map((l, k) => <Box key={l} i={4} x={270} y={176 + k * 62} w={150} h={50} t="app" label={l} sub={['sha256:c92…', 'sha256:7b1…', 'sha256:a3f…'][k]} size={14} />)}
      <Wire i={4} d="M212 319 H242 V129 H268" /><Wire i={4} d="M242 201 H268" /><Wire i={4} d="M242 263 H268" /><Wire i={4} d="M242 319 V325 H268" />

      <Zone i={5} x={560} y={0} w={440} h={440} label="Dein Host" />
      <Box i={5} x={580} y={44} w={400} h={60} t="engine" label="dockerd" sub="vergleicht die Digests mit dem, was schon da ist" size={17} />
      <Zone i={6} x={580} y={124} w={400} h={296} t="app" label="Lokaler Speicher auf der Platte" />
      <Box i={7} x={600} y={176} w={190} h={50} t="ok" label="Layer 3" sub="geladen, geprüft" size={14} />
      <Box i={7} x={600} y={238} w={190} h={50} t="ok" label="Layer 2" sub="geladen, geprüft" size={14} />
      <Box i={6} x={600} y={300} w={190} h={50} t="host" label="Layer 1" sub="war schon da" size={14} />
      <Label i={7} x={806} y={206} anchor="start" size={13} mono>Pull complete</Label>
      <Label i={7} x={806} y={268} anchor="start" size={13} mono>Pull complete</Label>
      <Label i={6} x={806} y={330} anchor="start" size={13} mono>Already exists</Label>
      <Label i={8} x={780} y={396} size={13} tone="muted">entpackt: bereit für OverlayFS</Label>

      <Arrow i={2} kind="back" d="M578 66 H500 V95 H174" n={1} nx={500} ny={80} label="Tag auflösen" lx={500} ly={58} />
      <Arrow i={7} d="M422 201 H596" n={2} nx={500} ny={201} label="fehlt: laden" lx={500} ly={183} />
      <Arrow i={7} d="M422 263 H596" />
      <Wire i={6} k="ok" d="M422 325 H470" /><Label i={6} x={510} y={330} size={13} weight={700} tone="ok">gespart</Label>
    </Svg>
    <Take i={9} label="Digest" text="Jedes Teil heißt nach der Prüfsumme seines Inhalts. Deshalb erkennt Docker gleiche Layer und jede Veränderung beim Download." />
  </div>
)

/* OverlayFS: which layer provides which file. */
const oCols = ['bin/sh', 'etc/nginx.conf', 'html/index.html', 'tmp/cache']
const oX = (k: number) => 250 + k * 188
const oRows: { y: number; title: string; sub: string; t: 'engine' | 'libs'; cells: (string | null)[]; win: number[] }[] = [
  { y: 130, title: 'Schreibschicht', sub: 'lesen und schreiben', t: 'engine', cells: [null, 'nginx.conf v2', null, 'cache'], win: [1, 3] },
  { y: 222, title: 'Layer 3', sub: 'COPY index.html', t: 'libs', cells: [null, null, 'deine Seite', null], win: [2] },
  { y: 286, title: 'Layer 2', sub: 'RUN apt install nginx', t: 'libs', cells: [null, 'nginx.conf v1', 'Standardseite', null], win: [] },
  { y: 350, title: 'Layer 1', sub: 'FROM debian', t: 'libs', cells: ['sh', null, null, null], win: [0] },
]
export const Overlay = () => (
  <div className="dg-col">
    <Svg w={1000} h={410} label="OverlayFS: Der Container sieht je Datei die oberste Schicht, die sie enthält">
      {oCols.map((c, k) => <Label key={c} x={oX(k) + 85} y={16} size={13} weight={700} mono>{c}</Label>)}
      <Box i={7} x={0} y={30} w={225} h={56} t="container" label="Sicht im Container" sub="alles als ein Dateisystem" size={15} />
      {['sh', 'nginx.conf v2', 'deine Seite', 'cache'].map((c, k) => <Box key={c} i={7} x={oX(k)} y={30} w={170} h={56} t="container" label={c} size={15} />)}
      {oRows.map((r, n) => {
        const i = 3 - n + 1
        return (
          <g key={r.title}>
            <Box i={i} x={0} y={r.y} w={225} h={54} t={r.t} label={r.title} sub={r.sub} size={15} />
            {r.cells.map((c, k) => c && <Box key={k} i={i} x={oX(k)} y={r.y} w={170} h={54} t={r.win.includes(k) ? (n ? 'libs' : 'engine') : 'gone'} label={c} size={14} />)}
            {r.win.map(k => <Arrow key={k} i={6} kind="ok" d={`M${oX(k) + 85} ${r.y - 2} V90`} />)}
          </g>
        )
      })}
      <g className="sa" data-k="mute" style={at(5)}><path d="M0 203 H1000" strokeDasharray="5 5" /></g>
      <Label i={5} x={0} y={198} anchor="start" size={12} weight={700} tone="muted">▲ gehört nur diesem Container</Label>
      <Label i={5} x={0} y={217} anchor="start" size={12} weight={700} tone="muted">▼ gehört zum Image, nur lesbar</Label>
    </Svg>
    <Take i={8} label="Regel" text="Für jede Datei gewinnt die oberste Schicht. Gestrichelte Versionen sind noch da, aber verdeckt." />
  </div>
)

/* Copy-on-write: the three things a container can do to a file. */
const cowRows = [['Sicht im Container', 54], ['Schreibschicht', 160], ['Image-Layer', 266]] as const
const cowX = (k: number) => 170 + k * 280
export const CopyOnWrite = () => (
  <div className="dg-col">
    <Svg w={1000} h={350} label="Lesen, Ändern und Löschen einer Datei im Container">
      {cowRows.map(([l, y], k) => <Label key={l} i={k} x={0} y={y + 32} anchor="start" size={15} weight={700}>{l}</Label>)}
      {['Lesen', 'Ändern', 'Löschen'].map((l, k) => <g key={l}><Zone i={k * 3} x={cowX(k) - 14} y={0} w={268} h={346} t="app" /><Label i={k * 3} x={cowX(k) + 120} y={30} size={17} weight={700} tone="blue">{l}</Label></g>)}

      <Box i={1} x={cowX(0)} y={54} w={240} h={52} t="container" label="nginx.conf v1" size={15} />
      <Box i={1} x={cowX(0) + 56} y={160} w={184} h={52} t="gone" label="leer" size={14} />
      <Box i={1} x={cowX(0)} y={266} w={240} h={52} t="libs" label="nginx.conf v1" size={15} />
      <Arrow i={2} kind="ok" d={`M${cowX(0) + 26} 264 V110`} />
      <Label i={2} x={cowX(0) + 40} y={139} anchor="start" size={13} tone="muted">gelesen, nichts kopiert</Label>

      <Box i={4} x={cowX(1)} y={54} w={240} h={52} t="container" label="nginx.conf v2" size={15} />
      <Box i={4} x={cowX(1)} y={160} w={240} h={52} t="engine" label="nginx.conf v2" size={15} />
      <Box i={4} x={cowX(1)} y={266} w={240} h={52} t="gone" label="nginx.conf v1" size={15} />
      <Arrow i={5} d={`M${cowX(1) + 40} 264 V216`} n={1} nx={cowX(1) + 40} ny={240} label="erst hochkopieren" lx={cowX(1) + 60} ly={245} anchor="start" />
      <Arrow i={6} kind="ok" d={`M${cowX(1) + 40} 158 V110`} n={2} nx={cowX(1) + 40} ny={134} label="dann ändern" lx={cowX(1) + 60} ly={139} anchor="start" />

      <Box i={7} x={cowX(2)} y={54} w={240} h={52} t="bad" label="Datei fehlt" size={15} />
      <Box i={7} x={cowX(2)} y={160} w={240} h={52} t="reg" label="Whiteout-Marke" size={15} />
      <Box i={7} x={cowX(2)} y={266} w={240} h={52} t="gone" label="nginx.conf v1" size={15} />
      <Arrow i={8} kind="bad" d={`M${cowX(2) + 40} 158 V110`} label="verdeckt die Datei" lx={cowX(2) + 58} ly={139} anchor="start" />
      <Label i={8} x={cowX(2) + 120} y={245} size={13} tone="muted">liegt weiter im Image</Label>
    </Svg>
    <Take i={9} label="Folge" text="Das Image ändert sich nie. Darum macht Löschen in einem späteren Layer ein Image auch nicht kleiner." />
  </div>
)

/* Shared layers: the width of a bar shows who uses it. */
const barScale = 1.7
const barX = (mb: number) => 240 + mb * barScale
export const SharedLayers = () => (
  <div className="dg-col">
    <Svg w={1000} h={450} label="Drei Container teilen sich Layer auf der Platte, jeder hat nur eine eigene dünne Schreibschicht">
      {([['web-1', 20], ['web-2', 280], ['job', 540]] as const).map(([n, x]) => <Ctr key={n} i={3} x={x} y={0} w={240} h={84} name={`Container ${n}`} />)}
      {[20, 280, 540].map((x, k) => <Box key={x} i={3} x={x + 12} y={32} w={216} h={42} t="engine" label="Schreibschicht" sub={undefined} size={14} />)}
      <Box i={2} x={20} y={96} w={500} h={50} t="libs" label="nginx-Layer · 65 MB" sub="von web-1 und web-2 gemeinsam genutzt" size={15} />
      <Box i={2} x={540} y={96} w={240} h={50} t="libs" label="Python-Layer · 20 MB" sub="nur job" size={15} />
      <Box i={1} x={20} y={156} w={760} h={50} t="kchip" label="debian-Layer · 75 MB" sub="alle drei nutzen dieselben Dateien auf der Platte" size={15} />
      <Label i={4} x={800} y={58} anchor="start" size={14} weight={700}>je Container eigen</Label>
      <Label i={4} x={800} y={76} anchor="start" size={13} tone="muted">wenige KB bis MB</Label>
      <Label i={4} x={800} y={150} anchor="start" size={14} weight={700}>nur einmal gespeichert</Label>
      <Label i={4} x={800} y={168} anchor="start" size={13} tone="muted">nur lesbar, also sicher teilbar</Label>

      <Label i={5} x={0} y={262} anchor="start" size={16} weight={700}>Platzbedarf auf der Festplatte</Label>
      <Label i={5} x={0} y={306} anchor="start" size={14} weight={600}>Jeder mit eigener Kopie</Label>
      {([[0, 140, 'web-1'], [140, 140, 'web-2'], [280, 95, 'job']] as const).map(([a, w, l]) => <Box key={l} i={6} x={barX(a)} y={282} w={w * barScale - 3} h={44} t="bad" label={l} size={14} />)}
      <Label i={6} x={barX(375) + 8} y={310} anchor="start" size={15} weight={700} tone="bad">375 MB</Label>
      <Label i={7} x={0} y={372} anchor="start" size={14} weight={600}>Mit geteilten Layern</Label>
      {([[0, 75, 'debian', 'kchip'], [75, 65, 'nginx', 'libs'], [140, 20, '', 'libs']] as const).map(([a, w, l, t]) => <Box key={a} i={7} x={barX(a)} y={348} w={w * barScale - 3} h={44} t={t} label={l} size={14} />)}
      <Label i={7} x={barX(160) + 8} y={376} anchor="start" size={15} weight={700} tone="ok">160 MB</Label>
      <Label i={7} x={barX(140) + 18} y={410} size={13} tone="muted">Python</Label>
    </Svg>
    <Take i={8} label="Darum" text="startet ein zweiter Container in Millisekunden und kostet kaum Platz: Es kommt nur eine leere Schreibschicht dazu." />
  </div>
)

/* ═══ Daten ═══ */

/* Four paths that look like one file system, and the place each one really lives. */
const mX = [14, 262, 510, 772]
const mounts: { path: string; flag: string; where: string; sub: string; t: 'host' | 'reg' | 'libs' | 'hyper'; rm: boolean; boot: boolean }[] = [
  { path: '/etc, /var …', flag: 'ohne Angabe', where: 'Schreibschicht', sub: 'gehört zum Container', t: 'host', rm: false, boot: true },
  { path: '/data', flag: '-v daten:/data', where: 'Volume daten', sub: 'verwaltet von Docker', t: 'reg', rm: true, boot: true },
  { path: '/app', flag: '-v ./app:/app', where: 'Ordner ./app', sub: 'dein Projektordner', t: 'libs', rm: true, boot: true },
  { path: '/tmp/cache', flag: '--tmpfs /tmp/cache', where: 'tmpfs', sub: 'nur im RAM', t: 'hyper', rm: false, boot: false },
]
export const Mounts = () => (
  <div className="dg-col">
    <Svg w={1000} h={420} label="Vier Pfade im Container und wo ihre Daten wirklich liegen">
      <Ctr x={0} y={0} w={1000} h={104} name="Container web · von innen sieht alles aus wie ein Dateisystem" />
      <Zone i={2} x={0} y={186} w={750} h={234} t="app" label="Festplatte des Hosts" />
      <Zone i={2} x={760} y={186} w={240} h={234} t="app" label="Arbeitsspeicher" />
      {mounts.map((m, k) => {
        const x = mX[k], c = x + 108
        return (
          <g key={m.path}>
            <Box i={1} x={x} y={34} w={216} h={58} t="container" label={m.path} sub={m.flag} size={15} mono />
            <Arrow i={2} d={`M${c} 106 V182`} />
            <Box i={3} x={x} y={222} w={216} h={70} t={m.t} label={m.where} sub={m.sub} size={15} />
            <Tick i={4} ok={m.rm} bad={!m.rm} x={x + 16} y={330} />
            <Label i={4} x={x + 34} y={335} anchor="start" size={13} weight={600} tone={m.rm ? 'ok' : 'bad'}>{m.rm ? 'bleibt nach docker rm' : 'weg nach docker rm'}</Label>
            <Tick i={5} ok={m.boot} bad={!m.boot} x={x + 16} y={376} />
            <Label i={5} x={x + 34} y={381} anchor="start" size={13} weight={600} tone={m.boot ? 'ok' : 'bad'}>{m.boot ? 'bleibt nach Neustart' : 'weg nach Stopp'}</Label>
          </g>
        )
      })}
    </Svg>
  </div>
)

/* ═══ Netzwerk ═══ */

/* Three network modes side by side: same container, different cabling. */
export const NetModes = () => (
  <div className="dg-col">
    <Svg w={1000} h={400} label="Netzwerk-Modi bridge, host und none im Vergleich">
      {([['bridge', 'Standard: eigenes Netz', 0], ['host', 'kein eigenes Netz', 345], ['none', 'gar kein Netz', 690]] as const).map(([n, s, x], k) => (
        <g key={n}>
          <Zone i={k * 3} x={x} y={0} w={310} h={400} label={`--network ${n}`} />
          <Label i={k * 3} x={x + 16} y={44} anchor="start" size={13} tone="muted">{s}</Label>
          <Box i={k * 3} x={x + 20} y={340} w={270} h={44} t="hw" label="eth0 des Hosts · 192.168.1.20" size={13} />
        </g>
      ))}
      <Ctr i={1} x={20} y={62} w={270} h={110} name="Container" />
      <Box i={1} x={36} y={96} w={238} h={60} t="libs" label="eth0" sub="172.17.0.2 · eigene Ports" size={15} />
      <Box i={2} x={20} y={222} w={270} h={60} t="kernel" label="Bridge docker0 + NAT" sub="übersetzt die Adressen" size={15} />
      <Arrow i={2} both d="M155 174 V218" /><Arrow i={2} both d="M155 284 V336" />

      <g className="sb" data-t="gone" style={at(4)}><rect x={365} y={62} width={270} height={110} rx={14} /><text x={379} y={84} fontSize={14} fontWeight={700}>{t('Container · Netz offen')}</text></g>
      <Box i={4} x={381} y={96} w={238} h={60} t="app" label="nginx" sub="lauscht direkt auf :80" size={15} />
      <Arrow i={5} kind="ok" both d="M500 158 V336" label="ohne Umweg," lx={512} ly={240} anchor="start" />
      <Label i={5} x={512} y={258} anchor="start" weight={600}>kein -p nötig</Label>

      <Ctr i={7} x={710} y={62} w={270} h={110} name="Container" />
      <Box i={7} x={726} y={96} w={238} h={60} t="libs" label="lo" sub="nur 127.0.0.1" size={15} />
      <Wire i={8} k="bad" d="M845 174 V336" /><Tick i={8} bad x={845} y={255} />
    </Svg>
    <Take i={9} label="Standard" text="Ohne Angabe nutzt ein Container `bridge`: Er hat ein eigenes Netz und ist von außen nur über `-p` erreichbar." />
  </div>
)

/* ═══ Isolation ═══ */

/* The same two processes under two numbers. */
export const PidNs = () => (
  <div className="dg-col">
    <Svg w={1000} h={320} label="Dieselben Prozesse mit anderen Nummern: Host-Sicht und Sicht im Container">
      <Zone x={0} y={0} w={420} h={320} label="ps auf dem Host" />
      <Zone i={3} x={580} y={0} w={420} h={320} t="container" label="ps im Container web" />
      <Box i={1} x={24} y={44} w={372} h={50} t="host" label="PID 1 · systemd" size={15} />
      <Box i={1} x={24} y={106} w={372} h={50} t="engine" label="PID 812 · dockerd" size={15} />
      <Box i={2} x={24} y={168} w={372} h={50} t="libs" label="PID 4021 · nginx master" size={15} />
      <Box i={2} x={24} y={230} w={372} h={50} t="libs" label="PID 4030 · nginx worker" size={15} />
      <Box i={3} x={604} y={44} w={372} h={50} t="gone" label="systemd: nicht sichtbar" size={15} />
      <Box i={3} x={604} y={106} w={372} h={50} t="gone" label="dockerd: nicht sichtbar" size={15} />
      <Box i={4} x={604} y={168} w={372} h={50} t="libs" label="PID 1 · nginx master" size={15} />
      <Box i={4} x={604} y={230} w={372} h={50} t="libs" label="PID 7 · nginx worker" size={15} />
      <Arrow i={5} kind="back" both d="M398 193 H602" label="derselbe Prozess" lx={500} ly={182} />
      <Arrow i={5} kind="back" both d="M398 255 H602" label="derselbe Prozess" lx={500} ly={244} />
    </Svg>
    <Take i={6} label="Namespace" text="Der Kernel zeigt jedem Prozess nur seinen Ausschnitt. Für Netz, Dateien und Hostname funktioniert das genauso. Endet PID 1, endet der Container." />
  </div>
)

/* cgroups: memory as tanks with a fill line. Height = limit. */
const tanks: { n: string; lim: string; use: string; h: number; fill: number; bad?: boolean; x: number }[] = [
  { n: 'web', lim: '512 MB', use: '300 MB', h: 110, fill: .6, x: 30 },
  { n: 'db', lim: '2 GB', use: '1,4 GB', h: 200, fill: .7, x: 200 },
  { n: 'job', lim: '256 MB', use: 'will 400 MB', h: 70, fill: 1, bad: true, x: 370 },
]
const tankB = 262
export const Cgroups = () => (
  <div className="dg-col">
    <Svg w={1000} h={290} label="cgroups: Jeder Container hat eine Speichergrenze, beim Überschreiten beendet der Kernel den Prozess">
      <Zone x={0} y={0} w={1000} h={290} t="app" label="Arbeitsspeicher des Hosts · 8 GB" />
      {tanks.map((c, k) => {
        const top = tankB - c.h
        return (
          <g key={c.n}>
            <g className="sb" data-t={c.bad ? 'bad' : 'libs'} style={at(1 + k)}><rect x={c.x} y={tankB - c.h * c.fill} width={130} height={c.h * c.fill} rx={4} /></g>
            <g className="sa" data-k={c.bad ? 'bad' : 'go'} style={at(1 + k)}><path d={`M${c.x} ${top} V${tankB} H${c.x + 130} V${top}`} /><path d={`M${c.x - 8} ${top} H${c.x + 138}`} strokeDasharray="5 4" /></g>
            <Label i={1 + k} x={c.x + 65} y={top - 10} size={13} weight={700} tone={c.bad ? 'bad' : undefined}>{`Grenze ${c.lim}`}</Label>
            <Label i={1 + k} x={c.x + 65} y={tankB - 8} size={13} weight={600} tone={c.bad ? 'bad' : undefined}>{c.use}</Label>
            <Label i={1 + k} x={c.x + 65} y={280} size={14} weight={700}>{c.n}</Label>
          </g>
        )
      })}
      <Arrow i={4} kind="bad" d="M502 212 H566" n={1} nx={534} ny={190} />
      <Box i={4} x={570} y={176} w={180} h={72} t="kernel" label="OOM-Killer" sub="im Kernel" size={16} />
      <Arrow i={5} kind="bad" d="M752 212 H806" n={2} nx={779} ny={190} />
      <Box i={5} x={810} y={176} w={170} h={72} t="bad" label="Exit-Code 137" sub="128 + Signal 9" size={16} />
      <Arrow i={6} kind="back" d="M895 174 V100 H700" label="restart-Regel startet neu" lx={800} ly={90} />
      <Box i={6} x={570} y={70} w={128} h={56} t="engine" label="job" sub="neu gestartet" size={15} />

    </Svg>
    <Take i={7} label="Merke" text="Mit `--memory 512m` bekommt ein Container eine feste Grenze. Durchgesetzt wird sie vom Kernel, nicht von der Anwendung." />
  </div>
)

/* ═══ Alles zusammen ═══ */

/* Closing picture: every part of one command lands somewhere in the system. */
const sumLines: Line[] = [
  { t: 'docker run -d \\', k: 'cmd' },
  { t: '    --name web \\', k: 'cont', n: 1 },
  { t: '    -p 8080:80 \\', k: 'cont', n: 2 },
  { t: '    -v daten:/data \\', k: 'cont', n: 3 },
  { t: '    --memory 512m \\', k: 'cont', n: 4 },
  { t: '    nginx:1.27', k: 'cont', n: 5 },
  { t: '# ohne Option, immer dabei:', k: 'note' },
  { t: '# eigene Namespaces', k: 'note', n: 6 },
]
export const RunSummary = () => (
  <div className="dg-split">
    <Code title="Terminal" lines={sumLines} />
    <Svg w={620} h={480} label="Jede Option des Befehls und der Ort im System, an dem sie wirkt">
      <Zone x={0} y={0} w={620} h={480} t="app" label="Docker Host" />
      <Zone i={1} x={12} y={34} w={596} h={136} label="Userspace" />
      <Ctr i={2} x={150} y={60} w={330} h={98} name="Container web" />
      <Box i={2} x={166} y={92} w={298} h={54} t="libs" label="nginx" sub="sieht nur sich selbst" size={15} />
      <Num i={3} n={1} x={480} y={60} /><Num i={3} n={6} x={150} y={60} />
      <Zone i={4} x={12} y={180} w={596} h={132} t="kernel" label="Kernel" />
      <Box i={5} x={26} y={214} w={136} h={84} t="engine" label="NAT-Regel" sub="8080 → 80" size={14} />
      <Box i={5} x={172} y={214} w={136} h={84} t="kchip" label="cgroup" sub="Speichergrenze" size={14} />
      <Box i={5} x={318} y={214} w={136} h={84} t="kchip" label="Namespaces" sub="pid, net, mnt …" size={14} />
      <Box i={5} x={464} y={214} w={132} h={84} t="kchip" label="OverlayFS" sub="Layer zu /" size={14} />
      <Num i={6} n={2} x={148} y={228} /><Num i={6} n={4} x={294} y={228} /><Num i={6} n={6} x={440} y={228} /><Num i={6} n={5} x={582} y={228} />
      <Zone i={7} x={12} y={322} w={596} h={146} t="reg" label="Festplatte" />
      <Box i={8} x={26} y={356} w={270} h={98} label="volumes/daten/_data" sub="bleibt nach docker rm" size={14} mono />
      <Box i={8} x={326} y={356} w={270} h={98} label="overlay2/…" sub="Layer von nginx:1.27" size={14} mono />
      <Num i={9} n={3} x={282} y={370} /><Num i={9} n={5} x={582} y={370} />
      <Arrow i={9} d="M530 354 V302" /><Arrow i={9} d="M167 354 V162" />
    </Svg>
  </div>
)
