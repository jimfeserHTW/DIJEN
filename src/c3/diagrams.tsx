import { t } from '../i18n.ts'
import { at } from '../components/Stack.tsx'
import { Svg, Box, Arrow, Label, Zone, Wire, Ctr, Num, Tick, Take, type BoxTone } from '../components/Svg.tsx'
import { Icon } from '../components/Icons.tsx'
import { Code, type Line } from '../components/Code.tsx'

// Chapter 3 diagrams. Same running example as chapter 1: project "shop" with proxy (nginx), web (WordPress) and db (MySQL).

/* ═══ Projekt ═══ */

/* What `up` does, and where each step runs. */
export const UpFlow = () => (
  <div className="dg-col">
    <Svg w={1000} h={430} label="docker compose up: Compose liest den Projektordner und beauftragt den Docker Daemon">
      <Zone x={0} y={0} w={240} h={230} t="reg" label="Projektordner shop/" />
      {([['compose.yaml', 'der Bauplan'], ['compose.override.yaml', 'Ergänzung'], ['.env', 'Werte für ${…}']] as const).map(([f, s], k) => <Box key={f} i={0} x={14} y={38 + k * 62} w={212} h={54} label={f} sub={s} size={13} mono />)}
      <Box i={1} x={0} y={320} w={240} h={56} t="hw" label="docker compose up -d" size={13} mono />
      <Zone i={1} x={300} y={60} w={210} h={230} t="app" label="Compose" sub="dein Rechner" />
      {['Dateien mischen', '${…} einsetzen', 'Plan berechnen'].map((l, k) => <g key={l}><Box i={2 + k} x={330} y={100 + k * 58} w={166} h={46} t="libs" label={l} size={14} /><Num i={2 + k} n={k + 1} x={330} y={100 + k * 58} /></g>)}
      <Arrow i={2} d="M242 130 H296" label="liest" lx={268} ly={118} />
      <Arrow i={1} d="M242 348 H405 V294" />
      <Zone i={5} x={570} y={0} w={430} h={430} label="Docker Host" />
      <Box i={5} x={590} y={40} w={390} h={56} t="engine" label="dockerd" sub="legt alles der Reihe nach an" size={17} />
      <Arrow i={5} d="M512 76 H586" label="API" lx={540} ly={64} />
      <Wire i={6} d="M612 98 V342" />
      {([['Netz shop_default', 'kchip'], ['Volume shop_dbdata', 'reg'], ['Container shop-db-1', 'container'], ['Container shop-web-1', 'container']] as const).map(([l, t], k) => (
        <g key={l}><Box i={6 + k} x={640} y={116 + k * 62} w={340} h={52} t={t} label={l} size={15} /><Num i={6 + k} n={k + 1} x={612} y={142 + k * 62} /></g>
      ))}
      <Label i={10} x={785} y={400} size={13} tone="muted">laufen weiter, wenn Compose längst beendet ist</Label>
    </Svg>
    <Take i={11} label="Merke" text="Compose ist kein Dienst, sondern ein Client: Es rechnet kurz, gibt Aufträge an dockerd und beendet sich." />
  </div>
)

/* ═══ Service ═══ */

/* Every key of a service changes one concrete part of the container. */
const svcLines: Line[] = [
  'services:', '  web:',
  { t: '    image: wordpress:6', n: 1 },
  { t: '    command: apache2-foreground', n: 2 },
  { t: '    user: "33:33"', n: 3 },
  { t: '    working_dir: /var/www/html', n: 3 },
  '    environment:',
  { t: '      WORDPRESS_DB_HOST: db', n: 4 },
  '    volumes:',
  { t: '      - uploads:/var/www/html/wp-content', n: 5 },
  '    ports:',
  { t: '      - "8080:80"', n: 6 },
  { t: '    networks: [frontend]', n: 7 },
]
export const ServiceMap = () => (
  <div className="dg-split">
    <Code kind="file" title="compose.yaml" lines={svcLines} />
    <Svg w={620} h={470} label="Jeder Schlüssel eines Service und der Teil des Containers, den er bestimmt">
      <Zone x={0} y={0} w={620} h={470} label="Host-Rechner" />
      <Box i={1} x={12} y={130} w={76} h={56} t="engine" label="8080" size={16} />
      <Num i={1} n={6} x={12} y={130} />
      <Ctr i={2} x={120} y={40} w={350} h={320} name="Container web" />
      <Box i={3} x={136} y={74} w={318} h={56} t="app" label="Prozess: apache2-foreground" sub="PID 1" size={15} /><Num i={3} n={2} x={454} y={74} />
      <Box i={4} x={136} y={140} w={318} h={50} t="app" label="Benutzer 33 · Ordner /var/www/html" size={14} /><Num i={4} n={3} x={454} y={140} />
      <Box i={5} x={136} y={200} w={318} h={44} t="host" label="WORDPRESS_DB_HOST=db" size={14} mono /><Num i={5} n={4} x={454} y={200} />
      <Box i={6} x={136} y={254} w={200} h={90} t="libs" label="Image-Layer" sub="wordpress:6" size={15} /><Num i={6} n={1} x={136} y={254} />
      <Box i={7} x={346} y={254} w={108} h={90} t="reg" label="wp-content" sub="Mount" size={13} />
      <Box i={7} x={500} y={254} w={106} h={90} t="reg" label="uploads" sub="Volume" size={14} /><Num i={7} n={5} x={606} y={254} />
      <Arrow i={7} both d="M456 299 H496" />
      <Arrow i={1} d="M90 158 H132" />
      <Box i={8} x={120} y={398} w={350} h={44} t="kchip" label="Netz frontend" size={15} /><Num i={8} n={7} x={470} y={398} />
      <Wire i={8} d="M295 362 V396" />
    </Svg>
  </div>
)

