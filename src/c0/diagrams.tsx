import type { CSSProperties, ReactNode } from 'react'
import { Stack, at, type Block, type Row } from '../components/Stack.tsx'
import { Svg, Box, Arrow, Label } from '../components/Svg.tsx'
import { Icon, IconSvg } from '../components/Icons.tsx'
import { Visuals } from '../components/Visuals.tsx'
import { t } from '../i18n.ts'
import './c0.css'

// Chapter 0 diagrams. All stacks use the shared vocabulary: hardware at the bottom, units side by side,
// a dashed line where "geteilt" ends and "eigen" begins.
const ctr = (n: string | number, rows: Row[] = ['libs', 'app'], mark?: 'ok' | 'bad', w?: number): Block => ({ unit: `Container ${n}`, kind: 'container', rows, mark, w })
const vm = (n: number, rows: Row[] = ['guestKernel', 'libs', 'app'], mark?: 'ok' | 'bad'): Block => ({ unit: `VM ${n}`, kind: 'vm', rows, mark })
const css = (o: Record<string, string | number>) => o as CSSProperties

/* ── 2 · the problem ── */
export const Problem = () => (
  <div className="c0-problem">
    <div className="need" style={at(0)}>
      <IconSvg name="file" size={46} />
      <div className="need-app"><b>shop.py</b><small>{t('Auf beiden Rechnern derselbe Code')}</small></div>
      <span className="need-arrow">{t('braucht')}</span>
      <span className="chip"><b>Python ≥ 3.10</b><small>{t('nutzt den Befehl „match“')}</small></span>
      <span className="chip"><b>OpenSSL 3</b><small>{t('gegen Version 3 gebaut')}</small></span>
    </div>
    <div className="duo">
      <Stack d={2} title="Entwickler-Laptop" sub="frisch eingerichtet" icon={<IconSvg name="laptop" size={44} />} rows={[
        'hardware', { part: 'kernel', sub: 'Linux 6.8' },
        [{ part: 'hostApps', label: 'Python 3.12', mark: 'ok' }, { part: 'hostApps', label: 'OpenSSL 3.0', mark: 'ok' }],
        { part: 'app', label: 'shop.py', mark: 'ok' },
      ]} status={{ mark: 'ok', text: 'Läuft' }} />
      <Stack d={2} title="Server" sub="seit Jahren nicht aktualisiert" icon={<IconSvg name="server" size={44} />} rows={[
        'hardware', { part: 'kernel', sub: 'Linux 5.10' },
        [{ part: 'hostApps', label: 'Python 3.9', sub: 'kennt „match“ nicht', mark: 'bad' }, { part: 'hostApps', label: 'OpenSSL 1.1', sub: 'Version 3 fehlt', mark: 'bad' }],
        { part: 'app', label: 'shop.py', mark: 'bad' },
      ]} status={{ mark: 'bad', text: 'Absturz: SyntaxError, libssl.so.3 nicht gefunden' }} />
    </div>
    <p className="cause" style={at(7)}><b>{t('Ursache')}</b> {t('Die App nutzt, was auf dem Rechner installiert ist, und jeder Rechner hat andere Versionen.')}</p>
  </div>
)

/* ── 3 · the idea ── */
const packed: Row[] = [
  { part: 'libs', label: 'Basis-Dateisystem', sub: 'Debian' },
  [{ part: 'libs', label: 'Python 3.12' }, { part: 'libs', label: 'OpenSSL 3' }],
  [{ part: 'app', label: 'shop.py' }, { part: 'app', label: 'Konfig' }],
]
const host = (title: string, icon: 'laptop' | 'server', kernel: string, py: string) => (
  <Stack d={5} size="s" title={title} sub={t('eigenes Python {{py}} bleibt unbenutzt', { py })} icon={<IconSvg name={icon} size={38} />} rows={[
    'hardware', { part: 'kernel', sub: kernel },
    'engine',
    { unit: 'Container', kind: 'container', sub: 'aus shop:1.0', rows: packed, mark: 'ok' },
  ]} status={{ mark: 'ok', text: 'Läuft' }} />
)
export const Idea = () => (
  <div className="c0-idea">
    <Stack title="Image shop:1.0" sub="Der versiegelte Bauplan" icon={<IconSvg name="blueprint" size={44} />} rows={[
      { part: 'hardware', mark: 'gone', sub: 'kommt vom Rechner' },
      { part: 'kernel', mark: 'gone', sub: 'kommt vom Rechner' },
      { unit: 'Image', kind: 'image', sub: 'alles hier drin reist mit', rows: packed },
    ]} />
    <div className="idea-arrow" style={at(4)}><span>{t('Die Engine lädt das Image und startet es als Container')}</span><i /></div>
    <div className="duo">{host('Laptop', 'laptop', 'Linux 6.8', '3.12')}{host('Server', 'server', 'Linux 5.10', '3.9')}</div>
  </div>
)

