import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { HttpError } from "../../lib/http-error";
import { env } from "../../config/env";

// Mirrors docx-exporter-cli.ts / renderer-cli.ts: run the sibling
// anvilnote-charts repo's compiled CLI directly with the current Node
// binary. .cjs, not .js — see anvilnote-charts/scripts/bundle-desktop.mjs.
const chartsEntry = path.join(env.ANVILNOTE_CHARTS_PATH, "dist", "cli.cjs");

type ChartsSuccess = {
  ok: true;
  status: "COMPLETED";
  svgPath: string;
  logs: string[];
};

type ChartsFailure = {
  ok: false;
  status: "FAILED";
  error: { message: string; details?: string };
  logs: string[];
};

type ChartsResult = ChartsSuccess | ChartsFailure;

export async function runChartsCli(spec: unknown): Promise<string> {
  const workDir = env.TYPST_STORAGE_DIR; // reuse the existing scratch dir; nothing Typst-specific about it
  const id = randomUUID();
  const inputPath = path.join(workDir, `chart-input-${id}.json`);
  const outputPath = path.join(workDir, `chart-output-${id}.svg`);

  try {
    await fs.access(chartsEntry);
  } catch {
    throw new HttpError(
      500,
      "Chart compiler is not built",
      `Missing ${chartsEntry}. Build it with: pnpm --dir ${env.ANVILNOTE_CHARTS_PATH} build:desktop`,
    );
  }

  await fs.writeFile(inputPath, JSON.stringify(spec, null, 2), "utf8");

  try {
    const result = await invokeCharts(inputPath, outputPath);
    if (!result.ok) {
      throw new HttpError(422, result.error.message, result.error.details);
    }
    return await fs.readFile(outputPath, "utf8");
  } finally {
    await fs.rm(inputPath, { force: true });
    await fs.rm(outputPath, { force: true });
  }
}

function invokeCharts(inputPath: string, outputPath: string) {
  return new Promise<ChartsResult>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [chartsEntry, "--input", inputPath, "--output", outputPath],
      {
        cwd: env.ANVILNOTE_CHARTS_PATH,
        env: { ...process.env, TYPST_BIN: env.TYPST_BIN },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    // 10s per spec's "已定案的實作細節" — the CLI's own internal Typst
    // compile timeout is 8s, so this outer bound gives a little slack for
    // process startup before declaring the whole thing timed out.
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new HttpError(504, "Chart compiler CLI timed out"));
    }, 10_000);

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
      reject(new HttpError(500, "Failed to start chart compiler CLI", error.message));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);

      let parsed: ChartsResult | null = null;
      try {
        parsed = JSON.parse(stdout) as ChartsResult;
      } catch {
        if (code === 0) {
          reject(new HttpError(500, "Chart compiler CLI returned invalid JSON", stdout || stderr));
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
          "Chart compiler CLI failed",
          stderr.trim() || stdout.trim() || `chart compiler exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}