/* How the start command is assembled from two slots. */
const cmdRows: { title: string; sub: string; e: [string, BoxTone]; c: [string, BoxTone]; r: string; y: number }[] = [
  { title: 'Nur das Image', sub: 'Compose ändert nichts', e: ['/entry.sh', 'libs'], c: ['nginx -g off', 'libs'], r: '/entry.sh nginx -g off', y: 44 },
  { title: 'command:', sub: 'ersetzt nur CMD', e: ['/entry.sh', 'libs'], c: ['nginx -t', 'engine'], r: '/entry.sh nginx -t', y: 144 },
  { title: 'entrypoint:', sub: 'ersetzt ihn, leert CMD', e: ['/init.sh', 'engine'], c: ['geleert', 'gone'], r: '/init.sh', y: 244 },
]
export const StartCommand = () => (
  <div className="dg-col">
    <Svg w={1000} h={320} label="Der Startbefehl entsteht aus ENTRYPOINT und CMD, Compose kann beide Teile ersetzen">
      <Label x={315} y={22} weight={700} size={15} mono>ENTRYPOINT</Label><Label x={560} y={22} weight={700} size={15} mono>CMD</Label><Label x={845} y={22} weight={700} size={15}>PID 1 im Container</Label>
      {cmdRows.map((r, k) => (
        <g key={r.title}>
          <Label i={k * 3} x={0} y={r.y + 28} anchor="start" size={15} weight={700} mono={k > 0}>{r.title}</Label>
          <Label i={k * 3} x={0} y={r.y + 48} anchor="start" size={13} tone="muted">{r.sub}</Label>
          <Box i={k * 3} x={200} y={r.y} w={230} h={66} t={r.e[1]} label={r.e[0]} size={15} mono />
          <Label i={k * 3} x={442} y={r.y + 39} size={20} weight={700}>+</Label>
          <Box i={k * 3 + 1} x={455} y={r.y} w={210} h={66} t={r.c[1]} label={r.c[0]} size={15} mono />
          <Arrow i={k * 3 + 2} d={`M667 ${r.y + 33} H696`} />
          <Box i={k * 3 + 2} x={700} y={r.y} w={300} h={66} t="container" label={r.r} size={15} mono />
        </g>
      ))}
    </Svg>
    <Take i={9} label="Falle" text="Wer `entrypoint` setzt, verliert auch das `CMD` aus dem Image. Es muss dann in `command` neu angegeben werden." />
  </div>
)

/* build: from a folder to an image to a container. */
export const BuildFlow = () => (
  <div className="dg-col">
    <Svg w={1000} h={400} label="build: Der Ordner geht als Kontext zu BuildKit, Stufen werden gebaut, das Ergebnis wird zum Image">
      <Zone x={0} y={0} w={220} h={300} t="reg" label="Ordner ./web" />
      {['src/', 'package.json', 'Dockerfile'].map((f, k) => <Box key={f} x={14} y={40 + k * 52} w={192} h={44} label={f} size={14} mono />)}
      <Box i={1} x={14} y={196} w={192} h={56} t="gone" label="node_modules/" sub="per .dockerignore raus" size={14} mono />
      <Arrow i={2} d="M222 120 H276" label="Kontext" lx={249} ly={108} />
      <Zone i={2} x={280} y={0} w={440} h={400} label="BuildKit · im Docker-Daemon" />
      <Zone i={3} x={296} y={36} w={200} h={200} t="app" label="Stufe build" />
      {['FROM node:22', 'RUN npm ci', 'RUN npm run build'].map((l, k) => <Box key={l} i={3} x={308} y={72 + k * 52} w={176} h={44} t="libs" label={l} size={13} mono />)}
      <Zone i={5} x={510} y={36} w={196} h={200} t="app" label="Stufe runtime" />
      {['FROM nginx', 'COPY --from=build'].map((l, k) => <Box key={l} i={5} x={520} y={72 + k * 52} w={176} h={44} t={k ? 'engine' : 'libs'} label={l} size={13} mono />)}
      <Arrow i={4} d="M486 198 C 500 198, 500 150, 516 146" />
      <Box i={2} x={296} y={254} w={200} h={60} t="reg" label="args: NODE_ENV" sub="nur beim Bauen" size={14} mono />
      <Arrow i={3} d="M396 252 V240" />
      <Box i={6} x={510} y={254} w={196} h={60} t="gone" label="Stufe debug" sub="wird nicht gebaut" size={14} />
      <Label i={6} x={500} y={352} size={14} weight={700} tone="blue">target: runtime · hier ist Schluss</Label>
      <Arrow i={7} d="M708 120 H756" />
      <Box i={7} x={760} y={84} w={240} h={76} t="libs" label="shop/web:1.4" sub="fertiges Image" size={15} mono />
      <Arrow i={8} d="M880 162 V216" label="startet" lx={892} ly={194} anchor="start" />
      <Box i={8} x={760} y={220} w={240} h={70} t="container" label="Container web" sub="ohne node, ohne Quellcode" size={15} />
    </Svg>
  </div>
)

