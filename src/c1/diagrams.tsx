import type { CSSProperties } from 'react'
import { at } from '../components/Stack.tsx'
import { Svg, Box, Arrow, Label, type ArrowKind } from '../components/Svg.tsx'
import { Icon, IconSvg } from '../components/Icons.tsx'
import { Code, type Line } from '../components/Code.tsx'
import { Visuals } from '../components/Visuals.tsx'
import { t } from '../i18n.ts'
import './c1.css'

// Chapter 1 diagrams. One running example throughout: project "shop" = WordPress (web) + MySQL (db).
const css = (o: Record<string, string | number>) => o as CSSProperties
/** Line without arrow head: a cable between a container and a network. */
const Wire = ({ d, i = 0, k = 'mute' }: { d: string; i?: number; k?: ArrowKind }) => <g className="sa" data-k={k} style={at(i)}><path d={d} /></g>
/** Container outline with its name, children drawn inside. */
const Ctr = ({ x, y, w, h, name, i = 0 }: { x: number; y: number; w: number; h: number; name: string; i?: number }) => (
  <g className="sb" data-t="container" style={at(i)}>
    <rect x={x} y={y} width={w} height={h} rx={14} />
    <text x={x + 14} y={y + 22} fontSize={14} fontWeight={700}>{t(name)}</text>
  </g>
)
/** Numbered badge inside an SVG, matches the badges in a Code panel. */
const Num = ({ n, x, y, i = 0 }: { n: number; x: number; y: number; i?: number }) => (
  <g className="sl num" style={at(i)}><circle cx={x} cy={y} r={12} /><text x={x} y={y + 5} textAnchor="middle">{n}</text></g>
)

/* ── 2 · the problem: one correct command, and the same command with one small slip each ── */
const run = ['docker run -d', '--name db', '--network shop', '-e MYSQL_ROOT_PASSWORD=geheim', '-v dbdata:/var/lib/mysql', 'mysql:8']
const slips: { at: number; t: string; when: string; now?: boolean; result: string }[] = [
  { at: 2, t: '--network shpo', when: 'sofort', now: true, result: 'Error: network shpo not found' },
  { at: 3, t: '-e MYSQL_ROOT_PASWORD=geheim', when: 'nach Sekunden', result: 'Container beendet sich: „password option is not specified“' },
  { at: 1, t: '', when: 'später', result: 'Container bekommt einen Zufallsnamen: web findet „db“ nicht' },
  { at: 4, t: '-v dbdata:/var/lib/mysq', when: 'viel später', result: 'Daten landen nicht im Volume dbdata: nach dem Löschen nicht wiederzufinden' },
  { at: 5, t: 'mysql', when: 'irgendwann', result: 'Neueste Version statt 8: läuft anders als bei den Kollegen' },
]
export const Problem = () => (
  <div className="c1-problem">
    <div className="ty" data-ok style={at(0)}>
      <span className="ty-tag">{t('✓ richtig')}</span>
      <code>{run.map(p => t(p)).join(' ')}</code>
      <small>{t('Netz, Name, Passwort, Volume und Version stimmen')}</small>
    </div>
    <p className="ty-sep" style={at(1)}>{t('Derselbe Befehl, jeweils ein kleiner Fehler:')}</p>
    {slips.map((s, k) => (
      <div className="ty" key={k} style={at(2 + k)}>
        <span className="ty-tag" data-now={s.now || undefined}>{s.now ? '✗' : '⚠'} {t(s.when)}</span>
        <code>{run.map((p, j) => <span key={j}>{j ? ' ' : ''}{j !== s.at ? t(p) : s.t ? <mark>{t(s.t)}</mark> : <del>{t(p)}</del>}</span>)}</code>
        <small>{t(s.result)}</small>
      </div>
    ))}
    <p className="cause" style={at(8)}><b>{t('Ursache')}</b> {t('Jede Option wird bei jedem Start neu getippt, für jeden Container. Nur einer von fünf Fehlern meldet sich sofort.')}</p>
  </div>
)

