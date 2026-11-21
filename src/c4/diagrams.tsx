import { t } from '../i18n.ts'
import { at } from '../components/Stack.tsx'
import { Svg, Box, Arrow, Label, Zone, Wire, Ctr, Num, Tick, Take } from '../components/Svg.tsx'
import { Icon } from '../components/Icons.tsx'
import { Code, type Line } from '../components/Code.tsx'

// Chapter 4 diagrams: the internals behind chapter 2, on the same example (containers web and db).

/* ═══ Dateien und Netz ═══ */

/* Every object you know, and the folder it really is. */
const dRows: { y: number; p: string; s: string; keep: boolean }[] = [
  { y: 60, p: 'overlay2/a3f…/diff', s: 'Dateien eines Image-Layers', keep: true },
  { y: 164, p: 'overlay2/e5f…/diff', s: 'Schreibschicht von web', keep: false },
  { y: 216, p: 'containers/e5f…/config.v2.json', s: 'Konfiguration des Containers', keep: false },
  { y: 268, p: 'containers/e5f…/e5f…-json.log', s: 'alles, was docker logs zeigt', keep: false },
  { y: 372, p: 'volumes/daten/_data', s: 'der Inhalt des Volumes', keep: true },
]
export const DiskMap = () => (
  <div className="dg-col">
    <Svg w={1000} h={450} label="Image, Container und Volume und die Ordner, in denen sie auf der Platte liegen">
      <g className="sl" style={at(1)}><Icon name="blueprint" x={14} y={44} s={64} /></g>
      <Label i={1} x={90} y={72} anchor="start" size={17} weight={700}>Image</Label><Label i={1} x={90} y={92} anchor="start" size={13} tone="muted">nginx:1.27</Label>
      <g className="sl" style={at(2)}><Icon name="crate" x={14} y={188} s={64} /></g>
      <Label i={2} x={90} y={216} anchor="start" size={17} weight={700}>Container</Label><Label i={2} x={90} y={236} anchor="start" size={13} tone="muted">web</Label>
      <g className="sl" style={at(3)}><Icon name="folder" x={14} y={358} s={64} /></g>
      <Label i={3} x={90} y={386} anchor="start" size={17} weight={700}>Volume</Label><Label i={3} x={90} y={406} anchor="start" size={13} tone="muted">daten</Label>

      <Zone x={250} y={0} w={750} h={450} t="reg" label="Festplatte · /var/lib/docker/" sub="nach docker rm web" />
      {dRows.map((r, k) => {
        const i = k === 0 ? 1 : k === 4 ? 3 : 2
        return (
          <g key={r.p}>
            <Box i={i} x={270} y={r.y} w={520} h={48} label={r.p} sub={r.s} size={14} mono />
            <Tick i={i + 3} x={830} y={r.y + 23} ok={r.keep} bad={!r.keep} />
            <Label i={i + 3} x={850} y={r.y + 28} anchor="start" size={14} weight={700} tone={r.keep ? 'ok' : 'bad'}>{r.keep ? 'bleibt' : 'gelöscht'}</Label>
          </g>
        )
      })}
      <Arrow i={1} d="M170 74 C 210 74, 230 83, 266 83" />
      <Arrow i={2} d="M170 214 C 215 214, 225 187, 266 187" />
      <Arrow i={2} d="M170 220 C 215 220, 225 239, 266 239" />
      <Arrow i={2} d="M170 226 C 205 240, 225 291, 266 291" />
      <Arrow i={3} d="M170 392 C 210 392, 230 395, 266 395" />
    </Svg>
    <Take i={7} label="Hinweis" text="Neuere Installationen mit containerd-Image-Store legen Image-Layer unter `/var/lib/containerd` ab. Das Prinzip bleibt gleich." />
  </div>
)