/* Restart policies: one small timeline per policy and event. */
const events = ['Absturz', 'Ende mit Code 0', 'stop von Hand', 'Daemon startet neu', 'stop, dann Daemon neu']
const marks = ['⚡', '0', '■', '↺', '■↺']
const policies: [string, number[]][] = [['no', [0, 0, 0, 0, 0]], ['on-failure', [1, 0, 0, 0, 0]], ['always', [1, 1, 0, 1, 1]], ['unless-stopped', [1, 1, 0, 1, 0]]]
const evX = (k: number) => 170 + k * 167
const Seg = ({ x, y, w, t, i }: { x: number; y: number; w: number; t: BoxTone; i: number }) => <g className="sb" data-t={t} style={at(i)}><rect x={x} y={y} width={w} height={22} rx={6} /></g>
export const RestartGrid = () => (
  <div className="dg-col">
    <Svg w={1000} h={380} label="Vier Neustart-Regeln und ihr Verhalten bei fünf Ereignissen">
      {events.map((e, k) => <Label key={e} x={evX(k) + 75} y={k > 2 ? 18 : 28} size={13} weight={700}>{k > 2 ? t(e).split(' ').slice(0, Math.ceil(t(e).split(' ').length / 2)).join(' ') : e}</Label>)}
      {events.map((e, k) => k > 2 && <Label key={e} x={evX(k) + 75} y={36} size={13} weight={700}>{t(e).split(' ').slice(Math.ceil(t(e).split(' ').length / 2)).join(' ')}</Label>)}
      {policies.map(([p, v], r) => {
        const y = 62 + r * 78
        return (
          <g key={p}>
            <Zone i={r} x={160} y={y - 6} w={840} h={66} t="app" />
            <Label i={r} x={150} y={y + 30} anchor="end" size={13} weight={700} mono>{p}</Label>
            {v.map((on, k) => (
              <g key={k}>
                <Seg i={r} x={evX(k)} y={y + 16} w={46} t="engine" />
                <Label i={r} x={evX(k) + 66} y={y + 33} size={15} weight={700}>{marks[k]}</Label>
                <Seg i={r + 1} x={evX(k) + 88} y={y + 16} w={58} t={on ? 'ok' : 'gone'} />
                {on ? <Label i={r + 1} x={evX(k) + 117} y={y + 10} size={12} weight={700} tone="ok">↻ läuft</Label> : <Label i={r + 1} x={evX(k) + 117} y={y + 10} size={12} tone="muted">aus</Label>}
              </g>
            ))}
          </g>
        )
      })}
    </Svg>
    <Take i={5} label="Wahl" text="Für Dienste passt meist `unless-stopped`: Sie kommen nach Absturz und Neustart wieder, aber nicht, wenn du sie bewusst gestoppt hast." />
  </div>
)

/* Limits are ceilings on a shared machine. */
const limLines: Line[] = [
  'services:', '  web:',
  { t: '    mem_limit: 512m', chip: 'höchstens 512 MB' },
  { t: '    cpus: 1.5', chip: 'höchstens 1,5 Kerne' },
  { t: '    pids_limit: 200', chip: 'höchstens 200 Prozesse' },
  { t: '    read_only: true', chip: 'Dateisystem nur lesen' },
  { t: '    tmpfs: [/tmp]', chip: 'schreibbar im RAM' },
  { t: '    cap_drop: [ALL]', chip: 'keine Sonderrechte' },
  '  db:',
  { t: '    mem_limit: 2g', chip: 'höchstens 2 GB' },
  { t: '    cpus: 2', chip: 'höchstens 2 Kerne' },
  '  cache:',
  { t: '    mem_limit: 256m', chip: 'höchstens 256 MB' },
]
const gb = 118
const mem: [string, number, number, string][] = [['web', .3, .5, '512 MB'], ['db', 1.4, 2, '2 GB'], ['cache', .1, .25, '256 MB']]
export const Limits = () => (
  <div className="dg-split">
    <Code kind="file" title="compose.yaml" lines={limLines} />
    <div className="dg-col">
      <Svg w={600} h={350} label="Speicher und CPU eines Hosts mit den Grenzen der Services">
        <Zone x={0} y={0} w={600} h={186} t="app" label="Arbeitsspeicher des Hosts · 4 GB" />
        {mem.map(([n, use, lim, txt], k) => {
          const y = 42 + k * 46
          return (
            <g key={n}>
              <Label i={1 + k} x={18} y={y + 22} anchor="start" size={14} weight={700}>{n}</Label>
              <Seg i={1 + k} x={80} y={y + 4} w={4 * gb} t="host" />
              <Seg i={1 + k} x={80} y={y + 4} w={use * gb} t="engine" />
              <g className="sa" data-k="bad" style={at(1 + k)}><path d={`M${80 + lim * gb} ${y - 2} V${y + 32}`} /></g>
              <Label i={1 + k} x={88 + lim * gb} y={y + 21} anchor="start" size={12} weight={600}>{`Grenze ${txt}`}</Label>
            </g>
          )
        })}
        <Zone i={4} x={0} y={200} w={600} h={150} t="app" label="CPU des Hosts · 4 Kerne" />
        {[0, 1, 2, 3].map(k => <g key={k} className="sb" data-t="host" style={at(4)}><rect x={80 + k * 118} y={238} width={112} height={96} rx={8} /></g>)}
        <Label i={5} x={18} y={262} anchor="start" size={14} weight={700}>web</Label><Label i={6} x={18} y={312} anchor="start" size={14} weight={700}>db</Label>
        <Seg i={5} x={80} y={246} w={1.5 * 118 - 3} t="engine" />
        <Seg i={6} x={80} y={298} w={2 * 118 - 6} t="kchip" />
      </Svg>
      <Take i={7} label="Wichtig" text="Ein Limit ist eine Obergrenze, keine Reservierung. Dieser Platz wird niemandem freigehalten." />
    </div>
  </div>
)