/* ── 3 · the idea: the same environment by hand and with Compose ── */
const byHand: Line[] = [
  { t: 'docker network create shop', k: 'cmd' },
  { t: 'docker volume create dbdata', k: 'cmd' },
  { t: 'docker run -d --name db --network shop \\', k: 'cmd' },
  { t: '    -e MYSQL_ROOT_PASSWORD=geheim \\', k: 'cont' },
  { t: '    -e MYSQL_DATABASE=wordpress \\', k: 'cont' },
  { t: '    -v dbdata:/var/lib/mysql mysql:8', k: 'cont' },
  { t: '# warten, bis die Datenbank bereit ist …', k: 'note' },
  { t: 'docker run -d --name web --network shop \\', k: 'cmd' },
  { t: '    -p 8080:80 -e WORDPRESS_DB_HOST=db \\', k: 'cont' },
  { t: '    -e WORDPRESS_DB_USER=root \\', k: 'cont' },
  { t: '    -e WORDPRESS_DB_PASSWORD=geheim wordpress:6', k: 'cont' },
  { t: '# aufräumen, in der richtigen Reihenfolge:', k: 'note' },
  { t: 'docker stop web db', k: 'cmd' },
  { t: 'docker rm web db', k: 'cmd' },
  { t: 'docker network rm shop', k: 'cmd' },
]
const withCompose: Line[] = [
  { t: '# alle Optionen stehen einmal in compose.yaml', k: 'note' },
  { t: 'docker compose up -d', k: 'cmd' },
  '[+] Running 4/4',
  { t: ' ✔ Network shop_default    Created', k: 'ok' },
  { t: ' ✔ Volume shop_dbdata      Created', k: 'ok' },
  { t: ' ✔ Container shop-db-1     Healthy', k: 'ok' },
  { t: ' ✔ Container shop-web-1    Started', k: 'ok' },
  { t: 'docker compose ps', k: 'cmd' },
  'NAME        SERVICE  STATUS        PORTS',
  'shop-db-1   db       Up (healthy)  3306/tcp',
  'shop-web-1  web      Up            0.0.0.0:8080->80/tcp',
  { t: '# aufräumen: ein Befehl', k: 'note' },
  { t: 'docker compose down', k: 'cmd' },
  { t: ' ✔ Container shop-web-1    Removed', k: 'ok' },
  { t: ' ✔ Container shop-db-1     Removed', k: 'ok' },
  { t: ' ✔ Network shop_default    Removed', k: 'ok' },
]
export const Idea = () => (
  <div className="c1-idea">
    <div className="duo c1-terms">
      <div className="c1-col"><h3 style={at(0)}>{t('Nur Docker')} <small>{t('4 Befehle zum Starten, 3 zum Aufräumen')}</small></h3><Code title="Terminal" lines={byHand} i={0} /></div>
      <div className="c1-col"><h3 style={at(2)}>{t('Mit Docker Compose')} <small>{t('1 Befehl zum Starten, 1 zum Aufräumen')}</small></h3><Code title="Terminal" lines={withCompose} i={2} /></div>
    </div>
    <div className="c1-wide" style={at(6)}>
      <span><b>{t('Ein Befehl statt vieler')}</b><code>up</code> {t('legt Netz, Volume und Container in der richtigen Reihenfolge an,')} <code>down</code> {t('räumt alles wieder weg.')}</span>
      <span><b>{t('Wiederholbar')}</b>{t('Die Datei liegt im Git: Jeder startet genau dieselbe Umgebung, Tippfehler fallen beim Einlesen auf.')}</span>
    </div>
  </div>
)

/* ── 4 · anatomy in one file: bright = nearly always needed, darker = only when needed ── */
const fileAll: Line[] = [
  { t: 'name: shop', dim: true },
  'services:',
  '  web:',
  '    image: wordpress:6',
  { t: '    build: ./web', dim: true },
  '    ports:',
  '      - "8080:80"',
  '    environment:',
  '      WORDPRESS_DB_HOST: db',
  '      WORDPRESS_DB_USER: root',
  '      WORDPRESS_DB_PASSWORD: geheim',
  '    volumes:',
  '      - uploads:/var/www/html/wp-content',
  '    depends_on: [db]',
  { t: '    restart: unless-stopped', dim: true },
  '  db:',
  '    image: mysql:8',
  '    environment:',
  '      MYSQL_ROOT_PASSWORD: geheim',
  '      MYSQL_DATABASE: wordpress',
  '    volumes:',
  '      - dbdata:/var/lib/mysql',
  { t: '    healthcheck:', dim: true },
  { t: '      test: mysqladmin ping -h localhost', dim: true },
  { t: 'networks:', dim: true },
  { t: '  default: { driver: bridge }', dim: true },
  'volumes:',
  '  uploads: { driver: local }',
  '  dbdata: { driver: local }',
]
export const Anatomy = () => (
  <div className="c1-anat">
    <Code kind="file" title="compose.yaml" lines={fileAll} groups={[
      { from: 0, n: 1, label: 'Projektname' },
      { from: 2, n: 13, label: 'Service web' },
      { from: 15, n: 9, label: 'Service db' },
      { from: 24, n: 2, label: 'Netze' },
      { from: 26, n: 3, label: 'Volumes' },
    ]} />
    <div className="c1-legend" style={at(5)}>
      <span><b className="lg-on">{t('hell')}</b> {t('fast immer gebraucht')}</span>
      <span><b className="lg-off">{t('dunkel')}</b> {t('nur bei Bedarf')}</span>
    </div>
  </div>
)

