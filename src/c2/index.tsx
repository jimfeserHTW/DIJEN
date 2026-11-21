import type { Chapter } from '../components/types.ts'
import {
  VmVsContainer, OwnOs, Where, Platforms, SystemMap, ApiCall, Pull, Overlay, CopyOnWrite, SharedLayers, Mounts,
  NetModes, PidNs, Cgroups, RunSummary,
} from './diagrams.tsx'

// Plan: what happens and what it means for you. The internals behind it follow in chapter 4.
const chapter: Chapter = {
  id: 'deep-dive', title: 'Docker im Detail', level: 'Advanced',
  blurb: 'Wo Docker im System liegt, wie Images aus Schichten entstehen, wo Daten liegen, wie Container ins Netz kommen und wie der Kernel sie trennt.',
  pages: [
    {
      id: 'system', title: 'Docker im System', summary: 'Wo Docker liegt, aus welchen Programmen es besteht und wie ein Befehl ankommt.',
      slides: [
        { title: 'VM gegen Container', view: <VmVsContainer /> },
        { title: 'Hat ein Container ein eigenes Betriebssystem?', view: <OwnOs /> },
        { title: 'Wo Docker im Stack sitzt', view: <Where /> },
        { title: 'Docker auf Linux, macOS und Windows', view: <Platforms /> },
        { title: 'Ein Rechner, alle Teile von Docker', view: <SystemMap /> },
        { title: 'Wie ein Befehl beim Daemon ankommt', view: <ApiCall /> },
      ],
    },
    {
      id: 'images', title: 'Images und Layer', summary: 'Wie ein Image auf den Rechner kommt und wie aus Schichten ein Dateisystem wird.',
      slides: [
        { title: 'docker pull: Wie ein Image ankommt', view: <Pull /> },
        { title: 'Aus Schichten wird ein Dateisystem', view: <Overlay /> },
        { title: 'Copy-on-Write: Lesen, Ändern, Löschen', view: <CopyOnWrite /> },
        { title: 'Warum viele Container wenig Platz brauchen', view: <SharedLayers /> },
      ],
    },
    {
      id: 'daten-netz', title: 'Daten und Netzwerk', summary: 'Wo Daten eines Containers liegen und wie er ans Netz kommt.',
      slides: [
        { title: 'Vier Speicherorte, ein Dateisystem', view: <Mounts /> },
        { title: 'Drei Netzwerk-Modi', view: <NetModes /> },
      ],
    },
    {
      id: 'isolation', title: 'Isolation', summary: 'Was ein Prozess sieht und wie viel er verbrauchen darf.',
      slides: [
        { title: 'Ein Prozess, zwei Nummern', view: <PidNs /> },
        { title: 'cgroups: Wer wie viel verbrauchen darf', view: <Cgroups /> },
      ],
    },
    {
      id: 'gesamt', title: 'Alles zusammen', summary: 'Was ein einziger Befehl im System bewirkt.',
      slides: [
        { title: 'Ein Befehl, das ganze System', view: <RunSummary /> },
      ],
    },
  ],
}

export default chapter
