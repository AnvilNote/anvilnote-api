import type { Prisma } from "@prisma/client";
import { HttpError } from "../../lib/http-error";
import { DocumentService } from "../documents/document.service";
import type { AnvilMetadataValue, DocumentRecord } from "../documents/document.types";
import { DocumentVersionRepository } from "./document-version.repository";
import type { DocumentVersionRecord, DocumentVersionSummary } from "./document-version.types";

// Caps how many snapshots a single document can accumulate. The interval
// between snapshots is a client-side setting (as low as every 5 minutes),
// so over weeks of regular use this is the only thing standing between a
// frequently-edited document and unbounded storage growth.
const MAX_VERSIONS_PER_DOCUMENT = 100;

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function mapSummary(row: {
  id: string;
  documentId: string;
  title: string;
  createdAt: Date;
}): DocumentVersionSummary {
  return {
    id: row.id,
    documentId: row.documentId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
  };
}

function normalizeMetadata(value: unknown): Record<string, AnvilMetadataValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, AnvilMetadataValue>>(
    (acc, [key, entry]) => {
      if (typeof entry === "string" || typeof entry === "boolean" || entry === null) {
        acc[key] = entry;
      }
      return acc;
    },
    {},
  );
}

function mapFull(row: {
  id: string;
  documentId: string;
  title: string;
  content: unknown;
  metadata: unknown;
  templateSettings: unknown;
  createdAt: Date;
}): DocumentVersionRecord {
  return {
    id: row.id,
    documentId: row.documentId,
    title: row.title,
    content: Array.isArray(row.content) ? (row.content as unknown[]) : [],
    metadata: normalizeMetadata(row.metadata),
    templateSettings: normalizeMetadata(row.templateSettings),
    createdAt: row.createdAt.toISOString(),
  };
}

export class DocumentVersionService {
  private readonly versionRepository = new DocumentVersionRepository();
  private readonly documentService = new DocumentService();

  async listVersions(documentId: string): Promise<DocumentVersionSummary[]> {
    await this.documentService.getDocument(documentId); // 404s if missing
    const rows = await this.versionRepository.listSummariesByDocument(documentId);
    return rows.map(mapSummary);
  }

  async getVersion(documentId: string, versionId: string): Promise<DocumentVersionRecord> {
    const version = await this.findOwnedVersion(documentId, versionId);
    return mapFull(version);
  }

  // Snapshots the document's CURRENT (already-persisted) state — the caller
  // is expected to have saved first, so this is a straight copy of the
  // Document row, not something the client passes a separate payload for.
  async createVersion(documentId: string): Promise<DocumentVersionSummary> {
    const document = await this.documentService.getDocument(documentId);
    const created = await this.snapshotDocument(document);
    await this.versionRepository.pruneToLatest(documentId, MAX_VERSIONS_PER_DOCUMENT);
    return mapSummary(created);
  }

  // Non-destructive: the document's state right before restoring is itself
  // snapshotted first, so restoring never actually loses anything — the
  // user can always restore forward again if they change their mind.
  async restoreVersion(documentId: string, versionId: string): Promise<DocumentRecord> {
    const version = await this.findOwnedVersion(documentId, versionId);
    const current = await this.documentService.getDocument(documentId);
    await this.snapshotDocument(current);

    return this.documentService.updateDocument(documentId, {
      title: version.title,
      content: Array.isArray(version.content) ? (version.content as unknown[]) : [],
      metadata: normalizeMetadata(version.metadata),
      templateSettings: normalizeMetadata(version.templateSettings),
    });
  }

  private async snapshotDocument(document: DocumentRecord) {
    return this.versionRepository.create({
      title: document.title,
      content: toJsonValue(document.content),
      metadata: toJsonValue(document.metadata),
      templateSettings: toJsonValue(document.templateSettings),
      document: { connect: { id: document.id } },
    });
  }

  private async findOwnedVersion(documentId: string, versionId: string) {
    const version = await this.versionRepository.findById(versionId);
    if (!version || version.documentId !== documentId) {
      throw new HttpError(404, "Version not found");
    }
    return version;
  }
}