/* ── 5 · ports: the outside view. The host machine opens a port and forwards it to a container port. ── */
const Anat = ({ parts, d }: { parts: [string, string][]; d: number }) => (
  <div className="anatomy c1-center" style={css({ '--d': d })}>
    <div className="row">{parts.map(([c, l], k) => <div className="part" key={k} style={at(k)}><code>{c}</code><i /><span>{t(l)}</span></div>)}</div>
  </div>
)
export const Ports = () => (
  <div className="c1-ports">
    <Svg w={1000} h={440} label="Der Host-Rechner öffnet Port 8080 und leitet ihn an Port 80 im Container weiter">
      <g className="sb" data-t="host" style={at(0)}><rect x={150} y={10} width={840} height={420} rx={22} /></g>
      <Label x={172} y={40} anchor="start" size={16} weight={700}>Host-Rechner · IP 192.168.1.20</Label>
      <Label x={450} y={68} size={14} weight={700} tone="blue">Sicht von außen</Label>
      <Label x={788} y={68} size={14} weight={700} tone="blue">Sicht im Container</Label>

      <g className="sb" data-t="kernel" style={at(1)}>
        <rect x={400} y={84} width={100} height={330} rx={14} />
        <text x={450} y={108} textAnchor="middle" fontSize={13} fontWeight={700}>{t('Ports des')}</text>
        <text x={450} y={124} textAnchor="middle" fontSize={13} fontWeight={700}>{t('Host-Rechners')}</text>
      </g>
      <Box i={2} x={410} y={146} w={80} h={50} t="engine" label="8080" sub="offen" size={16} />
      <Box i={2} x={410} y={306} w={80} h={50} t="gone" label="3306" sub="zu" size={16} />

      <g className="sl" style={at(3)}><Icon name="browser" x={190} y={110} s={70} /></g>
      <Label i={3} x={225} y={200} weight={700}>Browser</Label>
      <Label i={3} x={225} y={218} size={13} tone="muted">auf dem Host</Label>
      <Arrow i={3} d="M266 150 H406" label="localhost:8080" lx={336} ly={138} />
      <g className="sl" style={at(4)}><Icon name="laptop" x={16} y={250} s={64} /></g>
      <Label i={4} x={6} y={336} anchor="start" weight={700}>anderer Rechner</Label>
      <Label i={4} x={6} y={354} anchor="start" size={13} tone="muted">192.168.1.20:8080</Label>
      <Arrow i={4} d="M84 272 C 220 272, 320 196, 406 180" />
      <Arrow i={8} kind="bad" d="M84 300 C 240 310, 320 331, 406 331" />
      <Label i={8} x={290} y={360} size={14} weight={700} tone="bad">192.168.1.20:3306 ✗</Label>
      <Label i={8} x={290} y={378} size={13} tone="bad">kein ports-Eintrag: keine Tür</Label>

      <g className="sb" data-t="gone" style={at(5)}><rect x={598} y={84} width={380} height={330} rx={18} /></g>
      <Label i={5} x={788} y={404} size={13} tone="muted">internes Netz: von außen unsichtbar</Label>
      <Ctr i={5} x={614} y={100} w={348} h={124} name="Container web" />
      <Box i={5} x={628} y={140} w={110} h={66} t="libs" label=":80" sub="Container-Port" />
      <Box i={5} x={750} y={140} w={196} h={66} label="WordPress" sub="lauscht auf Port 80" />
      <Ctr i={7} x={614} y={250} w={348} h={124} name="Container db" />
      <Box i={7} x={628} y={290} w={110} h={66} t="libs" label=":3306" sub="Container-Port" />
      <Box i={7} x={750} y={290} w={196} h={66} label="MySQL" sub="lauscht auf Port 3306" />
      <Arrow i={6} d="M494 172 H624" />
      <Label i={6} x={546} y={160} size={13} weight={600}>leitet weiter</Label>
    </Svg>
    <Anat d={10} parts={[['8080', 'Port am Host-Rechner'], [':', 'leitet weiter an'], ['80', 'Port im Container']]} />
  </div>
)

/* ── 6 · networks: the inside view. Containers reach each other by service name and container port. ── */
const fileNet: Line[] = [
  'services:',
  '  proxy:',
  '    image: nginx:1.27',
  '    networks: [frontend]',
  '  web:',
  '    image: wordpress:6',
  '    environment:',
  { t: '      WORDPRESS_DB_HOST: db:3306', n: 1 },
  '    networks: [frontend, backend]',
  '  db:',
  '    image: mysql:8',
  { t: '    # kein ports: nur intern erreichbar', k: 'note' },
  '    networks: [backend]',
  'networks:',
  '  frontend: { driver: bridge }',
  '  backend: { driver: bridge }',
]
/** A network as a cable everyone plugs into, its name written on it. */
const Bus = ({ x, w, y, name, tx }: { x: number; w: number; y: number; name: string; tx: number }) => (
  <g className="sb" data-t="kchip" style={at(1)}>
    <rect x={x} y={y} width={w} height={24} rx={12} />
    <text x={tx} y={y + 17} fontSize={13} fontWeight={700}>{t(name)}</text>
  </g>
)
const dns: [string, string, boolean][] = [['proxy', '172.18.0.2', false], ['web', '172.18.0.3 · 172.19.0.2', false], ['db', '172.19.0.3', true]]
export const Networks = () => (
  <div className="c1-net">
    <div className="c1-col">
      <Code kind="file" title="compose.yaml" lines={fileNet} />
      <p className="cause" style={at(3)}><b>{t('Name = Adresse')}</b> {t('Ohne')} <code>networks:</code> {t('hängen alle an einem Netz')} <code>shop_default</code>.</p>
    </div>
    <div className="c1-col">
      <Svg w={600} h={500} label="Die Engine führt eine Namensliste: web fragt nach db, bekommt die IP und verbindet sich direkt mit Port 3306">
        <g className="sb" data-t="host" style={at(0)}><rect x={0} y={0} width={600} height={500} rx={20} /></g>
        <Label x={20} y={28} anchor="start" size={15} weight={700}>Host-Rechner · Sicht der Container</Label>

        <Box i={1} x={30} y={46} w={150} h={64} t="container" label="proxy" sub="172.18.0.2" />
        <Box i={1} x={225} y={46} w={150} h={64} t="container" label="web" sub="fragt nach „db“" />
        <Box i={1} x={420} y={46} w={150} h={64} t="container" label="db" sub="lauscht auf :3306" />
        <Bus x={20} w={370} y={146} name="Netz frontend" tx={36} />
        <Bus x={242} w={338} y={190} name="Netz backend" tx={256} />
        <Wire i={1} d="M105 110 V146" /><Wire i={1} d="M300 110 V146" /><Wire i={1} d="M350 110 V190" /><Wire i={1} d="M495 110 V190" />

        <g className="sb" data-t="engine" style={at(2)}>
          <rect x={20} y={296} width={560} height={186} rx={16} />
          <text x={40} y={326} fontSize={16} fontWeight={700}>{t('Docker Engine · eingebauter DNS')}</text>
          <text x={40} y={346} fontSize={13} className="sb-sub">{t('jeder Container fragt hier: „Service-Name → IP“')}</text>
        </g>
        {dns.map(([n, ip, on], k) => <Box key={n} i={2} x={40} y={362 + k * 36} w={520} h={30} t={on ? 'ok' : 'app'} label={`${n}  →  ${ip}`} size={14} />)}

        <Arrow i={3} kind="back" d="M232 112 V292" both />
        <Num i={3} n={1} x={210} y={232} />
        <Label i={3} x={194} y={237} anchor="end" size={13} weight={600}>fragt: wer ist „db“?</Label>
        <Num i={4} n={2} x={210} y={266} />
        <Label i={4} x={194} y={271} anchor="end" size={13} weight={600}>Antwort: 172.19.0.3</Label>
        <Arrow i={5} kind="ok" d="M375 90 H416" />
        <Num i={5} n={3} x={397} y={62} />
        <Num i={5} n={3} x={300} y={240} />
        <Label i={5} x={316} y={245} anchor="start" size={13} weight={700} tone="ok">verbindet direkt 172.19.0.3:3306</Label>
      </Svg>
      <p className="cause" style={at(6)}><b>{t('Nicht erreichbar')}</b><code>localhost:3306</code> {t('in web zeigt auf web selbst. proxy kennt db nicht: kein gemeinsames Netz.')}</p>
    </div>
  </div>
)

