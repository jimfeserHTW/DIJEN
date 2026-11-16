import type { Chapter } from '../components/types.ts'
import { Problem, Idea, Anatomy, Ports, Variables, Networks, Volumes, StartOrder, Everyday, Merge, Pitfalls, Summary } from './diagrams.tsx'

// Plan chapter 2: declarative first. One example (WordPress plus MySQL) built up step by step.
const chapter: Chapter = {
  id: 'compose', title: 'Docker Compose', level: 'Beginner',
  blurb: 'Eine Datei beschreibt die ganze Umgebung. Services, Ports, Variablen, Netzwerk und Volumes am Beispiel Web-App plus Datenbank.',
  pages: [
    {
      id: 'idee', title: 'Problem und Idee', summary: 'Von vielen Befehlen zu einer Datei.',
      slides: [
        { title: 'Lernpfad: Wo stehen wir?', visual: { kind: 'path', active: 1, advanced: 5, stops: ['Docker verstehen', 'Compose', 'Images & Container', 'Dockerfile & Layers', 'Netzwerke & Volumes', 'Isolation', 'Sicherheit & mehr'] } },
        { title: 'Das Problem: Mehrere Container von Hand', view: <Problem /> },
        { title: 'Die Idee: Die Umgebung als Datei beschreiben', view: <Idea /> },
      ],
    },
    {
      id: 'datei', title: 'Datei, Ports, Netzwerke', summary: 'Aufbau der Datei, der Weg von außen und der Weg zwischen Containern.',
      slides: [
        { title: 'Die Compose-Datei', view: <Anatomy /> },
        { title: 'Ports: von außen in den Container', view: <Ports /> },
        { title: 'Netzwerke: Services finden sich über Namen', view: <Networks /> },
      ],
    },
    {
      id: 'betrieb', title: 'Variablen, Daten, Start', summary: 'Woher Werte kommen, wo Daten liegen, wer zuerst startet.',
      slides: [
        { title: 'Variablen: woher sie kommen, wo sie landen', view: <Variables /> },
        { title: 'Volumes: Daten überleben den Container', view: <Volumes /> },
        { title: 'Startreihenfolge: gestartet ist nicht bereit', view: <StartOrder /> },
      ],
    },
    {
      id: 'alltag', title: 'Alltag und Stolpersteine', summary: 'Die Befehle, getrennte Konfiguration und typische Fehler.',
      slides: [
        { title: 'Der Alltag mit Compose', view: <Everyday /> },
        { title: 'Konfiguration trennen', view: <Merge /> },
        { title: 'Typische Stolpersteine', view: <Pitfalls /> },
        { title: 'Compose im Überblick', view: <Summary /> },
      ],
    },
  ],
}

export default chapter
