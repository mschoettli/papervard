# Papervard

Papervard is a Docker-ready family PDF library with private documents, optional family access, in-browser viewing, downloads, and local search across titles, filenames and PDF text.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- PostgreSQL with `pgvector`
- Prisma
- Local PDF text extraction plus OCR via `pdftoppm` and `tesseract`
- Local deterministic embedding adapter for semantic search

## Local Setup

1. Copy `.env.example` to `.env` and replace every `replace-with-...` value. Generate random hex secrets with `openssl rand -hex 32`.
2. Install dependencies with `npm install`.
3. Start Postgres with `docker compose up db`.
4. Run migrations with `npm run prisma:migrate`.
5. Seed the first admin with `npm run db:seed`.
6. Start the app with `npm run dev`.

For local OCR outside Docker, install `poppler-utils` and Tesseract with the language packs for German, English, French, Italian, and Spanish.

The initial admin is configured through `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env`. Change the password after first use and never deploy the example values.

## Documents, search and family access

- `Nur ich` is the default for every new upload. Only the owner can list, search, preview or download it.
- `Familie` makes the document available to all members of the same family.
- Family and application admins cannot read another person's private documents.
- The Documents page searches document titles, original filenames and extracted PDF/OCR text.
- Entering a four-digit year such as `2024` shows documents assigned to that year. The year filter can be used together with a text search.
- Several PDFs can be selected or dragged into the file input at once. Each PDF may be up to 50 MB and a submission up to 75 MB.
- A manually selected year remains fixed during later re-indexing.

Existing documents become family-visible when migration `000003_family_document_access` is deployed. New users automatically join the default family. The decision and security boundaries are recorded in [`docs/decisions/001-family-document-access.md`](docs/decisions/001-family-document-access.md).

## Docker

Run the production stack from the published GHCR image. The app container applies Prisma migrations on startup:

```bash
docker compose pull
docker compose up -d
```

Then seed the first admin inside the app container before first use:

```bash
docker compose run --rm app npm run db:seed
```

By default Compose uses `ghcr.io/mschoettli/papervard:latest`. Override it with `PAPERVARD_IMAGE` if you publish a different tag.

Set `AUTH_COOKIE_SECURE=true` only when the app is served over HTTPS. Keep it `false` for plain HTTP Docker or local reverse-proxy setups.

Admins can open `System` in the app to check for a newer GitHub image and trigger an update. The update button uses the bundled Watchtower HTTP API:

1. Generate one token with `openssl rand -hex 32` and set it as `WATCHTOWER_HTTP_API_TOKEN` in `.env`.
2. Compose passes the same token to the app and Watchtower; do not expose Watchtower port 8080 publicly.
3. `UPDATE_API_URL` stays `http://watchtower:8080/v1/update` inside the Compose network.
4. The label `com.centurylinklabs.watchtower.enable=true` limits updates to opted-in containers.

The Docker socket gives Watchtower control over Docker. Run the stack only on a trusted host and restrict access to the `.env` file.

## Notes

The semantic search adapter is fully local and intentionally replaceable. For production-grade semantic quality, plug a multilingual local embedding model into `src/server/search/embeddings.ts` while keeping the same `vector(384)` storage contract or migrate the vector dimension.
