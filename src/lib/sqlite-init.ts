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
    "numberedHeadings" BOOLEAN NOT NULL DEFAULT true,
    "marginTopCm" REAL,
    "marginBottomCm" REAL,
    "marginLeftCm" REAL,
    "marginRightCm" REAL,
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
    "numberedHeadings" BOOLEAN NOT NULL DEFAULT true,
    "marginTopCm" REAL,
    "marginBottomCm" REAL,
    "marginLeftCm" REAL,
    "marginRightCm" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId")
      REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "AIConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AIConversation_documentId_fkey" FOREIGN KEY ("documentId")
      REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "AIConversationMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "draft" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId")
      REFERENCES "AIConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AIConversationMessage_conversationId_sequence_key"
      UNIQUE ("conversationId", "sequence")
  )`,
  `CREATE TABLE IF NOT EXISTS "AIKeyProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "safeDisplayPrefix" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "AIConversationAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIConversationAttachment_messageId_fkey" FOREIGN KEY ("messageId")
      REFERENCES "AIConversationMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "DocumentVersion_documentId_createdAt_idx"
    ON "DocumentVersion" ("documentId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AIConversation_documentId_lastMessageAt_id_idx"
    ON "AIConversation" ("documentId", "lastMessageAt", "id")`,
  `CREATE INDEX IF NOT EXISTS "AIConversationMessage_conversationId_createdAt_id_idx"
    ON "AIConversationMessage" ("conversationId", "createdAt", "id")`,
  `CREATE INDEX IF NOT EXISTS "AIKeyProfile_providerId_isActive_idx"
    ON "AIKeyProfile" ("providerId", "isActive")`,
  `CREATE INDEX IF NOT EXISTS "AIConversationAttachment_messageId_createdAt_id_idx"
    ON "AIConversationAttachment" ("messageId", "createdAt", "id")`,
  `CREATE INDEX IF NOT EXISTS "AIConversationAttachment_storageKey_idx"
    ON "AIConversationAttachment" ("storageKey")`,
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

  // Existing databases predate numberedHeadings/margins (both added the same
  // session, on Document and DocumentVersion) — this was the actual bug a
  // real desktop build hit: PATCH /api/documents/:id 500'd because Prisma's
  // generated SQLite client expected these columns and the on-disk table
  // never got them, since this bootstrap file wasn't updated when those
  // features shipped. Add them once, idempotently, same pattern as
  // projectId/icon above. Brand-new databases already have them from the
  // CREATE TABLE statements above.
  for (const table of ["Document", "DocumentVersion"] as const) {
    if (!(await columnExists(client, table, "numberedHeadings"))) {
      await client.$executeRawUnsafe(
        `ALTER TABLE "${table}" ADD COLUMN "numberedHeadings" BOOLEAN NOT NULL DEFAULT true`,
      );
    }
    for (const column of ["marginTopCm", "marginBottomCm", "marginLeftCm", "marginRightCm"] as const) {
      if (!(await columnExists(client, table, column))) {
        await client.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" REAL`);
      }
    }
  }
}

/** True when the API is configured to use the embedded SQLite database. */
export function isSqlite(): boolean {
  return (process.env.DATABASE_URL ?? "").startsWith("file:");
}
