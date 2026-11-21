import { bugs, choice, e, figure, flow, gaps, match, order, stacks, type Task } from '../components/quizModel.ts'

const quiz: Task[] = [
  choice(e('Warum läuft eine App oft nur „bei mir“?', 'Why does an app often only work “on my machine”?'), [
    e('Weil sie nutzt, was auf dem Rechner installiert ist, und jeder Rechner andere Versionen hat', 'Because it uses what is installed on the machine, and every machine has different versions'),
    e('Weil Quellcode auf jedem Rechner anders kompiliert wird', 'Because source code compiles differently on every machine'),
    e('Weil Programme nur auf einem Rechner gleichzeitig laufen dürfen', 'Because programs may only run on one machine at a time'),
  ], 0, e('Gleicher Code trifft auf andere Bibliotheken und Laufzeiten. Genau diese Umgebung verpackt Docker mit.', 'The same code meets different libraries and runtimes. Docker packs exactly this environment along with the app.')),
  choice(e('Was steckt nicht in einem Image?', 'What is not inside an image?'), [
    e('Die App', 'The app'), e('Bibliotheken', 'Libraries'), e('Der Kernel des Hosts', 'The host kernel'), e('Die Laufzeitumgebung', 'The runtime'),
  ], 2, e('Container nutzen den Kernel des Host-Rechners. Das Image bringt nur alles darüber mit.', 'Containers use the kernel of the host. The image only brings everything above it.')),
  figure(e('Ergänze die zwei fehlenden Schichten unter den Containern.', 'Fill in the two missing layers below the containers.'), stacks({
    title: 'Container',
    rows: ['hardware', { part: 'kernel', blank: 'Host-Kernel|Kernel|Host Kernel|Hostkernel' }, { part: 'engine', blank: 'Container Engine|Engine|Docker Engine|Container-Engine|Docker' }, [{ unit: 'Container 1', kind: 'container', rows: ['libs', 'app'] }, { unit: 'Container 2', kind: 'container', rows: ['libs', 'app'] }]],
  }), e('Alle Container laufen nebeneinander auf der Engine und teilen sich den Kernel des Hosts.', 'All containers run side by side on the engine and share the kernel of the host.')),
  figure(e('Was fehlt in diesem Aufbau einer virtuellen Maschine?', 'What is missing in this virtual machine setup?'), stacks({
    title: 'VM',
    rows: ['hardware', 'kernel', { part: 'hypervisor', blank: 'Hypervisor', sub: '' }, [{ unit: 'VM 1', kind: 'vm', rows: [{ part: 'guestKernel', blank: 'Gast-Kernel|Gastkernel|Guest kernel|Guest-Kernel' }, 'libs', 'app'] }]],
  }), e('Der Hypervisor vermittelt die Hardware an die VMs, und jede VM bringt ihren eigenen Gast-Kernel mit.', 'The hypervisor hands the hardware to the VMs, and every VM brings its own guest kernel.')),
  figure(e('Wer macht hier was? Ergänze die beiden Bausteine der Docker-Architektur.', 'Who does what here? Fill in the two building blocks of the Docker architecture.'), flow(
    [e('docker (Client)', 'docker (client)'), e('[[Daemon|dockerd|Docker Daemon|Docker-Daemon]] verwaltet Images und Container', '[[Daemon|dockerd|Docker Daemon]] manages images and containers'), e('[[Registry|Docker Registry|Docker-Registry]] z. B. Docker Hub', '[[Registry|Docker Registry]] e.g. Docker Hub')],
    [e('sendet den Befehl', 'sends the command'), e('lädt Images herunter', 'downloads images')],
  ), e('Der Client nimmt nur den Befehl an. Die Arbeit macht der Daemon, die Images kommen aus der Registry.', 'The client only takes the command. The daemon does the work, and images come from the registry.')),
  match(e('Ordne jedem Begriff seine Rolle zu.', 'Match each term with its role.'), [
    ['Image', e('Bauplan, nur lesbar', 'Blueprint, read-only')],
    ['Container', e('Laufende Instanz eines Images', 'Running instance of an image')],
    ['Registry', e('Lager für viele Images', 'Warehouse for many images')],
  ], e('Wie Klasse und Objekt: Aus einem Image entstehen beliebig viele Container.', 'Like class and object: one image can create any number of containers.')),
  order(e('Bringe die Befehle in die Reihenfolge des Lebenszyklus.', 'Put the commands into lifecycle order.'), ['docker pull nginx', 'docker create --name web nginx', 'docker start web', 'docker stop web', 'docker rm web', 'docker rmi nginx'],
    e('Erst das Image holen, daraus einen Container anlegen, starten, stoppen, löschen und zuletzt das Image entfernen.', 'First get the image, create a container, start, stop, remove it, and finally remove the image.'), { code: true }),
  order(e('Ziehe die Teile zu einem gültigen Befehl zusammen: nginx im Hintergrund, Port 8080 außen auf 80 innen.', 'Drag the parts into a valid command: nginx in the background, outside port 8080 to inside 80.'), ['docker', 'container', 'run', '-d', '-p 8080:80', 'nginx'],
    e('Aufbau: Programm, Objekt, Aktion, Optionen, Argument. Die beiden Optionen dürfen tauschen.', 'Structure: program, object, action, options, argument. The two options may swap.'), { inline: true, swap: [[3, 4]] }),
  gaps(e('Ergänze die fehlenden Befehlsteile.', 'Fill in the missing command parts.'), e('Laufende Container zeigt docker [[ps]]. Mit dem Flag -[[a]] erscheinen auch gestoppte. Die Ausgabe eines Containers zeigt docker [[logs]] web.', 'Running containers are shown by docker [[ps]]. With the flag -[[a]], stopped ones appear too. The output of a container is shown by docker [[logs]] web.'),
    e('`ps` ist die Kurzform von `container ls`.', '`ps` is the short form of `container ls`.')),
  bugs(e('Zwei dieser Befehle können so nicht funktionieren. Markiere sie.', 'Two of these commands cannot work like this. Mark them.'), 'terminal', ['docker pull nginx:1.27', '!!docker nginx run -d', 'docker run -d --name web nginx:1.27', 'docker ps -a', '!!docker rm'],
    e('Die Aktion steht vor dem Image, und `docker rm` braucht einen Container als Argument.', 'The action comes before the image, and `docker rm` needs a container as argument.')),
  choice(e('Welche Aussagen über Container und VMs stimmen?', 'Which statements about containers and VMs are true?'), [
    e('Container teilen sich den Kernel des Hosts', 'Containers share the kernel of the host'),
    e('Jede VM hat einen eigenen Kernel', 'Every VM has its own kernel'),
    e('Jeder Container bootet einen eigenen Kernel', 'Every container boots its own kernel'),
    e('VMs sind stärker voneinander isoliert', 'VMs are more strongly isolated from each other'),
  ], [0, 1, 3], e('Container sind leichtgewichtig, weil sie keinen eigenen Kernel starten. Dafür isolieren VMs stärker.', 'Containers are lightweight because they start no kernel of their own. In exchange, VMs isolate more strongly.')),
  choice(e('Was kennzeichnet Podman im Vergleich zu Docker?', 'What characterizes Podman compared to Docker?'), [
    e('Es ist eine vollständige virtuelle Maschine', 'It is a full virtual machine'),
    e('Es kommt ohne zentralen Daemon aus und läuft auch rootless', 'It works without a central daemon and can also run rootless'),
    e('Es kann keine Docker-Images starten', 'It cannot run Docker images'),
  ], 1, e('Podman ist weitgehend Docker-kompatibel, braucht aber keinen dauerhaft laufenden Daemon.', 'Podman is largely Docker-compatible but needs no permanently running daemon.')),
]
export default quiz
