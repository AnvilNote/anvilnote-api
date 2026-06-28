import type { RenderStatus } from "@prisma/client";

export type RenderExportOptions = {
  pageSize?: "A4" | "Letter";
  includeMetadata?: boolean;
};

export type RenderOutputRecord = {
  id: string;
  documentId: string;
  templateId: string | null;
  templateVersion: string | null;
  format: string;
  status: RenderStatus;
  pdfUrl: string | null;
  typstPath: string | null;
  pdfPath: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};