/* Bridge network: the actual cabling inside the host. */
export const NetBridge = () => (
  <div className="dg-col">
    <Svg w={1000} h={450} label="Container-Netzwerk: eth0 im Container, veth-Paar, Bridge docker0, NAT, eth0 des Hosts">
      <Zone x={0} y={0} w={850} h={450} label="Host-Rechner" />
      {([['web', 56, '172.17.0.2'], ['db', 226, '172.17.0.3']] as const).map(([n, y, ip], k) => (
        <g key={n}>
          <Ctr i={1} x={20} y={y} w={200} h={130} name={`Container ${n}`} />
          <Box i={1} x={36} y={y + 40} w={168} h={70} t="libs" label="eth0" sub={ip} size={16} />
          <Box i={2} x={276} y={y + 55} w={90} h={40} t="kchip" label={`veth${k + 1}`} size={14} />
          <Wire i={2} k="go" d={`M206 ${y + 75} H274`} />
          <Wire i={3} k="go" d={`M368 ${y + 75} H424`} />
        </g>
      ))}
      <Box i={3} x={426} y={100} w={110} h={232} t="kernel" label="docker0" sub="172.17.0.1" size={16} />
      <Box i={4} x={600} y={186} w={100} h={60} t="engine" label="NAT" sub="iptables" size={16} />
      <Box i={5} x={740} y={186} w={96} h={60} t="hw" label="eth0" sub="Host" size={16} />
      <Box i={6} x={905} y={186} w={95} h={60} t="reg" label="Internet" size={15} />
      <Arrow i={4} d="M538 216 H596" n={2} nx={567} ny={196} />
      <Arrow i={5} d="M702 216 H736" />
      <Arrow i={6} d="M838 216 H901" n={3} nx={870} ny={196} />
      <Num i={3} n={1} x={245} y={131} />
      <Label i={3} x={321} y={100} size={13} weight={600}>Paket nach außen</Label>
      <Arrow i={7} kind="ok" both d="M400 135 V297" />
      <Label i={7} x={392} y={208} anchor="end" size={13} weight={700} tone="ok">web ↔ db</Label>
      <Label i={7} x={392} y={226} anchor="end" size={13} tone="ok">über die Bridge</Label>
      <Label i={8} x={425} y={398} size={14} weight={600}>Ein veth-Paar ist ein virtuelles Kabel: ein Ende im Container, das andere an der Bridge.</Label>
      <Label i={8} x={425} y={420} size={13} tone="muted">Ausgehend tauscht NAT die Container-Adresse gegen die Adresse des Hosts.</Label>
    </Svg>
  </div>
)

/* A port mapping, following one packet and what changes in its header. */
const Pkt = ({ x, y, w, from, to, hot, i }: { x: number; y: number; w: number; from: string; to: string; hot: 'from' | 'to' | null; i: number }) => (
  <g>
    <Zone i={i} x={x} y={y} w={w} h={62} t="app" />
    <Label i={i} x={x + 12} y={y + 25} anchor="start" size={13} mono weight={hot === 'from' ? 700 : 500} tone={hot === 'from' ? 'blue' : undefined}>{t('von {{a}}', { a: from })}</Label>
    <Label i={i} x={x + 12} y={y + 47} anchor="start" size={13} mono weight={hot === 'to' ? 700 : 500} tone={hot === 'to' ? 'blue' : undefined}>{t('an  {{a}}', { a: to })}</Label>
  </g>
)
export const PortPath = () => (
  <div className="dg-col">
    <Svg w={1000} h={410} label="Ein Paket auf dem Weg durch -p 8080:80, hin und zurück">
      <Zone x={180} y={0} w={820} h={410} label="Host-Rechner · 192.168.1.20" />
      <Label x={20} y={50} anchor="start" size={14} weight={700} tone="blue">Hinweg</Label>
      <Label x={20} y={360} anchor="start" size={14} weight={700} tone="blue">Rückweg</Label>
      <g className="sl" style={at(0)}><Icon name="laptop" x={40} y={160} s={70} /></g>
      <Label x={75} y={250} weight={700}>Client</Label><Label x={75} y={268} size={13} tone="muted">203.0.113.9</Label>
      <Box i={1} x={220} y={170} w={120} h={70} t="hw" label="eth0" sub=":8080" size={16} />
      <Box i={2} x={420} y={170} w={150} h={70} t="engine" label="NAT-Regel" sub="DNAT, merkt sich alles" size={15} />
      <Box i={4} x={640} y={170} w={110} h={70} t="kernel" label="docker0" sub="Bridge" size={15} />
      <Ctr i={4} x={810} y={150} w={170} h={110} name="Container web" />
      <Box i={4} x={826} y={184} w={138} h={60} t="libs" label="nginx" sub="172.17.0.2:80" size={15} />
      <Arrow i={1} d="M116 190 H216" /><Arrow i={2} d="M342 190 H416" /><Arrow i={3} d="M572 190 H636" /><Arrow i={4} d="M752 190 H822" />
      <Arrow i={6} kind="back" d="M822 224 H754" /><Arrow i={6} kind="back" d="M636 224 H574" /><Arrow i={7} kind="back" d="M416 224 H344" /><Arrow i={7} kind="back" d="M216 224 H116" />
      <Pkt i={1} x={200} y={60} w={290} from="203.0.113.9:51000" to="192.168.1.20:8080" hot={null} />
      <Pkt i={3} x={560} y={60} w={290} from="203.0.113.9:51000" to="172.17.0.2:80" hot="to" />
      <Num i={3} n={1} x={525} y={91} />
      <Pkt i={6} x={560} y={300} w={290} from="172.17.0.2:80" to="203.0.113.9:51000" hot={null} />
      <Pkt i={7} x={200} y={300} w={290} from="192.168.1.20:8080" to="203.0.113.9:51000" hot="from" />
      <Num i={7} n={2} x={525} y={331} />
      <Wire i={3} d="M495 124 V166" /><Wire i={7} d="M495 244 V298" />
    </Svg>
    <Take i={8} label="Kern" text="`-p 8080:80` startet keinen Weiterleiter im Container, sondern legt eine Regel im Kernel an: 1 tauscht das Ziel, 2 tauscht die Antwort zurück." />
  </div>
)

