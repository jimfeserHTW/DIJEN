import test from 'node:test'
import assert from 'node:assert/strict'
import { Terminal } from './components/docker/engine/cli.ts'
import { BLANK, LABS, LabRun } from './labs.ts'
import en from './locales/en.ts'

type Action = string | { file: string; text: string }
const PG = 'postgres:16-alpine', DATA = '/var/lib/postgresql/data'
const STACK = `services:\n  web:\n    image: nginx:alpine\n    ports:\n      - "8080:80"\n  cache:\n    image: redis:alpine\n  db:\n    image: ${PG}\n    environment:\n      POSTGRES_PASSWORD: secret\n    volumes:\n      - pgdata:${DATA}\nvolumes:\n  pgdata:\n`
const HEALTHY = STACK.replace('      - "8080:80"\n', '      - "8080:80"\n    depends_on:\n      db:\n        condition: service_healthy\n').replace('    volumes:\n      - pgdata', '    healthcheck:\n      test: ["CMD-SHELL", "pg_isready"]\n      interval: 1s\n    volumes:\n      - pgdata')
const FIXED = `services:\n  lb:\n    image: nginx:alpine\n    ports:\n      - "8080:80"\n    depends_on:\n      - api\n  api:\n    image: nginx:alpine\n  db:\n    image: ${PG}\n    environment:\n      POSTGRES_PASSWORD: secret\n`

// One list of actions per step: each step must stay open before its actions and complete after them.
const SOLUTIONS: Record<string, Action[][]> = {
  'first-container': [['docker run --name hallo hello-world'], ['docker ps -a'], ['docker rm hallo']],
  'first-web-server': [['docker run -d --name web -p 8080:80 nginx:alpine'], ['curl localhost:8080'], ['docker stop web'], ['docker rm web']],
  'look-inside': [['docker run -d --name shop -p 8081:80 nginx:alpine'], ['curl localhost:8081'], ['docker logs shop'], ['docker exec shop sh -c "echo Hallo > /usr/share/nginx/html/index.html"'], ['curl localhost:8081'], ['docker rm -f shop']],
  'own-image': [[{ file: 'Dockerfile', text: 'FROM nginx:alpine\nCOPY index.html /usr/share/nginx/html/index.html\nEXPOSE 80\n' }], ['docker build -t meine-seite .'], ['docker run -d --name seite -p 8080:80 meine-seite'], ['curl localhost:8080']],
  volumes: [['docker volume create notizen'], ['docker run --rm -v notizen:/data alpine sh -c "echo merken > /data/n.txt"'], ['docker run --rm -v notizen:/data alpine cat /data/n.txt']],
  network: [['docker network create appnet'], ['docker run -d --name web --network appnet nginx:alpine'], ['docker run -d --name cache --network appnet redis:alpine'], ['docker run --rm --network appnet alpine wget -qO- http://web'], ['docker network inspect appnet']],
  database: [[`docker run -d --name db -e POSTGRES_PASSWORD=x -v pgdata:${DATA} ${PG}`], ['docker exec db pg_isready'], [`docker exec db psql -U postgres -c "create table t (name text); insert into t values ('gerettet')"`], ['docker rm -f db'], [`docker run -d --name db -e POSTGRES_PASSWORD=x -v pgdata:${DATA} ${PG}`], ['docker exec db psql -U postgres -c "select * from t"']],
  'compose-stack': [[{ file: 'compose.yml', text: STACK }, 'docker compose up -d'], [{ file: 'compose.yml', text: HEALTHY }, 'docker compose up -d'], ['curl localhost:8080'], ['docker compose exec web ping -c 1 db'], ['docker compose down']],
  'broken-stack': [[{ file: 'compose.yml', text: FIXED }, 'docker compose up -d'], ['docker compose up -d --scale api=3'], ['curl localhost:8080'], ['docker compose exec lb ping -c 1 api']],
}

for (const lab of LABS) test(`lab ${lab.id} can be solved step by step`, () => {
  let now = Date.UTC(2026, 10, 18, 12)
  const term = new Terminal(lab.files ?? {}, () => now), run = new LabRun(lab.steps)
  const pass = (ms: number) => { for (let t = 0; t < ms; t += 50) { now += 50; run.printed(term.tick().map(c => c.text).join('')) } }
  const act = (a: Action) => {
    if (typeof a !== 'string') return term.write(a.file, a.text)
    run.typed(a); term.input(a)
    for (let t = 0; term.busy && t < 120000; t += 50) pass(50)
    pass(50)
  }
  lab.steps.forEach((step, i) => {
    assert.equal(run.check(term), i, `step ${i + 1} is open before its solution: ${step.label}`)
    // Servers need a moment, so a person would simply retry.
    for (let tries = 0; tries < 6 && run.step === i; tries++) { SOLUTIONS[lab.id][i].forEach(act); pass(2000); if (!term.busy) run.check(term) }
    assert.equal(run.step, i + 1, `step ${i + 1} did not complete: ${step.label}`)
  })
})

test('task wording gives less away with each level, in both languages', () => {
  const COMMAND_WORD = /\b(docker|compose|up|down|run\w*|start\w*|stop\w*|exec\w*|logs?|ps|build\w*|pull|images?|volumes?|networks?|ports?|services?|depends\w*|health\w*|curl|ping|pg_isready|scale\w*|inspect|rm|ya?ml|containers?|stacks?)\b/i
  for (const lab of LABS) {
    for (const s of lab.steps) {
      assert.ok(en[s.label], `no English text: ${s.label}`)
      const marked = s.label.includes('`') && en[s.label].includes('`')
      assert.equal(marked, lab.level === 'Beginner' || lab.level === 'Intermediate', `marking in ${lab.id}: ${s.label}`)
    }
    if (lab.level !== 'Expert') continue
    const texts = [lab.title, lab.blurb, ...lab.steps.flatMap(s => [s.label, s.hint ?? ''])]
    for (const text of texts.flatMap(x => [x, x && en[x]])) assert.doesNotMatch(text, COMMAND_WORD)
  }
})

test('the course gets harder: gaps first, then no prepared commands', () => {
  const gaps = (level: string) => LABS.filter(l => l.level === level).flatMap(l => l.steps).filter(s => s.cmd?.includes(BLANK)).length
  assert.ok(gaps('Beginner') > 0 && gaps('Intermediate') > 0)
  assert.equal(gaps('Advanced') + gaps('Expert'), 0)
  assert.ok(Math.max(...LABS.map(l => l.containers)) >= 5)
})
