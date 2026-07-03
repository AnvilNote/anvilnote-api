import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { HttpError } from "../../lib/http-error";
import { env } from "../../config/env";

// Mirrors renderer-cli.ts: run the sibling anvilnote-docx-exporter repo's
// compiled CLI directly with the current Node binary. Fully decoupled from
// the Typst renderer — this shells out to a different repo entirely.
// .cjs, not .js: the bundled desktop build is forced CommonJS regardless of
// any package.json "type" field (see anvilnote-docx-exporter's
// scripts/bundle-desktop.mjs for why plain .js is ambiguous here).
const exporterEntry = path.join(env.ANVILNOTE_DOCX_EXPORTER_PATH, "dist", "cli.cjs");

type ExporterSuccess = {
  ok: true;
  status: "COMPLETED";
  docxPath: string;
  logs: string[];
};

type ExporterFailure = {
  ok: false;
  status: "FAILED";
  error: { message: string; details?: string };
  logs: string[];
};

type ExporterResult = ExporterSuccess | ExporterFailure;

export async function runDocxExporterCli(input: {
  title: string;
  content: unknown;
  primaryLang?: string;
}): Promise<Buffer> {
  const workDir = env.TYPST_STORAGE_DIR; // reuse the existing scratch dir; nothing Typst-specific about it
  const id = randomUUID();
  const inputPath = path.join(workDir, `docx-input-${id}.json`);
  const outputPath = path.join(workDir, `docx-output-${id}.docx`);

  try {
    await fs.access(exporterEntry);
  } catch {
    throw new HttpError(
      500,
      "DOCX exporter is not built",
      `Missing ${exporterEntry}. Build it with: pnpm --dir ${env.ANVILNOTE_DOCX_EXPORTER_PATH} build`,
    );
  }

  await fs.writeFile(inputPath, JSON.stringify(input, null, 2), "utf8");

  try {
    const result = await invokeExporter(inputPath, outputPath);
    if (!result.ok) {
      throw new HttpError(500, result.error.message, result.error.details);
    }
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(inputPath, { force: true });
    await fs.rm(outputPath, { force: true });
  }
}

function invokeExporter(inputPath: string, outputPath: string) {
  return new Promise<ExporterResult>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [exporterEntry, "--input", inputPath, "--output", outputPath],
      {
        cwd: env.ANVILNOTE_DOCX_EXPORTER_PATH,
        env: { ...process.env, PANDOC_BIN: process.env.PANDOC_BIN ?? "pandoc" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new HttpError(504, "DOCX exporter CLI timed out"));
    }, 30_000);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new HttpError(500, "Failed to start DOCX exporter CLI", error.message));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);

      let parsed: ExporterResult | null = null;
      try {
        parsed = JSON.parse(stdout) as ExporterResult;
      } catch {
        if (code === 0) {
          reject(new HttpError(500, "DOCX exporter CLI returned invalid JSON", stdout || stderr));
          return;
        }
      }

      if (parsed) {
        resolve(parsed);
        return;
      }

      reject(
        new HttpError(
          500,
          "DOCX exporter CLI failed",
          stderr.trim() || stdout.trim() || `exporter exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}
