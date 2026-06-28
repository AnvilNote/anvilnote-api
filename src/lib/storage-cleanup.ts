import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../config/env";

// Render artifacts (generated .typ source and .pdf output) accumulate with no
// natural lifecycle, so storage grows without bound. This sweeps both render
// directories and removes files whose last-modified time is older than the
// configured retention window. It is intentionally best-effort: a failure to
// stat or remove any single file is logged and skipped so cleanup never blocks
// startup or a render response.

const RENDER_DIRS = [env.TYPST_STORAGE_DIR, env.PDF_STORAGE_DIR];

async function sweepDir(dir: string, cutoff: number): Promise<number> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    // Directory may not exist yet on a fresh checkout; nothing to sweep.
    return 0;
  }

  let removed = 0;

  await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(dir, entry);
      try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile() || stats.mtimeMs >= cutoff) {
          return;
        }
        await fs.rm(filePath, { force: true });
        removed += 1;
      } catch (error) {
        console.warn(
          `storage-cleanup: failed to process ${filePath}`,
          error instanceof Error ? error.message : error,
        );
      }
    }),
  );

  return removed;
}

// Remove render artifacts older than RENDER_RETENTION_HOURS from the typst and
// pdf storage directories. Returns the number of files removed.
export async function sweepRenderArtifacts(): Promise<number> {
  const cutoff = Date.now() - env.RENDER_RETENTION_HOURS * 60 * 60 * 1000;

  const counts = await Promise.all(
    RENDER_DIRS.map((dir) => sweepDir(dir, cutoff)),
  );

  return counts.reduce((total, count) => total + count, 0);
}
