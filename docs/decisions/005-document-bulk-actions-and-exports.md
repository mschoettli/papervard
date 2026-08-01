# 005 – Mehrfachbearbeitung und Hintergrundexporte für Dokumente

Status: Angenommen
Datum: 2026-08-01

## Kontext

Papervard zeigt Dokumente standardmäßig als Vorschaukarten und unterstützt Einzelaktionen für Ablage, Tags, Download und Papierkorb. Bei großen Beständen – beispielsweise hundert oder mehr Leistungsabrechnungen – ist die wiederholte Einzelbearbeitung ineffizient. Die bestehende Mehrfachauswahl im Adminbereich ist nicht für normale Benutzer, Filterauswahlen oder große Downloads ausgelegt. Der bestehende TAR-Download liest zudem alle Dateien vollständig in den Arbeitsspeicher.

## Gemeinsames Verständnis

- Die normale Dokumentansicht erhält eine Mehrfachauswahl direkt auf den Vorschaukarten.
- Benutzer können zunächst die sichtbaren maximal 24 Karten und anschließend optional alle Treffer des aktuellen Ordners, Filters oder der Suche auswählen.
- Mehrfachaktionen sind: in einen Ordner verschieben, Tags hinzufügen, Tags entfernen, in den Papierkorb verschieben und als Archiv herunterladen.
- Jeder Benutzer darf zugängliche Familiendokumente entsprechend dem bestehenden Einzelverhalten bearbeiten.
- Eine gemischte Auswahl privater und gemeinsamer Dokumente kann nicht gemeinsam verschoben werden.
- Große Sammeldownloads werden als Hintergrundauftrag verarbeitet und als ZIP mit Papervard-Ordnerstruktur bereitgestellt.
- Fertige ZIP-Dateien laufen nach 24 Stunden ab und werden automatisch entfernt.

## Annahmen und Grenzen

- Große Auswahlen werden serverseitig durch eine normalisierte Filterbeschreibung repräsentiert; der Browser überträgt nicht Tausende IDs.
- Jede Aktion bestimmt einen stabilen Satz von Dokumenten und prüft den aktuellen Zugriff serverseitig erneut.
- Nicht mehr zugängliche oder nicht mehr vorhandene Dokumente werden ausgelassen und im Ergebnis gemeldet.
- Bearbeitungsaktionen laufen in begrenzten Datenbank-Batches.
- Exporte bilden beim Start einen Snapshot der aktuellen unveränderlichen Dateiversionen.
- „Praktisch unbegrenzt“ wird durch Streaming und Hintergrundverarbeitung erreicht; verfügbarer Datenträgerplatz bleibt die natürliche Obergrenze.
- Nicht Teil dieser Entscheidung sind Massenänderungen an Titel, Jahr, Sichtbarkeit, Favoriten oder Dokumentinhalt.

## Erwogene Ansätze

### 1. Fachlicher Exportdatensatz plus vorhandener Worker

Ein eigener Exportdatensatz hält Eigentümer, Snapshot, Fortschritt, Ergebnis und Ablaufzeit. Ein technischer `ProcessingJob` verarbeitet ihn im bestehenden Worker.

Vorteile: dauerhafter Zustand, klare Zugriffsregeln, Wiederholbarkeit, Fortschritt nach Browser-Neuladen und saubere automatische Bereinigung.

### 2. Exportzustand vollständig im Job-Checkpoint

Filter, Dateipfad und Status würden als JSON in `ProcessingJob.checkpoint` liegen.

Vorteil: weniger Tabellen. Nachteil: fachlicher Zustand, Berechtigungen und technische Queue werden vermischt und erschweren Wartung und Bereinigung.

### 3. ZIP direkt in der HTTP-Antwort streamen

Vorteil: wenig persistenter Zustand. Nachteil: lange Verbindung, kein dauerhaft sichtbarer Fortschritt und keine zuverlässige Wiederaufnahme. Dieser Ansatz erfüllt die gewünschte Größenordnung nicht.

