import { promises as fs } from "node:fs";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { corsOptions } from "./config/cors";
import { env } from "./config/env";
import { errorMiddleware } from "./middleware/error.middleware";
import { notFoundMiddleware } from "./middleware/not-found.middleware";
import { requestIdMiddleware } from "./middleware/request-id.middleware";
import { sweepRenderArtifacts } from "./lib/storage-cleanup";
import { prisma } from "./lib/prisma";
import { ensureSqliteSchema, isSqlite } from "./lib/sqlite-init";
import { documentRouter } from "./modules/documents/document.routes";
import { projectRouter } from "./modules/projects/project.routes";
import { healthRouter } from "./modules/health/health.routes";
import { renderRouter } from "./modules/render/render.routes";
import { templateRouter } from "./modules/templates/template.routes";

export async function createApp() {
  await Promise.all([
    fs.mkdir(env.STORAGE_DIR, { recursive: true }),
    fs.mkdir(env.TYPST_STORAGE_DIR, { recursive: true }),
    fs.mkdir(env.PDF_STORAGE_DIR, { recursive: true }),
  ]);

  // Desktop (embedded SQLite): create the schema on first launch. Cloud
  // (Postgres) keeps using its own migrations and skips this entirely.
  if (isSqlite()) {
    await ensureSqliteSchema(prisma);
  }

  // Sweep stale render artifacts on boot; best-effort, never blocks startup.
  void sweepRenderArtifacts()
    .then((removed) => {
      if (removed > 0) {
        console.log(`storage-cleanup: removed ${removed} stale render artifact(s)`);
      }
    })
    .catch((error) => {
      console.warn("storage-cleanup: startup sweep failed", error);
    });

  const app = express();

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("dev"));

  app.get("/", (_req, res) => {
    res.json({
      ok: true,
      service: "anvilnote-api",
    });
  });

  app.use("/files/pdf", express.static(path.resolve(env.PDF_STORAGE_DIR), {
    fallthrough: false,
    index: false,
    immutable: false,
  }));

  // Pre-generated static assets (template preview PDFs/thumbnails/manifests),
  // produced offline by scripts/generate-template-previews.mjs. The CORP header
  // lets the web app (different origin) embed these in <img>/pdf.js.
  app.use(
    "/static",
    (_req, res, next) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(path.resolve(env.STATIC_DIR), { index: false }),
  );

  app.use("/api/health", healthRouter);
  app.use("/api/documents", documentRouter);
  app.use("/api/projects", projectRouter);
  app.use("/api/templates", templateRouter);
  app.use("/api", renderRouter);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
