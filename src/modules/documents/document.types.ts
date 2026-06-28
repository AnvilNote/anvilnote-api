export type AnvilMetadataValue = string | boolean | null;

export type DocumentContent = unknown[];

export type DocumentRecord = {
  id: string;
  title: string;
  content: DocumentContent;
  metadata: Record<string, AnvilMetadataValue>;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
};
