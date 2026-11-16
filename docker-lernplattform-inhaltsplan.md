# Docker-Lernplattform: Inhaltsplan

Lernplattform zu Docker und Docker Compose im Vortragsstil: durchklickbare Slides, unterteilt in Chapter.

## Rahmenbedingungen

- **Zielgruppe:** Studierende, überwiegend Beginner und Intermediates. Die späten Chapter gehen tiefer (Advanced).
- **Stil:** Viele Grafiken, wenig Text. Kontextverständnis ist wichtiger als Detailwissen.
- **Keine Quizze** auf den Lernseiten.
- **Sprache:** Deutsch als Hauptsprache, Englisch per Umschalter (die Übersetzung ist nicht Teil dieses Plans).
- **Chapter 1** enthält keine Befehle, nur grundlegendes Verständnis auf hohem Niveau.
- **Kubernetes** kommt in Chapter 1 nicht vor, es wird erst später behandelt.

## Gesamtplan

| Chapter | Thema | Level |
|---|---|---|
| 1 | Grundlagen: Was ist Docker und wo läuft es? | Beginner |
| 2 | Docker Compose | Beginner / Intermediate |
| 3 | Images und Container im Detail (`run`, Ports, Volumes, Logs, `exec`) | Intermediate |
| 4 | Dockerfile und Layers (eigene Images, Compose mit `build`) | Intermediate |
| 5 | Netzwerke und Volumes vertieft | Intermediate |
| 6 | Isolation unter der Haube (Namespaces, cgroups, Speicherlimits, OOM) | Advanced |
| 7 | Metadaten, Image-Optimierung, Sicherheit und Nischenthemen | Advanced |

Der rote Faden zu den Advanced-Chaptern: Weil Container sich den Kernel teilen (Chapter 1, Folien 6, 7 und 13), braucht es Mechanismen für Isolation und Ressourcenlimits. Dort entstehen später OOM-Kills und die Metadaten-Themen.

---

## Chapter 1: Was ist Docker und wo läuft es?

| # | Folie | Hauptgrafik |
|---|---|---|
| 1 | Lernpfad: Wo stehen wir? | Kapitelkarte mit allen Chaptern, Chapter 1 hervorgehoben |
| 2 | Das Problem: „Bei mir läuft's" | Entwickler-Laptop und Server mit unterschiedlichen Versionen und Bibliotheken |
| 3 | Die Idee: App und Umgebung zusammen verpacken | Anwendung plus Abhängigkeiten in einer Box, die überall gleich läuft |
| 4 | Virtualisierung in drei Ebenen | Prozess-, OS- und System-Virtualisierung als Einordnungsschema |
| 5 | VM vs. Container | Zwei Schichtstapel nebeneinander (Hypervisor und Gast-OS gegen Container Engine) |
| 6 | Hat ein Container ein eigenes Betriebssystem? | Mehrere Container, die sich einen Kernel teilen |
| 7 | Wo Docker im Stack sitzt | Hardware → Host OS → Container Engine → Container |
| 8 | Docker auf Linux, macOS und Windows | Direkter Kernel-Zugriff gegen Linux-VM im Hintergrund |
| 9 | Die Architektur auf einen Blick | Client, Docker Daemon und Registry als Pfeil-Diagramm, ohne Befehle |
| 10 | Image, Container, Registry | Bauplan → laufende Instanz → Lagerhaus (die Kernfolie des Chapters) |
| 11 | Lebenszyklus eines Containers | Zustandsdiagramm: Image geholt → erstellt → läuft → gestoppt → gelöscht |
| 12 | Wofür wird Docker eingesetzt? | Vier Szenarien: Entwicklung, Test/CI, Deployment, Microservices |
| 13 | Grenzen und Abgrenzung | Geteilter Kernel heißt weniger Isolation als bei VMs; Docker ist kein VM-Ersatz |
| 14 | Docker im Vergleich zu Alternativen | Vergleichsmatrix mit Icons (siehe unten) |
| 15 | Zusammenfassung | Chapter-Rückblick als Grafik, ohne Quiz |

### Folie 14: Vergleich mit Alternativen

| Option | Kurzcharakteristik |
|---|---|
| **Docker** | Standard mit dem größten Ökosystem; zentraler Daemon; Docker Hub |
| **Podman** | Ohne zentralen Daemon; kann rootless laufen; Bedienung weitgehend kompatibel zu Docker |
| **containerd / CRI-O** | Schlanke Runtimes ohne Entwickler-Oberfläche; laufen im Hintergrund anderer Tools (containerd steckt auch unter Docker selbst) |
| **LXC / LXD** | System-Container, die sich eher wie eine leichte VM verhalten als wie ein einzelner Anwendungsprozess |
| **Virtuelle Maschinen** | Volle Isolation mit eigenem Kernel; mehr Ressourcenbedarf, langsamerer Start |

