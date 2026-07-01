#!/usr/bin/env node
// Generates static template preview assets (PDF + thumbnail + manifest) under
// static/template-previews/{id}/{locale}/ by rendering each template through
// the REAL renderer (anvilnote-renderer), so every preview reflects that
// template's actual design — not a generic mock. Each locale gets its own
// sample document (headings, body filler text, table/author placeholders) so
// a preview looks native to the viewer's UI language, not just a fixed
// EN+zh-TW demo reused everywhere.
//
// PDFs are produced by the renderer CLI; thumbnails by pdftoppm; page counts
// by pdfinfo.
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

// Every locale the web app supports (must match anvilnote-web/src/i18n).
const LOCALES = ["en", "zh-TW", "ja", "ko", "th", "ru"];
const DEFAULT_LOCALE = "en";

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

// Per-locale sample content. Every non-English locale pairs its own filler
// text with the same English Lorem Ipsum chunks (mirroring how the app
// already shows EN+zh-TW side by side), so previews still demonstrate
// multi-script/CJK font handling — not just a monolingual demo. The `en`
// locale is English-only (pairing English with English would be redundant).
//
// English: the standard Lorem Ipsum passage (lipsum.com).
// zh-TW: an excerpt from Tao Yuanming's 桃花源記 (public domain classical
// prose), used the way Chinese typography samples commonly use it as filler.
// ja/ko/th/ru: neutral, self-composed placeholder sentences (ja also draws
// its opening lines from Natsume Soseki's 吾輩は猫である, public domain).
const LOCALE_CONTENT = {
  en: {
    headings: ["Heading One", "Heading Two", "Heading Three"],
    lorem: [
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
      "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
      "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
    ],
    around: {
      beforeImage: "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.",
      afterImage: "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.",
      beforeTable: "Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.",
      afterTable: "Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur.",
    },
    tableHeaders: ["Item", "Description", "Value"],
    localWord: "Local text",
    author: "Author Name",
    titleSuffix: "Sample Document",
    inlineMathLabel: "Inline math: ",
  },
  "zh-TW": {
    headings: ["大標題", "中標題", "小標題"],
    lorem: [
      "晉太元中，武陵人捕魚為業。緣溪行，忘路之遠近。忽逢桃花林，夾岸數百步，中無雜樹，芳草鮮美，落英繽紛。漁人甚異之，復前行，欲窮其林。",
      "林盡水源，便得一山，山有小口，彷彿若有光。便舍船，從口入。初極狹，纔通人。復行數十步，豁然開朗。土地平曠，屋舍儼然，有良田美池桑竹之屬。",
      "阡陌交通，雞犬相聞。其中往來種作，男女衣著，悉如外人。黃髮垂髫，並怡然自樂。見漁人，乃大驚，問所從來，具答之。便要還家，設酒殺雞作食。",
    ],
    around: {
      beforeImage: "村中聞有此人，咸來問訊。自云先世避秦時亂，率妻子邑人來此絕境，不復出焉，遂與外人間隔。",
      afterImage: "問今是何世，乃不知有漢，無論魏晉。此人一一為具言所聞，皆歎惋。餘人各復延至其家，皆出酒食。",
      beforeTable: "停數日，辭去。此中人語云：不足為外人道也。既出，得其船，便扶向路，處處誌之。及郡下，詣太守。",
      afterTable: "說如此。太守即遣人隨其往，尋向所誌，遂迷，不復得路。南陽劉子驥，高尚士也，聞之，欣然規往。",
    },
    tableHeaders: ["項目", "說明", "數值"],
    localWord: "中文文字",
    author: "作者姓名",
    titleSuffix: "範例文件",
    inlineMathLabel: "Inline 數學：",
  },
  ja: {
    headings: ["見出し1", "見出し2", "見出し3"],
    lorem: [
      "吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。",
      "吾輩はここで始めて人間というものを見た。しかもあとで聞くとそれは書生という人間中で一番獰悪な種族であったそうだ。",
      "この書生というのは時々我々を捕えて煮て食うという話である。しかしその当時は何という考もなかったから別段恐しいとも思わなかった。",
    ],
    around: {
      beforeImage: "ただ彼の掌に載せられてスーと持ち上げられた時何だか浮いた感じがあったばかりである。",
      afterImage: "掌の上で少し落ち着いて書生の顔を見たのがいわゆる人間というものの見始であろう。",
      beforeTable: "この時妙なものだと思った感じが今でも残っている。第一毛をもって装飾されべきはずの顔がつるつるしてまるで薬缶だ。",
      afterTable: "その後猫にもだいぶ逢ったがこんな片輪には一度も出会わした事がない。のみならず顔の真中があまりに突起している。",
    },
    tableHeaders: ["項目", "説明", "数値"],
    localWord: "日本語文字",
    author: "著者名",
    titleSuffix: "サンプル文書",
    inlineMathLabel: "インライン数式：",
  },
  ko: {
    headings: ["제목 1", "제목 2", "제목 3"],
    lorem: [
      "이 문단은 디자인과 레이아웃을 확인하기 위한 예시 텍스트입니다. 실제 내용과는 관련이 없으며 글자의 배치와 줄바꿈을 살펴보기 위해 사용됩니다.",
      "글꼴의 크기와 자간, 행간이 문서 전체에서 어떻게 나타나는지 확인할 수 있도록 다양한 길이의 문장을 포함하고 있습니다.",
      "표와 이미지 주변의 여백과 정렬 상태도 함께 점검할 수 있도록 충분한 분량의 예시 문단을 배치했습니다.",
    ],
    around: {
      beforeImage: "아래 이미지는 문서 안에서 그림이 어떻게 배치되는지 보여주기 위한 예시입니다.",
      afterImage: "이미지 위아래에 문단이 자연스럽게 이어지는지 확인할 수 있습니다.",
      beforeTable: "다음 표는 문서에서 표가 어떻게 정렬되고 표시되는지 보여주는 예시입니다.",
      afterTable: "표 아래에도 본문이 계속 이어지는 모습을 확인할 수 있습니다.",
    },
    tableHeaders: ["항목", "설명", "값"],
    localWord: "한국어 문자",
    author: "작성자",
    titleSuffix: "샘플 문서",
    inlineMathLabel: "인라인 수식: ",
  },
  th: {
    headings: ["หัวข้อ 1", "หัวข้อ 2", "หัวข้อ 3"],
    lorem: [
      "ข้อความนี้เป็นเพียงตัวอย่างสำหรับทดสอบการจัดวางตัวอักษรและรูปแบบเอกสาร ไม่มีความหมายเกี่ยวข้องกับเนื้อหาจริงแต่อย่างใด",
      "ตัวอย่างนี้ใช้เพื่อตรวจสอบขนาดตัวอักษร ระยะห่างระหว่างบรรทัด และการจัดเรียงข้อความในระดับหัวข้อต่าง ๆ ของเอกสาร",
      "นอกจากนี้ยังใช้ตรวจสอบระยะขอบรอบตารางและรูปภาพ เพื่อให้แน่ใจว่าเอกสารแสดงผลได้อย่างถูกต้องสวยงาม",
    ],
    around: {
      beforeImage: "รูปภาพด้านล่างเป็นตัวอย่างการแสดงผลรูปภาพภายในเอกสาร",
      afterImage: "ข้อความหลังรูปภาพใช้ตรวจสอบระยะห่างและการต่อเนื่องของย่อหน้า",
      beforeTable: "ตารางด้านล่างเป็นตัวอย่างการจัดวางตารางภายในเอกสาร",
      afterTable: "ข้อความหลังตารางใช้ตรวจสอบว่าเนื้อหายังคงต่อเนื่องกันอย่างถูกต้อง",
    },
    tableHeaders: ["รายการ", "คำอธิบาย", "ค่า"],
    localWord: "อักษรไทย",
    author: "ผู้เขียน",
    titleSuffix: "เอกสารตัวอย่าง",
    inlineMathLabel: "สมการในบรรทัด: ",
  },
  ru: {
    headings: ["Заголовок 1", "Заголовок 2", "Заголовок 3"],
    lorem: [
      "Этот абзац используется как образец текста для проверки макета и оформления документа. Он не несёт смысловой нагрузки и нужен только для демонстрации вёрстки.",
      "Пример показывает, как выглядит текст разного объёма на разных уровнях заголовков, включая межстрочный интервал и начертание шрифта.",
      "Дополнительный текст помогает проверить отступы вокруг таблиц и изображений, чтобы документ выглядел аккуратно на любом шаблоне.",
    ],
    around: {
      beforeImage: "Изображение ниже показывает, как картинка располагается внутри документа.",
      afterImage: "Текст после изображения нужен для проверки правильного продолжения абзацев.",
      beforeTable: "Таблица ниже демонстрирует, как таблицы выравниваются и отображаются в документе.",
      afterTable: "Текст после таблицы показывает, что содержимое корректно продолжается дальше.",
    },
    tableHeaders: ["Пункт", "Описание", "Значение"],
    localWord: "Русский текст",
    author: "Автор",
    titleSuffix: "Образец документа",
    inlineMathLabel: "Встроенная формула: ",
  },
};

