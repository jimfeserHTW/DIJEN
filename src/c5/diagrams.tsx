import { at, css } from '../components/Stack.tsx'
import { Svg, Box, Arrow, Label, Zone, Wire, Num, Tick, Take, type BoxTone } from '../components/Svg.tsx'
import { Code, type Line } from '../components/Code.tsx'

// Chapter 5 diagrams: Compose for large projects and its internals. Same project "shop" as chapters 1 and 3.

/* ═══ Konfiguration ═══ */

/* One concrete line, image: shop:…, and what each placeholder makes of it. */
const states = ['TAG=1.5', 'TAG=', 'TAG fehlt']
const bad = 'shop: (ungültig)'
const forms: [string, [string, BoxTone][]][] = [
  ['shop:${TAG}', [['shop:1.5', 'ok'], [bad, 'reg'], [bad + ' !', 'reg']]],
  ['shop:${TAG:-latest}', [['shop:1.5', 'ok'], ['shop:latest', 'libs'], ['shop:latest', 'libs']]],
  ['shop:${TAG-latest}', [['shop:1.5', 'ok'], [bad, 'reg'], ['shop:latest', 'libs']]],
  ['shop:${TAG:?fehlt}', [['shop:1.5', 'ok'], ['Abbruch', 'bad'], ['Abbruch', 'bad']]],
  ['shop:${TAG?fehlt}', [['shop:1.5', 'ok'], [bad, 'reg'], ['Abbruch', 'bad']]],
  ['shop:${TAG:+neu}', [['shop:neu', 'libs'], [bad, 'reg'], [bad, 'reg']]],
]
export const Interp = () => (
  <div className="dg-col">
    <Svg w={1000} h={380} label="Ergebnis jeder Platzhalter-Schreibweise für gesetzte, leere und fehlende Variablen">
      <Label x={0} y={22} anchor="start" size={15} weight={700} mono>image:</Label>
      {states.map((s, k) => <Label key={s} x={425 + k * 225} y={22} size={15} weight={700} mono>{s}</Label>)}
      {forms.map(([f, c], r) => (
        <g key={f}>
          <Box i={r} x={0} y={38 + r * 56} w={290} h={46} t="kchip" label={f} size={15} mono />
          {c.map(([l, t], k) => <Box key={k} i={r} x={325 + k * 225} y={38 + r * 56} w={200} h={46} t={t} label={l} size={14} mono />)}
        </g>
      ))}
    </Svg>
    <Take i={6} label="Regel" text="Mit Doppelpunkt zählt eine leere Variable wie eine fehlende. Das `!` steht für eine zusätzliche Warnung." />
  </div>
)


/* Merge rules on one real file pair: blue comes from file 1, yellow from file 2. */
const mergeA: Line[] = ['services:', '  web:', '    image: shop:1', '    environment:', '      A: "1"', '      B: "1"', '    ports: ["80:80"]', '    volumes: ["./src:/app"]', '    dns: [1.1.1.1]']
const mergeB: Line[] = ['services:', '  web:', '    image: shop:2', '    environment:', '      B: "2"', '      C: "3"', '    ports: ["443:443"]', '    volumes: !reset []', '    dns: !override [8.8.8.8]']
const mergeR: Line[] = [
  'services:', '  web:',
  { t: '    image: shop:2', mark: 'b', chip: 'ersetzt' },
  '    environment:',
  { t: '      A: "1"', mark: 'a', chip: 'bleibt' },
  { t: '      B: "2"', mark: 'b', chip: 'ersetzt' },
  { t: '      C: "3"', mark: 'b', chip: 'neu' },
  '    ports:',
  { t: '      - "80:80"', mark: 'a' },
  { t: '      - "443:443"', mark: 'b', chip: 'angehängt' },
  { t: '    volumes: []', mark: 'b', chip: 'geleert' },
  { t: '    dns: [8.8.8.8]', mark: 'b', chip: 'ersetzt' },
]
export const MergeRules = () => (
  <div className="dg-col">
    <div className="dg-merge">
      <Code kind="file" title="compose.yaml" lines={mergeA} />
      <span className="dg-op" style={at(1)}>+</span>
      <Code kind="file" title="compose.override.yaml" lines={mergeB} i={1} />
      <span className="dg-op" style={at(2)}>=</span>
      <Code kind="file" title="docker compose config" lines={mergeR} i={2} />
    </div>
    <Take i={4} label="Regel" text="Einzelwerte ersetzt die spätere Datei, Schlüssel werden gemischt, Listen angehängt. Mit `!reset` und `!override` änderst du das gezielt." />
  </div>
)


