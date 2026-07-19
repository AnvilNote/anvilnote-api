import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AttachmentContext } from "@anvilnote/ai-writer";
import { AI_ATTACHMENT_LIMITS } from "@anvilnote/ai-writer";
import mammoth from "mammoth";
import { HttpError } from "../../lib/http-error";

export interface BufferedAttachment {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface AttachmentLimits {
  maxFiles: number;
  maxFileSizeBytes: number;
  maxTotalSizeBytes: number;
  maxCharactersPerFile: number;
  maxTotalExtractedCharacters: number;
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ACCEPTED = new Map<string, ReadonlySet<string>>([
  [".txt", new Set(["text/plain"])],
  [".md", new Set(["text/markdown", "text/plain"])],
  [".markdown", new Set(["text/markdown", "text/plain"])],
  [".pdf", new Set(["application/pdf"])],
  [".docx", new Set([DOCX_MIME])],
]);

function displayFilename(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  const base = Array.from(path.posix.basename(normalized))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .trim();
  return base.slice(0, 512) || "attachment";
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new HttpError(499, "Attachment extraction was cancelled.", {
      code: "request_cancelled",
      messageKey: "ai.errors.request_cancelled",
      retryable: false,
    });
  }
}

function decodeUtf8(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new HttpError(422, "Attachment is not valid UTF-8 text.", {
      code: "attachment_parse_failed",
      messageKey: "ai.errors.attachment_parse_failed",
      retryable: false,
    });
  }
}

function truncateAtBoundary(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  const prefix = text.slice(0, limit);
  const paragraph = prefix.lastIndexOf("\n\n");
  const line = prefix.lastIndexOf("\n");
  const sentence = Math.max(prefix.lastIndexOf(". "), prefix.lastIndexOf("。"));
  const boundary = Math.max(paragraph, line, sentence);
  const safeEnd = boundary >= Math.floor(limit * 0.5) ? boundary + (boundary === sentence ? 1 : 0) : limit;
  return { text: prefix.slice(0, safeEnd).trimEnd(), truncated: true };
}

async function extractPdf(buffer: Buffer, signal?: AbortSignal): Promise<{ text: string; pageCount: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  assertNotAborted(signal);
  try {
    const document = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
    }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      assertNotAborted(signal);
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+\n/gu, "\n")
          .trim(),
      );
      page.cleanup();
    }
    await document.destroy();
    return { text: pages.join("\n\n").trim(), pageCount: document.numPages };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") {
      throw new HttpError(422, "Password-protected PDF files are not supported.", {
        code: "attachment_parse_failed",
        messageKey: "ai.errors.password_protected_pdf",
        retryable: false,
      });
    }
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, "PDF text extraction failed.", {
      code: "attachment_parse_failed",
      messageKey: "ai.errors.attachment_parse_failed",
      retryable: false,
    });
  }
}

export class AttachmentExtractionService {
  constructor(private readonly limits: AttachmentLimits = AI_ATTACHMENT_LIMITS) {}

  async extract(files: BufferedAttachment[], signal?: AbortSignal): Promise<AttachmentContext[]> {
    if (files.length === 0 || files.length > this.limits.maxFiles) {
      throw new HttpError(413, "Attachment count exceeds the allowed limit.", {
        code: "request_too_large",
        maxFiles: this.limits.maxFiles,
      });
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const totalBufferedBytes = files.reduce(
      (sum, file) => sum + file.buffer.byteLength,
      0,
    );
    if (
      totalBytes > this.limits.maxTotalSizeBytes ||
      totalBufferedBytes > this.limits.maxTotalSizeBytes
    ) {
      throw new HttpError(413, "Total attachment size exceeds the allowed limit.", {
        code: "request_too_large",
        maxTotalSizeBytes: this.limits.maxTotalSizeBytes,
      });
    }

    const output: AttachmentContext[] = [];
    let totalCharacters = 0;
    for (const file of files) {
      assertNotAborted(signal);
      if (file.size > this.limits.maxFileSizeBytes || file.buffer.byteLength > this.limits.maxFileSizeBytes) {
        throw new HttpError(413, "Attachment size exceeds the allowed limit.", {
          code: "request_too_large",
          maxFileSizeBytes: this.limits.maxFileSizeBytes,
        });
      }
      const filename = displayFilename(file.originalname);
      const extension = path.extname(filename).toLowerCase();
      if (!ACCEPTED.get(extension)?.has(file.mimetype)) {
        throw new HttpError(415, "Attachment type is not supported.", {
          code: "unsupported_attachment",
          filename,
        });
      }

      let extractedText: string;
      let pageCount: number | undefined;
      const warnings: string[] = [];
      if (extension === ".pdf") {
        const pdf = await extractPdf(file.buffer, signal);
        extractedText = pdf.text;
        pageCount = pdf.pageCount;
        if (!extractedText) warnings.push("scanned_or_image_only_pdf");
      } else if (extension === ".docx") {
        try {
          const result = await mammoth.extractRawText({ buffer: file.buffer });
          extractedText = result.value.replace(/\r\n?/gu, "\n").trim();
          if (result.messages.length > 0) warnings.push("docx_extraction_warning");
        } catch {
          throw new HttpError(422, "DOCX text extraction failed.", {
            code: "attachment_parse_failed",
            messageKey: "ai.errors.attachment_parse_failed",
            retryable: false,
          });
        }
      } else {
        extractedText = decodeUtf8(file.buffer)
          .replace(/^\uFEFF/u, "")
          .replace(/\r\n?/gu, "\n")
          .trim();
      }

      const perFile = truncateAtBoundary(extractedText, this.limits.maxCharactersPerFile);
      if (perFile.truncated) warnings.push("attachment_text_truncated");
      const remaining = this.limits.maxTotalExtractedCharacters - totalCharacters;
      const totalLimited = truncateAtBoundary(perFile.text, Math.max(0, remaining));
      if (totalLimited.truncated && !warnings.includes("attachment_text_truncated")) {
        warnings.push("attachment_text_truncated");
      }
      totalCharacters += totalLimited.text.length;
      output.push({
        id: randomUUID(),
        filename,
        mimeType: file.mimetype,
        extractedText: totalLimited.text,
        ...(pageCount !== undefined ? { pageCount } : {}),
        characterCount: totalLimited.text.length,
        truncated: perFile.truncated || totalLimited.truncated,
        warnings,
      });
    }
    return output;
  }
}
