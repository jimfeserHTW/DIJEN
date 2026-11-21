import type { Chapter } from '../components/types.ts'
import { Interp, MergeRules, Anchors, FileWays, ProjectLabels, Recreate, NetKernel, Scale, BigProject } from './diagrams.tsx'

// Plan: Compose for large projects, building on chapters 3 and 4 (the network slide needs the bridge from chapter 4).
const chapter: Chapter = {
  id: 'compose-internals', title: 'Docker Compose für Profis', level: 'Expert',
  blurb: 'Große Compose-Projekte: Platzhalter und Merge-Regeln, mehrere Dateien, wie Compose intern Änderungen erkennt, Netze im Kernel und Skalierung.',
  pages: [
    {
      id: 'konfiguration', title: 'Konfiguration im Detail', summary: 'Alle Platzhalter und die genauen Regeln beim Zusammenführen.',
      slides: [
        { title: 'Platzhalter-Schreibweisen', view: <Interp /> },
        { title: 'Regeln beim Zusammenführen', view: <MergeRules /> },
      ],
    },
    {
      id: 'dateien', title: 'Große Projekte strukturieren', summary: 'Wiederverwendung und mehrere Dateien.',
      slides: [
        { title: 'Wiederholung vermeiden mit Ankern', view: <Anchors /> },
        { title: 'Drei Wege, Dateien zu verbinden', view: <FileWays /> },
      ],
    },
    {
      id: 'interna', title: 'Wie Compose intern arbeitet', summary: 'Etiketten als Gedächtnis und der Vergleich von Soll und Ist.',
      slides: [
        { title: 'Woran Compose sein Projekt erkennt', view: <ProjectLabels /> },
        { title: 'Wann up einen Container ersetzt', view: <Recreate /> },
      ],
    },
    {
      id: 'netz', title: 'Netze und Skalierung', summary: 'Was Compose im Host anlegt und wie mehrere Container einen Namen teilen.',
      slides: [
        { title: 'Was ein Compose-Netz wirklich ist', view: <NetKernel /> },
        { title: 'Einen Service skalieren', view: <Scale /> },
      ],
    },
    {
      id: 'gesamt', title: 'Alles zusammen', summary: 'Ein Produktionsprojekt mit allen Techniken.',
      slides: [
        { title: 'Ein großes Projekt auf einen Blick', view: <BigProject /> },
      ],
    },
  ],
}

export default chapter