/* ═══ Start ═══ */

/* A healthcheck over time, and who actually runs it. */
export const Health = () => (
  <div className="dg-col">
    <Svg w={1000} h={380} label="Healthcheck im Zeitverlauf: Anlaufzeit, Prüfungen, Zustände und wer die Prüfung ausführt">
      <g className="sb" data-t="reg" style={at(0)}><rect x={130} y={36} width={250} height={116} rx={10} /></g>
      <Label x={255} y={56} size={13} weight={700}>start_period: Fehler zählen nicht</Label>
      <Label i={1} x={120} y={106} anchor="end" size={14} weight={700}>Prüfung</Label>
      {[170, 250, 330].map(x => <Tick key={x} i={1} x={x} y={100} />)}
      {[430, 510].map(x => <Tick key={x} i={2} ok x={x} y={100} />)}
      <Label i={3} x={600} y={106} size={18} weight={700} tone="muted">…</Label>
      {[690, 770, 850].map(x => <Tick key={x} i={3} bad x={x} y={100} />)}
      <Arrow i={2} both d="M434 76 H506" /><Label i={2} x={470} y={64} size={13} weight={700}>interval</Label>
      <Arrow i={3} both kind="bad" d="M690 128 H850" /><Label i={3} x={770} y={146} size={13} weight={700} tone="bad">retries: 3 Fehler in Folge</Label>
      <Label i={4} x={120} y={186} anchor="end" size={14} weight={700}>Zustand</Label>
      <Box i={1} x={130} y={160} w={296} h={40} t="host" label="starting" size={14} mono />
      <Box i={2} x={430} y={160} w={420} h={40} t="ok" label="healthy" size={14} mono />
      <Box i={3} x={854} y={160} w={146} h={40} t="bad" label="unhealthy" size={14} mono />
      <Box i={5} x={130} y={262} w={210} h={80} t="engine" label="dockerd" sub="startet jede Prüfung" size={17} />
      <Arrow i={5} d="M342 288 H496" label="führt im Container aus" lx={420} ly={276} />
      <Arrow i={6} kind="back" d="M496 320 H344" label="Exit-Code 0 oder 1" lx={420} ly={340} />
      <Ctr i={5} x={500} y={230} w={340} h={130} name="Container db" />
      <Box i={5} x={516} y={264} w={308} h={80} t="app" label="mysqladmin ping" sub="der Befehl aus test:" size={15} mono />
    </Svg>
  </div>
)

/* The whole start order of the project on one time axis. */
const lanesY: Record<string, number> = { db: 44, migrate: 114, web: 184, proxy: 254 }
export const DependsGantt = () => (
  <div className="dg-col">
    <Svg w={1000} h={350} label="Startreihenfolge mit drei Bedingungen und umgekehrte Reihenfolge beim Stoppen">
      {Object.entries(lanesY).map(([n, y], k) => <Label key={n} i={k * 2} x={100} y={y + 25} anchor="end" size={15} weight={700}>{n}</Label>)}
      <Box i={0} x={120} y={44} w={220} h={38} t="host" label="startet" size={14} />
      <Box i={1} x={340} y={44} w={560} h={38} t="ok" label="healthy" size={14} />
      <Box i={2} x={370} y={114} w={130} h={38} t="reg" label="Migration" size={14} />
      <Tick i={3} ok x={516} y={133} /><Label i={3} x={534} y={138} anchor="start" size={13} weight={700} tone="ok">Exit 0</Label>
      <Box i={4} x={540} y={184} w={320} h={38} t="engine" label="läuft" size={14} />
      <Box i={6} x={590} y={254} w={230} h={38} t="engine" label="läuft" size={14} />
      <Arrow i={2} d="M345 84 V133 H366" /><Label i={2} x={336} y={118} anchor="end" size={13} weight={600} mono>service_healthy</Label>
      <Arrow i={4} d="M516 146 V203 H536" /><Label i={4} x={506} y={190} anchor="end" size={13} weight={600} mono>service_completed_successfully</Label>
      <Arrow i={6} d="M560 224 V273 H586" /><Label i={6} x={550} y={258} anchor="end" size={13} weight={600} mono>service_started</Label>
      <Num i={7} n={1} x={820} y={273} /><Num i={7} n={2} x={860} y={203} /><Num i={7} n={3} x={900} y={63} />
      <Label i={7} x={1000} y={24} anchor="end" size={13} weight={700} tone="blue">down: umgekehrte Reihenfolge</Label>
      <Arrow i={0} kind="mute" d="M120 322 H990" /><Label x={100} y={327} anchor="end" size={13} tone="muted">Zeit</Label>
    </Svg>
    <Take i={8} label="Muster" text="Einmal-Aufgaben wie Migrationen laufen als eigener Service. `web` startet erst, wenn sie erfolgreich beendet sind." />
  </div>
)

/* ═══ Netze ═══ */

