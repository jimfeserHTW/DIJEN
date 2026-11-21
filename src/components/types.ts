// Shared shapes for all chapters. Chapter content lives in src/cN/.
import type { ReactNode } from 'react'

// Goal: a checkable lab step.
export type Goal<T> = { label: string; test: (x: T) => boolean }

// Building blocks. Each builds itself in reading order. In table cells, `code` is rendered as code.
export type Tone = 'plain' | 'blue' | 'navy' | 'sky' | 'muted' | 'warn'
export type NodeD = { label: string; sub?: string; items?: string[]; tone?: Tone }
export type Visual =
  | { kind: 'flow'; dir?: 'row' | 'col'; nodes: NodeD[]; links?: string[] }
  | { kind: 'tree'; root: NodeD; link?: string; children: NodeD[] }
  | { kind: 'stack'; columns: { title?: string; layers: { label: string; tone?: Tone; note?: string }[] }[] }
  | { kind: 'anatomy'; rows: { text: string; label: string }[][] }
  | { kind: 'code'; file?: string; lines: { text: string; note?: string }[] }
  | { kind: 'cards'; items: { title: string; text: string }[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'mindmap'; root: string; branches: { label: string; leaves: string[] }[] }
  | { kind: 'matrix'; head: string[]; rows: string[][]; legend?: string } // cells '0'..'4' become Harvey balls
  | { kind: 'bars'; legend: [string, string]; rows: { label: string; a: number; b: number }[] } // relative size, 0..100

/** A slide shows generic visuals, or its own chapter-specific diagram (`view`). */
export type Slide = { title: string; visual?: Visual | Visual[]; view?: ReactNode }
export type Page = { id: string; title: string; summary: string; slides: Slide[] }
export type Chapter = { id: string; title: string; level: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert'; blurb: string; pages: Page[] }

export const flow = (nodes: NodeD[], links: string[] = []): Visual => ({ kind: 'flow', nodes, links })