/* Three ways to combine files, drawn as what they do to the project. */
export const FileWays = () => (
  <Svg w={1000} h={430} label="Drei Wege, Compose-Dateien zu verbinden: -f, extends und include">
    <Zone x={0} y={0} w={310} h={430} t="app" label="-f: übereinanderlegen" />
    <Box i={0} x={20} y={44} w={250} h={54} t="libs" label="compose.yaml" size={14} mono />
    <Box i={1} x={40} y={106} w={250} h={54} t="reg" label="compose.prod.yaml" size={14} mono />
    <Arrow i={2} d="M155 162 V222" label="mischen" lx={167} ly={198} anchor="start" />
    <Box i={2} x={20} y={226} w={270} h={70} t="container" label="ein Service web" sub="mit Werten aus beiden" size={15} />
    <Label i={2} x={155} y={350} size={13} mono>up -f a.yaml -f b.yaml</Label>
    <Label i={2} x={155} y={376} size={13} tone="muted">für Umgebungen: dev, prod</Label>

    <Zone i={3} x={345} y={0} w={310} h={430} t="app" label="extends: erben" />
    <Box i={3} x={365} y={44} w={270} h={72} t="libs" label="base-web" sub="in common.yaml" size={15} />
    <Arrow i={4} d="M430 118 V222" /><Arrow i={4} d="M570 118 V222" /><Label i={4} x={500} y={172} size={13} weight={600}>erben</Label>
    <Box i={4} x={365} y={226} w={128} h={70} t="container" label="web" sub="+ eigene Ports" size={14} />
    <Box i={4} x={507} y={226} w={128} h={70} t="container" label="worker" sub="+ command" size={14} />
    <Label i={4} x={500} y={350} size={13} mono>extends: {'{ file, service }'}</Label>
    <Label i={4} x={500} y={376} size={13} tone="muted">für gleiche Services</Label>

    <Zone i={5} x={690} y={0} w={310} h={430} t="app" label="include: einbinden" />
    <Zone i={5} x={710} y={44} w={270} h={120} t="reg" label="infra/compose.yaml" />
    <Box i={5} x={724} y={84} w={116} h={60} label="db" sub="eigene Pfade" size={14} /><Box i={5} x={850} y={84} w={116} h={60} label="cache" size={14} />
    <Arrow i={6} d="M845 166 V222" label="kommt dazu" lx={857} ly={198} anchor="start" />
    <Zone i={6} x={710} y={226} w={270} h={92} t="container" label="dein Projekt" />
    <Box i={6} x={724} y={258} w={76} h={48} label="web" size={13} /><Box i={6} x={806} y={258} w={76} h={48} t="reg" label="db" size={13} /><Box i={6} x={888} y={258} w={78} h={48} t="reg" label="cache" size={13} />
    <Label i={6} x={845} y={350} size={13} mono>include: [infra/compose.yaml]</Label>
    <Label i={6} x={845} y={376} size={13} tone="muted">für fertige Teilprojekte</Label>
  </Svg>
)

