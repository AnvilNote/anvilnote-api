import { PrismaClient } from "@prisma/client";

declare global {
  var __anvilnotePrisma__: PrismaClient | undefined;
}

const logLevels: ("warn" | "error")[] =
  process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

// Pick the client by DATABASE_URL. A `file:` URL means the desktop build, which
// uses the embedded SQLite client generated from prisma/sqlite.prisma into
// src/generated/sqlite-client. It is loaded lazily (require) so the cloud build
// never needs that generated module. The SQLite client is structurally
// compatible with the Postgres PrismaClient for our models (status is a string
// union in both), so we expose it under the same type.
function createPrisma(): PrismaClient {
  if ((process.env.DATABASE_URL ?? "").startsWith("file:")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../generated/sqlite-client") as {
      PrismaClient: new (opts?: unknown) => unknown;
    };
    return new mod.PrismaClient({ log: logLevels }) as unknown as PrismaClient;
  }
  return new PrismaClient({ log: logLevels });
}

export const prisma = global.__anvilnotePrisma__ ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  global.__anvilnotePrisma__ = prisma;
}