## Entscheidung

Papervard verwendet Ansatz 1. Mehrfachänderungen laufen in Batches; nur Sammeldownloads werden als dauerhafte Hintergrundaufträge modelliert.

## Auswahlmodell

Die Clientauswahl besitzt zwei Modi:

1. `explicit`: eine überschaubare Liste manuell gewählter Dokument-IDs auf der aktuellen Seite.
2. `query`: alle Treffer einer serverseitig normalisierten Auswahlbeschreibung, ergänzt um explizit abgewählte IDs.

Die Auswahlbeschreibung umfasst:

- Suchbegriff
- Ordner einschließlich Unterordner
- Dokumentbereich (`all`, `mine`, `family`, `favorites`)
- Jahr
- Tagfilter

Die Sortierung ist kein Bestandteil der Treffermenge. Bei jeder Aktion rekonstruiert der Server dieselben Zugriffs- und Filterbedingungen aus validierten Feldern. Vom Client übermittelte Datenbankbedingungen werden nie direkt ausgeführt.

Nach „Alle sichtbaren auswählen“ bietet die Oberfläche „Alle X Treffer auswählen“ an. Filter- oder Seitenkontextwechsel heben die Auswahl auf, damit keine unsichtbare alte Auswahl weiterwirkt.

## Bearbeitungsaktionen

### Verschieben

- Der Zielordner muss für den Benutzer zugänglich sein.
- Zielordner, Dokumente, Sichtbarkeit und Haushalt müssen zusammenpassen.
- Bei gemischter privater und gemeinsamer Auswahl ist die Aktion deaktiviert und serverseitig abgelehnt.
- Sichtbarkeiten werden niemals implizit verändert.

### Tags

- „Hinzufügen“ ergänzt ausgewählte Tags und erhält alle anderen Zuweisungen.
- „Entfernen“ löscht nur die ausgewählten Tags.
- Tags müssen zum Haushalt des jeweiligen Dokuments gehören.
- Doppelte Zuweisungen bleiben durch den bestehenden zusammengesetzten Primärschlüssel ausgeschlossen.

### Papierkorb

- Die Aktion erfordert eine Bestätigung mit genauer Dokumentanzahl.
- `deletedAt` und der bisherige Ordner werden wie bei der Einzelaktion gespeichert.
- Die bestehende Wiederherstellungs- und Ablaufregel bleibt unverändert.

### Ergebnis

Jede Aktion liefert ein strukturiertes Ergebnis mit bearbeiteten, ausgelassenen und fehlgeschlagenen Dokumenten. Beispiel: „382 bearbeitet, 4 ausgelassen“. Ein einzelnes nicht mehr zugängliches Dokument stoppt nicht die gesamte Aktion.

## Exportmodell

Ein `DocumentExport` speichert mindestens:

- Eigentümer
- Status und Fortschritt
- Gesamt-, Erfolgs- und Fehleranzahl
- finalen Dateipfad und Dateigröße
- Fehlermeldung beziehungsweise strukturierte Warnungen
- Erstellungs-, Abschluss- und Ablaufzeit

`DocumentExportItem` speichert pro Snapshot-Element:

- Exportbezug
- Dokument- und unveränderliche Versionsreferenz
- relativen ZIP-Pfad
- Verarbeitungsstatus und optionale Fehlermeldung

`ProcessingJob` erhält eine optionale Exportreferenz und den Typ `document_export`. Fachlicher Exportzustand und technische Queue bleiben getrennt.

## ZIP-Erzeugung

