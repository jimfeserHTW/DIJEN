import type { Chapter } from '../components/types.ts'
import {
  UpFlow, ServiceMap, StartCommand, BuildFlow, RestartGrid, Limits, Health, DependsGantt, Doors,
  VolumeInit, Cleanup, VarWinner, Secrets, Profiles, Watch, DebugPath, Summary,
} from './diagrams.tsx'

// Plan: builds on chapter 1 (the same shop project). What you need for real projects; internals follow in chapter 5.
const chapter: Chapter = {
  id: 'compose-deep-dive', title: 'Docker Compose im Detail', level: 'Advanced',
  blurb: 'Was jeder Schlüssel im Container bewirkt, wie Start, Ports und Daten zusammenspielen und wie man ein Projekt konfiguriert und betreibt.',
  pages: [
    {
      id: 'projekt', title: 'Was Compose ist', summary: 'Compose als Client von dockerd.',
      slides: [
        { title: 'Was bei docker compose up passiert', view: <UpFlow /> },
      ],
    },
    {
      id: 'service', title: 'Ein Service im Detail', summary: 'Was die Schlüssel eines Service im Container verändern.',
      slides: [
        { title: 'Vom Schlüssel zum Container', view: <ServiceMap /> },
        { title: 'Wie der Startbefehl entsteht', view: <StartCommand /> },
        { title: 'build: Vom Ordner zum Image', view: <BuildFlow /> },
        { title: 'Neustart-Regeln im Vergleich', view: <RestartGrid /> },
        { title: 'Grenzen auf einem geteilten Rechner', view: <Limits /> },
      ],
    },
    {
      id: 'start', title: 'Start und Reihenfolge', summary: 'Wann ein Service bereit ist und wer auf wen wartet.',
      slides: [
        { title: 'Healthcheck: Wann ist ein Service bereit?', view: <Health /> },
        { title: 'Wer wartet auf wen?', view: <DependsGantt /> },
      ],
    },
    {
      id: 'zugang-daten', title: 'Ports und Daten', summary: 'Wer von wo erreichbar ist, was beim Mounten passiert und was beim Aufräumen bleibt.',
      slides: [
        { title: 'Vier Türen in einen Container', view: <Doors /> },
        { title: 'Was mit den Dateien im Image passiert', view: <VolumeInit /> },
        { title: 'Was welcher Befehl löscht', view: <Cleanup /> },
      ],
    },
    {
      id: 'konfiguration', title: 'Konfiguration', summary: 'Variablen, Geheimnisse und optionale Services.',
      slides: [
        { title: 'Welcher Wert gewinnt?', view: <VarWinner /> },
        { title: 'Passwörter: Variable oder Secret?', view: <Secrets /> },
        { title: 'Profile: Services bei Bedarf', view: <Profiles /> },
      ],
    },
    {
      id: 'betrieb', title: 'Arbeiten mit Compose', summary: 'Entwickeln, Fehler finden und der Gesamtblick.',
      slides: [
        { title: 'Entwickeln mit Compose Watch', view: <Watch /> },
        { title: 'Fehler systematisch finden', view: <DebugPath /> },
        { title: 'Das ganze Projekt auf einen Blick', view: <Summary /> },
      ],
    },
  ],
}

export default chapter
