import { bugs, choice, e, figure, flow, gaps, match, order, type Task } from '../components/quizModel.ts'

const quiz: Task[] = [
  choice(e('Welches Problem löst Docker Compose vor allem?', 'Which problem does Docker Compose mainly solve?'), [
    e('Es ersetzt den Linux-Kernel', 'It replaces the Linux kernel'),
    e('Es beschreibt mehrere Container, Netze und Volumes in einer Datei', 'It describes several containers, networks and volumes in one file'),
    e('Es macht Images kleiner', 'It makes images smaller'),
  ], 1, e('Statt vieler langer Befehle startet ein einziger Befehl die ganze Umgebung, und die Datei liegt im Git.', 'Instead of many long commands, one command starts the whole environment, and the file lives in Git.')),
  bugs(e('In dieser Datei stecken drei Fehler. Markiere die betroffenen Zeilen.', 'This file contains three errors. Mark the affected lines.'), 'compose.yaml', ['services:', '  web:', '!!    imgae: wordpress:6', '    ports:', '      - "8080:80"', '    environment:', '!!      WORDPRESS_DB_HOST: localhost', '!!    depends_on: [database]', '  db:', '    image: mysql:8', '    environment:', '      MYSQL_ROOT_PASSWORD: geheim'],
    e('`image` ist falsch geschrieben, `localhost` zeigt auf web selbst, und der Service heißt `db`, nicht `database`.', '`image` is misspelled, `localhost` points to web itself, and the service is called `db`, not `database`.')),
  figure(e('Der Service hat `ports: "8080:80"`. Trage beide Portnummern ein.', 'The service has `ports: "8080:80"`. Enter both port numbers.'), flow(
    [e('Browser', 'Browser'), e('Host-Port [[8080]]', 'Host port [[8080]]'), e('Container-Port [[80]]', 'Container port [[80]]')],
    [e('ruft auf', 'requests'), e('leitet weiter', 'forwards')],
  ), e('Links steht immer der Port am Host, rechts der Port im Container.', 'The left side is always the host port, the right side the container port.')),
  gaps(e('Ergänze die fehlenden Schlüssel.', 'Fill in the missing keys.'), 'services:\n  web:\n    [[image]]: nginx:1.27\n    [[ports]]:\n      - "8080:80"\n    [[depends_on]]: [db]\n  db:\n    image: mysql:8\n    [[environment]]:\n      MYSQL_ROOT_PASSWORD: geheim\n    [[volumes]]:\n      - dbdata:/var/lib/mysql\nvolumes:\n  dbdata:\n',
    e('Benannte Volumes stehen beim Service und zusätzlich auf oberster Ebene.', 'Named volumes appear at the service and also at the top level.'), 'compose.yaml'),
  match(e('Was macht welcher Befehl? Alle beginnen mit `docker compose`.', 'What does each command do? All start with `docker compose`.'), [
    ['up -d', e('Alles im Hintergrund starten', 'Start everything in the background')],
    ['ps', e('Laufende Services und Ports zeigen', 'Show running services and ports')],
    ['logs -f web', e('Ausgabe eines Services live verfolgen', 'Follow the output of one service live')],
    ['exec web sh', e('Shell im laufenden Container öffnen', 'Open a shell in the running container')],
    ['config', e('Fertige Datei mit eingesetzten Variablen zeigen', 'Show the final file with variables filled in')],
    ['down', e('Container und Netz entfernen', 'Remove containers and network')],
  ], e('Diese sechs Befehle decken den Alltag mit Compose fast vollständig ab.', 'These six commands cover almost all everyday work with Compose.')),
  order(e('Sortiere einen typischen Arbeitsablauf.', 'Sort a typical workflow.'), ['docker compose config', 'docker compose up -d', 'docker compose ps', 'docker compose logs -f web', 'docker compose down'],
    e('Erst die Datei prüfen, dann starten, nachsehen und am Ende aufräumen. `ps` und `logs` dürfen tauschen.', 'First validate the file, then start, inspect, and finally clean up. `ps` and `logs` may swap.'), { code: true, swap: [[2, 3]] }),
  choice(e('Was bleibt nach `docker compose down` erhalten?', 'What is kept after `docker compose down`?'), [
    e('Die Container', 'The containers'), e('Das Projektnetz', 'The project network'), e('Benannte Volumes', 'Named volumes'), e('Nichts', 'Nothing'),
  ], 2, e('Erst `down -v` löscht auch die benannten Volumes.', 'Only `down -v` also deletes named volumes.')),
  choice(e('`TAG` steht in der Shell und in `.env` mit verschiedenen Werten. Welcher gilt für `${TAG}`?', '`TAG` is set in the shell and in `.env` with different values. Which one applies to `${TAG}`?'), [
    e('Der Wert aus `.env`', 'The value from `.env`'), e('Der Wert aus der Shell', 'The value from the shell'), e('Compose bricht mit einem Fehler ab', 'Compose stops with an error'),
  ], 1, e('Die Shell gewinnt gegen `.env`.', 'The shell wins over `.env`.')),
  choice(e('Wie erreicht der Service web die Datenbank im selben Compose-Netz?', 'How does the service web reach the database on the same Compose network?'), [
    e('Über `localhost:3306`', 'Via `localhost:3306`'), e('Über den Service-Namen `db:3306`', 'Via the service name `db:3306`'), e('Nur über einen veröffentlichten Host-Port', 'Only via a published host port'),
  ], 1, e('Der eingebaute DNS löst Service-Namen auf. `localhost` wäre der Container web selbst.', 'The built-in DNS resolves service names. `localhost` would be the web container itself.')),
  choice(e('Worauf wartet ein einfaches `depends_on: [db]`?', 'What does a plain `depends_on: [db]` wait for?'), [
    e('Bis db gestartet wurde', 'Until db has been started'), e('Bis db Verbindungen annimmt', 'Until db accepts connections'), e('Bis alle Tabellen angelegt sind', 'Until all tables exist'),
  ], 0, e('Gestartet ist nicht bereit. Dafür braucht es einen Healthcheck.', 'Started is not ready. That takes a healthcheck.')),
  gaps(e('web soll erst starten, wenn db gesund ist.', 'web should only start once db is healthy.'), 'services:\n  web:\n    depends_on:\n      db:\n        condition: [[service_healthy]]\n  db:\n    [[healthcheck]]:\n      test: mysqladmin ping -h localhost\n      [[interval]]: 5s\n',
    e('Der Healthcheck läuft im Container, `service_healthy` wartet auf sein Ergebnis.', 'The healthcheck runs in the container, and `service_healthy` waits for its result.'), 'compose.yaml'),
  order(e('Ziehe die Teile in die richtige Reihenfolge: die letzten 50 Logzeilen von web.', 'Drag the parts into the right order: the last 50 log lines of web.'), ['docker', 'compose', 'logs', '--tail 50', 'web'],
    e('Optionen stehen hinter dem Unterbefehl, der Service als Argument am Ende.', 'Options follow the subcommand, and the service comes last as argument.'), { inline: true }),
  figure(e('Wer beantwortet die Frage nach dem Namen `db`?', 'Who answers the question for the name `db`?'), flow(
    [e('Container web', 'Container web'), e('Eingebauter [[DNS]] der Engine', 'Built-in [[DNS]] of the engine'), e('Container [[db]]', 'Container [[db]]')],
    [e('fragt: wer ist db?', 'asks: who is db?'), e('liefert die IP', 'returns the IP')],
  ), e('Im selben Netz gilt: Name gleich Adresse.', 'On the same network, the name is the address.')),
]
export default quiz