- Der Worker liest Dateien nacheinander als Streams und schreibt in eine temporäre ZIP-Datei.
- Die Ordnerstruktur beginnt unter `Papervard-Export/` und folgt den Papervard-Ordnerpfaden.
- Originalformate und Dateiendungen bleiben erhalten.
- Unsichere Dateinamenszeichen werden ersetzt; Namenskollisionen erhalten `-2`, `-3` und so weiter.
- Fortschritt basiert auf verarbeiteten Elementen und, soweit verfügbar, Bytes.
- Einzelne nicht lesbare Dateien werden protokolliert und ausgelassen.
- Ein Auftragsfehler verwirft die temporäre Datei. Wiederholungen bauen das ZIP vollständig neu auf.
- Erst nach erfolgreichem Abschluss wird das Ergebnis atomar als Download verfügbar.

## Ablauf und Bereinigung

- Fertige Archive sind 24 Stunden verfügbar.
- Eine regelmäßige Bereinigung entfernt abgelaufene Archivdateien und zugehörige Datensätze.
- Temporäre Dateien abgebrochener oder endgültig fehlgeschlagener Aufträge werden ebenfalls entfernt.
- Pro Benutzer ist nur eine kleine Zahl paralleler Exporte aktiv; weitere Aufträge warten in der vorhandenen Queue.

## Sicherheit

- Alle Auswahlparameter werden mit festen Schemas validiert.
- Dokumentzugriff wird beim Ermitteln des Snapshots beziehungsweise unmittelbar vor einer Bearbeitungsaktion erneut geprüft.
- Exportdateien liegen außerhalb öffentlich ausgelieferter Verzeichnisse.
- Status- und Downloadrouten geben nur eigene Exporte zurück; Administratoren dürfen alle einsehen.
- Downloadantworten verwenden `private, no-store` und eine sichere `Content-Disposition`.
- Interne Speicherpfade und ausgelassene fremde Dokumente werden nicht an Benutzer ausgegeben.

## Oberflächendesign

Die Oberfläche bleibt im bestehenden warmen, editoriellen Papervard-System:

- Papierweißer Hintergrund, dunkle Tinte und Rostrot als einziger starker Akzent.
- Serifenschrift bleibt Überschriften vorbehalten; Bedienung und Status verwenden die Sans-Serif-Schrift.
- Keine Glasmorphismusflächen oder zusätzlichen dekorativen Verläufe.
- Moderne Wirkung entsteht durch klare Zustände, konsistente Radien, ruhige Abstände und weiche zweistufige Schatten.

### Karten und Auswahl

- Checkbox links oben auf der Vorschau mit mindestens 44 × 44 px Trefferfläche und 22 × 22 px sichtbarem Feld.
- Checkboxen erscheinen beim Überfahren; im aktiven Auswahlmodus bleiben sie auf allen Karten sichtbar.
- Ausgewählte Karten erhalten eine 2-px-Primärkontur, eine sehr leichte Primärfärbung und ein deutliches Häkchen.
- Dynamische Zähler verwenden tabellarische Ziffern.

### Auswahlhinweis und Aktionsleiste

- Direkt über dem Raster erscheint eine schmale Fläche mit Auswahlanzahl und optionalem Wechsel auf alle Treffer.
- Desktop: deckende, schwebende Aktionsleiste unten mittig mit feinem Rand und tiefem Schatten.
- Mobil: zweizeilige Leiste über die verfügbare Breite mit Safe-Area-Abstand.
- Neutrale Aktionen nutzen ruhige Flächen; destruktives Rot erscheint erst in der Papierkorbbestätigung.
- Hauptaktion eines Dialogs nutzt Rostrot.

### Dialoge und Aktivitätsanzeige

- Dialoge sind auf Desktop zentriert und auf Mobilgeräten als Bottom Sheet gestaltet.
- Jeder Dialog behandelt eine einzelne Entscheidung.
- Exportfortschritt erscheint in einer kompakten Aktivitätsanzeige in der visuellen Sprache des Upload-Managers.
- Statusänderungen werden mit `aria-live` angekündigt; Fokus wird beim Schließen zum Auslöser zurückgeführt.

### Bewegung und Barrierefreiheit