/* Four ways to publish a port: one door from the network above, one from this machine below. */
const doors: { key: string; k: string; s: string; eth: boolean; lo: boolean; net: boolean }[] = [
  { key: 'ports:', k: '"8080:80"', s: 'für alle offen', eth: true, lo: true, net: true },
  { key: 'ports:', k: '"127.0.0.1:8081:80"', s: 'nur von diesem Rechner', eth: false, lo: true, net: true },
  { key: 'expose:', k: '["80"]', s: 'kein Port am Host', eth: false, lo: false, net: true },
  { key: 'network_mode:', k: 'host', s: 'direkt im Netz des Hosts', eth: true, lo: true, net: false },
]
export const Doors = () => (
  <div className="dg-col">
    <Svg w={1000} h={410} label="Vier Arten, einen Port zu veröffentlichen, und wer jeweils durchkommt">
      <g className="sl" style={at(0)}><Icon name="laptop" x={14} y={28} s={66} /></g>
      <Label x={47} y={112} weight={700} size={13}>anderer</Label><Label x={47} y={130} weight={700} size={13}>Rechner</Label>
      <Zone x={110} y={0} w={890} h={410} label="Host-Rechner" />
      <Box i={1} x={130} y={36} w={850} h={46} t="hw" label="eth0 · 192.168.1.20 · Zugang aus dem Netz" size={15} />
      <Arrow i={1} d="M84 59 H126" />
      <Box i={2} x={130} y={346} w={850} h={46} t="kchip" label="lo · 127.0.0.1 · Zugang nur von diesem Rechner" size={15} />
      {doors.map((d, k) => {
        const x = 130 + k * 215, c = x + 102, i = 3 + k
        return (
          <g key={d.k}>
            <g className="sb" data-t="container" style={at(i)}><rect x={x} y={150} width={205} height={130} rx={14} /></g>
            <Label i={i} x={c} y={172} size={12} tone="muted" mono>{d.key}</Label>
            <Label i={i} x={c} y={192} size={13} weight={700} mono>{d.k}</Label>
            <Label i={i} x={c} y={216} size={13} tone="muted">{d.s}</Label>
            <Tick i={i} ok={d.net} bad={!d.net} x={x + 24} y={254} />
            <Label i={i} x={x + 42} y={259} anchor="start" size={13} weight={600}>{d.net ? 'andere Container' : 'kein Container-Netz'}</Label>
            {d.eth && <Arrow i={i} kind="ok" d={`M${c} 84 V146`} />}
            <Tick i={i} ok={d.eth} bad={!d.eth} x={c} y={114} />
            {d.lo && <Arrow i={i} kind="ok" d={`M${c} 344 V284`} />}
            <Tick i={i} ok={d.lo} bad={!d.lo} x={c} y={314} />
          </g>
        )
      })}
    </Svg>
    <Take i={7} label="Achtung" text="`ports` ohne IP ist aus dem ganzen Netz erreichbar. Docker setzt eigene Firewall-Regeln, die Werkzeuge wie `ufw` nicht sehen." />
  </div>
)

/* ═══ Daten ═══ */

/* What happens to the image's files when something is mounted over them. */
const vcase: { title: string; mount: string; msub: string; t: BoxTone; arrow: string; res: string; rsub: string; rt: BoxTone; kind: 'ok' | 'bad' }[] = [
  { title: 'Leeres Volume', mount: 'Volume daten', msub: 'noch leer', t: 'reg', arrow: 'Docker kopiert', res: 'index.html, style.css', rsub: 'Inhalt aus dem Image', rt: 'ok', kind: 'ok' },
  { title: 'Volume mit Daten', mount: 'Volume daten', msub: 'enthält alt.html', t: 'reg', arrow: 'nichts wird kopiert', res: 'alt.html', rsub: 'neue Image-Dateien fehlen', rt: 'reg', kind: 'ok' },
  { title: 'Bind-Mount', mount: './leer', msub: 'Ordner auf dem Host', t: 'libs', arrow: 'verdeckt das Image', res: 'leerer Ordner', rsub: 'die App findet nichts', rt: 'bad', kind: 'bad' },
]
export const VolumeInit = () => (
  <div className="dg-col">
    <Svg w={1000} h={400} label="Was mit den Dateien des Images passiert, wenn etwas über den Ordner gemountet wird">
      {vcase.map((c, k) => {
        const x = k * 345, m = x + 155
        return (
          <g key={c.title}>
            <Zone i={k * 4} x={x} y={0} w={310} h={400} t="app" label={c.title} />
            <Box i={k * 4} x={x + 20} y={40} w={270} h={72} t="libs" label="/app im Image" sub="index.html, style.css" size={15} />
            <Box i={k * 4 + 1} x={x + 20} y={160} w={270} h={72} t={c.t} label={c.mount} sub={c.msub} size={15} />
            <Label i={k * 4 + 1} x={m} y={143} size={13} weight={700}>darüber gemountet</Label>
            <Arrow i={k * 4 + 2} kind={c.kind} d={`M${m} 234 V296`} label={c.arrow} lx={m + 12} ly={270} anchor="start" />
            <Box i={k * 4 + 3} x={x + 20} y={300} w={270} h={80} t={c.rt} label={c.res} sub={c.rsub} size={15} />
          </g>
        )
      })}
    </Svg>
    <Take i={12} label="Folge" text="Ein Volume wird nur beim ersten Mal gefüllt. Eine neue Image-Version ändert seinen Inhalt nicht mehr." />
  </div>
)

