// Type-only import: erased at compile time, so the runtime never loads
// @prisma/client unless the Postgres branch actually requires it. This lets the
// desktop (SQLite) build run without a generated default client.
import type { PrismaClient } from "@prisma/client";

declare global {
  var __anvilnotePrisma__: PrismaClient | undefined;
}

const logLevels: ("warn" | "error")[] =
  process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

// Pick the client by DATABASE_URL. A `file:` URL means the desktop build, which
// uses the embedded SQLite client generated from prisma/sqlite.prisma into
// src/generated/sqlite-client. Each branch requires its client lazily, so the
// cloud build never loads the SQLite client and the desktop build never loads
// the (possibly ungenerated) default @prisma/client. The SQLite client is
// structurally compatible with the Postgres PrismaClient for our models (status
// is a string union in both), so we expose it under the same type.
function createPrisma(): PrismaClient {
  type Ctor = { PrismaClient: new (opts?: unknown) => unknown };
  if ((process.env.DATABASE_URL ?? "").startsWith("file:")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../generated/sqlite-client") as Ctor;
    return new mod.PrismaClient({ log: logLevels }) as unknown as PrismaClient;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@prisma/client") as Ctor;
  return new mod.PrismaClient({ log: logLevels }) as unknown as PrismaClient;
}

export const prisma = global.__anvilnotePrisma__ ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  global.__anvilnotePrisma__ = prisma;
}
