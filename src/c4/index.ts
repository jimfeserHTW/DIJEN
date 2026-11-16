import type { Chapter } from '../components/types.ts'

const chapter: Chapter = {
  id: 'operate', title: 'Operate', level: 'Intermediate',
  blurb: 'Find out what a running container is doing, and run several services together with Docker Compose.',
  pages: [
    {
      id: 'debug', title: 'Debug a container', summary: 'The commands to look inside, and which one to reach for.',
      slides: [
        {
          title: 'Debugging an application in a container',
          visual: { kind: 'anatomy', rows: [
            [{ text: '$ docker', label: 'CLI' }, { text: 'top', label: 'Command' }, { text: 'nginx-va-1', label: 'Container name' }],
            [{ text: '$ docker', label: 'CLI' }, { text: 'logs', label: 'Command' }, { text: '--follow', label: 'Mode' }, { text: 'nginx-va-1', label: 'Container name' }],
            [{ text: '$ docker', label: 'CLI' }, { text: 'exec', label: 'Command' }, { text: '-it', label: 'Mode' }, { text: 'nginx-va-1', label: 'Container name' }, { text: '/bin/bash', label: 'Command to run inside' }],
          ] },
        },
        {
          title: 'Which command when',
          visual: { kind: 'table', head: ['Question', 'Command', 'Shows'], rows: [
            ['Is it running?', '`docker ps -a`', 'State of all containers'],
            ['What did it print?', '`docker logs --follow NAME`', 'Live output'],
            ['What runs inside?', '`docker top NAME`', 'Its processes'],
            ['Let me look around', '`docker exec -it NAME /bin/bash`', 'A shell inside'],
            ['What is its configuration?', '`docker inspect NAME`', 'Full details as JSON'],
            ['How much does it use?', '`docker stats`', 'Live CPU and memory'],
            ['How is Docker set up?', '`docker info`', 'Host-wide settings'],
          ] },
        },
        {
          title: 'Where is the problem?',
          visual: { kind: 'tree', root: { label: 'Something is wrong', tone: 'blue' }, link: 'ask', children: [
            { label: 'Container exited', items: ['docker ps -a', 'docker logs NAME'] },
            { label: 'Running but misbehaving', items: ['docker logs --follow', 'docker top'] },
            { label: 'Need to look inside', items: ['docker exec -it … /bin/bash'] },
          ] },
        },
      ],
    },
    {
      id: 'compose', title: 'Docker Compose', summary: 'One file for several services, its keys and its commands.',
      slides: [
        {
          title: 'Docker Compose starts multiple services',
          visual: { kind: 'code', file: 'docker-compose.yml', lines: [
            { text: 'services:' },
            { text: '  nginx_primary:' },
            { text: '    image: nginx:stable', note: 'Image to use' },
            { text: '    ports:' },
            { text: '      - "8080:80"', note: 'Port mapping' },
            { text: '    environment:' },
            { text: '      - NGINX_PORT=80', note: 'Environment variable' },
            { text: '  nginx_secondary:' },
            { text: '    image: nginx:stable' },
            { text: '    ports:' },
            { text: '      - "8081:80"' },
          ] },
        },
        {
          title: 'One command for the whole environment',
          visual: { kind: 'tree', root: { label: 'docker-compose.yml', tone: 'sky' }, link: 'docker compose up', children: [
            { label: 'nginx_primary', sub: 'localhost:8080', tone: 'blue' }, { label: 'nginx_secondary', sub: 'localhost:8081', tone: 'blue' },
          ] },
        },
        {
          title: 'Keys of a service',
          visual: { kind: 'table', head: ['Key', 'Meaning', 'Example'], rows: [
            ['`image`', 'Image to start', '`image: nginx:stable`'],
            ['`build`', 'Build from a Dockerfile', '`build: .`'],
            ['`ports`', 'Publish ports, host:container', '`"8080:80"`'],
            ['`environment`', 'Environment variables', '`NGINX_PORT=80`'],
            ['`volumes`', 'Mount data or folders', '`pgdata:/var/lib/postgresql/data`'],
            ['`depends_on`', 'Start order', '`depends_on: [db]`'],
          ] },
        },
        {
          title: 'Everyday commands',
          visual: { kind: 'table', head: ['Command', 'Effect'], rows: [
            ['`docker compose up -d`', 'Create and start everything in the background'],
            ['`docker compose ps`', 'Show the state of the services'],
            ['`docker compose logs -f web`', 'Follow the logs of one service'],
            ['`docker compose down`', 'Stop and remove containers and the network'],
            ['`docker compose down -v`', 'Also remove the named volumes'],
            ['`docker-compose …`', 'The older standalone command from the lecture. Same file format'],
          ] },
        },
      ],
    },
    {
      id: 'compose-data', title: 'Networks and data in Compose', summary: 'How services find each other, and where their data lives.',
      slides: [
        {
          title: 'Services share a network',
          visual: { kind: 'tree', root: { label: 'Network demo_default', sub: 'Created by Compose', tone: 'sky' }, link: 'connects', children: [
            { label: 'web', sub: 'Reaches the database at host "db"', tone: 'blue' }, { label: 'db', sub: 'postgres:16', tone: 'blue' },
          ] },
        },
        {
          title: 'A database with a volume',
          visual: { kind: 'code', file: 'docker-compose.yml', lines: [
            { text: 'services:' },
            { text: '  web:' },
            { text: '    build: .' },
            { text: '    ports: ["8080:3000"]' },
            { text: '    depends_on: [db]', note: 'Start the database first' },
            { text: '  db:' },
            { text: '    image: postgres:16' },
            { text: '    volumes:' },
            { text: '      - pgdata:/var/lib/postgresql/data', note: 'Data survives docker compose down' },
            { text: 'volumes:' },
            { text: '  pgdata:', note: 'Declare the named volume' },
          ] },
        },
        {
          title: 'Where does data live?',
          visual: { kind: 'table', head: ['Option', 'Survives removing the container?', 'Typical use'], rows: [
            ['Container layer', 'No', 'Temporary files'],
            ['Named volume', 'Yes', 'Databases'],
            ['Bind mount', 'Yes, it is a folder on the host', 'Source code during development'],
            ['`tmpfs`', 'No, memory only', 'Secrets and caches'],
          ] },
        },
      ],
    },
  ],
}

export default chapter