/* The same project four times: what is still there after each command. */
const objs: ['crate' | 'network' | 'folder' | 'blueprint', string][] = [['crate', 'Container'], ['network', 'Netz'], ['folder', 'Volume'], ['blueprint', 'Image']]
type Fate = 'keep' | 'gone' | 'stop'
const cleanup: [string, Fate[], string?][] = [
  ['docker compose stop', ['stop', 'keep', 'keep', 'keep']],
  ['docker compose down', ['gone', 'gone', 'keep', 'keep']],
  ['docker compose down -v', ['gone', 'gone', 'gone', 'keep']],
  ['docker compose down --rmi local', ['gone', 'gone', 'keep', 'gone'], 'nur Images ohne eigenen Tag'],
]
const fateText: Record<Fate, string> = { keep: 'bleibt', gone: 'gelöscht', stop: 'gestoppt' }
export const Cleanup = () => (
  <div className="dg-col">
    <Svg w={1000} h={370} label="Was nach stop, down, down -v und down --rmi local vom Projekt noch da ist">
      {cleanup.map(([c, fate, note], p) => {
        const px = (p % 2) * 510, py = Math.floor(p / 2) * 190
        return (
          <g key={c}>
            <Zone i={p * 2} x={px} y={py} w={490} h={180} t="app" />
            <Label i={p * 2} x={px + 18} y={py + 28} anchor="start" size={14} weight={700} mono>{c}</Label>
            {objs.map(([ic, l], k) => {
              const x = px + 24 + k * 116, f = fate[k]
              return (
                <g key={l}>
                  <g className="sl" style={{ ...at(p * 2 + 1), opacity: f === 'gone' ? .22 : 1 }}><Icon name={ic} x={x + 10} y={py + 44} s={54} /></g>
                  {f !== 'stop' && <Tick i={p * 2 + 1} ok={f === 'keep'} bad={f === 'gone'} x={x + 66} y={py + 50} />}
                  <Label i={p * 2 + 1} x={x + 37} y={py + 124} size={13} weight={700}>{l}</Label>
                  <Label i={p * 2 + 1} x={x + 37} y={py + 143} size={13} tone={f === 'gone' ? 'bad' : f === 'keep' ? 'ok' : 'muted'}>{fateText[f]}</Label>
                </g>
              )
            })}
            {note && <Label i={p * 2 + 1} x={px + 472} y={py + 168} anchor="end" size={12} tone="muted">{note}</Label>}
          </g>
        )
      })}
    </Svg>
    <Take i={8} label="Sicher" text="Volumes mit `external: true` löscht auch `down -v` nie: Sie gehören nicht zum Projekt." />
  </div>
)


/* ═══ Konfiguration ═══ */

/* Two different ladders feed two different targets. */
const Ladder = ({ x, cards, i }: { x: number; cards: [string, BoxTone][]; i: number }) => <>
  {cards.map(([l, t], k) => <Box key={l} i={i + k} x={x + k * 16} y={46 + k * 58} w={300} h={50} t={t} label={l} size={13} mono />)}
</>
export const VarWinner = () => (
  <div className="dg-col">
    <Svg w={1000} h={320} label="Zwei Rangfolgen: Variablen im Container und Platzhalter in der Compose-Datei">
      <Label x={0} y={22} anchor="start" size={16} weight={700}>Variable im Container</Label>
      <Label x={0} y={300} anchor="start" size={13} tone="muted">oben gewinnt, gilt zur Laufzeit</Label>
      <Ladder x={0} i={0} cards={[['run -e MODE=test', 'engine'], ['environment: prod', 'gone'], ['env_file: stage', 'gone'], ['ENV im Image: dev', 'gone']]} />
      <Arrow i={4} kind="ok" d="M302 71 H346" />
      <Ctr i={4} x={350} y={36} w={130} h={72} name="Container" /><Label i={4} x={415} y={92} size={13} weight={700} mono>MODE=test</Label>
      <Label i={5} x={530} y={22} anchor="start" size={16} weight={700}>Platzhalter in compose.yaml</Label>
      <Label i={5} x={530} y={300} anchor="start" size={13} tone="muted">oben gewinnt, gilt beim Einlesen</Label>
      <Ladder x={530} i={5} cards={[['Shell: TAG=1.5', 'engine'], ['.env: TAG=1.4', 'gone'], ['${TAG:-latest}', 'gone']]} />
      <Arrow i={8} kind="ok" d="M832 71 H866" />
      <Box i={8} x={870} y={36} w={130} h={72} t="libs" label="shop:1.5" sub="image:" size={14} mono />
    </Svg>
    <Take i={9} label="Falle" text="`.env` wirkt nur rechts: Es füllt `${…}` in der Datei. In den Container kommt ein Wert erst über `environment` oder `env_file`." />
  </div>
)

