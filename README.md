# AnvilNote API

`anvilnote-api` is the Node.js and Express application service for AnvilNote.
It owns document persistence, projects, versions, template metadata, PDF and
DOCX export orchestration, chart compilation requests, attachment text
extraction, and the trusted HTTP boundary around `@anvilnote/ai-writer`.

The backend is TypeScript running on Node.js. Typst supplies the Rust-based PDF
engine; the API itself is not a Rust service.

## Responsibilities

- Document, project, version, and template APIs
- PostgreSQL and embedded Desktop SQLite runtime profiles
- PDF render records and file serving
- DOCX export through the dedicated exporter CLI
- Function-plot SVG compilation through the charts CLI
- Provider/model metadata and token/cost estimation
- Smart Mode composition and selection rewrite application services
- Attachment extraction for TXT, Markdown, text-layer PDF, and DOCX
- Request cancellation and stable AI error mapping
- Trusted credential resolution without persistent plaintext keys
- Document-scoped AI conversation persistence and cursor pagination

## Required sibling repositories

The source development layout is a polyrepo workspace:

```text
parent-folder/
  anvilnote-ai-writer/
  anvilnote-api/
  anvilnote-web/
  anvilnote-renderer/
  anvilnote-docx-exporter/
  anvilnote-charts/
  anvilnote-desktop/
```

`anvilnote-ai-writer` is a `file:../anvilnote-ai-writer` library dependency.
The renderer, DOCX exporter, and charts repositories are independent CLI
boundaries. Web is the normal browser client, while Desktop builds and stages
all of these siblings into the packaged local application.

## Stack

- Node.js, Express 5, and TypeScript
- Prisma 6
- PostgreSQL 16 for standalone local development
- SQLite through a separately generated Prisma client in Desktop
- Zod 4
- `@anvilnote/ai-writer`
- Multer, Mammoth, and PDF.js for bounded attachment extraction
- Helmet, CORS, and Morgan

## Database profiles

`prisma/schema.prisma` is the PostgreSQL source schema used by the standalone
API development workflow and committed migrations. `prisma/sqlite.prisma`
generates a separate client for the packaged Desktop sidecar. At Desktop
runtime, `DATABASE_URL` is a local `file:` URL and the schema is initialized on
first launch.

This distinction is intentional: the API repository supports both a normal
PostgreSQL service profile and an embedded SQLite Desktop profile.

## Setup

Build AI Writer and the CLI siblings first:

```bash
cd ../anvilnote-ai-writer
pnpm install
pnpm build

cd ../anvilnote-renderer
pnpm install
pnpm build

cd ../anvilnote-docx-exporter
pnpm install
pnpm build:desktop

cd ../anvilnote-charts
pnpm install
pnpm build:desktop
```

Then start the API:

```bash
cd ../anvilnote-api
pnpm install
cp .env.example .env
pnpm prisma:generate
make dev
```

`make dev` starts the PostgreSQL 16 Docker container, applies committed Prisma
migrations, binds the API to `127.0.0.1`, and starts the TypeScript watcher.
The default URL is `http://127.0.0.1:4000`.

Important development values are documented in `.env.example`, including:

```env
HOST=127.0.0.1
DATABASE_URL="postgresql://postgres:postgres@localhost:55432/anvilnote?schema=public"
ANVILNOTE_BROWSER_SESSION_BYOK=true
ANVILNOTE_RENDERER_PATH="../anvilnote-renderer"
ANVILNOTE_DOCX_EXPORTER_PATH="../anvilnote-docx-exporter"
ANVILNOTE_CHARTS_PATH="../anvilnote-charts"
```

Do not place a shared OpenAI key in `.env`. Local browser development passes a
user-entered key for one request/session when the capability is enabled.

## API endpoints

The following routes are registered by the current source.

### Health

- `GET /api/health`

### Documents and projects