/* YAML anchors: the block is written once and appears twice. */
const anchorFile: Line[] = [
  { t: 'x-common: &common', chip: 'Vorlage, von Compose ignoriert', mark: 'a' },
  { t: '  restart: unless-stopped', mark: 'a' },
  { t: '  logging: { driver: local }', mark: 'a' },
  'services:', '  web:',
  { t: '    <<: *common', chip: 'hier einfügen', mark: 'b' },
  '    image: wordpress:6', '  db:',
  { t: '    <<: *common', chip: 'hier einfügen', mark: 'b' },
  '    image: mysql:8',
]
const anchorResult: Line[] = [
  'services:', '  web:', '    image: wordpress:6',
  { t: '    restart: unless-stopped', mark: 'a' }, { t: '    logging: { driver: local }', mark: 'a' },
  '  db:', '    image: mysql:8',
  { t: '    restart: unless-stopped', mark: 'a' }, { t: '    logging: { driver: local }', mark: 'a' },
]
export const Anchors = () => (
  <div className="dg-col">
    <div className="duo" style={css({ alignItems: 'start' })}>
      <Code kind="file" title="compose.yaml" lines={anchorFile} />
      <Code kind="file" title="Ergebnis: docker compose config" lines={anchorResult} i={2} />
    </div>
    <Take i={5} label="Prüfen" text="`docker compose config` zeigt immer die fertige Datei, nach Ankern, Merge und Variablen." />
  </div>
)

/* ═══ Interna ═══ */

/* Compose keeps no database: the state is written on the objects themselves. */
const proj = (name: string, y: number, i: number, sep: string) => (
  <g>
    <Zone i={i} x={14} y={y} w={612} h={122} t="app" label={`Projekt ${name}`} />
    {([[`${name}-web-1`, 'Container', 'container'], [`${name}-db-1`, 'Container', 'container'], [`${name}${sep}default`, 'Netz', 'kchip'], [`${name}${sep}dbdata`, 'Volume', 'reg']] as const).map(([l, s, t], k) => (
      <Box key={l} i={i} x={28 + k * 148} y={y + 40} w={140} h={66} t={t} label={l} sub={s} size={13} mono />
    ))}
  </g>
)
export const ProjectLabels = () => (
  <div className="dg-col">
    <Svg w={1000} h={420} label="Zwei Projekte auf einem Host, getrennt über Namen und Etiketten">
      <Zone x={0} y={0} w={640} h={420} label="Docker Host · dieselbe Datei, zweimal gestartet" />
      {proj('shop', 36, 1, '_')}{proj('test', 170, 2, '_')}
      <Box i={3} x={14} y={320} w={270} h={56} t="hw" label="docker compose ps" size={14} mono />
      <Label i={3} x={300} y={344} anchor="start" size={14} weight={600}>fragt dockerd nach allen Containern</Label>
      <Label i={3} x={300} y={364} anchor="start" size={13} tone="muted">mit dem Etikett project=shop</Label>
      <Zone i={4} x={670} y={0} w={330} h={176} t="reg" label="Etiketten an shop-web-1" />
      {['project=shop', 'service=web', 'container-number=1', 'config-hash=a1b2…'].map((l, k) => <Label key={l} i={4} x={688} y={58 + k * 27} anchor="start" size={14} mono weight={600}>{l}</Label>)}
      <Arrow i={4} kind="mute" d="M628 96 H666" />
      <Label i={4} x={688} y={162} anchor="start" size={12} tone="muted">alle mit Präfix com.docker.compose.</Label>
      <Zone i={5} x={670} y={190} w={330} h={230} t="app" label="Woher der Name kommt" sub="stärkste oben" />
      {([['-p shop', 'engine'], ['COMPOSE_PROJECT_NAME', 'kchip'], ['name: shop', 'libs'], ['Ordner shop/', 'host']] as const).map(([l, t], k) => <Box key={l} i={6 + k} x={686} y={226 + k * 46} w={298} h={40} t={t} label={l} size={14} mono />)}
    </Svg>
    <Take i={10} label="Kern" text="Compose hat keine eigene Datenbank. Was zu einem Projekt gehört, steht als Etikett an den Objekten. Mit `-p test` läuft dieselbe Datei getrennt daneben." />
  </div>
)