/* ═══ Isolation ═══ */

/* One kernel holds everything; namespaces decide which slice a process is shown. */
const nsX = [90, 396, 702]
const nsW = 290
const nsRows: [string, string, string, string][] = [
  ['pid', '1 systemd · 812 dockerd · …', '1 nginx · 7 nginx', '1 mysqld'],
  ['net', 'eth0 192.168.1.20', 'eth0 172.17.0.2', 'eth0 172.17.0.3'],
  ['mnt', '/ = Ubuntu auf der Platte', '/ = Dateien aus nginx:1.27', '/ = Dateien aus mysql:8'],
  ['uts', 'Hostname server01', 'Hostname a3f9c2e1', 'Hostname 7c1e04bd'],
  ['ipc', 'Shared Memory des Hosts', 'eigener leerer Bereich', 'eigener leerer Bereich'],
]
const nsT = ['host', 'libs', 'reg'] as const
export const NsMap = () => (
  <div className="dg-col">
    <Svg w={1000} h={500} label="Ein Kernel hält alle Prozesse, Namespaces zeigen jedem Prozess nur seinen Ausschnitt">
      <Zone x={0} y={0} w={1000} h={136} label="USERSPACE · drei Prozesse stellen dieselbe Frage" />
      <Box i={1} x={nsX[0]} y={46} w={nsW} h={72} t="app" label="bash" sub="direkt auf dem Host" />
      <Box i={2} x={nsX[1]} y={46} w={nsW} h={72} t="container" label="nginx" sub="Container web" />
      <Box i={3} x={nsX[2]} y={46} w={nsW} h={72} t="container" label="mysqld" sub="Container db" />
      <Zone i={4} x={0} y={166} w={1000} h={334} t="kernel" label="KERNEL · einer für alle" sub="jeder Prozess bekommt nur seine Spalte" />
      {nsX.map((x, k) => <Arrow key={x} i={1 + k} d={`M${x + nsW / 2} 120 V162`} label={k === 0 ? 'Was gibt es hier?' : undefined} lx={x + nsW / 2 + 12} ly={148} anchor="start" />)}
      {nsRows.map(([n, ...c], r) => (
        <g key={n}>
          <Box i={5 + r} x={14} y={204 + r * 40} w={68} h={34} t="kchip" label={n} size={13} mono />
          {c.map((v, k) => <Box key={k} i={5 + r} x={nsX[k]} y={204 + r * 40} w={nsW} h={34} t={nsT[k]} label={v} size={13} />)}
        </g>
      ))}
      <Box i={10} x={14} y={410} w={68} h={34} t="bad" label="user" size={13} mono />
      <Box i={10} x={nsX[0]} y={410} w={nsX[2] + nsW - nsX[0]} h={34} t="bad" label="UID 0 ist überall derselbe root: Standardmäßig ist dieser Namespace nicht aktiv" size={13} />
      <Box i={11} x={14} y={452} w={68} h={34} t="gone" label="kein NS" size={12} />
      <Box i={11} x={nsX[0]} y={452} w={nsX[2] + nsW - nsX[0]} h={34} t="app" label="Kernel-Version, Kernel-Module und Hardware: für alle gleich, nicht getrennt" size={13} />
    </Svg>
  </div>
)

