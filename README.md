# Papervard

Papervard ist ein vollständig lokales Dokumentenarchiv für Familien und kleine Teams. Es verwaltet private und gemeinsame Dokumente, verschachtelte Ordner, manuelle Tags, Sammlungen, Versionen, DICOM-Studien, einen 30-Tage-Papierkorb und eine durchsuchbare, nur für Administratoren freigegebene SMB-Arbeitsablage.

Es gibt keine KI-Tags und keine Verbindung zu OpenAI, Claude oder anderen externen KI-Diensten. Texterkennung, Vorschau, Suche und Bearbeitung laufen im lokalen Docker-Stack.

## Funktionen

- Private Bereiche und der gemeinsame Familienbereich sind nach Mitgliedern gegliedert.
- Jedes Dokument liegt in einem Ordner; ohne Ziel landet es im unveränderlichen Systemordner `Unsortiert`.
- Ordner können verschachtelt, umbenannt, verschoben und über Drag-and-drop organisiert werden.
- Die globale Suche durchsucht alle zugänglichen Dokumente; die Ordnersuche beschränkt sich auf einen Ordner und seine Unterordner.
- Manuelle, familienweite Tags funktionieren für Dokumente, Ordner, Sammlungen und DICOM-Serien. Mitglieder dürfen Tags anlegen, bearbeiten, zusammenführen und zuweisen.
- Gelöschte Ordner und Dokumente bleiben 30 Tage wiederherstellbar.
- Uploads sind blockweise, fortsetzbar und zeigen Upload- sowie Verarbeitungsfortschritt. Papervard setzt keine eigene Dateigrößenobergrenze; verfügbarer Speicher, Dateisystem, Browser und Reverse Proxy bleiben technische Grenzen.
- Archive werden nach einem Passwort gefragt, falls sie geschützt sind. Das Passwort wird nicht gespeichert.
- Archive und Verzeichnisimporte werden als flache Sammlungen abgebildet; tiefe Quellstrukturen erzeugen nicht automatisch viele verschachtelte Papervard-Ordner.
- Inhaltsänderungen erzeugen unveränderliche Versionen. Versionen werden unbegrenzt behalten; eine Wiederherstellung erzeugt wiederum eine neue Version.
- Veraltete Web- oder SMB-Speicherungen werden als Konfliktversion gesichert und überschreiben die aktuelle Version nicht unbemerkt.

## Unterstützte Formate

Papervard erkennt Dateiendungen und prüft, soweit möglich, zusätzlich die tatsächliche Signatur.

- Dokumente: PDF, DOC/DOCX, ODT, RTF, TXT, Markdown, HTML, TeX, JSON, XML, YAML, TOML, SQL, ICS, VCF und Pages
- Tabellen: XLS/XLSX/XLSM, ODS, CSV/TSV und Numbers
- Präsentationen: PPT/PPTX, ODP und Keynote
- Bilder und Scans: JPEG, PNG, TIFF, WebP, GIF, BMP, HEIF/HEIC, AVIF, SVG sowie verbreitete Kamera-RAW-Formate
- E-Mail: EML, MSG und MBOX
- E-Books: EPUB, FB2, MOBI und DRM-freie AZW/AZW3
- Medizinische Bilder: DICOM (`.dcm`, `.dicom`), Studien, Serien, Einzelbilder und mehrbildige Instanzen
- Sammlungen: ZIP, TAR, GZ/TGZ, 7Z und lokal lesbare RAR-Archive

Wenn ein Format lokal nicht visuell konvertiert werden kann, bleiben Original, Download, extrahierter Text und Metadaten verfügbar.

## Lokale Bearbeitung

- ONLYOFFICE Docs bearbeitet Word-/OpenDocument-Dateien, Tabellen, Präsentationen, Text/HTML und PDF gemeinsam in Echtzeit.
- Markdown und andere strukturierte Textformate verwenden den nativen UTF-8-Editor.
- Unterstützte Rasterbilder können verlustarm gedreht oder gespiegelt werden. Jede Änderung wird als abgeleitete Version gespeichert.
- Gemeinsame Inhaltsnotizen stehen bei jeder Dateifamilie zur Verfügung.
- DICOM bietet Serienwahl, Cine, Fensterung, Zoom, Verschieben, Längen-, Winkel- und ROI-Messungen. Messungen werden separat gespeichert und verändern nie die Originalpixel.

Alle Mitglieder mit Zugriff dürfen gemeinsame Inhalte bearbeiten. Administratoren dürfen zusätzlich private Inhalte verwalten; normale Mitglieder sehen private Inhalte anderer Personen nicht.

## Wichtiger DICOM-Hinweis

Patientenname, Geburtsdatum und Patient-ID werden nach der Extraktion mit AES-256-GCM verschlüsselt in PostgreSQL gespeichert und nicht in die allgemeine Volltextsuche aufgenommen.

Die originalen DICOM-Dateien werden auf ausdrückliche Produktentscheidung **nicht verschlüsselt und nicht anonymisiert**. Sie bleiben bytegenau erhalten und können weiterhin lesbare Patientendaten enthalten. Der Docker-Host bzw. das NAS muss deshalb verschlüsselte Datenträger und Backups verwenden. SMB, Docker-Verzeichnisse und Sicherungen dürfen nur vertrauenswürdigen Administratoren zugänglich sein. Papervard ist kein diagnostisch zertifiziertes Befundsystem.