/* Where a password can be read from: variable versus secret file. */
export const Secrets = () => (
  <div className="dg-col">
    <Svg w={1000} h={400} label="Passwort als Variable ist an vielen Stellen lesbar, als Secret liegt es nur als Datei im Container">
      <Zone x={0} y={0} w={480} h={400} t="bad" label="Als Variable" />
      <Ctr i={1} x={20} y={40} w={440} h={100} name="Container db" />
      <Box i={1} x={36} y={72} w={408} h={54} t="bad" label="MYSQL_ROOT_PASSWORD=geheim" size={14} mono />
      {([['docker inspect', 'jeder mit Docker-Zugriff', 20], ['/proc/1/environ', 'im Container', 170], ['Kindprozesse', 'erben alles, auch Logs', 320]] as const).map(([l, s, x], k) => (
        <g key={l}><Arrow i={2 + k} kind="bad" d={`M${x + 70} 142 V246`} /><Box i={2 + k} x={x} y={250} w={140} h={84} label={l} sub={k === 2 ? 'erben alles' : k ? 'im Container' : 'mit Docker-Zugriff'} size={13} mono={k < 2} /></g>
      ))}
      <Label i={5} x={240} y={370} size={14} weight={700} tone="bad">Der Wert liegt an vielen Stellen offen</Label>

      <Zone i={6} x={520} y={0} w={480} h={400} t="ok" label="Als Secret" />
      <Box i={6} x={540} y={40} w={440} h={60} label="./secrets/db_pw.txt" sub="auf dem Host, nicht im Git" size={14} mono />
      <Arrow i={7} kind="ok" d="M760 102 V166" label="als Datei eingehängt" lx={772} ly={140} anchor="start" />
      <Ctr i={7} x={540} y={170} w={440} h={150} name="Container db" />
      <Box i={7} x={556} y={202} w={408} h={46} t="ok" label="/run/secrets/db_pw" size={14} mono />
      <Box i={8} x={556} y={258} w={408} h={46} t="host" label="MYSQL_ROOT_PASSWORD_FILE=/run/secrets/db_pw" size={12} mono />
      <Label i={9} x={760} y={350} size={14} weight={700} tone="ok">docker inspect zeigt nur den Pfad</Label>
      <Label i={9} x={760} y={372} size={13} tone="muted">Das Image muss _FILE-Variablen unterstützen</Label>
    </Svg>
  </div>
)

/* Profiles switch services on and off. */
const svcP: [string, string | null, boolean, boolean][] = [['proxy', null, true, true], ['web', null, true, true], ['db', null, true, true], ['adminer', 'debug', false, true], ['backup', 'ops', false, false]]
export const Profiles = () => (
  <Svg w={1000} h={350} label="Profile: Ohne Angabe laufen nur die normalen Services, mit --profile kommen weitere dazu">
    {(['docker compose up', 'docker compose --profile debug up'] as const).map((c, p) => {
      const x = p * 515
      return (
        <g key={c}>
          <Zone i={p * 3} x={x} y={0} w={485} h={350} t="app" />
          <Label i={p * 3} x={x + 18} y={30} anchor="start" size={14} weight={700} mono>{c}</Label>
          {svcP.map(([n, prof, a, b], k) => {
            const on = p ? b : a
            return <Box key={n} i={p * 3 + 1} x={x + 18 + (k % 3) * 152} y={56 + Math.floor(k / 3) * 140} w={144} h={120} t={on ? 'container' : 'gone'} label={n} sub={prof ? `Profil ${prof}` : 'immer dabei'} size={15} />
          })}
        </g>
      )
    })}
  </Svg>
)


/* ═══ Betrieb ═══ */

/* Compose Watch: a saved file takes one of three ways into the running service. */
const watch: { f: string; a: string; y: number }[] = [{ f: 'src/app.js', a: 'sync', y: 50 }, { f: 'nginx.conf', a: 'sync+restart', y: 160 }, { f: 'package.json', a: 'rebuild', y: 270 }]
export const Watch = () => (
  <div className="dg-col">
    <Svg w={1000} h={350} label="Compose Watch: Je nach Datei wird synchronisiert, neu gestartet oder neu gebaut">
      <Zone x={0} y={0} w={220} h={350} t="reg" label="Projektordner" />
      {watch.map((w, k) => (
        <g key={w.f}>
          <Box i={k * 2} x={14} y={w.y} w={192} h={60} label={w.f} sub="gespeichert" size={14} mono />
          <Arrow i={k * 2} d={`M208 ${w.y + 30} H266`} />
          <Box i={k * 2} x={270} y={w.y + 6} w={160} h={48} t="kchip" label={w.a} size={14} mono />
        </g>
      ))}
      <Zone i={1} x={640} y={0} w={360} h={240} label="Container web läuft" />
      <Arrow i={1} kind="ok" d="M432 80 H656" />
      <Box i={1} x={660} y={48} w={320} h={64} t="ok" label="Datei ausgetauscht" sub="Prozess läuft einfach weiter" size={15} />
      <Arrow i={3} d="M432 190 H656" />
      <Box i={3} x={660} y={158} w={320} h={64} t="reg" label="Datei neu, Prozess ↻" sub="derselbe Container startet neu" size={15} />
      <Arrow i={5} d="M432 300 H486" />
      <g className="sl" style={at(5)}><Icon name="blueprint" x={490} y={274} s={52} /></g>
      <Label i={5} x={516} y={342} size={13} weight={600}>neues Image</Label>
      <Arrow i={5} d="M546 300 H636" />
      <Box i={5} x={640} y={268} w={360} h={64} t="container" label="neuer Container" sub="ersetzt den alten" size={15} />
    </Svg>
    <Take i={7} label="Kosten" text="Von oben nach unten wird es langsamer: Wähle für jeden Pfad die kleinste Aktion, die noch reicht." />
  </div>
)