/* cgroup limits are plain files that runc writes and the kernel enforces. */
const limits: [string, string, string, string, string][] = [
  ['--memory 512m', 'memory.max', '536870912', 'über 512 MB', 'OOM-Kill, Exit-Code 137'],
  ['--cpus 1.5', 'cpu.max', '150000 100000', '150 ms je 100 ms', 'danach wird gebremst'],
  ['--pids-limit 100', 'pids.max', '100', 'mehr als 100 Prozesse', 'fork() schlägt fehl'],
]
export const CgroupFiles = () => (
  <div className="dg-col">
    <Svg w={1000} h={400} label="Limits werden von runc in cgroup-Dateien geschrieben und vom Kernel durchgesetzt">
      <Zone x={0} y={0} w={1000} h={120} label="USERSPACE" />
      <Box i={1} x={20} y={40} w={620} h={62} t="hw" label="docker run --memory 512m --cpus 1.5 --pids-limit 100 nginx" size={13} mono />
      <Arrow i={2} d="M642 71 H756" />
      <Box i={2} x={760} y={40} w={220} h={62} t="kchip" label="runc" sub="schreibt die Werte" size={16} />
      <Arrow i={3} d="M870 104 V146" />
      <Zone i={3} x={0} y={150} w={1000} h={250} t="kernel" label="KERNEL · Limits sind Dateien" sub="/sys/fs/cgroup/system.slice/docker-e5f6….scope/" />
      {limits.map(([f, file, v, when, what], k) => (
        <g key={f}>
          <Box i={4 + k} x={20 + k * 330} y={190} w={300} h={84} t="kchip" label={f} sub={`${file} = ${v}`} size={15} mono />
          <Wire i={4 + k} d={`M${170 + k * 330} 276 V298`} />
          <Box i={4 + k} x={20 + k * 330} y={300} w={300} h={84} t="app" label={when} sub={what} size={15} />
        </g>
      ))}
    </Svg>
    <Take i={7} label="Kern" text="Docker überwacht die Grenzen nicht selbst. Es trägt sie einmal ein, ab dann setzt sie der Kernel durch." />
  </div>
)

