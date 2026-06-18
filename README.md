# Papervard

Papervard is a Docker-ready PDF library with login, admin-managed users, PDF upload, year-based browsing, in-browser viewing, downloads, and local hybrid search.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- PostgreSQL with `pgvector`
- Prisma
- Local PDF text extraction plus OCR via `pdftoppm` and `tesseract`
- Local deterministic embedding adapter for semantic search

## Local Setup

1. Copy `.env.example` to `.env` and adjust `AUTH_SECRET`.
2. Install dependencies with `npm install`.
3. Start Postgres with `docker compose up db`.
4. Run migrations with `npm run prisma:migrate`.
5. Seed the first admin with `npm run db:seed`.
6. Start the app with `npm run dev`.

For local OCR outside Docker, install `poppler-utils` and Tesseract with the language packs for German, English, French, Italian, and Spanish.

Seeded admin:

- Email: `admin@papervard.local`
- Password: `Papervard-Admin-123!`

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

Admins can open `System` in the app to check for a newer GitHub image and trigger an update. The update button uses the bundled Watchtower service, so keep `WATCHTOWER_HTTP_API_TOKEN` identical for `app` and `watchtower`.

## Notes

The semantic search adapter is fully local and intentionally replaceable. For production-grade semantic quality, plug a multilingual local embedding model into `src/server/search/embeddings.ts` while keeping the same `vector(384)` storage contract or migrate the vector dimension.