## Docker-Schnellstart

Voraussetzungen sind Docker Engine mit Compose sowie ein ARM64- oder x86-64-System.

1. Konfiguration anlegen:

   ```bash
   cp .env.example .env
   mkdir -p config data
   ```

2. In `.env` mindestens sichere Werte für `POSTGRES_PASSWORD`, `SEED_ADMIN_PASSWORD`, `ONLYOFFICE_JWT_SECRET` und `SMB_ADMIN_PASSWORD` setzen. Zufallswerte lassen sich zum Beispiel mit `openssl rand -hex 32` erzeugen.

3. Stack bauen und starten:

   ```bash
   docker compose up -d --build
   ```

4. Papervard unter `http://localhost:3000` öffnen. Der App-Container spielt Migrationen ein und legt den ersten Administrator aus `SEED_ADMIN_EMAIL` und `SEED_ADMIN_PASSWORD` idempotent an.

Die ONLYOFFICE-Browseradresse wird mit `ONLYOFFICE_BROWSER_URL` konfiguriert. Bei Zugriff von einem anderen Rechner muss sie auf eine vom Browser erreichbare Adresse zeigen, zum Beispiel `http://papervard.lan:8081`.

### Genau zwei Speicherwurzeln

Compose definiert nur diese beiden persistenten Hostpfade:

- `PAPERVARD_CONFIG_PATH`: Schlüssel und wiederherstellungsrelevante Konfiguration
- `PAPERVARD_DATA_PATH`: PostgreSQL, Original-Blobs, Versionen, Vorschauen, Upload-Staging und SMB-Arbeitsbibliothek

Die Standardwerte sind `./config` und `./data`. Beide Pfade müssen gemeinsam gesichert werden. Ohne `config/secrets/dicom-field-key` können verschlüsselte DICOM-Metadaten nach einer Wiederherstellung nicht mehr entschlüsselt werden. Die automatisch erzeugten Schlüsseldateien besitzen restriktive Rechte; `.env`, `config` und `data` gehören nicht ins Git-Repository.

## SMB für Administratoren

Samba veröffentlicht die Freigabe `Papervard` standardmäßig auf Port 445. Anmeldung:

- Benutzer: `admin`
- Passwort: Wert aus `SMB_ADMIN_PASSWORD`

Die Struktur lautet:

```text
Papervard/
├── Familie/
│   └── <Mitglied>/
└── Privat/
    └── <Mitglied>/
```

Nur der SMB-Administrator erhält Zugriff. Neue Dateien und Ordner werden importiert, Dateiänderungen erzeugen Versionen, Umbenennungen und Verschiebungen werden zurück in Papervard gespiegelt und Löschungen wandern in den Papierkorb. Eine Verschiebung zwischen Mitgliedsordnern überträgt den Eigentümer; eine Verschiebung zwischen `Familie` und `Privat` ändert die Sichtbarkeit. Änderungen werden als `SMB-Administrator` protokolliert.

SMB zeigt eine synchronisierte Arbeitskopie unter `data/library`, niemals einen beschreibbaren Hardlink auf den unveränderlichen Blob-Speicher. Dateisystemzugriff auf andere Unterordner von `data` darf nicht freigegeben werden.

## Lokale Entwicklung

```bash
npm install
docker compose up -d db tika onlyoffice
npm run prisma:deploy
npm run db:seed
npm run dev
```

Den Worker in einem zweiten Terminal starten:

```bash
npm run worker
```

Für eine lokale Node-Ausführung müssen `DATABASE_URL`, `AUTH_SECRET`, `PAPERVARD_SIGNING_SECRET`, `DICOM_FIELD_KEY`, `ONLYOFFICE_JWT_SECRET` und die Dienst-URLs gesetzt sein.

## Prüfung

```bash
npm run typecheck
npm test
npm run build
docker compose config
```

Die Architekturentscheidungen stehen in [`docs/decisions`](docs/decisions). Besonders relevant sind [Ordner, Tags und Papierkorb](docs/decisions/002-folders-tags-trash.md) sowie [Mehrformat, Bearbeitung, DICOM und SMB](docs/decisions/003-multiformat-editing-dicom-smb.md).

## Sicherheit und Betrieb

- Für Zugriff außerhalb eines vertrauenswürdigen LANs ist HTTPS erforderlich; dann `AUTH_COOKIE_SECURE=true` setzen.
- Papervard führt keine Makros oder eingebetteten aktiven Inhalte aus.
- Originale und Versionen sind inhaltadressiert und unveränderlich; die SMB-Bibliothek ist eine kontrollierte Arbeitskopie.
- Passwörter für geschützte Archive werden nur für den laufenden Verarbeitungsversuch verwendet.
- Administratoren sind Vertrauenspersonen: Sie dürfen private Dokumente verwalten und besitzen als Einzige SMB-Zugriff.
- Vor Updates immer `config` und `data` sichern. Updates mit dem optionalen Profil starten: `docker compose --profile updates up -d`.