/* ── 7 · variables: where they come from, where they end up, and who can read them ── */
const band = (y: number, t: string, title: string, sub: string, i: number) => (
  <g key={title}>
    <g className="sb" data-t={t} style={at(i)}><rect x={0} y={y} width={1000} height={96} rx={16} /></g>
    <Label i={i} x={18} y={y + 42} anchor="start" size={16} weight={700}>{title}</Label>
    <Label i={i} x={18} y={y + 62} anchor="start" size={13} tone="muted">{sub}</Label>
  </g>
)
const col = [200, 395, 590]
const W = 175
const mid = (k: number) => col[k] + W / 2
const Who = ({ y, a, b, tone, i }: { y: number; a: string; b: string; tone?: 'bad' | 'ok'; i: number }) => <>
  <Label i={i} x={800} y={y + 42} anchor="start" size={14} weight={700} tone={tone}>{a}</Label>
  <Label i={i} x={800} y={y + 62} anchor="start" size={13} tone={tone ?? 'muted'}>{b}</Label>
</>
export const Variables = () => (
  <div className="c1-vars">
    <Svg w={1000} h={470} label="Variablen: vom Rechner über compose.yaml und Dockerfile in Image und Container, und wer sie lesen kann">
      <Label x={800} y={-8} anchor="start" size={13} weight={700} tone="blue">Wer kann den Wert lesen?</Label>
      {band(0, 'host', 'Dein Rechner', 'beim Start gelesen', 0)}
      {band(122, 'app', 'Konfiguration', 'Dateien im Projekt', 2)}
      {band(244, 'libs', 'Image', 'gebacken, reist mit', 4)}
      {band(366, 'container', 'Container', 'weg nach down', 6)}
      <g className="sa" data-k="mute" style={at(0)}><path d="M784 8 V 454" strokeDasharray="4 6" /></g>

      <Box i={1} x={col[0]} y={19} w={W} h={58} label=".env" sub="DB_PASSWORD=geheim" />
      <Box i={1} x={col[1]} y={19} w={W} h={58} label="Shell" sub="export DB_PASSWORD=…" />
      <Label i={1} x={col[2] + 4} y={44} anchor="start" size={13} tone="muted">Shell gewinnt gegen .env.</Label>
      <Label i={1} x={col[2] + 4} y={62} anchor="start" size={13} tone="muted">.env selbst bleibt hier.</Label>
      <Who i={1} y={0} a="nur du" b="auf deinem Rechner" />

      <Box i={3} x={col[0]} y={141} w={col[1] + W - col[0]} h={58} t="libs" label="environment:" sub="MYSQL_ROOT_PASSWORD: ${DB_PASSWORD}" />
      <Box i={3} x={col[2]} y={141} w={W} h={58} t="libs" label="Dockerfile" sub="zwei ENV-Zeilen" size={15} />
      <Arrow i={3} d={`M${mid(0)} 78 V 137`} />
      <Arrow i={3} d={`M${mid(1)} 78 V 137`} label="setzt den Wert ein" lx={mid(1) + 10} ly={112} anchor="start" />
      <Who i={3} y={122} a="im Git" b="nur ${…}, aber ENV offen" />

      <Box i={5} x={col[1]} y={263} w={W} h={58} label="ENV APP_ENV=prod" sub="harmlos" size={15} />
      <Box i={5} x={col[2]} y={263} w={W} h={58} t="bad" label="ENV DB_PASSWORD" sub="Geheimnis im Image ✗" size={15} />
      <Arrow i={5} d={`M${mid(2)} 200 V 231 H ${mid(1)} V 259`} />
      <Arrow i={5} d={`M${mid(2)} 200 V 259`} />
      <Label i={5} x={mid(0) + 10} y={288} anchor="start" size={13} weight={600}>am Image</Label>
      <Label i={5} x={mid(0) + 10} y={304} anchor="start" size={13} weight={600}>vorbei</Label>
      <Who i={5} y={244} tone="bad" a="jeder mit dem Image" b="Registry, image inspect" />

      <Box i={7} x={col[0]} y={385} w={W} h={58} t="ok" label="MYSQL_ROOT_PASSWORD" sub="aus environment" size={13} />
      <Box i={7} x={col[1]} y={385} w={W} h={58} t="libs" label="APP_ENV=prod" sub="vom Image geerbt" size={15} />
      <Box i={7} x={col[2]} y={385} w={W} h={58} t="bad" label="DB_PASSWORD" sub="vom Image geerbt" size={15} />
      <Arrow i={7} d={`M${mid(0)} 200 V 381`} />
      <Arrow i={7} d={`M${mid(1)} 322 V 381`} />
      <Arrow i={7} d={`M${mid(2)} 322 V 381`} />
      <Who i={7} y={366} tone="ok" a="nur dieser Host" b="solange er läuft" />
    </Svg>
    <p className="cause" style={at(8)}><b>{t('Warum sicherer?')}</b> {t('Ein Wert aus')} <code>environment</code> {t('lebt nur im laufenden Container auf diesem Rechner. Ein')} <code>ENV</code> {t('steckt im Image und reist mit jeder Kopie in die Registry.')}</p>
  </div>
)

