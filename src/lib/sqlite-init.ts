// First-run schema creation for the embedded SQLite database (desktop builds).
//
// We avoid shipping the Prisma CLI in the packaged app: instead these idempotent
// CREATE TABLE statements (generated from prisma/sqlite.prisma via
// `prisma migrate diff`) are applied on boot. Keep this in sync with that schema
// if the models change.

import type { PrismaClient } from "@prisma/client";

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "tags" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "metadata" JSONB,
    "templateSettings" JSONB,
    "templateId" TEXT,
    "typstSource" TEXT,
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId")
      REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "RenderOutput" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "templateId" TEXT,
    "templateVersion" TEXT,
    "format" TEXT NOT NULL DEFAULT 'pdf',
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "typstPath" TEXT,
    "pdfPath" TEXT,
    "pdfUrl" TEXT,
    "error" TEXT,
    "contentSnapshot" JSONB,
    "metadataSnapshot" JSONB,
    "templateSnapshot" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RenderOutput_documentId_fkey" FOREIGN KEY ("documentId")
      REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "DocumentVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "metadata" JSONB,
    "templateSettings" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId")
      REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "DocumentVersion_documentId_createdAt_idx"
    ON "DocumentVersion" ("documentId", "createdAt")`,
];

/** True if `table` already has a column named `column`. */
async function columnExists(
  client: PrismaClient,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = (await client.$queryRawUnsafe(
    `PRAGMA table_info("${table}")`,
  )) as Array<{ name: string }>;
  return Array.isArray(rows) && rows.some((row) => row.name === column);
}

/** Create the tables if they don't exist. Safe to run on every boot. */
export async function ensureSqliteSchema(client: PrismaClient): Promise<void> {
  for (const sql of STATEMENTS) {
    await client.$executeRawUnsafe(sql);
  }

  // Existing databases predate the projects feature: add the Document.projectId
  // column (with its SET NULL foreign key) once, idempotently. Brand-new
  // databases already have it from the CREATE TABLE above.
  if (!(await columnExists(client, "Document", "projectId"))) {
    await client.$executeRawUnsafe(
      `ALTER TABLE "Document" ADD COLUMN "projectId" TEXT REFERENCES "Project" ("id") ON DELETE SET NULL`,
    );
  }

  // Projects predate the icon field: add it once, idempotently.
  if (!(await columnExists(client, "Project", "icon"))) {
    await client.$executeRawUnsafe(`ALTER TABLE "Project" ADD COLUMN "icon" TEXT`);
  }
}

/** True when the API is configured to use the embedded SQLite database. */
export function isSqlite(): boolean {
  return (process.env.DATABASE_URL ?? "").startsWith("file:");
}
