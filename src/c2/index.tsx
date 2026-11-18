import type { Chapter } from '../components/types.ts'
import { VmVsContainer, OwnOs, Where, Platforms } from '../c0/diagrams.tsx'

const chapter: Chapter = {
  id: 'deep-dive', title: 'Docker im Detail', level: 'Advanced',
  blurb: 'Wie Docker unter der Haube arbeitet: Container gegen VMs, der geteilte Kernel, der Platz im Stack und der Betrieb auf Linux, macOS und Windows.',
  pages: [
    {
      id: 'container-vm', title: 'Container und VM', summary: 'VM gegen Container und der geteilte Kernel.',
      slides: [
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
  ],
}

export default chapter