/* ── 9 · volumes: where the data lives, and what Compose creates and deletes ── */
type Cell = [0 | 1 | null, string]
const vol: { code: string; sub: string; up: Cell; down: Cell; downV: Cell }[] = [
  { code: 'dbdata:/var/lib/mysql', sub: 'benanntes Volume, oben deklariert', up: [1, 'legt an'], down: [1, 'bleibt'], downV: [0, 'gelöscht'] },
  { code: './data:/var/lib/mysql', sub: 'Bind-Mount: Ordner im Projekt', up: [1, 'Ordner, falls er fehlt'], down: [1, 'bleibt'], downV: [1, 'bleibt'] },
  { code: 'dbdata + external: true', sub: 'vorher von Hand angelegt', up: [0, 'Fehler, wenn es fehlt'], down: [1, 'bleibt'], downV: [1, 'bleibt'] },
  { code: 'dbdata:/var/lib/mysql', sub: 'aber oben nicht deklariert', up: [0, 'Fehler: undefined volume'], down: [null, ''], downV: [null, ''] },
  { code: 'kein Eintrag', sub: 'Daten in der Schreibschicht', up: [null, 'nichts'], down: [0, 'weg*'], downV: [0, 'weg'] },
]
const mk = ([v, s]: Cell) => v === null ? <small>{s ? t(s) : '–'}</small> : <><span className="mk" data-m={v ? 'ok' : 'bad'}>{v ? '✓' : '✗'}</span><small>{t(s)}</small></>
export const Volumes = () => (
  <div className="c1-vol">
    <Svg w={520} h={470} label="Container mit Schreibschicht, Volume im Host-Dateisystem">
      <Box x={10} y={412} w={500} h={48} t="hw" label="Hardware · Festplatte" />
      <Box i={1} x={10} y={356} w={500} h={48} t="kernel" label="Host-Kernel · Linux" />
      <Box i={2} x={10} y={300} w={276} h={48} t="engine" label="Container Engine" />
      <g className="sb" data-t="host" style={at(2)}><rect x={300} y={56} width={210} height={292} rx={14} /></g>
      <Label i={2} x={405} y={80} size={14} weight={700}>Host-Dateisystem</Label>
      <Box i={3} x={314} y={130} w={182} h={64} t="reg" label="Volume dbdata" sub="/var/lib/docker/volumes" size={15} />
      <Box i={3} x={314} y={218} w={182} h={64} t="reg" label="Ordner ./data" sub="Bind-Mount im Projekt" size={15} />
      <Label i={3} x={405} y={318} size={13} tone="muted">gehört dem Host</Label>

      <Ctr i={4} x={10} y={56} w={276} h={236} name="Container db" />
      <Box i={4} x={24} y={90} w={248} h={44} label="MySQL" sub="schreibt nach /var/lib/mysql" size={15} />
      <Box i={4} x={24} y={140} w={248} h={44} t="reg" label="/var/lib/mysql" sub="Mount: zeigt nach draußen" size={15} />
      <Box i={4} x={24} y={190} w={248} h={44} t="host" label="Schreibschicht" sub="alle übrigen Änderungen" size={15} />
      <Box i={4} x={24} y={240} w={248} h={44} t="libs" label="Image-Schichten" sub="mysql:8 · nur lesen" size={15} />
      <Arrow i={5} d="M274 162 H310" />
      <Label i={6} x={148} y={44} size={14} weight={700} tone="bad">✗ weg bei down</Label>
      <Label i={6} x={405} y={44} size={14} weight={700} tone="ok">✓ bleibt bei down</Label>
    </Svg>
    <div className="c1-col">
      <table className="tbl vol-tbl" style={at(7)}>
        <thead><tr><th scope="col">{t('Eintrag unter volumes')}</th><th scope="col">up</th><th scope="col">down</th><th scope="col">down -v</th></tr></thead>
        <tbody>{vol.map((r, k) => (
          <tr key={k} style={at(8 + k)}><th scope="row"><code>{t(r.code)}</code><small>{t(r.sub)}</small></th><td>{mk(r.up)}</td><td>{mk(r.down)}</td><td>{mk(r.downV)}</td></tr>
        ))}</tbody>
      </table>
      <p className="legend" style={at(13)}>{t('* Images wie mysql legen dann ein anonymes Volume an: Es bleibt liegen, der neue Container findet es aber nicht wieder.')}</p>
    </div>
  </div>
)

