# Manga Shelf Architecture

## Goals

Manga Shelf is a personal collection tracker optimized for quick purchase checks and low-friction volume entry. The MVP favors simple self-hosting, direct workflows, and easy correction over perfect catalog accuracy.

## Folder Structure

```text
book-rec/
  backend/
    app/
      database.py
      main.py
      metadata.py
      schemas.py
    Dockerfile
    requirements.txt
  frontend/
    src/
      api.ts
      App.tsx
      main.tsx
      styles.css
      types.ts
    Dockerfile
    nginx.conf
    package.json
    tsconfig.json
    vite.config.ts
  docs/
    architecture.md
  docker-compose.yml
```

## Backend

FastAPI exposes a small JSON API over SQLite. SQLite is a good MVP fit because the app is single-user, self-hosted, and write volume is low. The schema avoids SQLite-specific tricks so it can migrate to PostgreSQL later.

### Database Schema

`series`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer primary key | Internal ID |
| `title` | text not null | Grouping title |
| `original_title` | text | Optional original-language title |
| `author` | text | Shared author where known |
| `publisher` | text | Shared publisher where known |
| `status` | text | Optional collecting/publication status |
| `notes` | text | User notes |
| `created_at` | text | ISO timestamp |
| `updated_at` | text | ISO timestamp |

`volumes`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer primary key | Internal ID |
| `series_id` | integer not null | Foreign key to `series` |
| `title` | text not null | Volume title |
| `volume_number` | text | Kept as text to support `1`, `01`, `1.5`, omnibuses |
| `isbn_13` | text unique where present | Duplicate detection |
| `isbn_10` | text unique where present | Duplicate detection |
| `barcode` | text unique where present | Duplicate detection |
| `cover_url` | text | External cover URL |
| `published_date` | text | Provider date string |
| `purchased_at` | text | Date owned/purchased |
| `storage_location` | text | Shelf, box, room, store, etc. |
| `notes` | text | User notes |
| `created_at` | text | ISO timestamp |
| `updated_at` | text | ISO timestamp |

Indexes cover series title, author, publisher, volume title, volume number, and ISBN/barcode fields for fast search and duplicate checks.

## API Design

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Container health check |
| `GET` | `/api/dashboard` | Owned count, series count, recent additions |
| `GET` | `/api/collection?search=` | Series grouped with matching volumes |
| `GET` | `/api/volumes/{id}` | Fetch one volume |
| `POST` | `/api/metadata/lookup` | Lookup ISBN/barcode metadata and duplicate status |
| `POST` | `/api/volumes` | Save a reviewed volume |
| `PUT` | `/api/volumes/{id}` | Edit a volume |
| `DELETE` | `/api/volumes/{id}` | Delete a volume |

The create endpoint rejects duplicate ISBN/barcode values with `409 Conflict`. The lookup endpoint also returns duplicate matches so the UI can warn before save.

## Recommended Libraries

Frontend:

- `React`, `TypeScript`, `Vite`
- `@zxing/browser` for camera barcode scanning
- Browser `fetch` for API calls

Backend:

- `FastAPI`, `Uvicorn`
- `httpx` for metadata provider requests
- Python standard `sqlite3` for a small dependency footprint

Deployment:

- Docker Compose
- Nginx serving the frontend and reverse proxying `/api` and `/health`

## Barcode Scanning Approach

The frontend uses `@zxing/browser` to scan EAN/ISBN barcodes from the device camera. The add flow keeps manual ISBN/barcode entry visible as a fallback because camera permissions, lighting, and older devices can fail. HTTPS is required by most mobile browsers for camera access, except on localhost.

## Metadata Provider Strategy

Lookup is provider-agnostic and returns normalized candidates.

1. Check the local collection for duplicate ISBN/barcode matches.
2. If `GEMINI_API_KEY` is configured, ask Gemini for structured JSON metadata for the ISBN.
3. Normalize identifiers, authors, publisher, title, cover URL, and published date into one review model.
4. Prefer speed over completeness. The user can edit fields before saving.

Gemini is useful for Thai translated manga and light novels where public book APIs often miss metadata. It is treated as a convenience provider, not an authority: the backend requests JSON with a response schema, validates the response, and drops it if the model reports low confidence or no exact match. The review step remains mandatory so the user can correct hallucinations or incomplete metadata before saving.

Series grouping is heuristic for the MVP. The backend derives a series title by stripping common volume suffixes from metadata titles, then matches existing series by normalized title and author. Manual correction remains available.

## MVP Implementation Plan

1. Build schema, migrations-on-start, and duplicate-safe create/update APIs.
2. Add metadata lookup and normalized candidate responses.
3. Build mobile-first add flow: scan/manual entry, lookup, review, save.
4. Build grouped collection search and dashboard.
5. Add edit/delete volume actions.
6. Package with Docker Compose and Nginx reverse proxy.
7. Add focused tests around duplicate detection and metadata normalization.

## Future Extensibility

- Add PostgreSQL by replacing the connection layer or introducing SQLAlchemy migrations.
- Add CSV import/export for backup and bulk entry.
- Add configurable provider priority and API keys if needed.
- Add series-level editing and merge/split tools.
- Add offline-first caching for convention/store use.
- Add optional authentication at the reverse proxy layer for internet-exposed deployments.
