import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  // Bind address. Defaults to all interfaces (unchanged cloud behaviour); the
  // desktop sidecar sets HOST=127.0.0.1 so it never opens an external port.
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:3000,http://localhost:5173,http://localhost:5174"),
  CORS_CREDENTIALS: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  STORAGE_DIR: z.string().default("./storage"),
  TYPST_STORAGE_DIR: z.string().default("./storage/typst"),
  PDF_STORAGE_DIR: z.string().default("./storage/pdf"),
  // Pre-generated static assets (template preview PDFs/thumbnails) served at
  // /static. Produced offline by scripts/generate-template-previews.mjs.
  STATIC_DIR: z.string().default("./static"),
  ANVILNOTE_RENDERER_PATH: z.string().default("../anvilnote-renderer"),
  // Fallback template slug when a document has none and the render request
  // doesn't specify one. Must exist under <renderer>/templates/.
  DEFAULT_TEMPLATE_SLUG: z.string().default("plain-note"),
  TYPST_BIN: z.string().default("typst"),
  // Render artifacts (generated .typ and .pdf files) older than this are
  // swept on startup and after each render to keep storage bounded.
  RENDER_RETENTION_HOURS: z.coerce.number().positive().default(24),
  // Sibling repo: Tiptap JSON -> .docx via Pandoc. Fully decoupled from the
  // Typst renderer — see anvilnote-docx-exporter/README.md.
  ANVILNOTE_DOCX_EXPORTER_PATH: z.string().default("../anvilnote-docx-exporter"),
  // Sibling repo: function-plot spec -> SVG via Typst + simple-plot.
  ANVILNOTE_CHARTS_PATH: z.string().default("../anvilnote-charts"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment variables:\n${issues}`);
}

const cwd = process.cwd();

export const env = {
  ...parsed.data,
  STORAGE_DIR: path.resolve(cwd, parsed.data.STORAGE_DIR),
  TYPST_STORAGE_DIR: path.resolve(cwd, parsed.data.TYPST_STORAGE_DIR),
  PDF_STORAGE_DIR: path.resolve(cwd, parsed.data.PDF_STORAGE_DIR),
  STATIC_DIR: path.resolve(cwd, parsed.data.STATIC_DIR),
  ANVILNOTE_RENDERER_PATH: path.resolve(cwd, parsed.data.ANVILNOTE_RENDERER_PATH),
  ANVILNOTE_DOCX_EXPORTER_PATH: path.resolve(cwd, parsed.data.ANVILNOTE_DOCX_EXPORTER_PATH),
  ANVILNOTE_CHARTS_PATH: path.resolve(cwd, parsed.data.ANVILNOTE_CHARTS_PATH),
};

export type Env = typeof env;
