import type { Chapter } from '../components/types.ts'
import { Problem, Idea, Levels, Architecture, ImageContainer, Lifecycle, UseCases, Limits, Summary } from './diagrams.tsx'

// Plan chapter 1: the big picture; commands appear only as an anatomy, nothing to type. No Kubernetes.
const chapter: Chapter = {
  id: 'basics', title: 'Docker verstehen', level: 'Beginner',
  blurb: 'Was ist Docker? Das Problem, die Idee, die Ebenen der Virtualisierung, die Architektur, der Aufbau eines Befehls und die Grenzen.',
  pages: [
    {
      id: 'idee', title: 'Problem und Idee', summary: 'Warum es Container gibt: „Bei mir läuft’s“ und die Lösung.',
      slides: [
        { title: 'Das Problem: „Bei mir läuft’s“', view: <Problem /> },
        { title: 'Die Idee: App und Umgebung verpacken', view: <Idea /> },
      ],
    },
    {
      id: 'virtualisierung', title: 'Virtualisierung', summary: 'Die drei Ebenen der Virtualisierung.',
      slides: [
        { title: 'Virtualisierung in drei Ebenen', view: <Levels /> },
      ],
    },
    {
      id: 'architektur', title: 'Architektur und Begriffe', summary: 'Client, Daemon und Registry, Image und Container, Lebenszyklus, Aufbau eines Befehls.',
      slides: [
        { title: 'Die Architektur auf einen Blick', view: <Architecture /> },
        { title: 'Image, Container, Registry', view: <ImageContainer /> },
        { title: 'Lebenszyklus eines Containers', view: <Lifecycle /> },
        {
          title: 'Aufbau eines Docker-Befehls',
          visual: { kind: 'anatomy', rows: [
            [
              { text: 'docker', label: 'Programm' }, { text: 'container', label: 'Objekt: worum es geht' }, { text: 'run', label: 'Aktion: was passiert' },
              { text: '-d', label: 'Option: im Hintergrund' }, { text: '-p 8080:80', label: 'Option mit Wert: Port' }, { text: 'nginx:1.27', label: 'Argument: welches Image' },
            ],
            [{ text: 'docker', label: 'Programm' }, { text: 'ps', label: 'Kurzform: container ls' }, { text: '-a', label: 'Option: auch gestoppte' }],
          ] },
        },
      ],
    },
    {
      id: 'einordnung', title: 'Einordnung', summary: 'Einsatz, Grenzen, Alternativen und der Rückblick.',
      slides: [
        { title: 'Wofür wird Docker eingesetzt?', view: <UseCases /> },
        { title: 'Grenzen und Abgrenzung', view: <Limits /> },
        {
          title: 'Docker im Vergleich zu Alternativen',
          visual: { kind: 'matrix', legend: 'Je voller der Kreis, desto besser: stärker isoliert, sparsamer, schneller, größeres Ökosystem. Grobe Einordnung.', head: ['Option', 'Architektur', 'Isolation', 'Sparsam', 'Schnellstart', 'Einsatz', 'Ökosystem'], rows: [
            ['Docker', 'Zentraler Daemon (dockerd), läuft meist als root', '2', '3', '4', 'Standard für Entwicklung', '4'],
            ['Podman', 'Kein Daemon, rootless möglich', '3', '3', '4', 'Weitgehend Docker-kompatibel', '3'],
            ['containerd / CRI-O', 'Schlanker Daemon ohne Entwickler-Oberfläche', '2', '4', '4', 'Unter anderen Tools, containerd auch unter Docker', '2'],
            ['LXC / LXD', 'System-Container, LXD als Daemon', '3', '3', '3', 'Ganzes Linux-System wie eine leichte VM', '2'],
            ['Virtuelle Maschinen', 'Hypervisor, eigener Kernel je VM', '4', '1', '1', 'Volle Isolation, beliebiges Betriebssystem', '4'],
          ] },
        },
        { title: 'Zusammenfassung', view: <Summary /> },
      ],
    },
  ],
}

export default chapter