/* The way of a system call through the protection layers. */
const gates: [string, string, number][] = [['seccomp', 'filtert Systemaufrufe', 300], ['Capabilities', '14 von 41 Rechten', 500], ['AppArmor / SELinux', 'Regeln für Pfade', 700]]
const lanes: { y: number; c: string; s: string; stop: number | null }[] = [
  { y: 130, c: 'open("/index.html")', s: 'Datei lesen', stop: null },
  { y: 210, c: 'bind(:80)', s: 'Port öffnen', stop: null },
  { y: 290, c: 'Netzgerät anlegen', s: 'braucht CAP_NET_ADMIN', stop: 1 },
  { y: 370, c: 'init_module()', s: 'Kernel-Modul laden', stop: 0 },
]
export const Gates = () => (
  <div className="dg-col">
    <Svg w={1000} h={420} label="Vier Systemaufrufe auf dem Weg vom Container zum Kernel durch drei Schutzschichten">
      <Ctr x={0} y={50} w={110} h={370} name="nginx" />
      <Label x={55} y={100} size={13} tone="muted">als root</Label><Label x={55} y={118} size={13} tone="muted">im Container</Label>
      {gates.map(([n, s, x], k) => (
        <g key={n}>
          <Zone i={1 + k} x={x} y={0} w={150} h={420} t="libs" />
          <Label i={1 + k} x={x + 75} y={26} size={k === 2 ? 13 : 15} weight={700}>{n}</Label>
          <Label i={1 + k} x={x + 75} y={46} size={12} tone="muted">{s}</Label>
        </g>
      ))}
      <Zone i={4} x={890} y={0} w={110} h={420} t="kernel" />
      <g className="sb" data-t="kernel" style={at(4)}><text x={945} y={214} textAnchor="middle" fontSize={17} fontWeight={700}>Kernel</text></g>
      {lanes.map((l, k) => {
        const i = 5 + k
        const end = l.stop === null ? 886 : gates[l.stop][2] + 75 - 14
        return (
          <g key={l.c}>
            <Arrow i={i} kind={l.stop === null ? 'ok' : 'bad'} d={`M112 ${l.y} H${end}`} />
            <Label i={i} x={120} y={l.y - 10} anchor="start" size={13} weight={700} mono>{l.c}</Label>
            <Label i={i} x={120} y={l.y + 20} anchor="start" size={13} tone="muted">{l.s}</Label>
            {l.stop !== null ? <Tick i={i} bad x={gates[l.stop][2] + 75} y={l.y} /> : <Tick i={i} ok x={868} y={l.y - 18} />}
          </g>
        )
      })}
    </Svg>
    <Take i={9} label="Merke" text="root im Container ist nicht allmächtig: Jeder Aufruf an den Kernel muss diese Schichten passieren." />
  </div>
)

/* ═══ Der Start im Detail ═══ */

/* From dockerd down to the running process. */
export const RunChain = () => (
  <div className="dg-col">
    <Svg w={1000} h={470} label="Von dockerd über containerd, shim und runc zum Kernel und zum laufenden Prozess">
      <Zone x={0} y={0} w={1000} h={316} label="USERSPACE" />
      <Box i={0} x={20} y={46} w={160} h={72} t="engine" label="dockerd" sub="prüft, plant Netz" size={16} />
      <Box i={2} x={235} y={46} w={160} h={72} t="runtime" label="containerd" sub="bereitet Bundle vor" size={16} />
      <Box i={4} x={450} y={46} w={160} h={72} t="libs" label="shim" sub="wird Elternprozess" size={16} />
      <Box i={6} x={665} y={46} w={160} h={72} t="kchip" label="runc" sub="baut den Container" size={16} />
      <Arrow i={1} d="M182 92 H231" n={1} nx={207} ny={66} />
      <Arrow i={3} d="M397 92 H446" n={2} nx={421} ny={66} />
      <Arrow i={5} d="M612 92 H661" n={3} nx={636} ny={66} />
      <Box i={2} x={20} y={196} w={200} h={72} t="reg" label="Bundle" sub="config.json + Dateisystem" size={16} />
      <Arrow i={3} kind="mute" d="M300 120 C 300 170, 260 200, 224 216" />
      <Arrow i={7} kind="mute" d="M120 270 V296 H735 V122" label="liest" lx={420} ly={290} />
      <Ctr i={10} x={300} y={170} w={290} h={106} name="Container web" />
      <Box i={10} x={316} y={204} w={258} h={58} t="app" label="nginx" sub="PID 1 im Container" size={16} />
      <Arrow i={11} kind="back" both d="M530 120 V166" label="stdin, stdout, Exit-Code" lx={542} ly={150} anchor="start" />
      <Arrow i={8} d="M790 120 V326" n={4} nx={790} ny={165} label="Systemaufrufe" lx={808} ly={160} anchor="start" />
      <Label i={12} x={808} y={180} anchor="start" size={13} tone="muted">danach endet runc</Label>

      <Zone i={8} x={0} y={330} w={1000} h={140} t="kernel" label="KERNEL · macht aus einem Prozess einen Container" />
      {([['clone()', 'neue Namespaces'], ['cgroup-Dateien', 'Limits eintragen'], ['mount, pivot_root', 'Image wird zu /'], ['seccomp, Caps', 'Rechte kürzen'], ['execve()', 'nginx starten']] as const).map(([l, s], k) => (
        <Box key={l} i={9} x={16 + k * 196} y={366} w={184} h={88} t="kchip" label={l} sub={s} size={14} mono />
      ))}
      <Arrow i={10} kind="ok" d="M892 364 V240 H594" n={5} nx={660} ny={240} label="Prozess läuft" lx={850} ly={230} />
    </Svg>
  </div>
)

