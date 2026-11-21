import type { Chapter } from '../components/types.ts'
import { DiskMap, NetBridge, PortPath, NsMap, CgroupFiles, Gates, RunChain, AfterStart, Standards, ProofMap } from './diagrams.tsx'

// Plan: the internals behind chapter 2. Order: files and network first, kernel isolation next, the full start sequence last.
const chapter: Chapter = {
  id: 'docker-internals', title: 'Docker für Profis', level: 'Expert',
  blurb: 'Docker von innen: Ordner auf der Platte, Verkabelung und Paketwege, Namespaces, cgroups und Schutzschichten sowie die Kette bis zum laufenden Prozess.',
  pages: [
    {
      id: 'platte', title: 'Docker auf der Platte', summary: 'Welche Ordner hinter Images, Containern und Volumes stehen.',
      slides: [
        { title: 'Was wo auf der Festplatte liegt', view: <DiskMap /> },
      ],
    },
    {
      id: 'netz', title: 'Netzwerk im Kernel', summary: 'Wie Container verkabelt sind und wie ein Paket seinen Weg findet.',
      slides: [
        { title: 'Die Verkabelung im Host', view: <NetBridge /> },
        { title: 'Ein Paket durch -p 8080:80', view: <PortPath /> },
      ],
    },
    {
      id: 'isolation', title: 'Isolation im Kernel', summary: 'Alle Namespaces, Limits als Dateien und die Schutzschichten.',
      slides: [
        { title: 'Namespaces: Ein Kernel, getrennte Sichten', view: <NsMap /> },
        { title: 'cgroups: Limits sind Dateien', view: <CgroupFiles /> },
        { title: 'Schutzschichten: Was ein Prozess darf', view: <Gates /> },
      ],
    },
    {
      id: 'start', title: 'Der Start im Detail', summary: 'Von dockerd bis zum Prozess, und die Standards dahinter.',
      slides: [
        { title: 'Von dockerd bis zum laufenden Prozess', view: <RunChain /> },
        { title: 'Was nach dem Start noch läuft', view: <AfterStart /> },
        { title: 'Andere Werkzeuge, gleiche Standards', view: <Standards /> },
        { title: 'Alles am echten System nachprüfen', view: <ProofMap /> },
      ],
    },
  ],
}

export default chapter
