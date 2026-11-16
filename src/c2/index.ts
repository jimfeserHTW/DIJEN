import { flow, type Chapter } from '../components/types.ts'

const chapter: Chapter = {
  id: 'web', title: 'Web servers', level: 'Beginner',
  blurb: 'Why files need a web server, how it differs from an application server, and how to serve a site from NGINX in a container.',
  pages: [
    {
      id: 'http', title: 'Why a web server', summary: 'Local files versus HTTP, and what a request and a response contain.',
      slides: [
        {
          title: 'Why do we need a web server?',
          visual: flow([{ label: 'Browser' }, { label: 'Web server', tone: 'blue' }, { label: 'Static content', sub: 'HTML, CSS, JS' }], ['HTTP over the network', 'reads files']),
        },
        {
          title: 'Local file or web server',
          visual: { kind: 'table', head: ['', 'Open the file locally', 'Serve it with a web server'], rows: [
            ['Address', '`file:///…/index.html`', '`http://host:8080/`'],
            ['Reachable by others', 'No', 'Yes, over the network'],
            ['Needs a running process', 'No', 'Yes'],
            ['Features', 'None', 'Routing, caching, compression, TLS'],
          ] },
        },
        {
          title: 'Anatomy of an HTTP exchange',
          visual: { kind: 'table', head: ['Part', 'Request', 'Response'], rows: [
            ['Start line', '`GET /index.html HTTP/1.1`', '`HTTP/1.1 200 OK`'],
            ['Headers', '`Host`, `Accept`', '`Content-Type`, `Content-Length`'],
            ['Body', 'Empty', 'The HTML file'],
          ] },
        },
      ],
    },
    {
      id: 'servers', title: 'Web server and application server', summary: 'Two roles that are often confused, and how a request travels through both.',
      slides: [
        {
          title: 'Web server or application server',
          visual: { kind: 'table', head: ['', 'Web server', 'Application server'], rows: [
            ['Serves', 'Static files: HTML, CSS, JS', 'Dynamic content from application logic'],
            ['Runs', 'Almost none of your code', 'Your application code, for example Java'],
            ['Examples', 'NGINX, Apache httpd', 'WildFly, Quarkus'],
            ['Scaling', 'Cheap', 'Needs care: sessions and state'],
          ] },
        },
        {
          title: 'A typical request path',
          visual: flow([
            { label: 'Browser' }, { label: 'NGINX', sub: 'Serves static files, forwards the rest', tone: 'blue' },
            { label: 'App server', sub: 'Runs the business logic', tone: 'sky' }, { label: 'Database', sub: 'Stores the data' },
          ], ['HTTP', 'proxies', 'queries']),
        },
      ],
    },
    {
      id: 'vue', title: 'Static content from Vue', summary: 'Where static files come from and why a dev server is not for production.',
      slides: [
        {
          title: 'From source to static content',
          visual: flow([
            { label: 'Vue project', sub: 'Components, .vue files' }, { label: 'Static content', sub: 'HTML, CSS, JS in dist/', tone: 'sky' }, { label: 'Web server', sub: 'NGINX', tone: 'blue' },
          ], ['npm run build', 'served by']),
        },
        {
          title: 'Dev server or build',
          visual: { kind: 'table', head: ['', '`npm run dev`', '`npm run build`'], rows: [
            ['Output', 'Modules served from memory', 'Static files in `dist/`'],
            ['Served by', 'Vite dev server (Node.js)', 'Any web server, for example NGINX'],
            ['Reload', 'Instant hot reload', 'None'],
            ['Use for', 'Developing', 'Shipping'],
          ] },
        },
        {
          title: 'The four commands',
          visual: { kind: 'code', file: 'terminal', lines: [
            { text: '$ npm init vue@latest', note: 'Create a Vue project' },
            { text: '$ npm install', note: 'Install the dependencies' },
            { text: '$ npm run build', note: 'Build static HTML, CSS and JS' },
            { text: '$ npm run dev', note: 'Start the Node.js development web server' },
          ] },
        },
      ],
    },
    {
      id: 'nginx', title: 'NGINX in a container', summary: 'Pull NGINX, publish a port and mount your own site into it.',
      slides: [
        { title: 'NGINX from Docker Hub', visual: flow([{ label: 'Docker Hub', sub: 'nginx' }, { label: 'Image', tone: 'sky' }, { label: 'Container', tone: 'blue' }], ['pull', 'run']) },
        {
          title: 'How the port reaches NGINX',
          visual: flow([
            { label: 'Browser', sub: 'http://localhost:8080' }, { label: 'Docker host', sub: 'Forwards 8080 to 80', tone: 'sky' }, { label: 'Container', sub: 'NGINX listens on port 80', tone: 'blue' },
          ], ['request', 'forwards']),
        },
        {
          title: 'Bring your own files',
          visual: flow([
            { label: 'Filesystem', sub: '~/site-content', items: ['HTML, CSS, JS'] }, { label: 'Container', sub: '/usr/share/nginx/html', tone: 'blue' },
          ], ['bind mount']),
        },
        {
          title: 'The command, line by line',
          visual: { kind: 'code', file: 'terminal', lines: [
            { text: 'docker run -it -p 8080:80 \\', note: 'Reach the site on localhost:8080' },
            { text: '  -v ~/site-content:/usr/share/nginx/html \\', note: 'Mount your folder as the web root' },
            { text: '  nginx:stable', note: 'The image to start' },
          ] },
        },
      ],
    },
  ],
}

export default chapter
