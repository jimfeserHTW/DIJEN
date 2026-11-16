import { flow, type Chapter } from '../components/types.ts'

const chapter: Chapter = {
  id: 'images', title: 'Build your own image', level: 'Intermediate',
  blurb: 'From a Dockerfile to a finished image: the instructions, how they become cached layers, and how to keep images small.',
  pages: [
    {
      id: 'from', title: 'From Dockerfile to image', summary: 'The two paths to a container, and when to pick which.',
      slides: [
        {
          title: 'Two paths to a container',
          visual: [
            flow([{ label: 'Docker Hub', sub: 'nginx' }, { label: 'Image', tone: 'sky' }, { label: 'Container', tone: 'blue' }], ['pull', 'run']),
            flow([{ label: 'Dockerfile', sub: 'FROM nginx' }, { label: 'Own image', tone: 'sky' }, { label: 'Container', tone: 'blue' }], ['build', 'run or compose up']),
          ],
        },
        {
          title: 'Pull or build?',
          visual: { kind: 'table', head: ['', 'Pull a ready image', 'Build your own'], rows: [
            ['Source', 'A registry', 'A Dockerfile in your project'],
            ['Best for', 'Standard software: NGINX, PostgreSQL', 'Your own application'],
            ['Control', 'Low: you take it as it is', 'Full: you decide every layer'],
            ['Effort', 'One command', 'Write and maintain a Dockerfile'],
          ] },
        },
      ],
    },
    {
      id: 'instructions', title: 'Dockerfile instructions', summary: 'The core instructions, grouped by purpose, and how to build and tag.',
      slides: [
        {
          title: 'Building an image with a Dockerfile',
          visual: { kind: 'code', file: 'Dockerfile', lines: [
            { text: 'FROM nginx:stable', note: 'Base image' },
            { text: '' },
            { text: 'COPY site-content /usr/share/nginx/html', note: 'Copies files or directories into the image filesystem' },
            { text: '' },
            { text: 'RUN apt-get update && apt-get upgrade -y', note: 'Runs a command in a new layer on top of the current image' },
            { text: 'RUN apt-get install -y curl htop vim' },
            { text: '' },
            { text: 'ENV GREETING=hello', note: 'Sets an environment variable' },
          ] },
        },
        {
          title: 'Instructions by purpose',
          visual: { kind: 'mindmap', root: 'Dockerfile', branches: [
            { label: 'Base', leaves: ['FROM'] },
            { label: 'Files', leaves: ['COPY, ADD', 'WORKDIR'] },
            { label: 'Build time', leaves: ['RUN', 'ARG'] },
            { label: 'Runtime settings', leaves: ['ENV, EXPOSE', 'CMD, ENTRYPOINT', 'USER, VOLUME'] },
          ] },
        },
        {
          title: 'Core instructions',
          visual: { kind: 'table', head: ['Instruction', 'Purpose', 'Creates a layer?'], rows: [
            ['`FROM`', 'Choose the base image', 'Brings the base layers'],
            ['`WORKDIR`', 'Set the working directory', 'Metadata only'],
            ['`COPY`', 'Copy files from the build context', 'Yes'],
            ['`ADD`', 'Like COPY, also unpacks archives and fetches URLs', 'Yes'],
            ['`RUN`', 'Run a command while building', 'Yes'],
            ['`ENV`', 'Set an environment variable', 'Metadata only'],
            ['`EXPOSE`', 'Document a listening port', 'Metadata only'],
            ['`CMD`', 'Default command of the container', 'Metadata only'],
            ['`ENTRYPOINT`', 'Fixed executable; CMD becomes its arguments', 'Metadata only'],
          ] },
        },
        {
          title: 'CMD or ENTRYPOINT?',
          visual: { kind: 'table', head: ['', '`CMD`', '`ENTRYPOINT`'], rows: [
            ['Purpose', 'The default command', 'The program the container is'],
            ['Overridden by', 'Arguments of `docker run`', 'Only `--entrypoint`'],
            ['Typical use', 'Start the app', 'Tools that always run the same program'],
          ] },
        },
        {
          title: 'Build and tag',
          visual: { kind: 'anatomy', rows: [[
            { text: '$ docker', label: 'CLI' }, { text: 'build', label: 'Command' }, { text: '-t my-nginx:va', label: 'Tag' },
            { text: '-t my-nginx:latest', label: 'Second tag' }, { text: '.', label: 'Build context' },
          ]] },
        },
      ],
    },
    {
      id: 'layers', title: 'Instructions and layers', summary: 'Every instruction adds a layer, and the build cache decides what is rebuilt.',
      slides: [
        {
          title: 'One instruction, one layer',
          visual: { kind: 'stack', columns: [{ layers: [
            { label: 'FROM nginx:stable', tone: 'navy', note: 'Layers 1–5' }, { label: 'COPY site-content …', tone: 'blue', note: 'Layer 6' },
            { label: 'RUN apt-get update …', tone: 'blue', note: 'Layer 7' }, { label: 'RUN apt-get install …', tone: 'blue', note: 'Layer 8' }, { label: 'ENV GREETING=hello', tone: 'blue', note: 'Layer 9' },
          ] }] },
        },
        { title: 'See the layers', visual: { kind: 'code', file: 'terminal', lines: [{ text: '$ docker history my-nginx:latest', note: 'Lists every layer and the instruction that created it' }] } },
        {
          title: 'A change rebuilds every layer above it',
          visual: { kind: 'stack', columns: [{ layers: [
            { label: 'FROM node:22-alpine', tone: 'navy', note: 'cached' }, { label: 'COPY package.json', tone: 'navy', note: 'cached' },
            { label: 'RUN npm install', tone: 'navy', note: 'cached' }, { label: 'COPY . .', tone: 'blue', note: 'changed: rebuilt' }, { label: 'CMD ["node", "server.js"]', tone: 'blue', note: 'rebuilt' },
          ] }] },
        },
        {
          title: 'Order: rare changes first',
          visual: flow([
            { label: 'Base image', sub: 'changes rarely', tone: 'navy' }, { label: 'Dependencies', sub: 'change sometimes', tone: 'sky' }, { label: 'Source code', sub: 'changes constantly', tone: 'blue' },
          ], ['then', 'then']),
        },
      ],
    },
    {
      id: 'minimize', title: 'Keep images small', summary: 'Fewer layers and smaller layers, with the techniques that achieve both.',
      slides: [
        {
          title: 'Minimize the number of layers',
          visual: { kind: 'code', file: 'Dockerfile', lines: [
            { text: 'FROM nginx:stable' },
            { text: 'COPY site-content /usr/share/nginx/html' },
            { text: 'RUN apt-get update && apt-get upgrade -y \\' },
            { text: '    && apt-get install -y \\', note: 'Fewer instructions, fewer layers' },
            { text: '       curl htop vim \\' },
            { text: '    && rm -rf /var/lib/apt/lists/*', note: 'Smaller image: clean up in the same step' },
            { text: 'ENV GREETING=hello' },
          ] },
        },
        {
          title: 'Techniques',
          visual: { kind: 'table', head: ['Technique', 'Effect', 'How'], rows: [
            ['Chain commands in one `RUN`', 'Fewer layers', '`RUN a && b && c`'],
            ['Clean up in the same `RUN`', 'Smaller layers', '`rm -rf /var/lib/apt/lists/*`'],
            ['Use a small base image', 'Much smaller image', '`alpine` or `-slim` variants'],
            ['Exclude files from the context', 'Smaller context, better cache', '`.dockerignore`'],
            ['Multi-stage build', 'Only runtime files remain', '`COPY --from=build`'],
            ['Mind the layer limit', 'Some storage drivers cap layers (AUFS: 42)', 'Keep the layer count low'],
          ] },
        },
      ],
    },
    {
      id: 'multistage', title: 'Multi-stage builds', summary: 'Build in one image, ship from another.',
      slides: [
        {
          title: 'Build in one stage, ship from another',
          visual: flow([
            { label: 'Build stage', sub: 'FROM node:22 AS build', items: ['npm ci', 'npm run build'] },
            { label: 'Final stage', sub: 'FROM nginx:stable', items: ['COPY --from=build', 'Only the built files'], tone: 'blue' },
            { label: 'Image', sub: 'Small, no build tools', tone: 'sky' },
          ], ['copies dist/', 'becomes']),
        },
        {
          title: 'A multi-stage Dockerfile',
          visual: { kind: 'code', file: 'Dockerfile', lines: [
            { text: 'FROM node:22-alpine AS build', note: 'Stage 1: build the site' },
            { text: 'WORKDIR /app' },
            { text: 'COPY package*.json ./' },
            { text: 'RUN npm ci' },
            { text: 'COPY . .' },
            { text: 'RUN npm run build' },
            { text: 'FROM nginx:stable', note: 'Stage 2: the image you ship' },
            { text: 'COPY --from=build /app/dist /usr/share/nginx/html', note: 'Take only the build output' },
          ] },
        },
      ],
    },
  ],
}

export default chapter
