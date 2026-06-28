import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
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
  ANVILNOTE_RENDERER_PATH: z.string().default("../anvilnote-renderer"),
  TYPST_BIN: z.string().default("typst"),
  // Render artifacts (generated .typ and .pdf files) older than this are
  // swept on startup and after each render to keep storage bounded.
  RENDER_RETENTION_HOURS: z.coerce.number().positive().default(24),
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
  ANVILNOTE_RENDERER_PATH: path.resolve(cwd, parsed.data.ANVILNOTE_RENDERER_PATH),
};

export type Env = typeof env;