Vergleichsachsen: Architektur (Daemon ja/nein), Isolation, Ressourcenbedarf, Startzeit, typischer Einsatz, Ökosystem.

Details wie der OCI-Standard oder der rootless-Betrieb folgen erst in den Advanced-Chaptern.

---

## Chapter 2: Docker Compose

Erster Praxis-Teil, hier dürfen Befehle und YAML vorkommen. Ansatz: Compose „deklarativ zuerst". Ports, Umgebungsvariablen und Volumes lernen die Studierenden direkt über die YAML-Datei kennen, nicht über `docker run`.

Ein durchgehendes Beispiel (Web-App plus Datenbank) zieht sich als roter Faden durch alle Folien und wird Schritt für Schritt aufgebaut.

| # | Folie | Hauptgrafik |
|---|---|---|
| 1 | Rückblick und Ausblick | Kapitelkarte, Chapter 2 hervorgehoben |
| 2 | Das Problem: Mehrere Container von Hand | Web, Datenbank und Cache, jeweils mit langen Startoptionen und Reihenfolgechaos |
| 3 | Die Idee: Die Umgebung als Datei beschreiben | Eine Datei → die ganze laufende Umgebung |
| 4 | Anatomie einer Compose-Datei | Annotiertes YAML mit farbigen Blöcken (services, image, ports, environment, volumes) |
| 5 | Ports: Wie kommt man von außen an einen Container? | Host-Port → Container-Port, die Zuordnung `8080:80` |
| 6 | Umgebungsvariablen und Konfiguration | Wie Einstellungen in den Container gelangen |
| 7 | Mehrere Services: Web und Datenbank | Zwei Container im gemeinsamen Stack |
| 8 | Netzwerke: Services finden sich über Namen | Der Service-Name als Adresse im internen Netz |
| 9 | Volumes: Daten überleben den Container | Container weg, Daten bleiben |
| 10 | Startreihenfolge und Abhängigkeiten | `depends_on` gegen „wirklich bereit" (Healthcheck) |
| 11 | Der Alltag mit Compose | Lebenszyklus: starten, ansehen, Logs, stoppen, aufräumen |
| 12 | Konfiguration trennen | `.env`-Dateien, Entwicklung gegen Produktion |
| 13 | Typische Stolpersteine | Port-Konflikte, Datenverlust beim Aufräumen, „gestartet" ist nicht „bereit" |
| 14 | Compose im Überblick | Zusammenfassung als Grafik, ohne Quiz |

---

## Noch zu bestätigen

1. **Compose vor den Docker-Details (Chapter 2 vor Chapter 3):** Vorteil: schnell etwas Lauffähiges. Nachteil: Chapter 3 erklärt teilweise, was Compose schon im Hintergrund erledigt hat.
2. **Befehlsschreibweise:** Vorschlag ist durchgehend `docker compose up` (aktuelles Docker-Plugin) und ohne `version:` in der YAML-Datei. Die Vorlesungsfolien nutzen noch `docker-compose up` (Version 1, Support seit 2023 beendet). Ein kurzer Hinweis darauf, dass die alte Form in älteren Tutorials noch vorkommt, wäre sinnvoll.


