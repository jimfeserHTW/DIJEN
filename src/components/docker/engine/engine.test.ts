import test from 'node:test'
import assert from 'node:assert/strict'
import { Terminal, mergeChunks, type Chunk } from './cli.ts'

const FILES = {
  'index.html': '<h1>Hallo</h1>\n',
  Dockerfile: 'FROM nginx:alpine\nCOPY index.html /usr/share/nginx/html/index.html\n',
  'compose.yml': 'services:\n  web:\n    build: .\n    ports:\n      - "8080:80"\n',
}
function setup(files: Record<string, string> = FILES) {
  let now = Date.UTC(2026, 10, 18, 12)
  const term = new Terminal(files, () => now)
  /** Type a line, let up to `ms` of time pass, return the printed text. */
  const text = (l: Chunk[]) => l.map(c => c.text).join('')
  const sh = (line: string, ms = 60000) => {
    term.input(line)
    let out: Chunk[] = []
    for (let t = 0; t <= ms; t += 50) {
      out = mergeChunks(out, term.tick())
      if (!term.busy) break
      now += 50
    }
    return text(mergeChunks(out, term.tick()))
  }
  return { term, sh, pass: (ms: number) => { now += ms; return text(term.tick()) } }
}

test('compose up builds, serves index.html, logs every request', () => {
  const { sh } = setup()
  assert.match(sh('docker compose up -d'), /Container sandbox-web-1 +Started/)
  assert.match(sh('docker compose ps'), /sandbox-web-1.*Up .*0\.0\.0\.0:8080->80\/tcp/)
  assert.equal(sh('curl -s localhost:8080'), '<h1>Hallo</h1>\n')
  assert.match(sh('curl -s -o /dev/null -w "%{http_code}" localhost:8080/nope'), /404/)
  const logs = sh('docker compose logs')
  assert.match(logs, /web-1 +\| .*Configuration complete; ready for start up/)
  assert.match(logs, /"GET \/ HTTP\/1\.1" 200 15/)
  assert.match(logs, /"GET \/nope HTTP\/1\.1" 404/)
  assert.match(logs, /No such file or directory/)
  assert.match(sh('docker compose down'), /Network sandbox_default +Removed/)
  assert.match(sh('curl -s -S localhost:8080'), /Couldn't connect/)
})

test('COPY is a snapshot, a bind mount is live, and the layer cache notices changes', () => {
  const { sh, term } = setup()
  assert.doesNotMatch(sh('docker build -t a .'), /CACHED/)
  assert.match(sh('docker build -t a .'), /CACHED \[2\/2\] COPY/)
  sh('docker run -d --name copy -p 8081:80 a')
  sh('docker run -d --name bind -p 8082:80 -v ./index.html:/usr/share/nginx/html/index.html:ro nginx:alpine')
  term.write('index.html', 'neu\n')
  assert.equal(sh('curl -s localhost:8081'), '<h1>Hallo</h1>\n')
  assert.equal(sh('curl -s localhost:8082'), 'neu\n')
  assert.doesNotMatch(sh('docker build -t a .'), /CACHED \[2\/2\]/)
  assert.match(sh('docker exec bind sh -c "echo x > /usr/share/nginx/html/index.html"'), /Read-only file system/)
})

test('docker logs: streams, order, timestamps, tail, since, follow', () => {
  const { sh, pass, term } = setup()
  sh(`docker run -d --name tt alpine sh -c 'i=0; while [ $i -lt 5 ]; do echo out$i; echo err$i >&2; i=$((i+1)); sleep 1; done'`)
  pass(2500)
  assert.equal(sh('docker logs tt 2>/dev/null'), 'out0\nout1\nout2\n')
  assert.equal(sh('docker logs tt 2>&1 >/dev/null'), 'err0\nerr1\nerr2\n')
  assert.equal(sh('docker logs --tail 1 tt 2>&1'), 'err2\n') // --tail counts both streams together
  assert.match(sh('docker logs -t -n 2 tt 2>/dev/null'), /^2026-11-18T12:00:02\.\d{9}Z out2\n$/)
  assert.equal(sh('docker logs --since 1s tt 2>/dev/null'), 'out2\n')
  assert.equal(sh('docker logs -f tt 2>/dev/null'), 'out0\nout1\nout2\nout3\nout4\n')
  assert.match(sh('docker ps -a'), /Exited \(0\)/)
  term.input('docker logs -f nope')
  assert.match(term.tick().map(c => c.text).join(''), /No such container: nope/)
})

test('foreground up streams logs and Ctrl+C stops the project', () => {
  const { sh, term, pass } = setup()
  term.input('docker compose up')
  let started = ""; for (let i = 0; i < 60; i++) started += pass(100)
  assert.ok(term.busy)
  assert.match(started, /Attaching to web-1/)
  assert.match(started, /web-1 +\| .*Configuration complete; ready for start up/)
  sh('curl -s localhost:8080') // ignored: the terminal is blocked by the foreground command
  term.interrupt()
  const stopped = pass(200) + pass(200)
  assert.match(stopped, /Gracefully stopping/)
  assert.match(stopped, /web-1 exited with code 0/)
  assert.equal(term.busy, false)
  assert.match(sh('docker compose ps -a'), /Exited \(0\)/)
})

test('engine errors match Docker', () => {
  const { sh } = setup()
  assert.match(sh('docker run nosuchimage'), /pull access denied for nosuchimage/)
  assert.match(sh('docker run nginx:nope'), /manifest for nginx:nope not found/)
  assert.match(sh('docker run --nope alpine'), /unknown flag: --nope/)
  assert.match(sh('docker run alpine nosuchcmd'), /executable file not found in \$PATH/)
  assert.equal(sh('docker run alpine nosuchcmd; echo $?').trim().split('\n').pop(), '127')
  assert.match(sh('docker stop ghost'), /No such container: ghost/)
  assert.match(sh('docker run --name x alpine'), /Invalid container name/)
  sh('docker run -d --name one -p 80:80 nginx')
  assert.match(sh('docker run -d --name two -p 80:80 nginx'), /port is already allocated/)
  assert.match(sh('docker run -d --name one nginx'), /already in use/)
  assert.match(sh('docker rm one'), /stop the container before removing/)
  assert.match(sh('docker rmi nginx'), /must force/)
  assert.match(sh('docker exec one nosuch'), /executable file not found/)
  assert.match(sh('docker frob'), /not a docker command/)
})

test('Dockerfile errors point at the line', () => {
  const b = (df: string) => setup({ ...FILES, Dockerfile: df }).sh('docker build .')
  assert.match(b('RUN ls'), /no build stage in current context/)
  assert.match(b('FROM alpine\nFOO bar'), /Dockerfile:2[\s\S]*>>> +2 \| FOO bar[\s\S]*unknown instruction: FOO/)
  assert.match(b('FROM alpine\nCOPY nope /x'), /"\/nope": not found/)
  assert.match(b('FROM alpine\nRUN nosuch'), /nosuch: not found[\s\S]*did not complete successfully: exit code: 127/)
  assert.match(b('FROM nosuchbase'), /failed to resolve source metadata/)
  assert.match(setup({ ...FILES, Dockerfile: '' }).sh('docker build .'), /cannot be empty/)
})

test('Dockerfile features: multi-stage, ARG, ENV, CMD forms, permissions', () => {
  const { sh } = setup({ ...FILES, 'run.sh': '#!/bin/sh\necho "hi $WHO from $(pwd)"\n', Dockerfile: 'ARG V=3.20\nFROM alpine:$V AS base\nWORKDIR /app\nCOPY run.sh .\nRUN echo built > /app/stamp\nFROM alpine\nENV WHO=world\nWORKDIR /srv\nCOPY --from=base /app/ ./\nCMD ["./run.sh"]\n' })
  sh('docker build -t m .')
  assert.match(sh('docker run --rm m'), /permission denied/)
  const { sh: ok } = setup({ ...FILES, 'run.sh': '#!/bin/sh\necho "hi $WHO from $(pwd)"\n', Dockerfile: 'FROM alpine\nENV WHO=world\nWORKDIR /srv\nCOPY --chmod=755 run.sh .\nCMD ./run.sh\n' })
  ok('docker build -t m .')
  assert.equal(ok('docker run --rm m'), 'hi world from /srv\n')
  assert.equal(ok('docker run --rm -e WHO=you m'), 'hi you from /srv\n')
  assert.equal(ok('docker run --rm m echo over'), 'over\n')
})

test('compose validation errors', () => {
  const c = (y: string, cmd = 'docker compose up -d') => setup({ ...FILES, 'compose.yml': y }).sh(cmd)
  assert.match(c('services:\n  a:\n   image: [x\n'), /yaml:/)
  assert.match(c('services:\n  a:\n    imgae: x\n'), /services\.a additional properties 'imgae' not allowed/)
  assert.match(c('services:\n  a:\n    ports: []\n'), /neither an image nor a build context/)
  assert.match(c('services:\n  a:\n    image: alpine\n    depends_on: [b]\n'), /depends on undefined service "b"/)
  assert.match(c('services:\n  a:\n    image: alpine\n    depends_on: [b]\n  b:\n    image: alpine\n    depends_on: [a]\n'), /dependency cycle detected: a -> b -> a/)
  assert.match(c('services:\n  a:\n    image: alpine\n    volumes: [d:/x]\n'), /undefined volume d/)
  assert.match(c('services:\n  a:\n    image: alpine\n    networks: [n]\n'), /undefined network n/)
  assert.match(c('services:\n  a:\n    image: alpine\n    restart: sometimes\n'), /invalid restart policy/)
  assert.match(c('services:\n  a:\n    image: ${X:?need X}\n'), /required variable X is missing a value: need X/)
  assert.match(setup({ 'index.html': '' }).sh('docker compose up'), /no configuration file provided/)
})

test('compose: order, health, DNS, volumes, variables, recreate', () => {
  const y = 'name: shop\nservices:\n  api:\n    image: nginx:alpine\n    depends_on:\n      db:\n        condition: service_healthy\n    environment:\n      TAG: ${TAG:-dev}\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: secret\n    volumes:\n      - data:/var/lib/postgresql/data\n    healthcheck:\n      test: ["CMD", "pg_isready"]\n      interval: 5s\nvolumes:\n  data:\n'
  const { sh, term } = setup({ ...FILES, 'compose.yml': y })
  const up = sh('docker compose up -d')
  assert.ok(up.indexOf('shop-db-1') < up.indexOf('shop-api-1'))
  assert.match(up, /shop-db-1 +Healthy/)
  assert.match(sh('docker compose exec api printenv TAG'), /dev/)
  assert.match(sh('docker compose exec api ping -c 1 db'), /64 bytes from 172\.18\.0\.\d+/)
  sh('docker compose exec db sh -c "echo keep > /var/lib/postgresql/data/f"')
  assert.match(sh('docker compose up -d'), /shop-api-1 +Running/)
  term.write('compose.yml', y.replace('${TAG:-dev}', 'v2'))
  const again = sh('docker compose up -d')
  assert.match(again, /shop-api-1 +Recreated/)
  assert.match(again, /shop-db-1 +Running/)
  sh('docker compose down')
  assert.match(sh('docker volume ls'), /shop_data/)
  sh('docker compose up -d')
  assert.match(sh('docker compose exec db cat /var/lib/postgresql/data/f'), /keep/)
  sh('docker compose down -v')
  assert.doesNotMatch(sh('docker volume ls'), /shop_data/)
})

test('failed dependency and unhealthy service stop compose up', () => {
  const y = 'services:\n  a:\n    image: alpine\n    command: sh -c "exit 3"\n  b:\n    image: alpine\n    depends_on:\n      a:\n        condition: service_completed_successfully\n'
  assert.match(setup({ ...FILES, 'compose.yml': y }).sh('docker compose up -d'), /didn't complete successfully: exit 3/)
  const z = 'services:\n  a:\n    image: nginx\n    healthcheck:\n      test: exit 1\n      interval: 1s\n      retries: 2\n  b:\n    image: alpine\n    depends_on:\n      a:\n        condition: service_healthy\n'
  assert.match(setup({ ...FILES, 'compose.yml': z }).sh('docker compose up -d'), /sandbox-a-1 is unhealthy/)
})

test('process model: stop signals, restart policies, networks, sessions', () => {
  const { sh, pass, term } = setup()
  sh('docker run -d --name sl alpine sleep 1000')
  sh('docker stop sl')
  assert.match(sh('docker ps -a --filter name=sl'), /Exited \(137\)/)
  sh(`docker run -d --name tr alpine sh -c 'trap "echo bye; exit 0" TERM; while true; do sleep 1; done'`)
  sh('docker stop tr')
  assert.equal(sh('docker logs tr'), 'bye\n')
  assert.match(sh('docker inspect -f "{{.State.ExitCode}}" tr'), /^0/)
  sh('docker run -d --name crash --restart on-failure:2 alpine sh -c "echo boom; exit 1"')
  pass(5000)
  assert.equal(sh('docker logs crash'), 'boom\nboom\nboom\n')
  assert.match(sh('docker inspect -f "{{.RestartCount}}" crash'), /^2/)
  sh('docker network create nn && docker run -d --name ww --network nn nginx && docker run -d --name oo nginx')
  assert.match(sh('docker run --rm --network nn alpine wget -qO- http://ww'), /Welcome to nginx/)
  assert.match(sh('docker run --rm alpine wget -qO- http://oo'), /bad address/)
  sh('docker rm -f $(docker ps -aq)')
  assert.equal(sh('docker ps -aq'), '')
  sh('docker run -d --name box nginx')
  term.input('docker exec -it box sh'); pass(100)
  assert.equal(term.prompt, '/ # ')
  assert.match(sh('cd /etc && pwd'), /\/etc/)
  assert.equal(term.prompt, '/etc # ')
  sh('exit'); pass(100); term.tick(); pass(100)
  assert.equal(term.prompt, '$ ')
  assert.equal(term.busy, false)
})

test('commands take realistic time instead of answering instantly', () => {
  let now = Date.UTC(2026, 10, 18, 12)
  const term = new Terminal(FILES, () => now)
  const run = (line: string) => { term.input(line); const t0 = now; let out = ''; while (term.busy && now - t0 < 120000) { now += 50; out += term.tick().map(c => c.text).join('') } return { ms: now - t0, out: out + term.tick().map(c => c.text).join('') } }
  const pull = run('docker pull postgres:16')
  assert.ok(pull.ms > 2000, `pulling a 450 MB image took ${pull.ms}ms`)
  assert.equal(run('docker pull postgres:16').ms < 1000, true, 'a cached pull only checks the registry')
  const compose = 'services:\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: secret\n    healthcheck:\n      test: ["CMD-SHELL","pg_isready"]\n      interval: 2s\n  api:\n    image: nginx\n    depends_on:\n      db:\n        condition: service_healthy\n  cache:\n    image: redis\n'
  term.write('compose.yml', compose)
  const up = run('docker compose up -d')
  assert.ok(up.ms >= 2000, `waiting for the healthcheck took ${up.ms}ms`)
  assert.match(up.out, /Container sandbox-db-1 +Healthy[\s\S]*Container sandbox-api-1 +Started/)
  assert.equal(run('docker ps -q').out.trim().split('\n').length, 3, 'three containers run side by side')
  const down = run('docker compose down')
  assert.ok(down.ms > 100 && down.ms < 5000, `parallel stop took ${down.ms}ms`)
  assert.equal(run('docker ps -aq').out.trim(), '')
})

test('stop waits for the grace period of a process that ignores SIGTERM', () => {
  let now = Date.UTC(2026, 10, 18, 12)
  const term = new Terminal(FILES, () => now)
  const run = (line: string) => { term.input(line); const t0 = now; while (term.busy && now - t0 < 120000) { now += 50; term.tick() } return now - t0 }
  run('docker run -d --name stubborn alpine sleep 1000')
  const ms = run('docker stop -t 3 stubborn')
  assert.ok(ms >= 3000 && ms < 3500, `PID 1 without a handler only dies at the SIGKILL deadline, took ${ms}ms`)
})

/** A terminal with a controllable clock; `run` waits for the prompt like a person would. */
function lab(files: Record<string, string> = FILES) {
  let now = Date.UTC(2026, 10, 18, 12), log: Chunk[] = []
  const term = new Terminal(files, () => now)
  const step = (ms: number) => { for (let t = 0; t < ms; t += 50) { now += 50; log = mergeChunks(log, term.tick()) } }
  const take = () => { log = mergeChunks(log, term.tick()); const s = log.map(c => c.text).join(''); log = []; return s }
  const run = (line: string, max = 120000) => { take(); term.input(line); const t0 = now; while (term.busy && now - t0 < max) step(50); return Object.assign(new String(take()), { ms: now - t0 }).toString() }
  const timed = (line: string) => { const t0 = now; const out = run(line); return { out, ms: now - t0 } }
  return { term, run, timed, step, take, start: (line: string) => term.input(line), stop: () => term.interrupt() }
}
const WITH_DB = 'services:\n  web:\n    image: nginx\n    depends_on:\n      db:\n        condition: service_healthy\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: secret\n    volumes:\n      - data:/var/lib/postgresql/data\n    healthcheck:\n      test: ["CMD-SHELL","pg_isready"]\n      interval: 1s\n  cache:\n    image: redis\nvolumes:\n  data:\n'

test('Ctrl+C abandons pull, build and compose up without leaving anything half done', () => {
  const l = lab({ ...FILES, Dockerfile: 'FROM alpine\nRUN sleep 3\n', 'compose.yml': WITH_DB })
  l.start('docker pull postgres:16'); l.step(800); l.stop(); l.step(100)
  assert.equal(l.term.busy, false)
  assert.doesNotMatch(l.run('docker images'), /postgres/)
  l.run('docker pull alpine'); l.take()
  l.take(); l.start('docker build -t slow .'); l.step(300); l.stop(); l.step(100)
  assert.match(l.take(), /Canceled: context canceled/)
  assert.doesNotMatch(l.run('docker images'), /slow/)
  assert.ok(l.timed('docker build -t slow .').ms >= 3000, 'a canceled RUN step is not cached')
  l.take(); l.start('docker compose up -d'); l.step(500); l.stop(); l.step(100)
  assert.match(l.take(), /canceled/)
  assert.equal(l.term.busy, false)
})

test('docker stop finishes in the daemon even when the client gives up', () => {
  const l = lab()
  l.run('docker run -d --name slow alpine sleep 1000')
  l.start('docker stop -t 3 slow'); l.step(500); l.stop(); l.step(50)
  assert.equal(l.term.busy, false)
  assert.match(l.run('docker ps --format "{{.Status}}"'), /^Up/)
  l.step(3000)
  assert.match(l.run('docker ps -a --format "{{.Status}}"'), /Exited \(137\)/)
})

test('servers need time and configuration, and keep their data where it belongs', () => {
  const l = lab()
  l.run('docker run -d --name bad postgres:16'); l.step(200)
  assert.match(l.run('docker logs bad'), /superuser password is not specified/)
  assert.match(l.run('docker inspect bad --format "{{.State.ExitCode}}"'), /1/)
  l.run('docker run -d --name db -e POSTGRES_PASSWORD=x -v pgdata:/var/lib/postgresql/data postgres:16')
  assert.match(l.run('docker exec db pg_isready; echo rc=$?'), /no response\nrc=2/)
  l.step(3000)
  assert.match(l.run('docker exec db pg_isready'), /accepting connections/)
  assert.match(l.run('docker exec db psql -c "select 1"'), /role "root" does not exist/)
  l.run(`docker exec db psql -U postgres -c "create table t (id serial, name text); insert into t (name) values ('kept')"`)
  l.run('docker rm -f db')
  l.run('docker run -d --name db2 -v pgdata:/var/lib/postgresql/data postgres:16'); l.step(800)
  assert.match(l.run('docker logs db2'), /Skipping initialization/)
  assert.match(l.run('docker exec db2 psql -U postgres -c "select * from t"'), /1 \| kept/)
  l.run('docker run -d --name cache redis'); l.step(200)
  assert.equal(l.run('docker exec cache redis-cli set k v'), 'OK\n')
  l.run('docker restart cache'); l.step(200)
  assert.equal(l.run('docker exec cache redis-cli get k'), 'v\n')
  assert.match(l.run('curl -s --max-time 1 localhost:6379; echo rc=$?'), /rc=7/)
})

test('compose follows the dependency graph in parallel, in both directions', () => {
  const l = lab({ ...FILES, 'compose.yml': WITH_DB })
  assert.match(l.run('docker compose create'), /sandbox-web-1 +Created/)
  l.run('docker compose rm -f')
  const up = l.timed('docker compose up -d')
  assert.match(up.out, /\[\+\] Running 3\/3/)
  assert.match(up.out, /sandbox-db-1 +Healthy/)
  const events = () => l.term.d.events.filter(e => e.type === 'container')
  const at = (name: string, action: string) => events().find(e => e.name === name && e.action === action)!.t
  assert.ok(at('sandbox-cache-1', 'start') < at('sandbox-db-1', 'health_status: healthy'), 'unrelated services do not wait for the database')
  assert.ok(at('sandbox-web-1', 'start') >= at('sandbox-db-1', 'health_status: healthy'), 'web waits for it')
  assert.deepEqual(JSON.parse(l.run('docker compose ps --format json').split('\n')[0]).Service, 'cache')
  assert.equal(l.run('docker compose ps --format "{{.Service}}"'), 'cache\ndb\nweb\n')
  assert.match(l.run('docker compose cp web:/usr/share/nginx/html/index.html copy.html'), /Successfully copied/)
  l.run('docker compose down -v')
  assert.ok(at('sandbox-web-1', 'die') < at('sandbox-db-1', 'die'), 'dependents stop first')
  assert.doesNotMatch(l.run('docker volume ls'), /sandbox_data/)
})

test('progress is redrawn in place and addresses go back to the pool', () => {
  const l = lab()
  l.start('docker pull nginx'); l.step(1000)
  l.step(6000)
  const out = l.take()
  assert.doesNotMatch(out, /Downloading/)
  assert.match(out, /Pull complete/)
  l.run('docker run -d --name one nginx')
  assert.match(l.run('docker inspect one --format "{{.NetworkSettings.IPAddress}}"'), /172\.17\.0\.2/)
  l.run('docker stop one')
  l.run('docker run -d --name two nginx')
  assert.match(l.run('docker inspect two --format "{{.NetworkSettings.IPAddress}}"'), /172\.17\.0\.2/)
})

test('registry, archives and small commands', () => {
  const l = lab()
  l.run('docker build -t alice/app .')
  assert.match(l.run('docker push alice/app'), /denied/)
  l.run('docker login -u alice -p pw')
  assert.match(l.run('docker push alice/app'), /digest: sha256/)
  l.run('docker rmi alice/app')
  assert.match(l.run('docker pull alice/app'), /Downloaded newer image/)
  l.run('docker save alice/app -o app.tar'); l.run('docker rmi alice/app')
  assert.match(l.run('docker load -i app.tar'), /Loaded image: alice\/app:latest/)
  l.run('docker run -d --name up1 nginx:alpine'); l.run('docker update -m 64m up1')
  assert.match(l.run('docker stats --no-stream --format "{{.MemUsage}}" up1'), /64\.00MiB/)
  assert.equal(l.run('printf "a\\nb\\n" | tail -1'), 'b\n')
  assert.equal(l.run('docker version --format "{{.Server.Version}}"'), '27.3.1\n')
  l.start('docker stats'); l.step(1500); assert.ok(l.term.busy); l.stop(); l.step(50); assert.equal(l.term.busy, false)
})