- `GET /api/documents`
- `POST /api/documents`
- `GET /api/documents/:id`
- `PATCH /api/documents/:id`
- `DELETE /api/documents/:id`
- `GET /api/projects`
- `POST /api/projects`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id`

### Document versions

- `GET /api/documents/:id/versions`
- `GET /api/documents/:id/versions/:versionId`
- `POST /api/documents/:id/versions`
- `POST /api/documents/:id/versions/:versionId/restore`

### Templates

- `GET /api/templates`
- `GET /api/templates/:slug`
- `GET /api/templates/:slug/preview`

Templates are file-backed renderer manifests. The API does not expose template
create, update, or delete routes.

### PDF, DOCX, and charts

- `POST /api/documents/:id/render`
- `GET /api/render-outputs/:id`
- `GET /files/pdf/:filename`
- `POST /api/documents/:id/export/docx`
- `POST /api/charts/render`

PDF rendering is synchronous. The render-output route reads a recorded terminal
result rather than polling an asynchronous job.

### Smart Mode

- `GET /api/ai/providers` — provider/model metadata, pricing, attachment limits,
  and current runtime capability
- `POST /api/ai/estimate` — provider-neutral token and cost estimate
- `POST /api/ai/test-connection` — minimal credential/model connection test
- `POST /api/ai/attachments/extract` — bounded multipart text extraction
- `POST /api/ai/compose` — document composition
- `POST /api/ai/rewrite-selection` — selected-fragment rewrite
- `POST /api/ai/requests/:requestId/cancel` — cancel a registered request

### Document conversations

- `GET /api/documents/:documentId/ai-conversations`
- `GET /api/documents/:documentId/ai-conversations/:conversationId/messages`
- `POST /api/documents/:documentId/ai-conversations/turns`
- `PATCH /api/documents/:documentId/ai-conversations/:conversationId`
- `DELETE /api/documents/:documentId/ai-conversations/:conversationId`

Conversation and message lists use cursor pagination. The API, not the browser,
loads the bounded same-document history supplied to AI Writer. Browser-supplied
assistant history and drafts are not trusted.

### Desktop key profiles

The following routes require both Desktop runtime mode and the per-launch
Desktop trust token:

- `GET /api/ai/key-profiles`
- `POST /api/ai/key-profiles`
- `PATCH /api/ai/key-profiles/:profileId`
- `POST /api/ai/key-profiles/:profileId/activate`
- `POST /api/ai/key-profiles/:profileId/deactivate`
- `DELETE /api/ai/key-profiles/:profileId`
- `GET /api/ai/key-profiles/active/:providerId/secret`

The database stores Electron `safeStorage` ciphertext and safe profile metadata.
The API cannot decrypt a key. The active ciphertext route is a narrow
main-process integration endpoint and is not exposed by the renderer preload
bridge.

## Attachment extraction

Smart Mode accepts up to five files, 10 MB per file, and 25 MB in total. The
extractor supports:

- UTF-8 `.txt`;
- `.md` and `.markdown` as UTF-8 text;
- text-layer `.pdf` through PDF.js;
- `.docx` through Mammoth raw-text extraction.

Extension and MIME type must agree. Password-protected PDFs fail clearly.
Image-only or scanned PDFs return a warning with no extracted text; OCR is not
performed. Extracted text is capped per file and in aggregate with explicit
truncation warnings.

## BYOK and credential handling

The API does not ship or persist a shared OpenAI credential. It resolves a key
at the trusted request boundary and passes it separately from the writer
request to `@anvilnote/ai-writer/server`.

- Direct browser development uses an explicitly enabled memory-only key and a
  loopback-bound API.
- Remote browser BYOK is disabled unless the deployment operator opts in behind
  HTTPS.
- Desktop main generates a per-launch trust token, decrypts the active
  `safeStorage` profile only for the operation, and calls fixed loopback routes.
- The API database may store ciphertext produced by Electron, but never
  plaintext and never an application encryption key.
- Provider keys, trust tokens, selected content, attachment text, instructions,
  and raw model documents are not added to AI diagnostic metadata.

Provider execution, strict Structured Outputs, retries, usage, pricing, and
OpenAI error mapping remain inside `@anvilnote/ai-writer`. Automated API tests
inject fake application services and do not make paid OpenAI calls.

## Export flows

### PDF

1. The API loads the document and resolves its template metadata.
2. It writes a render record and invokes `anvilnote-renderer/dist/cli.js`.
3. The renderer converts canonical Tiptap JSON to Typst.
4. Typst produces the PDF and generated source.
5. The API records the result and serves the PDF below `/files/pdf`.

### DOCX

1. The API loads and unwraps the stored Tiptap `doc` node.
2. It invokes the bundled `anvilnote-docx-exporter` CLI.
3. The exporter converts Tiptap to Pandoc Markdown and OOXML extensions.
4. Pandoc writes the DOCX, including native OMML equations.
5. The API returns the DOCX as a file response.

Renderer, DOCX exporter, and charts are command-line services, not separate
HTTP servers. They never receive OpenAI credentials.

## Commands

```bash
pnpm dev
pnpm build
pnpm build:desktop
pnpm start
pnpm lint
pnpm typecheck
pnpm test
pnpm prisma:generate
pnpm prisma:generate:sqlite
pnpm prisma:migrate
pnpm prisma:deploy
pnpm prisma:studio
```

Useful Make targets include `make dev`, `make db-up`, `make db-down`,
`make lint`, `make typecheck`, and `make build`.

## Related repositories

- [AnvilNote AI Writer](https://github.com/AnvilNote/anvilnote-ai-writer)
- [AnvilNote Web](https://github.com/AnvilNote/anvilnote-web)
- [AnvilNote Desktop](https://github.com/AnvilNote/anvilnote-desktop)
- [AnvilNote Renderer](https://github.com/AnvilNote/anvilnote-renderer)
- [AnvilNote DOCX Exporter](https://github.com/AnvilNote/anvilnote-docx-exporter)
- [AnvilNote Charts](https://github.com/AnvilNote/anvilnote-charts)