/* What `up` compares, service by service. */
const rec: { n: string; want: string; have: string; eq: boolean; res: string; t: BoxTone }[] = [
  { n: 'db', want: 'Hash a1b2 · Image 7f3', have: 'Hash a1b2 · Image 7f3', eq: true, res: 'bleibt, läuft weiter', t: 'ok' },
  { n: 'web', want: 'Hash c3d4 · Image 2e9', have: 'Hash 9f00 · Image 2e9', eq: false, res: 'Konfiguration neu: ersetzen', t: 'reg' },
  { n: 'proxy', want: 'Hash 5a6b · Image d41', have: 'Hash 5a6b · Image 0c8', eq: false, res: 'Image neu: ersetzen', t: 'reg' },
]
export const Recreate = () => (
  <div className="dg-col">
    <Svg w={1000} h={410} label="docker compose up vergleicht Soll und Ist und ersetzt nur geänderte Container">
      <Label x={250} y={20} size={14} weight={700}>Soll: aus den Dateien</Label><Label x={560} y={20} size={14} weight={700}>Ist: Etikett am Container</Label><Label x={850} y={20} size={14} weight={700}>Was up tut</Label>
      {rec.map((r, k) => {
        const y = 36 + k * 68
        return (
          <g key={r.n}>
            <Label i={k * 2} x={0} y={y + 32} anchor="start" size={16} weight={700}>{r.n}</Label>
            <Box i={k * 2} x={100} y={y} w={300} h={54} t="libs" label={r.want} size={13} mono />
            <Label i={k * 2} x={405} y={y + 34} size={20} weight={700} tone={r.eq ? 'ok' : 'bad'}>{r.eq ? '=' : '≠'}</Label>
            <Box i={k * 2} x={415} y={y} w={300} h={54} t="host" label={r.have} size={13} mono />
            <Arrow i={k * 2 + 1} d={`M717 ${y + 27} H741`} />
            <Box i={k * 2 + 1} x={745} y={y} w={255} h={54} t={r.t} label={r.res} size={14} />
          </g>
        )
      })}
      <Zone i={6} x={0} y={254} w={1000} h={156} t="app" label="Ersetzen heißt" />
      <Box i={7} x={30} y={294} w={200} h={64} t="gone" label="alter Container" sub="gestoppt, gelöscht" size={15} />
      <Arrow i={8} d="M232 326 H306" />
      <Box i={8} x={310} y={294} w={200} h={64} t="container" label="neuer Container" sub="gleicher Name" size={15} />
      <Box i={9} x={700} y={294} w={270} h={64} t="reg" label="Volume dbdata" sub="bleibt angeschlossen" size={15} />
      <Arrow i={9} kind="ok" both d="M512 326 H696" label="übernimmt" lx={604} ly={314} />
      <Label i={9} x={500} y={392} size={13} tone="muted">Alles in der Schreibschicht geht dabei verloren, Volumes nicht.</Label>
    </Svg>
  </div>
)

/* ═══ Netz und Skalierung ═══ */