/* ── 4 · three levels ── */
export const Levels = () => (
  <div className="c0-levels">
    <div className="trio">
      <Stack size="s" title="Ebene Anwendung" sub="Prozess-Virtualisierung" rows={[
        'hardware', 'kernel', 'hostApps', { part: 'runtime', sub: 'z. B. JVM, WildFly' },
        [{ unit: 'Prozess 1', kind: 'proc', rows: ['app'] }, { unit: 'Prozess 2', kind: 'proc', rows: ['app'] }],
      ]} boundary={4} />
      <Stack d={2} size="s" title="Ebene Betriebssystem" sub="OS-Virtualisierung" tag="Docker" rows={[
        'hardware', 'kernel', 'engine', [ctr(1), ctr(2)],
      ]} boundary={3} />
      <Stack d={4} size="s" title="Ebene Hardware" sub="System-Virtualisierung" rows={[
        'hardware', 'kernel', 'hypervisor', [vm(1), vm(2)],
      ]} boundary={3} />
    </div>
    <div className="axis" style={at(9)}>
      <span><b>{t('Grenze hoch')}</b> {t('Apps teilen sich fast alles')}</span>
      <i />
      <span><b>{t('Grenze tief')}</b> {t('Jede VM bringt sogar einen eigenen Kernel mit')}</span>
    </div>
  </div>
)

