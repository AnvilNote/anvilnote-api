#!/usr/bin/env node
// Generates static template preview assets (PDF + thumbnail + manifest) under
// static/template-previews/{id}/ by rendering each template through the REAL
// renderer (anvilnote-renderer), so every preview reflects that template's
// actual design — not a generic mock.
//
// For each template the renderer's own templates/{id}/sample.json is used as
// the render input when present; otherwise a small generic sample is
// synthesized. PDFs are produced by the renderer CLI; thumbnails by pdftoppm;
// page counts by pdfinfo.
//
// DEV-ONLY tool. The API serves the produced files statically at /static/...
// and the web app consumes those URLs. Nothing runs the renderer at request
// time. The API builds/runs even if these tools are absent; this script then
// prints a clear message and exits 0 without failing other tooling.
//
//   node scripts/generate-template-previews.mjs
//
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync, rmSync, existsSync, mkdtempSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RENDERER = resolve(ROOT, "..", "anvilnote-renderer");
const RENDERER_CLI = join(RENDERER, "dist", "cli.js");
const TEMPLATES_DIR = join(RENDERER, "templates");
const OUT_DIR = join(ROOT, "static", "template-previews");
// The AnvilNote logo, embedded as a base64 PNG so it renders inside the PDF
// (Typst can only embed inline data URLs, not fetch remote images).
const LOGO_SVG = resolve(ROOT, "..", "anvilnote-web", "public", "favicon-light.svg");

function logoDataUri() {
  try {
    const svg = readFileSync(LOGO_SVG, "utf8");
    const m = svg.match(/data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)/);
    if (m) return `data:image/${m[1]};base64,${m[2]}`;
  } catch {
    // fall through
  }
  return null;
}

function titleCase(slug) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function which(bin) {
  return spawnSync("which", [bin], { stdio: "ignore" }).status === 0;
}

// Templates present in the renderer but intentionally not offered in the app.
// Keep in sync with HIDDEN_SLUGS in template.registry.ts.
const HIDDEN_SLUGS = new Set(["kunskap", "minimal-lecture"]);

// Real template slugs = renderer template folders that ship a manifest.json
// (excludes the shared font package and any hidden templates).
function listTemplateIds() {
  return readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(TEMPLATES_DIR, d.name, "manifest.json")))
    .map((d) => d.name)
    .filter((id) => id !== "shared" && !HIDDEN_SLUGS.has(id));
}

const EN = "The quick brown fox jumps over the lazy dog.";
const ZH = "敏捷的棕色狐狸跳過懶狗。";

// A single standardized sample document, rendered through every template so the
// previews differ only by template design — not content. Demonstrates heading
// levels, EN+CJK body, an image (logo), a table, and block + inline math.
function buildInput(id, logo) {
  const name = titleCase(id);
  const text = (t) => ({ type: "text", text: t });
  const para = (...nodes) => ({ type: "paragraph", content: nodes });
  const heading = (level, t) => ({ type: "heading", attrs: { level }, content: [text(t)] });
  const cell = (kind, t) => ({ type: kind, content: [para(text(t))] });
  const row = (kind, vals) => ({ type: "tableRow", content: vals.map((v) => cell(kind, v)) });

  const content = [
    heading(1, "大標題"),
    para(text(`${EN} ${ZH}`)),
    heading(2, "中標題"),
    para(text(`${EN} ${ZH}`)),
  ];
  if (logo) {
    content.push({ type: "image", attrs: { src: logo, width: 28, align: "center" } });
  }
  content.push(
    heading(3, "小標題"),
    para(text("Inline 數學："), { type: "inlineMath", attrs: { latex: "a^2 + b^2 = c^2" } }, text("。")),
    { type: "blockMath", attrs: { latex: "E = mc^2" } },
    {
      type: "table",
      content: [
        row("tableHeader", ["項目 Item", "說明 Description", "數值 Value"]),
        row("tableCell", ["Alpha", "Sample text", "123"]),
        row("tableCell", ["Beta", "中文文字", "456"]),
        row("tableCell", ["Gamma", "Mixed content", "789.10"]),
      ],
    },
  );

  return {
    document: {
      id: `sample-${id}`,
      title: `${name} 範例文件`,
      content: [{ type: "doc", content }],
    },
    template: {
      slug: id,
      meta: { title: `${name} 範例文件`, author: "作者姓名 Author Name", date: "2026/01/01" },
      options: {},
    },
    options: { format: "pdf", pageSize: "A4" },
  };
}