## praktische Darstellung
Chapter 1
1	Lernpfad	Horizontaler Pfad im Stil einer Metro-Karte. Das aktuelle Chapter pulsiert, die Advanced-Chapter sind farblich abgesetzt.
2	Das Problem	Split-Screen mit Laptop und Server. Per Klick erscheinen Versions-Badges (z. B. unterschiedliche Runtime-Versionen), dann ein Fehler-Icon.
3	Die Idee	Eine Animation in drei Schritten: Teile (App, Bibliotheken, Konfiguration) fliegen in eine Box, die Box wird versiegelt und läuft anschließend auf drei verschiedenen Rechnern identisch.
4	Virtualisierung in drei Ebenen	Drei Spalten oder Stufen. Beim Klick wird je eine Ebene mit Beispiel hervorgehoben, und Docker ist am Ende markiert.
5	VM vs. Container	Zwei Schichtstapel nebeneinander, die sich Schicht für Schicht aufbauen. Die Gast-OS-Blöcke sind rot markiert, daneben stehen Balken für relative Größe und Startzeit (nur als Größenordnung, ohne exakte Zahlen).
6	Eigenes Betriebssystem?	Querschnitt: ein Kernel-Block unten, mehrere Container darüber, die nur eigene Bibliotheken und Programme enthalten. Per Klick verschwindet das „Gast-OS“, und der geteilte Kernel wird hervorgehoben.
7	Wo Docker im Stack sitzt	Vertikaler Stack, der sich von unten aufbaut. Farbige Klammern zeigen, wer was verwaltet (Betreiber, Docker, Entwickler).
8	Linux, macOS, Windows	Drei Tabs oder drei Spalten mit je einem Stack. Der Linux-VM-Layer bei macOS und Windows ist farblich hervorgehoben, bei Linux fehlt er.
9	Architektur	Netzwerk-Diagramm Client → Daemon → Registry mit animiertem Datenfluss. Nummerierte Stationen erscheinen per Klick, der Host ist ein Rahmen um Client und Daemon.
10	Image, Container, Registry	Flussdiagramm Bauplan → Instanz → Lager. Ein Klick vervielfacht ein Image zu mehreren Containern (1:n). Als technischer Vergleich passt „Klasse → Objekt“.
11	Lebenszyklus	Zustandsdiagramm mit Knoten und Pfeilen. Per Klick wandert ein farbiger Marker durch die Zustände (grün läuft, grau gestoppt).
12	Einsatzszenarien	2×2-Kacheln mit Icons, jede Kachel klappt zu einer Mini-Pipeline auf (z. B. Entwickler → Test → Server).
13	Grenzen	Isolationsspektrum von Prozess über Container zu VM, mit einem Regler zwischen „leichtgewichtig“ und „stark isoliert“. Dazu eine Mini-Grafik: Ein Kernel-Problem trifft alle Container, bei VMs nur eine.
14	Vergleich mit Alternativen	Matrix mit Harvey-Balls (●◐○) pro Kriterium. Ein Klick auf eine Spalte hebt sie hervor und blendet eine Kurzbeschreibung ein.
15	Zusammenfassung	Ein Pfad aus Mini-Icons der Folien 2–14 und darunter drei groß gesetzte Kernaussagen.
Chapter 2
#	Folie	Praktische Darstellung
1	Rückblick und Ausblick	Kapitelkarte plus eine Reihe von Chips mit den Kernbegriffen aus Chapter 1 (Image, Container, Registry) als Brücke zu Compose.
2	Mehrere Container von Hand	Drei Terminal-Fenster mit langen Startzeilen, dazwischen Pfeile mit Fragezeichen für die Reihenfolge. Ein Zähler „mögliche Fehlerquellen“ wächst mit.
3	Umgebung als Datei	Vorher/Nachher als Split: links viele Befehle, rechts eine Datei und ein Befehl. Danach „startet“ die Datei und die Container entstehen.
4	Anatomie einer Compose-Datei	YAML mit farbigen Klammern. Ein Klick auf einen Block zeigt rechts, welcher Teil des Containers damit gemeint ist. Alternativ eine Baumansicht der Einrückungshierarchie.
5	Ports	Host-Rand mit Port 8080, ein Pfeil durch die Wand zum Container-Port 80, links der Browser. Die Schreibweise 8080:80 ist zweifarbig (links Host, rechts Container).
6	Umgebungsvariablen	Etiketten wandern aus Datei und .env als „Umschlag“ in die Container-Box.
7	Mehrere Services	YAML wächst links Block für Block, rechts erscheint jeweils der passende Container in einem gemeinsamen Rahmen.
8	Netzwerke	Interne Netzwerk-Wolke mit Service-Namen als Adressschildern. Gegenüberstellung: von außen nur über Ports, von innen über Namen.
9	Volumes	Zeitachse mit Container vorhanden → gelöscht → neu, der Daten-Zylinder bleibt daneben bestehen. Ein Umschalter „mit/ohne Volume“ zeigt den Unterschied.
10	Startreihenfolge	Gantt-artige Timeline mit „gestartet“ und „bereit“. Zwei Zeilen untereinander: nur depends_on (Fehlerblitz) gegen Healthcheck (sauberer Start).
11	Der Alltag	Kreislauf aus starten → ansehen → Logs → stoppen → aufräumen. Daneben ein Terminal-Mock, dessen Ausgabe pro Klick Zeile für Zeile erscheint.
12	Konfiguration trennen	Schichten-Overlay: Basis-Datei plus Override ergibt das Ergebnis. Tabs für Entwicklung und Produktion, die .env als Datei-Karte.
13	Stolpersteine	Drei Karten nach dem Muster Fehlerbild → Ursache → Lösung, jeweils mit Mini-Diagramm. Die Lösung wird per Klick aufgedeckt.
14	Compose im Überblick	Landkarte des Beispiel-Stacks mit allen beschrifteten Konzepten (Services, Ports, Netzwerk, Volume, Variablen) und der Kapitelkarte.