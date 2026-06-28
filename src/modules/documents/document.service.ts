import { Prisma, type Document } from "@prisma/client";
import { HttpError } from "../../lib/http-error";
import type { CreateDocumentInput, UpdateDocumentInput } from "./document.schemas";
import type { AnvilMetadataValue, DocumentRecord } from "./document.types";
import { DocumentRepository } from "./document.repository";

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

function mapDocument(document: Document): DocumentRecord {
  return {
    id: document.id,
    title: document.title,
    content: Array.isArray(document.content) ? (document.content as unknown[]) : [],
    metadata: normalizeMetadata(document.metadata),
    templateSettings: normalizeMetadata(document.templateSettings),
    templateId: document.templateId,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export class DocumentService {
  private readonly documentRepository = new DocumentRepository();

  async listDocuments() {
    const documents = await this.documentRepository.list();
    return documents.map(mapDocument);
  }

  // templateId is now a plain slug (file-based template), not a DB foreign key,
  // so there is no placeholder Template row to create.
  async createDocument(input: CreateDocumentInput) {
    const document = await this.documentRepository.create({
      title: input.title,
      content: toJsonValue(input.content),
      metadata: toJsonValue(input.metadata),
      templateSettings: toJsonValue(input.templateSettings),
      templateId: input.templateId,
    });

    return mapDocument(document);
  }

  async getDocument(id: string) {
    const document = await this.documentRepository.findById(id);

    if (!document) {
      throw new HttpError(404, "Document not found");
    }

    return mapDocument(document);
  }

  async updateDocument(id: string, input: UpdateDocumentInput) {
    await this.ensureDocumentExists(id);

    const document = await this.documentRepository.update(id, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: toJsonValue(input.content) } : {}),
      ...(input.metadata !== undefined ? { metadata: toJsonValue(input.metadata) } : {}),
      ...(input.templateSettings !== undefined
        ? { templateSettings: toJsonValue(input.templateSettings) }
        : {}),
      ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
    });

    return mapDocument(document);
  }

  async deleteDocument(id: string) {
    await this.ensureDocumentExists(id);
    const document = await this.documentRepository.delete(id);

    return { id: document.id };
  }

  private async ensureDocumentExists(id: string) {
    const document = await this.documentRepository.findById(id);
    if (!document) {
      throw new HttpError(404, "Document not found");
    }
    return document;
  }
}
