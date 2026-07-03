import { HttpError } from "../../lib/http-error";
import { DocumentRepository } from "../documents/document.repository";
import { runDocxExporterCli } from "./docx-exporter-cli";

const documentRepository = new DocumentRepository();

// Document.content is stored as [{ type: "doc", content: [...] }] (an array
// wrapping the single Tiptap doc node) — same convention render.service.ts
// normalizes for the Typst renderer. The docx exporter wants the unwrapped
// doc node itself.
function unwrapDocNode(content: unknown): Record<string, unknown> {
  if (Array.isArray(content) && content.length > 0 && typeof content[0] === "object") {
    return content[0] as Record<string, unknown>;
  }
  if (content && typeof content === "object") {
    return content as Record<string, unknown>;
  }
  return { type: "doc", content: [] };
}

export class DocxExportService {
  async exportDocument(documentId: string): Promise<{ buffer: Buffer; filename: string }> {
    const document = await documentRepository.findById(documentId);
    if (!document) {
      throw new HttpError(404, "Document not found");
    }

    const templateSettings =
      document.templateSettings && typeof document.templateSettings === "object"
        ? (document.templateSettings as Record<string, unknown>)
        : {};
    const primaryLang =
      typeof templateSettings.primaryLang === "string" ? templateSettings.primaryLang : undefined;

    const buffer = await runDocxExporterCli({
      title: document.title,
      content: unwrapDocNode(document.content),
      primaryLang,
    });

    const safeTitle = (document.title || "Untitled").replace(/[/\\?%*:|"<>]/g, "_").slice(0, 100);
    return { buffer, filename: `${safeTitle}.docx` };
  }
}