- Übergänge dauern 160–200 ms und betreffen nur Farbe, Schatten, Position oder Deckkraft.
- `prefers-reduced-motion` deaktiviert nicht notwendige Bewegung.
- Alle Ziele sind mindestens 44 × 44 px groß.
- Native Checkboxen und Buttons bleiben per Tastatur bedienbar.
- Fokuszustände, Beschriftungen und Kontraste erfüllen mindestens WCAG AA.

## Fehler- und Randfälle

- Leere Auswahl: keine Aktion, verständlicher Hinweis.
- Auswahl ändert sich durch Filterwechsel: Auswahl wird zurückgesetzt.
- Dokument während der Aktion gelöscht oder Zugriff entzogen: auslassen und zählen.
- Zielordner während der Aktion gelöscht: Verschieben nicht starten.
- Gemischte Sichtbarkeit bei serverseitiger Gesamtauswahl: Verschieben ablehnen.
- Tag zwischen Dialogöffnung und Absenden gelöscht: betroffene Tagoperation ablehnen, Auswahl erhalten.
- Exportdatei nicht lesbar: Element protokollieren, restliches ZIP fortsetzen.
- Kein freier Speicherplatz: Export fehlschlagen lassen, temporäre Datei bereinigen und verständlich melden.
- Browser wird geschlossen: Job und Fortschritt bleiben erhalten.
- Zwei gleiche Ordner- oder Dateinamen: kollisionsfreie ZIP-Pfade erzeugen.

## Teststrategie

- Auswahlzustand: explizite Seite, alle Treffer, Ausschlüsse und Zurücksetzen bei Kontextwechsel.
- Filterauflösung: Ordner mit Unterordnern, Suche, Bereich, Jahr und mehrere Tags.
- Berechtigungen: privater Zugriff, Familie, Administrator und währenddessen entzogener Zugriff.
- Aktionen: Verschieben, Tags ergänzen/entfernen, Papierkorb und strukturierte Teilergebnisse.
- Sichtbarkeit: gemeinsame Ziele und Ablehnung gemischter Auswahlen.
- Export-Snapshot: stabile Versionen und Pfade nach späteren Dokumentänderungen.
- ZIP: Ordnerstruktur, Originalendungen, bereinigte und doppelte Namen, große gestreamte Dateien.
- Worker: Fortschritt, Wiederholung, temporäre Bereinigung und Teilfehler.
- Ablauf: Download vor und Ablehnung nach 24 Stunden.
- Routen: Eigentümer-/Adminprüfung, No-Cache-Header und keine Pfadlecks.
- Oberfläche: Tastaturbedienung, Fokus, Live-Status, reduzierte Bewegung und mobile Aktionsleiste.

## Entscheidungsprotokoll

1. Normale Benutzer erhalten Mehrfachbearbeitung; die bestehende Adminauswahl ist nicht ausreichend.
2. Unterstützte Aktionen sind Verschieben, Tags hinzufügen/entfernen, Papierkorb und Sammeldownload.
3. Auswahl gilt wahlweise für die aktuelle Seite oder alle Treffer eines Ordners, Filters oder einer Suche.
4. Zugängliche Familiendokumente dürfen entsprechend dem Einzelverhalten von jedem berechtigten Benutzer bearbeitet werden.
5. Teilerfolg ist gewünscht; einzelne Zugriffs- oder Dateifehler stoppen die Gesamtaktion nicht.
6. Gemischte private und gemeinsame Auswahl kann nicht gemeinsam verschoben werden.
7. Exporte sind Hintergrundaufträge statt lang laufender HTTP-Streams.
8. Archive werden als ZIP mit Papervard-Ordnerstruktur erzeugt.
9. Fertige Archive laufen nach 24 Stunden ab.
10. Exportzustand wird fachlich modelliert und über den bestehenden Worker verarbeitet.
11. Das visuelle System bleibt warm, editorial und zurückhaltend; Auswahlzustände nutzen das bestehende Rostrot.