/* ── 10 · start order: the same start, twice, on one time axis ── */
const T0 = 210, READY = 600, X1 = 980
const Bar = ({ x, w, y, t, label, i }: { x: number; w: number; y: number; t: 'host' | 'ok' | 'app'; label: string; i: number }) => (
  <Box i={i} x={x} y={y} w={w} h={34} t={t} label={label} size={14} />
)
const Lane = ({ y, name, i }: { y: number; name: string; i: number }) => <Label i={i} x={190} y={y + 22} anchor="end" size={15} weight={700}>{name}</Label>
const Tick = ({ x, y, ok, bad, i }: { x: number; y: number; ok?: boolean; bad?: boolean; i: number }) => (
  <g className="sl tick" data-ok={ok || undefined} data-bad={bad || undefined} style={at(i)}><circle cx={x} cy={y} r={11} /><text x={x} y={y + 5} textAnchor="middle">{ok ? '✓' : '✗'}</text></g>
)
const dbLane = (y: number, i: number) => <>
  <Lane y={y} name="db" i={i} />
  <Bar i={i} x={T0} w={READY - T0} y={y} t="host" label="gestartet, richtet die Datenbank ein …" />
  <Bar i={i} x={READY} w={X1 - READY} y={y} t="ok" label="bereit" />
</>
export const StartOrder = () => (
  <div className="c1-order">
    <Svg w={1000} h={364} label="Zeitstrahl: nur depends_on gegen depends_on mit healthcheck">
      <Label x={0} y={20} anchor="start" size={16} weight={700}>Nur depends_on</Label>
      <Label x={0} y={38} anchor="start" size={13} tone="muted">wartet auf „gestartet“</Label>
      {dbLane(50, 0)}
      <Lane y={92} name="web" i={1} />
      <Bar i={1} x={T0 + 30} w={150} y={92} t="app" label="startet, verbindet" />
      <Tick i={2} bad x={T0 + 196} y={109} />
      <Label i={2} x={T0 + 216} y={114} anchor="start" size={14} weight={700} tone="bad">Verbindung abgelehnt</Label>

      <Label i={3} x={0} y={178} anchor="start" size={16} weight={700}>Mit healthcheck</Label>
      <Label i={3} x={0} y={196} anchor="start" size={13} tone="muted">wartet auf „gesund“</Label>
      {dbLane(208, 3)}
      <Lane y={250} name="healthcheck" i={4} />
      {[0, 1, 2].map(k => <Tick key={k} i={4} x={300 + k * 120} y={267} />)}
      <Tick i={5} ok x={660} y={267} />
      <Label i={5} x={676} y={272} anchor="start" size={13} weight={700} tone="ok">healthy</Label>
      <Lane y={292} name="web" i={6} />
      <Wire i={6} k="back" d={`M${T0 + 30} 309 H654`} />
      <Label i={6} x={430} y={302} size={13} weight={600} tone="blue">wartet</Label>
      <Bar i={6} x={660} w={X1 - 660} y={292} t="ok" label="startet, verbindet ✓" />

      <g className="sa" data-k="mute" style={at(7)}><path d={`M${READY} 44 V 336`} strokeDasharray="5 5" /></g>
      <Label i={7} x={READY} y={30} size={13} weight={700}>db wirklich bereit</Label>
      <Arrow i={7} kind="mute" d={`M${T0} 352 H${X1}`} label="Zeit" lx={T0 - 12} ly={357} anchor="end" />
    </Svg>
    <Code kind="file" title="compose.yaml" d={9} lines={[
      '  db:',
      { t: '    healthcheck:', chip: 'Wann ist db „bereit“?' },
      { t: '      test: mysqladmin ping -h localhost', chip: 'Befehl im Container: Erfolg = gesund' },
      { t: '      interval: 5s', chip: 'alle 5 Sekunden prüfen' },
      '  web:',
      '    depends_on:',
      { t: '      db: { condition: service_healthy }', chip: 'warten, bis „gesund“' },
    ]} />
  </div>
)

