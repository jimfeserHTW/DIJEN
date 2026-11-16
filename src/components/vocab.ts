// One name and one colour per component, on every slide. Diagrams reference parts by key so wording never drifts.
export type PartTone = 'hw' | 'kernel' | 'guest' | 'hyper' | 'engine' | 'host' | 'runtime' | 'libs' | 'app'

export const parts = {
  hardware: { label: 'Hardware', tone: 'hw' },
  kernel: { label: 'Host-Kernel', tone: 'kernel', sub: 'Linux' },
  guestKernel: { label: 'Gast-Kernel', tone: 'guest' },
  hypervisor: { label: 'Hypervisor', tone: 'hyper', sub: 'vermittelt Hardware an VMs' },
  engine: { label: 'Container Engine', tone: 'engine' },
  hostApps: { label: 'Host-Programme', tone: 'host' },
  runtime: { label: 'Laufzeitumgebung', tone: 'runtime' },
  libs: { label: 'Bibliotheken', tone: 'libs' },
  app: { label: 'App', tone: 'app' },
} satisfies Record<string, { label: string; tone: PartTone; sub?: string }>

export type Part = keyof typeof parts

/** The isolated unit, named the same everywhere. */
export const units = { container: 'Container', vm: 'VM', image: 'Image', proc: 'Anwendung' } as const
