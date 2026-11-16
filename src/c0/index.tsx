import type { Chapter } from '../components/types.ts'
import { Problem, Idea, Levels, VmVsContainer, OwnOs, Where, Platforms, Architecture, ImageContainer, Lifecycle, UseCases, Limits, Summary } from './diagrams.tsx'

// Plan chapter 1: no commands, only the big picture. No Kubernetes.
const chapter: Chapter = {
  id: 'basics', title: 'Docker verstehen', level: 'Beginner',
  blurb: 'Was ist Docker und wo läuft es? Das Problem, die Idee, Container gegen VMs, die Architektur und die Grenzen. Ganz ohne Befehle.',
  pages: [
    {
      id: 'idee', title: 'Problem und Idee', summary: 'Warum es Container gibt: „Bei mir läuft’s“ und die Lösung.',
      slides: [
        { title: 'Lernpfad: Wo stehen wir?', visual: { kind: 'path', active: 0, advanced: 5, stops: ['Docker verstehen', 'Compose', 'Images & Container', 'Dockerfile & Layers', 'Netzwerke & Volumes', 'Isolation', 'Sicherheit & mehr'] } },
        { title: 'Das Problem: „Bei mir läuft’s“', view: <Problem /> },
        { title: 'Die Idee: App und Umgebung verpacken', view: <Idea /> },
      ],
    },
    {
      id: 'virtualisierung', title: 'Virtualisierung', summary: 'Drei Ebenen, VM gegen Container und der geteilte Kernel.',
      slides: [
        { title: 'Virtualisierung in drei Ebenen', view: <Levels /> },
        { title: 'VM gegen Container', view: <VmVsContainer /> },
        { title: 'Hat ein Container ein eigenes Betriebssystem?', view: <OwnOs /> },
      ],
    },
    {
      id: 'stack', title: 'Docker im Stack', summary: 'Wer was verwaltet, und wie Docker auf Linux, macOS und Windows läuft.',
      slides: [
        { title: 'Wo Docker im Stack sitzt', view: <Where /> },
        { title: 'Docker auf Linux, macOS und Windows', view: <Platforms /> },
      ],
    },
    {
      id: 'architektur', title: 'Architektur und Begriffe', summary: 'Client, Daemon und Registry, Image und Container, Lebenszyklus.',
      slides: [
        { title: 'Die Architektur auf einen Blick', view: <Architecture /> },
        { title: 'Image, Container, Registry', view: <ImageContainer /> },
        { title: 'Lebenszyklus eines Containers', view: <Lifecycle /> },
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