/* ── 11 · everyday commands, in the order of a working day ── */
type Cmd = { c: string; note: string; dim?: boolean; bad?: boolean }
const days: { title: string; cmds: Cmd[] }[] = [
  { title: 'Starten', cmds: [
    { c: 'up -d', note: 'alles im Hintergrund starten' },
    { c: 'up', note: 'im Vordergrund, Logs laufen mit' },
    { c: 'up -d --build', note: 'Images vorher neu bauen' },
    { c: 'up -d web', note: 'nur web (und was es braucht)' },
    { c: 'pull', note: 'neue Image-Versionen holen', dim: true },
  ] },
  { title: 'Ansehen', cmds: [
    { c: 'ps', note: 'laufende Services, Ports, Status' },
    { c: 'ps -a', note: 'auch beendete Container' },
    { c: 'config', note: 'fertige Datei, Variablen eingesetzt' },
    { c: 'ls', note: 'alle Compose-Projekte', dim: true },
    { c: 'top', note: 'Prozesse in den Containern', dim: true },
  ] },
  { title: 'Logs', cmds: [
    { c: 'logs', note: 'alle Services gemischt' },
    { c: 'logs web', note: 'nur ein Service' },
    { c: 'logs -f web', note: 'live verfolgen (Strg+C beendet)' },
    { c: 'logs --tail 50 web', note: 'nur die letzten 50 Zeilen' },
    { c: 'logs -t --since 10m db', note: 'mit Zeit, letzte 10 Minuten', dim: true },
  ] },
  { title: 'Hineinschauen', cmds: [
    { c: 'exec db sh', note: 'Shell im laufenden Container' },
    { c: 'exec db mysql -p', note: 'Befehl direkt im Container' },
    { c: 'run --rm web sh', note: 'neuer Wegwerf-Container', dim: true },
    { c: 'port web 80', note: 'welcher Host-Port gehört dazu?', dim: true },
  ] },
  { title: 'Anhalten', cmds: [
    { c: 'stop', note: 'anhalten, Container bleiben' },
    { c: 'start', note: 'angehaltene wieder starten' },
    { c: 'restart web', note: 'einen Service neu starten' },
  ] },
  { title: 'Aufräumen', cmds: [
    { c: 'down', note: 'Container und Netz löschen' },
    { c: 'down -v', note: 'auch Volumes: Daten weg!', bad: true },
    { c: 'down --rmi local', note: 'auch selbst gebaute Images', dim: true },
  ] },
]
export const Everyday = () => (
  <div className="c1-days">
    <div className="days">
      {days.map((g, k) => (
        <section className="day" key={g.title} style={at(k)}>
          <h3><span>{k + 1}</span>{t(g.title)}</h3>
          <ul>{g.cmds.map(c => (
            <li key={c.c} data-dim={c.dim || undefined} data-bad={c.bad || undefined}><code><i>docker compose</i> {c.c}</code><small>{t(c.note)}</small></li>
          ))}</ul>
        </section>
      ))}
    </div>
    <p className="cause" style={at(6)}><b>{t('Alt')}</b><code>docker-compose</code> {t('mit Bindestrich ist Version 1 und seit 2023 eingestellt. Heute heißt es')} <code>docker compose</code>.</p>
  </div>
)

/* ── 12 · several files: how Compose merges them, then which files make which environment ── */
const base: Line[] = ['services:', '  web:', '    image: shop:1.0', '    ports: ["8080:80"]', '    environment:', '      DEBUG: "0"']
const over: Line[] = ['services:', '  web:', '    build: .', '    volumes: ["./src:/app"]', '    environment:', '      DEBUG: "1"']
const merged: Line[] = [
  'services:', '  web:',
  { t: '    image: shop:1.0', mark: 'a', chip: '1' },
  { t: '    build: .', mark: 'b', chip: '2' },
  { t: '    ports: ["8080:80"]', mark: 'a', chip: '1' },
  { t: '    volumes: ["./src:/app"]', mark: 'b', chip: '2' },
  '    environment:',
  { t: '      DEBUG: "0"', mark: 'x', chip: '1' },
  { t: '      DEBUG: "1"', mark: 'b', chip: '2 gewinnt' },
]
const files: [string, string, boolean][] = [
  ['compose.yaml', '1 · immer', true], ['compose.override.yaml', '2 · automatisch', true], ['compose.prod.yaml', 'nur mit -f', false], ['.env', 'Werte für ${…}', false],
]
export const Merge = () => (
  <div className="c1-merge">
    <div className="mrg">
      <div className="tree" style={at(0)}>
        <div className="tree-root"><IconSvg name="folder" size={30} /><b>shop/</b></div>
        <ul>{files.map(([f, s, on]) => <li key={f} data-on={on || undefined}><code>{f}</code><small>{t(s)}</small></li>)}</ul>
        <small className="tree-cmd"><code>docker compose up</code> {t('liest 1 und 2 von selbst')}</small>
      </div>
      <Code kind="file" title="compose.yaml" lines={base} i={1} />
      <span className="op" style={at(2)}>+</span>
      <Code kind="file" title="compose.override.yaml" lines={over} i={2} />
      <span className="op" style={at(3)}>=</span>
      <Code kind="file" title="Ergebnis: compose config" lines={merged} i={3} />
    </div>
    <div className="rules" style={at(5)}>
      <span><b>{t('Gleicher Name')}</b> {t('wird zusammengeführt: beide Dateien meinen denselben Service web.')}</span>
      <span><b>{t('Einzelwert')}</b> {t('wie DEBUG: Die spätere Datei gewinnt.')}</span>
      <span><b>{t('Neue Schlüssel')}</b> {t('wie build und volumes kommen dazu.')}</span>
    </div>
    <Visuals d={7} v={{ kind: 'stack', columns: [
      { title: 'Entwicklung · docker compose up', layers: [
        { label: 'compose.yaml', tone: 'navy', note: 'Basis' }, { label: 'compose.override.yaml', tone: 'blue', note: 'wird automatisch gelesen' },
        { label: '.env', tone: 'sky', note: 'Dev-Werte' }, { label: 'Ergebnis: Dev-Umgebung' },
      ] },
      { title: 'Produktion · up -f compose.yaml -f compose.prod.yaml', layers: [
        { label: 'compose.yaml', tone: 'navy', note: 'Basis' }, { label: 'compose.prod.yaml', tone: 'blue', note: 'mit -f angegeben' },
        { label: '.env', tone: 'sky', note: 'Prod-Werte, nicht im Git' }, { label: 'Ergebnis: Prod-Umgebung' },
      ] },
    ] }} />
  </div>
)