/* What is still running afterwards. */
export const AfterStart = () => (
  <div className="dg-col">
    <Svg w={1000} h={410} label="Prozessbaum nach dem Start: systemd, dockerd, containerd, je Container ein shim">
      <Box x={0} y={170} w={140} h={64} t="host" label="systemd" sub="PID 1 des Hosts" size={16} />
      <Box i={1} x={220} y={20} w={170} h={60} t="engine" label="dockerd" sub="API, Images, Netze" size={16} />
      <Box i={1} x={220} y={100} w={170} h={60} t="runtime" label="containerd" sub="Container verwalten" size={16} />
      <Box i={2} x={220} y={210} w={170} h={60} t="libs" label="shim" sub="für web" size={16} />
      <Box i={2} x={220} y={320} w={170} h={60} t="libs" label="shim" sub="für db" size={16} />
      {[50, 130, 240, 350].map((y, k) => <Wire key={y} i={k < 2 ? 1 : 2} d={`M142 202 H180 V${y} H218`} />)}
      <Ctr i={3} x={470} y={186} w={510} h={104} name="Container web" />
      <Box i={3} x={486} y={220} w={220} h={56} t="app" label="nginx" sub="master" size={15} />
      <Box i={3} x={744} y={220} w={220} h={56} t="app" label="nginx" sub="worker" size={15} />
      <Wire i={3} d="M708 248 H742" />
      <Ctr i={4} x={470} y={302} w={510} h={100} name="Container db" />
      <Box i={4} x={486} y={336} w={220} h={54} t="app" label="mysqld" size={15} />
      <Arrow i={3} d="M392 240 H482" /><Arrow i={4} d="M392 350 H482" />
      <Box i={5} x={744} y={70} w={236} h={60} t="gone" label="runc" sub="hat sich längst beendet" size={16} />
      <Label i={6} x={470} y={46} anchor="start" size={14} weight={700}>Fällt dockerd aus:</Label>
      <Label i={6} x={470} y={66} anchor="start" size={13} tone="muted">docker-Befehle gehen nicht mehr.</Label>
      <Label i={6} x={470} y={106} anchor="start" size={14} weight={700}>Der shim hält den Container:</Label>
      <Label i={6} x={470} y={126} anchor="start" size={13} tone="muted">unabhängig von den Diensten darüber.</Label>
    </Svg>
    <Take i={7} label="Praxis" text="Mit `live-restore` in `daemon.json` laufen Container weiter, während dockerd neu startet oder aktualisiert wird." />
  </div>
)