/* What Compose networks really are: one bridge each, a DNS in the engine, a rule between them. */
export const NetKernel = () => (
  <div className="dg-col">
    <Svg w={1000} h={470} label="Compose-Netze im Host: je Netz eine Bridge, eingebauter DNS, Trennung und Weg nach außen">
      <Zone x={0} y={0} w={1000} h={470} label="Host-Rechner" />
      <Box i={1} x={60} y={40} w={200} h={72} t="container" label="proxy" sub="ein Netz" />
      <Box i={1} x={340} y={40} w={200} h={72} t="container" label="web" sub="zwei Netze" />
      <Box i={1} x={640} y={40} w={200} h={72} t="container" label="db" sub="ein Netz" />
      <g className="sb" data-t="kchip" style={at(2)}><rect x={20} y={166} width={390} height={28} rx={14} /><text x={36} y={185} fontSize={13} fontWeight={700}>Bridge frontend · 172.18.0.0/16</text></g>
      <g className="sb" data-t="kchip" style={at(2)}><rect x={490} y={166} width={390} height={28} rx={14} /><text x={560} y={185} fontSize={13} fontWeight={700}>Bridge backend · 172.19.0.0/16</text></g>
      <Wire i={2} d="M160 114 V164" /><Wire i={2} d="M375 114 V164" /><Wire i={2} d="M515 114 V164" /><Wire i={2} d="M740 114 V164" />
      <Tick i={3} bad x={428} y={180} /><Label i={3} x={428} y={156} size={12} weight={700} tone="bad">getrennt</Label>
      <Arrow i={4} d="M100 196 V226" />
      <Box i={4} x={40} y={230} w={120} h={46} t="engine" label="NAT" size={15} />
      <Arrow i={4} d="M162 253 H196" />
      <Box i={4} x={200} y={230} w={90} h={46} t="hw" label="eth0" size={15} />
      <Arrow i={4} d="M292 253 H326" />
      <Box i={4} x={330} y={230} w={100} h={46} t="reg" label="Internet" size={14} />
      <Tick i={5} bad x={640} y={232} /><Label i={5} x={658} y={229} anchor="start" size={13} weight={700} tone="bad">internal: true</Label><Label i={5} x={658} y={247} anchor="start" size={13} tone="bad">kein Weg nach außen</Label>
      <Zone i={6} x={20} y={300} w={960} h={154} t="engine" label="Docker Engine · eingebauter DNS unter 127.0.0.11" />
      {([['proxy', '172.18.0.2', 'app'], ['web', '172.18.0.3 · 172.19.0.2', 'app'], ['db', '172.19.0.3', 'ok']] as const).map(([n, ip, t], k) => <Box key={n} i={6} x={500} y={332 + k * 38} w={460} h={32} t={t} label={`${n}  →  ${ip}`} size={14} />)}
      <Box i={7} x={40} y={342} w={420} h={92} t="app" label="Antwort passt zum Netz" sub="web bekommt für db die backend-Adresse" size={14} />
      <Arrow i={7} kind="back" both d="M462 114 V296" label="wer ist db?" lx={474} ly={268} anchor="start" />
    </Svg>
  </div>
)


/* Scaling: one name, many containers, and what collides. */
export const Scale = () => (
  <div className="dg-col">
    <Svg w={1000} h={410} label="Drei Container eines Service hinter einem DNS-Namen und die Einstellungen, die dabei kollidieren">
      <Box x={0} y={114} w={150} h={72} t="container" label="proxy" sub="fragt nach web" />
      <Box i={1} x={220} y={0} w={260} h={70} t="engine" label="DNS: web" sub="172.18.0.3 · .4 · .5" size={16} />
      <Arrow i={1} both kind="back" d="M75 112 V35 H216" n={1} nx={150} ny={35} />
      {[0, 1, 2].map(k => <g key={k}>
        <Box i={2 + k} x={700} y={10 + k * 88} w={300} h={70} t="container" label={`shop-web-${k + 1}`} sub={`172.18.0.${3 + k}`} size={15} mono />
        <Arrow i={2 + k} d={`M152 150 C 520 150, 560 ${45 + k * 88}, 696 ${45 + k * 88}`} />
      </g>)}
      <Num i={3} n={2} x={300} y={150} />
      <Label i={3} x={300} y={128} size={13} weight={600}>verteilt sich auf alle</Label>
      <Label i={5} x={0} y={296} anchor="start" size={15} weight={700}>Was beim Skalieren kollidiert</Label>
      <Box i={5} x={0} y={310} w={320} h={84} t="bad" label='ports: "8080:80"' sub="Host-Port gibt es nur einmal" size={14} mono />
      <Box i={6} x={340} y={310} w={320} h={84} t="bad" label="container_name: web" sub="Name gibt es nur einmal" size={14} mono />
      <Box i={7} x={680} y={310} w={320} h={84} t="ok" label="Proxy davor, kein Host-Port" sub="so skaliert es sauber" size={15} />
    </Svg>
  </div>
)

