import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { HttpError } from "../../lib/http-error";
import { env } from "../../config/env";

// Run the renderer's compiled entry directly with the current Node binary.
// This avoids a pnpm + tsx cold start on every render and removes the runtime
// dependency on pnpm being on PATH.
const rendererEntry = path.join(env.ANVILNOTE_RENDERER_PATH, "dist", "cli.js");

type RendererSuccess = {
  ok: true;
  status: "COMPLETED";
  typstPath: string;
  pdfPath: string;
  logs: string[];
};

type RendererFailure = {
  ok: false;
  status: "FAILED";
  error: {
    message: string;
    details?: string;
  };
  logs: string[];
};

type RendererResult = RendererSuccess | RendererFailure;

export async function runRendererCli(payload: unknown) {
  const inputPath = path.join(
    env.TYPST_STORAGE_DIR,
    `render-input-${randomUUID()}.json`,
  );

  try {
    await fs.access(rendererEntry);
  } catch {
    throw new HttpError(
      500,
      "Renderer is not built",
      `Missing ${rendererEntry}. Build it with: pnpm --dir ${env.ANVILNOTE_RENDERER_PATH} build`,
    );
  }

  await fs.writeFile(inputPath, JSON.stringify(payload, null, 2), "utf8");

  try {
    const result = await invokeRenderer(inputPath);
    if (!result.ok) {
      throw new HttpError(500, result.error.message, result.error.details);
    }
    return result;
  } finally {
    await fs.rm(inputPath, { force: true });
  }
}

function invokeRenderer(inputPath: string) {
  return new Promise<RendererResult>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        rendererEntry,
        "--input",
        inputPath,
        "--output-dir",
        env.PDF_STORAGE_DIR,
        "--work-dir",
        env.TYPST_STORAGE_DIR,
      ],
      {
        // The renderer resolves its templates relative to its own cwd, so run
        // it from the renderer root rather than the API process directory.
        cwd: env.ANVILNOTE_RENDERER_PATH,
        env: {
          ...process.env,
          TYPST_BIN: env.TYPST_BIN,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new HttpError(504, "Renderer CLI timed out"));
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
      reject(new HttpError(500, "Failed to start renderer CLI", error.message));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);

      let parsed: RendererResult | null = null;
      try {
        parsed = JSON.parse(stdout) as RendererResult;
      } catch {
        if (code === 0) {
          reject(new HttpError(500, "Renderer CLI returned invalid JSON", stdout || stderr));
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
          "Renderer CLI failed",
          stderr.trim() || stdout.trim() || `renderer exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}