/* ── 5 · VM versus container ── */
export const VmVsContainer = () => (
  <div className="c0-vm">
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
  <div className="c0-own">
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
  <div className="c0-where">
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
  <div className="trio c0-plat">
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

/* ── 9 · architecture: a request travels down to the kernel and the answer back up ── */
export const Architecture = () => (
  <Svg w={1000} h={510} label="Docker-Architektur: Nutzer, Client, Daemon, Kernel und Registry">
    <g className="sb" data-t="app" style={at(0)}><rect x={150} y={10} width={700} height={484} rx={22} /></g>
    <Label x={172} y={38} anchor="start" size={16} weight={700}>Docker Host · Linux-Rechner oder Server</Label>
    <g className="sb" data-t="host" style={at(0)}><rect x={165} y={52} width={670} height={260} rx={16} /></g>
    <Label x={180} y={76} anchor="start" size={13} weight={700} tone="muted">USERSPACE · PROGRAMME</Label>
    <Box i={5} x={165} y={332} w={670} h={78} t="kernel" label="Host-Kernel · Linux" sub="trennt die Container voneinander und teilt CPU und RAM zu" />
    <Box x={165} y={424} w={670} h={56} t="hw" label="Hardware · CPU · RAM · Speicher" />

    <g style={at(1)} className="sl"><Icon name="person" x={10} y={76} s={60} /></g>
    <Label x={40} y={156} weight={700} i={1}>Du</Label>
    <Box i={1} x={195} y={96} w={170} h={66} label="Client" sub="Kommandozeile, Desktop" />
    <Box i={2} x={420} y={96} w={190} h={66} t="engine" label="Docker Daemon" sub="steuert alles" />
    <Box i={3} x={665} y={96} w={150} h={66} t="libs" label="Lokale Images" sub="Bauplan-Speicher" />
    <g style={at(4)} className="sl"><Icon name="warehouse" x={890} y={70} s={80} /></g>
    <Label x={930} y={176} weight={700} i={4}>Registry</Label>
    <Label x={930} y={196} size={13} tone="muted" i={4}>z. B. Docker Hub</Label>
    <Box i={6} x={185} y={222} w={160} h={58} t="container" label="Container A" sub="isolierter Prozess" />
    <Box i={6} x={665} y={222} w={150} h={58} t="container" label="Container B" sub="isolierter Prozess" />

    <Arrow i={1} d="M76 106 H191" n={1} nx={110} ny={106} label="Auftrag" lx={110} ly={88} />
    <Arrow i={2} d="M367 116 H416" n={2} nx={391} ny={116} label="API" lx={391} ly={90} />
    <Arrow i={3} d="M612 129 H661" n={3} nx={636} ny={129} label="vorhanden?" lx={636} ly={90} />
    <Arrow i={4} d="M888 129 H819" n={4} nx={868} ny={129} label="herunterladen" lx={930} ly={222} />
    <Arrow i={5} d="M515 164 V328" n={5} nx={515} ny={196} label="Container anlegen" lx={499} ly={238} anchor="end" />
    <Label i={5} x={499} y={256} anchor="end" weight={600}>Ressourcen festlegen</Label>
    <Arrow i={6} kind="ok" d="M265 330 V284" n={6} nx={265} ny={297} label="laufen isoliert" lx={285} ly={302} anchor="start" />
    <Arrow i={6} kind="ok" d="M740 330 V284" />
    <Arrow i={7} kind="back" d="M416 146 H369" />
    <Arrow i={7} kind="back" d="M191 150 H76" n={7} nx={110} ny={150} label="Status &" lx={110} ly={182} />
    <Label i={7} x={110} y={198} weight={600}>Ausgabe</Label>
  </Svg>
)

/* ── 10 · image, container, registry ── */
export const ImageContainer = () => (
  <Svg w={1000} h={440} label="Registry als Lagerhaus, Image als Bauplan, Container als gebaute Objekte">
    <g className="sl" style={at(0)}><Icon name="warehouse" x={30} y={70} s={160} /></g>
    <Label i={0} x={110} y={266} size={22} weight={700}>Registry</Label>
    <Label i={0} x={110} y={290} tone="muted">Lagerhaus für viele Images</Label>
    <Arrow i={1} d="M200 160 H300" label="herunterladen" lx={250} ly={145} />
    <g className="sl" style={at(2)}><Icon name="blueprint" x={310} y={70} s={160} /></g>
    <Label i={2} x={390} y={266} size={22} weight={700}>Image</Label>
    <Label i={2} x={390} y={290} tone="muted">Bauplan, nur lesbar</Label>
    <Label i={2} x={390} y={314} tone="blue" weight={700}>≈ Klasse</Label>
    {[0, 1, 2].map(k => (
      <g key={k}>
        <Arrow i={3 + k} d={`M480 ${150 + k * 10} C 580 ${150 + k * 10}, 590 ${70 + k * 120}, 686 ${70 + k * 120}`} label={`Start ${k + 1}`} lx={652} ly={54 + k * 120} />
        <g className="sl" style={at(3 + k)}><Icon name="crate" x={694} y={36 + k * 120} s={70} /></g>
        <Label i={3 + k} x={780} y={78 + k * 120} anchor="start" size={18} weight={700}>{`Container ${k + 1}`}</Label>
      </g>
    ))}
    <Label i={6} x={729} y={414} tone="blue" weight={700}>≈ Objekte</Label>
    <Label i={7} x={360} y={400} size={15} weight={600}>Jeder Start baut ein neues Objekt nach demselben Plan.</Label>
    <Label i={7} x={360} y={424} size={15} tone="muted">Das Image enthält keine Container und bleibt unverändert.</Label>
  </Svg>
)

/* ── 11 · lifecycle: one main path; branches leave it and end on their own. A restart ends at the right edge (↻). ── */
const main: [string, string, 'app' | 'libs' | 'engine' | 'host' | 'gone'][] = [['Bauanleitung', 'Dockerfile', 'app'], ['Image', '', 'libs'], ['Erstellt', '', 'app'], ['Läuft', '', 'engine'], ['Gestoppt', '', 'host'], ['Gelöscht', '', 'gone']]
const steps = ['bauen', 'erstellen', 'starten', 'stoppen', 'löschen']
export const Lifecycle = () => (
  <div>
    <Svg w={1000} h={490} label="Lebenszyklus: Normalfall mit Abzweigungen">
      {main.map(([l, sub, t], k) => <Box key={l} i={k} x={10 + k * 172} y={200} w={120} h={60} t={t} label={l} sub={sub || undefined} size={15} />)}
      {steps.map((l, k) => <Arrow key={l} i={k + 1} d={`M${132 + k * 172} 230 H${178 + k * 172}`} label={l} lx={155 + k * 172} ly={192} />)}

      <Box i={7} x={182} y={60} w={120} h={56} t="reg" label="Registry" size={15} />
      <Arrow i={7} kind="mute" d="M242 118 V196" label="oder herunterladen" lx={252} ly={162} anchor="start" />

      <Arrow i={8} kind="back" d="M758 198 V90 H866" label="wieder starten" lx={812} ly={80} />
      <Box i={8} x={870} y={60} w={120} h={60} t="engine" label="↻ Läuft" sub="neu gestartet" size={15} />

      <Arrow i={9} kind="bad" d="M600 262 V340 H636" label="Fehler" lx={608} ly={300} anchor="start" />
      <Box i={9} x={640} y={310} w={150} h={60} t="bad" label="Abgestürzt" sub="Fehlercode" size={15} />
      <Arrow i={10} kind="back" d="M792 340 H866" label="Neustart-Regel" lx={830} ly={302} />
      <Box i={10} x={870} y={310} w={120} h={60} t="engine" label="↻ Läuft" sub="neu gestartet" size={15} />

      <Arrow i={11} kind="ok" d="M560 262 V440 H636" label="Aufgabe erledigt" lx={568} ly={400} anchor="start" />
      <Box i={11} x={640} y={410} w={150} h={60} t="ok" label="Fertig" sub="Code 0" size={15} />
      <Arrow i={12} kind="ok" d="M792 440 H866" label="automatisch entfernen" lx={830} ly={402} />
      <Box i={12} x={870} y={410} w={120} h={60} t="gone" label="Gelöscht" size={15} />
    </Svg>
    <div className="dg-legend" style={at(13)}>
      <span><i />{t('Normalfall')}</span>
      <span><i style={css({ '--c': 'var(--bad)' })} />{t('Fehler')}</span>
      <span><i style={css({ '--c': 'var(--ok)' })} />{t('Einmal-Aufgabe')}</span>
      <span><i data-dash style={css({ '--c': 'var(--blue)' })} />{t('Neustart: ↻ hier beginnt es erneut')}</span>
      <span><i style={css({ '--c': 'var(--ink-3)' })} />{t('Image aus der Registry')}</span>
    </div>
  </div>
)

/* ── 12 · use cases: four mini pipelines ── */
const Panel = ({ title, i, children }: { title: string; i: number; children: ReactNode }) => (
  <figure className="panel" style={at(i)}><figcaption>{t(title)}</figcaption>{children}</figure>
)
export const UseCases = () => (
  <div className="c0-uses">
    <Panel title="Entwicklung: gleiche Umgebung für alle" i={0}>
      <Svg w={460} h={190} label="Ein Image läuft auf drei Laptops gleich">
        <Icon name="blueprint" x={14} y={50} s={74} /><Label x={51} y={150} weight={700}>Image</Label>
        {[0, 1, 2].map(k => <g key={k}>
          <Arrow d={`M96 88 C 140 88, 150 ${36 + k * 54}, 190 ${36 + k * 54}`} />
          <Icon name="laptop" x={198} y={12 + k * 54} s={48} /><Icon name="crate" x={252} y={14 + k * 54} s={40} />
          <Label x={300} y={42 + k * 54} anchor="start" size={15}>{t('{{name}}: läuft gleich', { name: ['Anna', 'Ben', 'Chris'][k] })}</Label>
        </g>)}
      </Svg>
    </Panel>
    <Panel title="Test / CI: frisch testen, dann wegwerfen" i={1}>
      <Svg w={460} h={190} label="Code, frischer Container, Test, Wegwerfen">
        {(['file', 'crate', 'check', 'trash'] as const).map((n, k) => <g key={n}>
          <Icon name={n} x={14 + k * 116} y={46} s={62} />
          <Label x={45 + k * 116} y={140} size={14} weight={600}>{['neuer Code', 'frischer Container', 'Tests', 'weggeworfen'][k]}</Label>
          {k < 3 && <Arrow d={`M${82 + k * 116} 77 H${124 + k * 116}`} />}
        </g>)}
      </Svg>
    </Panel>
    <Panel title="Deployment: getestet ist ausgeliefert" i={2}>
      <Svg w={460} h={190} label="Image wird über die Registry auf Server verteilt">
        <Icon name="blueprint" x={14} y={52} s={66} /><Label x={47} y={146} weight={600}>Image</Label>
        <Arrow d="M88 85 H146" label="hochladen" lx={117} ly={72} />
        <Icon name="warehouse" x={152} y={44} s={80} /><Label x={192} y={146} weight={600}>Registry</Label>
        <Arrow d="M240 76 C 290 76, 300 40, 336 40" label="herunterladen" lx={288} ly={158} /><Arrow d="M240 92 C 290 92, 300 128, 336 128" />
        <Icon name="server" x={342} y={14} s={52} /><Icon name="server" x={342} y={102} s={52} />
        <Label x={402} y={46} anchor="start" size={14}>Server 1</Label><Label x={402} y={134} anchor="start" size={14}>Server 2</Label>
      </Svg>
    </Panel>
    <Panel title="Microservices: jeder Dienst ein Container" i={3}>
      <Svg w={460} h={190} label="Vier Dienste in eigenen Containern, verbunden">
        <Icon name="person" x={8} y={66} s={52} />
        <Arrow d="M62 92 H112" />
        {([['Shop', 118, 66], ['Zahlung', 270, 10], ['Suche', 270, 122], ['Datenbank', 390, 66]] as const).map(([n, x, y]) => <g key={n}>
          <Icon name="crate" x={x} y={y} s={50} />
          <Label x={x + 25} y={y + 66} size={14} weight={600}>{n}</Label>
        </g>)}
        <Arrow d="M170 84 L266 42" /><Arrow d="M170 100 L266 142" /><Arrow d="M322 42 L388 84" /><Arrow d="M322 142 L388 100" />
      </Svg>
    </Panel>
  </div>
)

/* ── 13 · limits: what is separated, and what a kernel fault hits ── */
const iso: [string, string, 0 | 1, 0 | 1, 0 | 1][] = [
  ['Prozessliste', 'PID-Namespace', 0, 1, 1],
  ['Dateisystem', 'Mount-Namespace', 0, 1, 1],
  ['Netzwerk', 'Netz-Namespace', 0, 1, 1],
  ['Ressourcen-Limits', 'cgroups', 0, 1, 1],
  ['Kernel', 'geteilt', 0, 0, 1],
]
const mk = (v: 0 | 1) => <span className="mk" data-m={v ? 'ok' : 'bad'}>{v ? '✓' : '✗'}</span>
export const Limits = () => (
  <div className="c0-limits">
    <div className="iso" style={at(0)}>
      <div className="spectrum"><span>{t('leichtgewichtig')}</span><i /><span>{t('stark isoliert')}</span></div>
      <table className="tbl iso-tbl">
        <thead><tr><th scope="col">{t('Eigene …')}</th><th scope="col">{t('Prozess')}</th><th scope="col">Container</th><th scope="col">VM</th></tr></thead>
        <tbody>{iso.map(([q, how, p, c, v], k) => (
          <tr key={q} style={at(k + 1)}><th scope="row">{t(q)}</th><td>{mk(p)}</td><td>{mk(c)}<small>{t(how)}</small></td><td>{mk(v)}</td></tr>
        ))}</tbody>
      </table>
    </div>
    <div className="duo">
      <Stack d={6} size="s" title="Kernel-Fehler bei Containern" sub="trifft alle" rows={[
        'hardware', { part: 'kernel', sub: 'Linux · ⚡ Fehler', mark: 'bad' }, 'engine', [ctr(1, ['app'], 'bad'), ctr(2, ['app'], 'bad')],
      ]} />
      <Stack d={9} size="s" title="Kernel-Fehler in VM 1" sub="trifft nur VM 1" rows={[
        'hardware', 'kernel', { part: 'hypervisor', sub: 'für VMs' }, [vm(1, [{ part: 'guestKernel', sub: '⚡ Fehler', mark: 'bad' }, 'app'], 'bad'), vm(2, ['guestKernel', 'app'], 'ok')],
      ]} />
    </div>
  </div>
)

/* ── 15 · summary map ── */
const Callout = ({ n, y, title, text, i }: { n: number; y: number; title: string; text: string; i: number }) => (
  <g>
    <g style={at(i)} className="callout"><circle cx={300} cy={y} r={16} /><text x={300} y={y + 6} textAnchor="middle">{n}</text></g>
    <Label i={i} x={326} y={y - 4} anchor="start" size={16} weight={700}>{title}</Label>
    <Label i={i} x={326} y={y + 18} anchor="start">{text}</Label>
  </g>
)
export const Summary = () => (
  <Svg w={1000} h={520} label="Zusammenfassung: Registry, Image, Container auf geteiltem Kernel, Plattformen">
    <g className="sl" style={at(0)}><Icon name="warehouse" x={20} y={20} s={110} /></g>
    <Label i={0} x={75} y={150} weight={700} size={17}>Registry</Label>
    <Arrow i={1} d="M75 162 V236" label="herunterladen" lx={84} ly={204} anchor="start" />
    <g className="sl" style={at(1)}><Icon name="blueprint" x={20} y={244} s={110} /></g>
    <Label i={1} x={75} y={374} weight={700} size={17}>Image</Label>
    <Label i={1} x={75} y={394} tone="muted" size={13}>App + Umgebung</Label>

    <Box i={2} x={260} y={450} w={470} h={52} t="hw" label="Hardware" />
    <Box i={2} x={260} y={390} w={470} h={52} t="kernel" label="Host-Kernel · Linux" sub="von allen Containern geteilt" />
    <Box i={2} x={260} y={330} w={470} h={52} t="engine" label="Container Engine" sub="Docker" />
    {[0, 1, 2].map(k => <g key={k}>
      <Box i={3} x={260 + k * 160} y={200} w={150} h={120} t="container" label="" />
      <Label i={3} x={335 + k * 160} y={224} weight={700} size={15}>{`Container ${k + 1}`}</Label>
      <Box i={3} x={270 + k * 160} y={236} w={130} h={34} label="App" size={14} />
      <Box i={3} x={270 + k * 160} y={276} w={130} h={34} t="libs" label="Bibliotheken" size={14} />
    </g>)}
    <Arrow i={3} d="M136 300 C 190 300, 200 260, 254 260" label="starten" lx={196} ly={244} />

    <Box i={4} x={790} y={330} w={190} h={52} t="ok" label="Linux" sub="läuft direkt" />
    <Box i={4} x={790} y={390} w={190} h={52} t="guest" label="macOS · Windows" sub="über eine Linux-VM" />

    <Callout i={5} n={1} y={40} title="Verpackt" text="Die Umgebung reist im Image mit: kein „bei mir läuft’s“ mehr." />
    <Callout i={6} n={2} y={96} title="Ein Image, viele Container" text="Der Bauplan bleibt gleich, jeder Start baut ein neues Objekt." />
    <Callout i={7} n={3} y={152} title="Geteilter Kernel" text="Leicht und schnell, aber weniger isoliert als eine VM." />
  </Svg>
)