/* ── 13 · pitfalls ── */
export const Pitfalls = () => (
  <div className="c1-trap">
    <Visuals v={{ kind: 'table', head: ['Fehlerbild', 'Ursache', 'Lösung'], rows: [
      ['„port is already allocated“', 'Der Host-Port ist schon belegt', 'Linken Port ändern: `"8081:80"`'],
      ['Datenbank nach Neustart leer', '`down -v` löscht Volumes, oder es gab gar keins', 'Benanntes Volume, ohne `-v` aufräumen'],
      ['web: „Connection refused“', '„gestartet“ ist nicht „bereit“', '`healthcheck` und `service_healthy`'],
      ['DB unter `localhost` nicht erreichbar', '`localhost` ist der Container selbst', 'Service-Namen nutzen: `db:3306`'],
      ['Variable aus `.env` fehlt im Container', '`.env` füllt nur `${…}` in der Datei', 'Unter `environment:` oder `env_file:` eintragen'],
      ['Änderung wirkt nicht', 'Container laufen mit alter Konfiguration oder altem Image', '`up -d` erneut, bei Code-Änderung `up -d --build`'],
      ['Ordner im Container plötzlich leer', 'Ein Bind-Mount überdeckt die Dateien aus dem Image', 'Anderen Zielordner wählen oder nur einen Unterordner mounten'],
      ['„yaml: … cannot start any token“', 'Tabulator oder falsche Einrückung', 'Nur Leerzeichen, `docker compose config` prüft die Datei'],
      ['„docker-compose: command not found“', 'Alte Version 1 mit Bindestrich', '`docker compose` mit Leerzeichen'],
    ] }} />
  </div>
)

/* ── 14 · summary: each part of the file becomes a part of the running system ── */
const fileSum: Line[] = [
  'services:',
  { t: '  web:', n: 1 },
  '    image: wordpress:6',
  { t: '    ports: ["8080:80"]', n: 2 },
  '    environment:',
  { t: '      WORDPRESS_DB_HOST: db', n: 4 },
  { t: '    depends_on:', n: 6 },
  '      db: { condition: service_healthy }',
  { t: '  db:', n: 1 },
  '    image: mysql:8',
  '    environment:',
  { t: '      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD}', n: 3 },
  { t: '    volumes: ["dbdata:/var/lib/mysql"]', n: 5 },
  { t: '    healthcheck: { … }', n: 6 },
  'volumes:',
  '  dbdata: { driver: local }',
]
export const Summary = () => (
  <div className="c1-sum">
    <Code kind="file" title="compose.yaml" lines={fileSum} />
    <div className="c1-go" style={at(3)}><span><code>docker compose</code><code>up -d</code></span><i /></div>
    <Svg w={560} h={470} label="Das laufende Projekt shop: Port, Netz, zwei Container, Volume und .env">
      <g className="sb" data-t="host" style={at(4)}><rect x={30} y={10} width={520} height={450} rx={20} /></g>
      <Label i={4} x={50} y={36} anchor="start" size={15} weight={700}>Host-Rechner · Projekt shop</Label>
      <Box i={5} x={6} y={112} w={60} h={46} t="engine" label="8080" size={15} />
      <Num i={5} n={2} x={36} y={100} />
      <g className="sb" data-t="libs" style={at(5)}><rect x={84} y={60} width={446} height={190} rx={16} strokeDasharray="6 5" /></g>
      <Label i={5} x={100} y={84} anchor="start" size={13} weight={700}>Netz shop_default</Label>
      <Num i={5} n={4} x={240} y={79} />

      <Box i={6} x={104} y={104} w={150} h={70} t="container" label="web" sub="wordpress:6" />
      <Box i={6} x={344} y={104} w={166} h={70} t="container" label="db" sub="mysql:8 · healthy" />
      <Num i={6} n={1} x={254} y={104} /><Num i={6} n={1} x={510} y={104} />
      <Arrow i={6} d="M68 135 H100" />
      <Arrow i={7} d="M256 139 H340" label="db:3306" lx={298} ly={128} />
      <Num i={7} n={6} x={116} y={201} />
      <Label i={7} x={134} y={206} anchor="start" size={13} tone="muted">web startet erst, wenn db healthy</Label>

      <Box i={8} x={334} y={290} w={176} h={62} t="reg" label="Volume dbdata" sub="überlebt down" />
      <Arrow i={8} d="M422 176 V 286" />
      <Num i={8} n={5} x={510} y={290} />
      <Box i={9} x={104} y={290} w={150} h={62} label=".env" sub="DB_PASSWORD=…" />
      <Arrow i={9} kind="back" d="M256 310 C 300 300, 340 240, 370 178" label="setzt ${…} ein" lx={300} ly={270} anchor="end" />
      <Num i={9} n={3} x={254} y={290} />
      <Box i={10} x={50} y={392} w={480} h={50} t="engine" label="Container Engine" sub="führt aus, was in compose.yaml steht" />
    </Svg>
  </div>
)
