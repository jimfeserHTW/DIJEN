import test from 'node:test'
import assert from 'node:assert/strict'
import { initial, run } from './docker.ts'
import { build, runImage } from './dockerfile.ts'
import { compose } from './compose.ts'

test('docker: run nginx detached, port clash, rm needs stop', () => {
  const s = initial()
  assert.match(run(s, 'docker run -d --name web -p 8080:80 nginx'), /Downloaded newer image/)
  assert.match(run(s, 'docker ps'), /web/)
  assert.match(run(s, 'docker run -d -p 8080:80 nginx'), /port is already allocated/)
  assert.match(run(s, 'docker rm web'), /stop the container/)
  run(s, 'docker stop web'); run(s, 'docker rm web')
  assert.equal(s.containers.length, 0)
  assert.match(run(s, 'docker run alpine echo hi'), /hi$/)
})

test('dockerfile: errors and cache warning', () => {
  assert.match(build('RUN ls').out, /must be FROM/)
  assert.match(build('FROM node\nFOO bar').out, /unknown instruction: FOO/)
  assert.match(build('FROM node:22\nCOPY nope.txt .').out, /not found/)
  const ok = build('FROM node:22\nCOPY . .\nRUN npm install\nEXPOSE 3000\nCMD ["node","server.js"]')
  assert.ok(ok.ok && ok.warnings.length === 1)
  assert.match(runImage(ok.ins), /listening on http:\/\/0.0.0.0:3000/)
})

test('compose: validation, order, volumes', () => {
  assert.match(compose('services: {}', 'up', false).out, /no service/)
  assert.match(compose('services:\n  a:\n    ports: ["1:1"]', 'up', false).out, /neither an image/)
  const y = 'services:\n  web:\n    build: .\n    depends_on: [db]\n  db:\n    image: postgres\n    volumes:\n      - data:/var/lib/postgresql/data\nvolumes:\n  data:\n'
  const r = compose(y, 'up', false)
  assert.ok(r.running && r.out.indexOf('demo-db-1') < r.out.indexOf('demo-web-1'))
  assert.match(compose(y.replace('volumes:\n  data:\n', ''), 'up', false).out, /undefined volume data/)
})