/* Different tools, same standards: bands run across all columns. */
const toolX = [150, 435, 720]
const tools: { n: string; rows: [string, string, 'app' | 'engine' | 'runtime' | 'gone'][]; run: string }[] = [
  { n: 'Docker', rows: [['docker', 'Client', 'app'], ['dockerd', 'Daemon', 'engine'], ['containerd', 'Verwalter', 'runtime']], run: 'runc' },
  { n: 'Podman', rows: [['podman', 'Client', 'app'], ['kein Daemon', 'läuft als dein Prozess', 'gone'], ['conmon', 'überwacht', 'runtime']], run: 'crun' },
  { n: 'Kubernetes', rows: [['kubectl', 'Client', 'app'], ['API-Server, kubelet', 'steuern die Rechner', 'engine'], ['containerd, CRI-O', 'über CRI', 'runtime']], run: 'runc' },
]
export const Standards = () => (
  <div className="dg-col">
    <Svg w={1000} h={470} label="Docker, Podman und Kubernetes unterscheiden sich oben und nutzen unten dieselben OCI-Standards">
      {tools.map((c, k) => (
        <g key={c.n}>
          <Label i={k} x={toolX[k] + 130} y={18} size={17} weight={700} tone="blue">{c.n}</Label>
          {c.rows.map(([l, s, t], r) => <Box key={l} i={k} x={toolX[k]} y={32 + r * 62} w={260} h={54} t={t} label={l} sub={s} size={15} />)}
          <Arrow i={3} d={`M${toolX[k] + 130} 212 V227`} />
          <Arrow i={4} d={`M${toolX[k] + 130} 264 V283`} />
          <Box i={4} x={toolX[k]} y={286} w={260} h={46} t="kchip" label={c.run} size={15} mono />
        </g>
      ))}
      <Label i={3} x={0} y={70} anchor="start" size={14} weight={700}>Oben</Label><Label i={3} x={0} y={90} anchor="start" size={13} tone="muted">verschieden</Label>
      <Label i={3} x={0} y={243} anchor="start" size={14} weight={700}>Darunter</Label><Label i={3} x={0} y={261} anchor="start" size={13} tone="muted">gemeinsam</Label>
      <Box i={3} x={150} y={230} w={830} h={32} t="reg" label="OCI Runtime Spec · so wird ein Container gestartet" size={14} />
      <Box i={5} x={150} y={352} w={830} h={40} t="libs" label="OCI Image Spec · dasselbe Image läuft in allen drei" size={15} />
      <Box i={6} x={150} y={402} w={830} h={40} t="reg" label="OCI Distribution Spec · dieselben Registries" size={15} />
      <g className="sl" style={at(5)}><Icon name="blueprint" x={60} y={350} s={44} /></g>
      <g className="sl" style={at(6)}><Icon name="warehouse" x={60} y={400} s={44} /></g>
    </Svg>
  </div>
)

/* Closing picture: every mechanism of one container, and the command that shows it on a real host. */
const proofLines: Line[] = [
  { t: '# Container web, PID 4021 auf dem Host', k: 'note' },
  { t: 'ls -l /proc/4021/ns', k: 'cmd', n: 1 },
  { t: 'cat /sys/fs/cgroup/…/memory.max', k: 'cmd', n: 2 },
  { t: 'mount | grep overlay', k: 'cmd', n: 3 },
  { t: 'iptables -t nat -L DOCKER', k: 'cmd', n: 4 },
  { t: 'ip link show type veth', k: 'cmd', n: 5 },
  { t: 'ps -ef --forest', k: 'cmd', n: 6 },
  { t: 'grep -E "Cap|Seccomp" /proc/4021/status', k: 'cmd', n: 7 },
]
const mech: [string, string, number][] = [['Namespaces', 'pid, net, mnt …', 1], ['cgroup', 'memory.max', 2], ['OverlayFS', 'Layer werden zu /', 3], ['NAT-Regel', '8080 → 80', 4], ['veth, Bridge', 'Kabel ins Netz', 5], ['Capabilities', 'und seccomp', 7]]
export const ProofMap = () => (
  <div className="dg-split">
    <Code title="Terminal auf dem Host" lines={proofLines} />
    <Svg w={620} h={480} label="Alle Mechanismen eines Containers und wo sie im System liegen">
      <Zone x={0} y={0} w={620} h={480} t="app" label="Docker Host" />
      <Zone i={1} x={12} y={34} w={596} h={150} label="Userspace" />
      <Box i={2} x={30} y={76} w={160} h={80} t="libs" label="shim" sub="Elternprozess" size={16} /><Num i={2} n={6} x={176} y={90} />
      <Arrow i={2} d="M192 116 H246" />
      <Ctr i={3} x={250} y={58} w={340} h={112} name="Container web" />
      <Box i={3} x={266} y={92} w={308} h={62} t="app" label="nginx" sub="PID 4021 auf dem Host" size={16} />
      <Zone i={4} x={12} y={196} w={596} h={272} t="kernel" label="KERNEL · das macht ihn zum Container" />
      {mech.map(([l, s, n], k) => {
        const x = 24 + (k % 3) * 192, y = 232 + Math.floor(k / 3) * 112
        return <g key={l}><Box i={5 + k} x={x} y={y} w={184} h={98} t="kchip" label={l} sub={s} size={15} /><Num i={5 + k} n={n} x={x + 168} y={y + 16} /></g>
      })}
      <Arrow i={5} d="M500 172 V228" />
    </Svg>
  </div>
)
