// First-run schema creation for the embedded SQLite database (desktop builds).
//
// We avoid shipping the Prisma CLI in the packaged app: instead these idempotent
// CREATE TABLE statements (generated from prisma/sqlite.prisma via
// `prisma migrate diff`) are applied on boot. Keep this in sync with that schema
// if the models change.

import type { PrismaClient } from "@prisma/client";

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "metadata" JSONB,
    "templateSettings" JSONB,
    "templateId" TEXT,
    "typstSource" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
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
];

/** Create the tables if they don't exist. Safe to run on every boot. */
export async function ensureSqliteSchema(client: PrismaClient): Promise<void> {
  for (const sql of STATEMENTS) {
    await client.$executeRawUnsafe(sql);
  }
}

/** True when the API is configured to use the embedded SQLite database. */
export function isSqlite(): boolean {
  return (process.env.DATABASE_URL ?? "").startsWith("file:");
}
