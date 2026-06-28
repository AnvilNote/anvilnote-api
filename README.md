# anvilnote-api

`anvilnote-api` is the Node.js/Express backend for AnvilNote.

It owns:

- document CRUD
- template metadata CRUD
- render job records
- PDF file serving
- CORS and HTTP concerns
- invoking the dedicated renderer CLI

This backend is written in Node.js/Express. The “Rust-powered” part of AnvilNote refers to Typst, not to the backend implementation language.

## Required Sibling Repos

The API expects this local layout:

```txt
parent-folder/
  anvilnote-api/
  anvilnote-renderer/
  anvilnote-web/
```

The renderer path is configured with:

```env
ANVILNOTE_RENDERER_PATH="../anvilnote-renderer"
```

## Stack

- Node.js
- Express.js
- TypeScript
- Prisma
- PostgreSQL
- Zod
- `cors`
- `helmet`
- `morgan`

## Setup

```bash
pnpm install
cp .env.example .env
pnpm prisma:migrate --name init
pnpm prisma:generate
pnpm dev
```

Default API URL:

```txt
http://localhost:4000
```

## Environment

```env
NODE_ENV=development
PORT=4000

DATABASE_URL="postgresql://postgres:postgres@localhost:55432/anvilnote?schema=public"

CORS_ORIGIN="http://localhost:3000,http://localhost:5173,http://localhost:5174"
CORS_CREDENTIALS=true

STORAGE_DIR="./storage"
TYPST_STORAGE_DIR="./storage/typst"
PDF_STORAGE_DIR="./storage/pdf"

ANVILNOTE_RENDERER_PATH="../anvilnote-renderer"
TYPST_BIN="typst"

RENDER_RETENTION_HOURS=24
```

## CORS

Allowed origins are read from `CORS_ORIGIN` as a comma-separated list.

The API also explicitly supports these local frontend origins by default:

- `http://localhost:3000`
- `http://localhost:5173`
- `http://localhost:5174`

Allowed methods:

- `GET`
- `POST`
- `PUT`
- `PATCH`
- `DELETE`
- `OPTIONS`

Allowed headers:

- `Content-Type`
- `Authorization`
- `X-Request-Id`

When `CORS_CREDENTIALS=true`, the API does not use wildcard origins.

## Render Flow

1. `POST /api/documents/:id/render`
2. Load the document and optional template metadata from PostgreSQL
3. Create a `RenderJob`
4. Write a temporary render input JSON file
5. Invoke the renderer CLI:

```bash
pnpm --dir ../anvilnote-renderer --silent render \
  --input /absolute/path/to/render-input.json \
  --output-dir /absolute/path/to/anvilnote-api/storage/pdf \
  --work-dir /absolute/path/to/anvilnote-api/storage/typst
```

6. Parse the renderer stdout JSON
7. Update the job status and store output paths
8. Expose the PDF at `/files/pdf/<filename>.pdf`

The API no longer owns BlockNote-to-Typst conversion, Typst escaping, Typst templates, or direct Typst compilation logic.

## API Endpoints

### Health

- `GET /api/health`

### Documents

- `GET /api/documents`
- `POST /api/documents`
- `GET /api/documents/:id`
- `PATCH /api/documents/:id`
- `DELETE /api/documents/:id`

### Templates

- `GET /api/templates`
- `POST /api/templates`
- `GET /api/templates/:id`
- `PATCH /api/templates/:id`
- `DELETE /api/templates/:id`

### Render

- `POST /api/documents/:id/render`
- `GET /api/render-jobs/:id`
- `GET /files/pdf/:filename`

## Example Requests

Create a document:

```bash
curl -X POST http://localhost:4000/api/documents \
  -H "Content-Type: application/json" \
  -d '{"title":"Lecture 01","content":[],"templateId":"lecture-note","metadata":{"course":"Algorithms"}}'
```

Render a document:

```bash
curl -X POST http://localhost:4000/api/documents/<DOCUMENT_ID>/render \
  -H "Content-Type: application/json" \
  -d '{"exportOptions":{"pageSize":"A4","fontPreset":"serif","includeMetadata":true}}'
```

Fetch the generated PDF:

```bash
curl -I http://localhost:4000/files/pdf/<filename>.pdf
```

## Running API + Renderer Together

In one terminal:

```bash
cd ../anvilnote-renderer
pnpm install
```

In another terminal:

```bash
cd ../anvilnote-api
pnpm dev
```

The API will invoke the renderer CLI on demand. The renderer does not need a separate HTTP server.