// A single standardized sample document per locale, rendered through every
// template so previews differ only by template design — not content.
// Demonstrates heading levels, lorem ipsum body (paired with English for
// non-English locales), an image (logo), a table, and block + inline math.
function buildInput(id, locale, logo) {
  const name = titleCase(id);
  const c = LOCALE_CONTENT[locale];
  const en = LOCALE_CONTENT.en;
  const paired = locale !== "en";

  const text = (t) => ({ type: "text", text: t });
  const para = (...nodes) => ({ type: "paragraph", content: nodes });
  const heading = (level, t) => ({ type: "heading", attrs: { level }, content: [text(t)] });
  const cell = (kind, t) => ({ type: kind, content: [para(text(t))] });
  const row = (kind, vals) => ({ type: "tableRow", content: vals.map((v) => cell(kind, v)) });

  // Lorem-ipsum paragraph at the given index, optionally preceded by the
  // matching English chunk (English locale itself just uses its own).
  const loremPara = (index) =>
    paired
      ? [para(text(en.lorem[index])), para(text(c.lorem[index]))]
      : [para(text(c.lorem[index]))];

  const content = [
    heading(1, c.headings[0]),
    ...loremPara(0),
    heading(2, c.headings[1]),
    ...loremPara(1),
  ];
  if (logo) {
    content.push(
      ...(paired ? [para(text(en.around.beforeImage))] : []),
      para(text(c.around.beforeImage)),
      { type: "image", attrs: { src: logo, width: 28, align: "center" } },
      ...(paired ? [para(text(en.around.afterImage))] : []),
      para(text(c.around.afterImage)),
    );
  }
  content.push(
    heading(3, c.headings[2]),
    ...loremPara(2),
    para(text(c.inlineMathLabel), { type: "inlineMath", attrs: { latex: "a^2 + b^2 = c^2" } }, text(".")),
    { type: "blockMath", attrs: { latex: "E = mc^2" } },
    ...(paired ? [para(text(en.around.beforeTable))] : []),
    para(text(c.around.beforeTable)),
    {
      type: "table",
      content: [
        row(
          "tableHeader",
          paired
            ? c.tableHeaders.map((h, i) => `${h} ${en.tableHeaders[i]}`)
            : en.tableHeaders,
        ),
        row("tableCell", ["Alpha", "Sample text", "123"]),
        row("tableCell", ["Beta", c.localWord, "456"]),
        row("tableCell", ["Gamma", "Mixed content", "789.10"]),
      ],
    },
    ...(paired ? [para(text(en.around.afterTable))] : []),
    para(text(c.around.afterTable)),
  );

  const title = `${name} ${c.titleSuffix}`;
  const author = paired ? `${c.author} ${en.author}` : c.author;

  return {
    document: {
      id: `sample-${id}-${locale}`,
      title,
      content: [{ type: "doc", content }],
    },
    template: {
      slug: id,
      meta: { title, author, date: "2026/01/01" },
      options: {},
    },
    options: { format: "pdf", pageSize: "A4" },
  };
}