/* ═══ Alles zusammen ═══ */

/* Closing picture: one production project that uses every technique of this chapter. */
const bigFile: Line[] = [
  'include:',
  { t: '  - infra/compose.yaml', n: 1 },
  { t: 'x-common: &common', n: 2 },
  '  restart: unless-stopped',
  'services:', '  proxy:',
  '    <<: *common',
  { t: '    ports: ["${PORT:?fehlt}:80"]', n: 3 },
  '  web:',
  { t: '    extends:', n: 4 },
  '      { file: common.yaml, service: base }',
]
const bigCmd: Line[] = [
  { t: 'docker compose -p shop-prod \\', k: 'cmd', n: 5 },
  { t: '    -f compose.yaml -f compose.prod.yaml \\', k: 'cont', n: 6 },
  { t: '    up -d --scale web=3', k: 'cont', n: 7 },
]
export const BigProject = () => (
  <div className="dg-split">
    <div className="dg-col">
      <Code kind="file" title="compose.yaml" lines={bigFile} />
      <Code title="Terminal" lines={bigCmd} i={2} />
    </div>
    <Svg w={620} h={470} label="Ein Produktionsprojekt, das alle Techniken dieses Kapitels nutzt">
      <Zone x={0} y={0} w={620} h={470} label="Host · Projekt shop-prod" /><Num i={1} n={5} x={205} y={18} />
      <Box i={1} x={14} y={70} w={66} h={50} t="engine" label=":80" size={15} /><Num i={1} n={3} x={14} y={70} />
      <Arrow i={1} d="M82 95 H116" />
      <Box i={2} x={120} y={56} w={130} h={78} t="container" label="proxy" sub="nginx" /><Num i={2} n={2} x={250} y={56} />
      {[0, 1, 2].map(k => <Box key={k} i={3} x={310} y={44 + k * 50} w={150} h={44} t="container" label={`web-${k + 1}`} size={14} mono />)}
      <Num i={3} n={4} x={460} y={44} /><Num i={3} n={7} x={460} y={144} />
      <Arrow i={3} d="M252 95 H306" />
      <g className="sb" data-t="kchip" style={at(4)}><rect x={100} y={206} width={300} height={26} rx={13} /><text x={114} y={224} fontSize={13} fontWeight={700}>frontend</text></g>
      <g className="sb" data-t="kchip" style={at(4)}><rect x={420} y={206} width={185} height={26} rx={13} /><text x={500} y={224} fontSize={13} fontWeight={700}>backend</text></g>
      <Wire i={4} d="M185 136 V204" /><Wire i={4} d="M350 190 V204" /><Wire i={4} d="M440 190 V204" />
      <Zone i={5} x={290} y={300} w={316} h={110} t="reg" label="include" />
      <Box i={5} x={304} y={336} w={140} h={60} t="container" label="db" size={15} /><Box i={5} x={452} y={336} w={140} h={60} t="container" label="cache" size={15} />
      <Num i={5} n={1} x={606} y={300} />
      <Wire i={5} d="M430 234 V334" /><Wire i={5} d="M522 234 V334" />
      <Box i={6} x={14} y={300} w={250} h={110} t="reg" label="compose.prod.yaml" sub="überschreibt Werte für alle" size={14} mono /><Num i={6} n={6} x={264} y={300} />
      <Box i={7} x={14} y={424} w={592} h={34} t="engine" label="Etiketten halten alles als ein Projekt zusammen" size={13} />
    </Svg>
  </div>
)
