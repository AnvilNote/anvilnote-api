import type { RenderStatus } from "@prisma/client";

export type RenderOptions = {
  pageSize?: "A4" | "Letter";
  fontPreset?: "sans" | "serif" | "mono";
  includeMetadata?: boolean;
};

export type RenderJobRecord = {
  id: string;
  documentId: string;
  status: RenderStatus;
  pdfUrl: string | null;
  typstPath: string | null;
  pdfPath: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};
