import type { AnvilMetadataValue, DocumentContent } from "../documents/document.types";

// A version list entry omits `content` — potentially large (inline base64
// images) and not needed until the user actually opens one to preview or
// restore it. `getVersion` returns the full record including content.
export type DocumentVersionSummary = {
  id: string;
  documentId: string;
  title: string;
  createdAt: string;
};

export type DocumentVersionRecord = DocumentVersionSummary & {
  content: DocumentContent;
  metadata: Record<string, AnvilMetadataValue>;
  templateSettings: Record<string, AnvilMetadataValue>;
};