function renderPdf(id, locale, workRoot, logo) {
  const inputPath = join(workRoot, `${id}-${locale}-input.json`);
  writeFileSync(inputPath, JSON.stringify(buildInput(id, locale, logo), null, 2));

  const outDir = join(workRoot, `${id}-${locale}-out`);
  const wkDir = join(workRoot, `${id}-${locale}-work`);
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
    throw new Error(`renderer returned non-JSON for ${id}/${locale}: ${res.stdout || res.stderr}`);
  }
  if (!parsed.ok) {
    throw new Error(`renderer failed for ${id}/${locale}: ${parsed.error?.message} ${parsed.error?.details ?? ""}`);
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
  console.log(`[generate-template-previews] Rendering ${ids.length} templates × ${LOCALES.length} locales via real renderer…`);

  try {
    let ok = 0;
    const failed = [];
    for (const id of ids) {
      for (const locale of LOCALES) {
        const outDir = join(OUT_DIR, id, locale);
        try {
          const pdfPath = renderPdf(id, locale, workRoot, logo);
          mkdirSync(outDir, { recursive: true });
          copyFileSync(pdfPath, join(outDir, "preview.pdf"));

          const hasThumb = makeThumbnail(pdfPath, outDir);
          const pageCount = pdfPageCount(pdfPath);

          writeFileSync(
            join(outDir, "manifest.json"),
            JSON.stringify(
              {
                templateId: id,
                locale,
                pdfUrl: `/static/template-previews/${id}/${locale}/preview.pdf`,
                thumbnailUrl: `/static/template-previews/${id}/${locale}/thumbnail.png`,
                ...(pageCount ? { pageCount } : {}),
              },
              null,
              2,
            ) + "\n",
          );

          ok += 1;
          console.log(`  ✓ ${id}/${locale}${pageCount ? ` (${pageCount}p)` : ""}${hasThumb ? "" : " [no thumb]"}`);
        } catch (error) {
          // A template that won't render shouldn't block the rest. The web app
          // shows a graceful "preview unavailable" state for missing PDFs.
          failed.push(`${id}/${locale}`);
          console.warn(`  ✗ ${id}/${locale}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
        }
      }
    }
    console.log(`[generate-template-previews] ${ok} ok, ${failed.length} skipped${failed.length ? `: ${failed.join(", ")}` : ""}.`);
    console.log(`[generate-template-previews] default locale for fallback: ${DEFAULT_LOCALE}`);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

main();
