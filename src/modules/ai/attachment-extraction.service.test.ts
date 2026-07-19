import assert from "node:assert/strict";
import { test } from "node:test";
import { AttachmentExtractionService } from "./attachment-extraction.service";
import JSZip from "jszip";

const service = new AttachmentExtractionService({
  maxFiles: 5,
  maxFileSizeBytes: 1024,
  maxTotalSizeBytes: 2048,
  maxCharactersPerFile: 24,
  maxTotalExtractedCharacters: 48,
});

test("extracts UTF-8 TXT with BOM and preserves display filename only", async () => {
  const result = await service.extract([
    {
      originalname: "../unsafe/notes.txt",
      mimetype: "text/plain",
      size: 14,
      buffer: Buffer.from("\uFEFFFirst\n\nSecond", "utf8"),
    },
  ]);
  assert.equal(result[0]?.filename, "notes.txt");
  assert.equal(result[0]?.extractedText, "First\n\nSecond");
  assert.equal(result[0]?.truncated, false);
});

test("extracts markdown as inert text and truncates at a paragraph boundary", async () => {
  const result = await service.extract([
    {
      originalname: "notes.md",
      mimetype: "text/markdown",
      size: 50,
      buffer: Buffer.from("First paragraph.\n\nSecond paragraph with script <script>x</script>"),
    },
  ]);
  assert.equal(result[0]?.truncated, true);
  assert.deepEqual(result[0]?.warnings, ["attachment_text_truncated"]);
  assert.equal(result[0]?.extractedText, "First paragraph.");
});

test("rejects unsupported and spoofed attachment types before extraction", async () => {
  await assert.rejects(() =>
    service.extract([
      {
        originalname: "photo.png",
        mimetype: "image/png",
        size: 3,
        buffer: Buffer.from("png"),
      },
    ]),
  );
  await assert.rejects(() =>
    service.extract([
      {
        originalname: "notes.pdf",
        mimetype: "text/plain",
        size: 4,
        buffer: Buffer.from("text"),
      },
    ]),
  );
});

test("rejects invalid UTF-8 and enforces total bytes from actual buffers", async () => {
  await assert.rejects(() =>
    service.extract([
      {
        originalname: "broken.txt",
        mimetype: "text/plain",
        size: 2,
        buffer: Buffer.from([0xc3, 0x28]),
      },
    ]),
  );
  await assert.rejects(() =>
    service.extract([
      {
        originalname: "one.txt",
        mimetype: "text/plain",
        size: 1,
        buffer: Buffer.alloc(800, 65),
      },
      {
        originalname: "two.txt",
        mimetype: "text/plain",
        size: 1,
        buffer: Buffer.alloc(800, 66),
      },
      {
        originalname: "three.txt",
        mimetype: "text/plain",
        size: 1,
        buffer: Buffer.alloc(800, 67),
      },
    ]),
  );
});

function minimalPdf(text?: string): Buffer {
  const stream = text
    ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
    : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

async function minimalDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.folder("_rels")?.file(
    ".rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.folder("word")?.file(
    "document.xml",
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>First paragraph</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p></w:body></w:document>',
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

test("extracts text PDF and returns page count", async () => {
  const buffer = minimalPdf("Hello PDF");
  const result = await new AttachmentExtractionService().extract([
    {
      originalname: "source.pdf",
      mimetype: "application/pdf",
      size: buffer.byteLength,
      buffer,
    },
  ]);
  assert.equal(result[0]?.pageCount, 1);
  assert.match(result[0]?.extractedText ?? "", /Hello PDF/);
});

test("returns an explicit image-only warning when a PDF has no text layer", async () => {
  const buffer = minimalPdf();
  const result = await new AttachmentExtractionService().extract([
    {
      originalname: "scan.pdf",
      mimetype: "application/pdf",
      size: buffer.byteLength,
      buffer,
    },
  ]);
  assert.deepEqual(result[0]?.warnings, ["scanned_or_image_only_pdf"]);
  assert.equal(result[0]?.extractedText, "");
});

test("extracts DOCX paragraphs without writing embedded content to disk", async () => {
  const buffer = await minimalDocx();
  const result = await new AttachmentExtractionService().extract([
    {
      originalname: "source.docx",
      mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: buffer.byteLength,
      buffer,
    },
  ]);
  assert.match(result[0]?.extractedText ?? "", /First paragraph\n\nSecond paragraph/);
});
