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

2. In `.env` mindestens sichere Werte für `POSTGRES_PASSWORD`, `SEED_ADMIN_PASSWORD`, `ONLYOFFICE_JWT_SECRET` und `SMB_ADMIN_PASSWORD` setzen. Die vollständige Schlüsselübersicht und passende Erzeugungsbefehle stehen im Abschnitt [Schlüssel, Passwörter und Token](#schlüssel-passwörter-und-token).

3. Stack bauen und starten:

   ```bash
   docker compose up -d --build
   ```

4. Papervard unter `http://localhost:3000` öffnen. Der App-Container spielt Migrationen ein und legt den ersten Administrator aus `SEED_ADMIN_EMAIL` und `SEED_ADMIN_PASSWORD` idempotent an.

Die ONLYOFFICE-Browseradresse wird mit `ONLYOFFICE_BROWSER_URL` konfiguriert. Bei Zugriff von einem anderen Rechner muss sie auf eine vom Browser erreichbare Adresse zeigen, zum Beispiel `http://papervard.lan:8081`.

Wird Papervard von Runvard installiert, kann `ONLYOFFICE_BROWSER_URL` den Wert `auto:<Port>` verwenden. Papervard übernimmt dann Protokoll und Hostnamen aus der geöffneten Browseradresse. Mit `PAPERVARD_UPDATE_MODE=external` bleibt die Versionsprüfung sichtbar, während Installation und Neustart neuer Images bewusst dem Runvard App-Store gehören.

### Schlüssel, Passwörter und Token

Für unabhängige zufällige Hex-Werte jeweils einen neuen Befehl ausführen:

```bash
openssl rand -hex 32
```

Der DICOM-Schlüssel muss dagegen Base64-kodiert genau 32 Byte enthalten:

```bash
openssl rand -base64 32
```

Jeder Wert darf nur für einen Zweck verwendet werden. Echte Schlüssel gehören ausschließlich in `.env` oder in die automatisch angelegten Dateien unter `config/secrets`, niemals in Git, Screenshots, Support-Nachrichten oder die README.

| Variable | Zweck und Erzeugung | Verhalten bei Änderung |
|---|---|---|
| `AUTH_SECRET` | Signiert Anmeldesitzungen. Kann leer bleiben; Papervard erzeugt dann automatisch einen Hex-Schlüssel in `config/secrets/auth-secret`. Manuell: `openssl rand -hex 32`. | Eine Änderung meldet alle Benutzer ab und macht vorhandene Sitzungscookies ungültig. |
| `PAPERVARD_SIGNING_SECRET` | Signiert kurzlebige Datei-, Vorschau- und Editor-Tokens. Kann leer bleiben; automatische Ablage in `config/secrets/signing-secret`. Manuell: `openssl rand -hex 32`. Der Wert muss mindestens 24 Zeichen lang sein. | Bereits ausgegebene signierte Links und Editor-Tokens werden ungültig. Gespeicherte Dokumente bleiben erhalten. |
| `DICOM_FIELD_KEY` | Verschlüsselt Patientenname, Geburtsdatum und Patient-ID mit AES-256-GCM. Kann leer bleiben; automatische Ablage in `config/secrets/dicom-field-key`. Manuell ausschließlich mit `openssl rand -base64 32`. | **Nach dem ersten DICOM-Import niemals ohne geplante Datenmigration ändern.** Andernfalls können vorhandene verschlüsselte Patientenmetadaten nicht mehr entschlüsselt werden. |
| `POSTGRES_PASSWORD` | Passwort des PostgreSQL-Benutzers `papervard`. Manuell mit `openssl rand -hex 32` erzeugen. | Bei einer bestehenden Datenbank nicht nur in `.env` ändern. Das Datenbankpasswort muss kontrolliert in PostgreSQL und anschließend in `.env` gemeinsam geändert werden, sonst kann Papervard die Datenbank nicht mehr öffnen. |
| `SEED_ADMIN_PASSWORD` | Startpasswort für `SEED_ADMIN_EMAIL`. Ein langes individuelles Passwort oder `openssl rand -hex 32` verwenden. | Ändert ein bestehendes Administratorkonto nicht automatisch. Ein bewusster Reset erfolgt einmalig mit `docker compose run --rm -e SEED_ADMIN_RESET_PASSWORD=true app npm run db:seed`; danach den temporären Container wieder entfernen lassen. |
| `ONLYOFFICE_JWT_SECRET` | Gemeinsames JWT-Geheimnis zwischen Papervard und ONLYOFFICE. Manuell mit `openssl rand -hex 32` erzeugen; mindestens 24 Zeichen. | Muss in beiden Diensten identisch sein. Nach einer Änderung `app`, `worker` und `onlyoffice` gemeinsam neu erstellen; offene Editor-Sitzungen werden ungültig. |
| `SMB_ADMIN_PASSWORD` | Passwort des alleinigen SMB-Benutzers `admin`. Ein langes individuelles Passwort oder `openssl rand -hex 32` verwenden. | Nach einer Änderung den Samba-Container neu erstellen und gespeicherte Anmeldedaten auf den Clients aktualisieren. Dokumentdaten werden nicht verändert. |
| `WATCHTOWER_HTTP_API_TOKEN` | Optionaler Bearer-Token für das Update-Profil. Mit `openssl rand -hex 32` erzeugen. Papervard und Watchtower erhalten über Compose denselben Wert. | Nach einer Änderung `app` und `watchtower` neu erstellen. Alte API-Aufrufe werden abgewiesen. Den Watchtower-Port nicht ungeschützt ins LAN oder Internet veröffentlichen. |

Beispielstruktur ohne echte Werte:

```env
AUTH_SECRET=""
PAPERVARD_SIGNING_SECRET=""
DICOM_FIELD_KEY=""
POSTGRES_PASSWORD="hier-einen-eigenen-hex-wert-eintragen"
SEED_ADMIN_PASSWORD="hier-ein-eigenes-startpasswort-eintragen"
ONLYOFFICE_JWT_SECRET="hier-einen-eigenen-hex-wert-eintragen"
SMB_ADMIN_PASSWORD="hier-ein-eigenes-passwort-eintragen"
WATCHTOWER_HTTP_API_TOKEN="hier-einen-eigenen-hex-wert-eintragen"
```

Leere Werte sind nur bei `AUTH_SECRET`, `PAPERVARD_SIGNING_SECRET` und `DICOM_FIELD_KEY` vorgesehen. Der Entrypoint erzeugt diese drei Werte beim ersten Start und verwendet die vorhandenen Dateien bei späteren Starts erneut. Wurde einer dieser Werte stattdessen manuell in `.env` gesetzt, darf er später nicht einfach geleert werden: Papervard würde sonst einen anderen automatischen Schlüssel erzeugen. Vor jeder Schlüsseländerung müssen mindestens `.env`, `config` und `data` gemeinsam gesichert werden.

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