/* Troubleshooting: walk the way of the service, each stop has its symptom and its command. */
const dbg: [string, string, string, string][] = [
  ['Datei', 'Stimmt die fertige Datei?', 'Variable fehlt, YAML-Fehler', 'compose config'],
  ['Start', 'Warum endet der Prozess?', 'Exited, Restarting', 'compose logs web'],
  ['Netz', 'Wird der Name gefunden?', 'Connection refused', 'exec web getent hosts db'],
  ['Ressourcen', 'Ist die Grenze erreicht?', 'Exit 137, sehr langsam', 'docker stats'],
  ['Daten', 'Ist es das richtige Volume?', 'Tabellen sind leer', 'volume ls, inspect'],
]
export const DebugPath = () => (
  <Svg w={1000} h={410} label="Fehlersuche entlang des Wegs von der Datei über Container und Netz bis zu den Daten">
    <Zone x={0} y={0} w={1000} h={178} label="Der Weg deines Service" />
    {([['file', 'compose.yaml', 70], ['crate', 'web', 300], ['crate', 'db', 610], ['folder', 'Volume', 860]] as const).map(([ic, l, x], k) => (
      <g key={l}><g className="sl" style={at(k)}><Icon name={ic} x={x} y={40} s={76} /></g><Label i={k} x={x + 38} y={146} size={14} weight={700}>{l}</Label></g>
    ))}
    <Arrow i={1} d="M152 78 H292" /><Num i={1} n={1} x={146} y={48} /><Num i={1} n={2} x={376} y={46} />
    <Arrow i={2} d="M382 78 H602" label="über das Netz" lx={492} ly={56} /><Num i={2} n={3} x={492} y={78} />
    <Arrow i={3} both d="M692 78 H852" /><Num i={2} n={4} x={686} y={46} /><Num i={3} n={5} x={936} y={46} />
    {dbg.map(([s, q, sym, cmd], k) => {
      const x = k * 202 + 2
      return (
        <g key={s}>
          <Zone i={4 + k} x={x} y={192} w={190} h={216} t="app" />
          <Num i={4 + k} n={k + 1} x={x + 22} y={216} />
          <Label i={4 + k} x={x + 42} y={221} anchor="start" size={15} weight={700}>{s}</Label>
          <Label i={4 + k} x={x + 95} y={262} size={12} weight={600}>{q}</Label>
          <Label i={4 + k} x={x + 95} y={304} size={12} weight={700} tone="bad">{sym}</Label>
          <Box i={4 + k} x={x + 10} y={336} w={170} h={56} t="hw" label={cmd} size={k === 2 ? 11 : 12} mono />
        </g>
      )
    })}
  </Svg>
)


/* Closing picture: the whole project, each number one topic of this chapter. */
const allLines: Line[] = [
  { t: 'name: shop', n: 1 }, 'services:',
  '  proxy:',
  { t: '    ports: ["80:80"]', n: 2 }, { t: '    networks: [frontend]', n: 3 },
  '  web:',
  { t: '    build: ./web', n: 4 }, { t: '    restart: unless-stopped', n: 5 },
  { t: '    depends_on: { db: …healthy }', n: 6 }, '    networks: [frontend, backend]',
  '  db:', '    image: mysql:8',
  { t: '    healthcheck: { … }', n: 6 }, { t: '    mem_limit: 2g', n: 7 },
  { t: '    volumes: [dbdata:/var/lib/mysql]', n: 8 }, { t: '    secrets: [db_pw]', n: 9 },
  '  adminer:', { t: '    profiles: [debug]', n: 10 },
]
export const Summary = () => (
  <div className="dg-split">
    <Code kind="file" title="compose.yaml" lines={allLines} />
    <Svg w={620} h={490} label="Das laufende Projekt shop mit allen Themen dieses Kapitels">
      <Zone x={0} y={0} w={620} h={490} label="Host · Projekt shop" /><Num i={1} n={1} x={160} y={18} />
      <Box i={1} x={14} y={56} w={66} h={50} t="engine" label=":80" size={15} /><Num i={1} n={2} x={14} y={56} />
      <Box i={2} x={120} y={44} w={130} h={74} t="container" label="proxy" sub="nginx" />
      <Box i={3} x={290} y={44} w={140} h={74} t="container" label="web" sub="selbst gebaut" /><Num i={3} n={4} x={430} y={44} /><Num i={3} n={5} x={290} y={44} />
      <Box i={4} x={465} y={44} w={140} h={74} t="container" label="db" sub="healthy" /><Num i={4} n={7} x={605} y={44} />
      <Box i={9} x={100} y={290} w={140} h={60} t="gone" label="adminer" sub="nur mit debug" size={14} /><Num i={9} n={10} x={240} y={290} />
      <Arrow i={1} d="M82 81 H116" />
      <Arrow i={5} kind="back" d="M465 100 H434" /><Num i={5} n={6} x={448} y={142} />
      <g className="sb" data-t="kchip" style={at(5)}><rect x={100} y={166} width={285} height={26} rx={13} /><text x={114} y={184} fontSize={13} fontWeight={700}>frontend</text></g>
      <g className="sb" data-t="kchip" style={at(5)}><rect x={400} y={166} width={170} height={26} rx={13} /><text x={456} y={184} fontSize={13} fontWeight={700}>backend</text></g>
      <Num i={5} n={3} x={372} y={179} />
      <Wire i={5} d="M185 120 V164" /><Wire i={5} d="M330 120 V164" /><Wire i={5} d="M415 120 V164" /><Wire i={5} d="M535 120 V164" />
      <Box i={6} x={290} y={272} w={150} h={64} t="reg" label="Volume dbdata" sub="überlebt down" size={14} /><Num i={6} n={8} x={440} y={272} />
      <Arrow i={6} d="M590 120 V304 H444" />
      <Arrow i={7} d="M590 304 V388 H444" />
      <Box i={7} x={290} y={356} w={150} h={64} t="reg" label="Secret db_pw" sub="als Datei" size={14} /><Num i={7} n={9} x={440} y={356} />
      <Box i={8} x={14} y={430} w={592} h={46} t="engine" label="dockerd führt aus, Compose hat nur den Plan geliefert" size={14} />
    </Svg>
  </div>
)
