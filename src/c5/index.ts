import { flow, type Chapter } from '../components/types.ts'

const chapter: Chapter = {
  id: 'beyond', title: 'Beyond Docker', level: 'Intermediate',
  blurb: 'A look over the edge: the tools that run containers on many machines and automate everything around them.',
  pages: [
    {
      id: 'edge', title: 'Looking over the edge', summary: 'Orchestration, automation, storage and networking around Docker.',
      slides: [
        {
          title: 'Beyond a single host',
          visual: { kind: 'mindmap', root: 'Beyond Docker', branches: [
            { label: 'Orchestration', leaves: ['Kubernetes', 'OpenShift'] },
            { label: 'Automation', leaves: ['Ansible', 'Terraform', 'Vagrant'] },
            { label: 'Storage', leaves: ['Cinder', 'GlusterFS'] },
            { label: 'Networking', leaves: ['Network virtualization'] },
          ] },
        },
        {
          title: 'Which tool solves what',
          visual: { kind: 'table', head: ['Tool', 'Solves', 'Idea'], rows: [
            ['Kubernetes', 'Running many containers on many machines', 'Declare the desired state, it keeps it true'],
            ['OpenShift', 'Kubernetes for enterprises', 'Kubernetes plus tooling and security from Red Hat'],
            ['Ansible', 'Configuring servers and deployments', 'Describe steps in YAML, run them over SSH'],
            ['Terraform', 'Creating infrastructure', 'Describe cloud resources as code'],
            ['Vagrant', 'Reproducible development machines', 'One file defines a VM'],
            ['Cinder', 'Block storage for clouds', 'Volumes for VMs in OpenStack'],
            ['GlusterFS', 'Shared storage across machines', 'A distributed file system'],
          ] },
        },
        {
          title: 'From Dockerfile to cluster',
          visual: flow([
            { label: 'Dockerfile' }, { label: 'Image', tone: 'sky' }, { label: 'Registry' }, { label: 'Kubernetes', sub: 'The orchestrator', tone: 'blue' }, { label: 'Nodes', sub: 'Machines in the cluster', tone: 'navy' },
          ], ['build', 'push', 'pulled by', 'schedules on']),
        },
      ],
    },
  ],
}

export default chapter