function renderPdf(id, workRoot, logo) {
  const inputPath = join(workRoot, `${id}-input.json`);
  writeFileSync(inputPath, JSON.stringify(buildInput(id, logo), null, 2));

  const outDir = join(workRoot, `${id}-out`);
  const wkDir = join(workRoot, `${id}-work`);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(wkDir, { recursive: true });

  const res = spawnSync(
    process.execPath,
    [RENDERER_CLI, "--input", inputPath, "--output-dir", outDir, "--work-dir", wkDir],
    { encoding: "utf8", cwd: RENDERER },
  );
  let parsed;
  try {
    parsed = JSON.parse(res.stdout.trim().split("\n").pop());
  } catch {
    throw new Error(`renderer returned non-JSON for ${id}: ${res.stdout || res.stderr}`);
  }
  if (!parsed.ok) {
    throw new Error(`renderer failed for ${id}: ${parsed.error?.message} ${parsed.error?.details ?? ""}`);
  }
  return parsed.pdfPath;
}

function pdfPageCount(pdfPath) {
  if (!which("pdfinfo")) return undefined;
  const out = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  const m = out.match(/^Pages:\s+(\d+)/m);
  return m ? Number(m[1]) : undefined;
}

function makeThumbnail(pdfPath, outDir) {
  if (!which("pdftoppm")) return false;
  const prefix = join(outDir, "thumb");
  execFileSync("pdftoppm", ["-png", "-f", "1", "-l", "1", "-r", "110", pdfPath, prefix]);
  // pdftoppm appends -1 / -01 depending on page count width.
  const produced = readdirSync(outDir).find((f) => /^thumb-0*1\.png$/.test(f));
  if (!produced) return false;
  renameSync(join(outDir, produced), join(outDir, "thumbnail.png"));
  return true;
}

function main() {
  if (!existsSync(RENDERER_CLI)) {
    console.log(
      `[generate-template-previews] Renderer not built (${RENDERER_CLI}).\n` +
        `  Build it: pnpm --dir ${RENDERER} build, then re-run.\n` +
        "  The API still builds and serves whatever static assets already exist.",
    );
    process.exit(0);
  }

  const ids = listTemplateIds();
  const logo = logoDataUri();
  if (!logo) console.warn("  (logo not found — previews will render without the image)");
  const workRoot = mkdtempSync(join(tmpdir(), "anvil-previews-"));
  console.log(`[generate-template-previews] Rendering ${ids.length} templates via real renderer…`);

  try {
    let ok = 0;
    const failed = [];
    for (const id of ids) {
      const outDir = join(OUT_DIR, id);
      try {
        const pdfPath = renderPdf(id, workRoot, logo);
        mkdirSync(outDir, { recursive: true });
        copyFileSync(pdfPath, join(outDir, "preview.pdf"));

        const hasThumb = makeThumbnail(pdfPath, outDir);
        const pageCount = pdfPageCount(pdfPath);

        writeFileSync(
          join(outDir, "manifest.json"),
          JSON.stringify(
            {
              templateId: id,
              pdfUrl: `/static/template-previews/${id}/preview.pdf`,
              thumbnailUrl: `/static/template-previews/${id}/thumbnail.png`,
              ...(pageCount ? { pageCount } : {}),
            },
            null,
            2,
          ) + "\n",
        );

        ok += 1;
        console.log(`  ✓ ${id}${pageCount ? ` (${pageCount}p)` : ""}${hasThumb ? "" : " [no thumb]"}`);
      } catch (error) {
        // A template that won't render shouldn't block the rest. The web app
        // shows a graceful "preview unavailable" state for missing PDFs.
        failed.push(id);
        console.warn(`  ✗ ${id}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
      }
    }
    console.log(`[generate-template-previews] ${ok} ok, ${failed.length} skipped${failed.length ? `: ${failed.join(", ")}` : ""}.`);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

main();
