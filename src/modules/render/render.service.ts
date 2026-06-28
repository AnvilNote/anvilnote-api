import type { RenderOutput } from "@prisma/client";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../lib/http-error";
import { env } from "../../config/env";
import { DocumentRepository } from "../documents/document.repository";
import { templateRegistry } from "../templates/template.registry";
import { sweepRenderArtifacts } from "../../lib/storage-cleanup";
import {
  applyDefaults,
  resolveDates,
  validateRequiredFields,
  type FieldValue,
} from "./field-resolver";
import type { RenderBodyInput } from "./render.schemas";
import type { RenderOutputRecord } from "./render.types";
import { runRendererCli } from "./renderer-cli";

function normalizeRecord(value: unknown): Record<string, FieldValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, FieldValue>>(
    (acc, [key, entry]) => {
      if (typeof entry === "string" || typeof entry === "boolean" || entry === null) {
        acc[key] = entry;
      }
      return acc;
    },
    {},
  );
}

function mapRenderOutput(output: RenderOutput): RenderOutputRecord {
  return {
    id: output.id,
    documentId: output.documentId,
    templateId: output.templateId,
    templateVersion: output.templateVersion,
    format: output.format,
    status: output.status,
    pdfUrl: output.pdfUrl,
    typstPath: output.typstPath,
    pdfPath: output.pdfPath,
    error: output.error,
    createdAt: output.createdAt.toISOString(),
    updatedAt: output.updatedAt.toISOString(),
  };
}

export class RenderService {
  private readonly documentRepository = new DocumentRepository();

  async renderDocument(documentId: string, input?: RenderBodyInput) {
    const document = await this.documentRepository.findById(documentId);
    if (!document) {
      throw new HttpError(404, "Document not found");
    }

    // Resolve the target template: explicit override → document's own → default.
    const slug = input?.templateId ?? document.templateId ?? env.DEFAULT_TEMPLATE_SLUG;
    const manifest = templateRegistry.get(slug);
    if (!manifest) {
      throw new HttpError(404, `Template not found: ${slug}`);
    }

    // Bucket fields by scope and resolve values (override > stored > default).
    const metaFields = manifest.fields.filter((field) => field.scope === "metadata");
    const optionFields = manifest.fields.filter((field) => field.scope === "option");

    const storedMetadata = normalizeRecord(document.metadata);
    const storedSettings = normalizeRecord(document.templateSettings);
    const optionOverrides = normalizeRecord(input?.options ?? {});

    let meta = applyDefaults(metaFields, storedMetadata, {});
    const options = applyDefaults(optionFields, storedSettings, optionOverrides);

    // Required-field gate runs before any metadata stripping (400 → no render).
    validateRequiredFields(manifest.fields, { ...meta, ...options });

    // Convert "today" sentinels; honor includeMetadata (false → drop all meta).
    meta = resolveDates(metaFields, meta);
    const includeMetadata = input?.exportOptions?.includeMetadata ?? true;
    if (!includeMetadata) {
      meta = {};
    }

    // Synchronous render: the row is a durable record of the outcome, created
    // as PROCESSING so a mid-render failure still leaves an accurate record.
    const output = await prisma.renderOutput.create({
      data: {
        documentId,
        templateId: slug,
        templateVersion: manifest.version,
        status: "PROCESSING",
      },
    });

    try {
      const result = await runRendererCli({
        document: {
          id: document.id,
          title: document.title,
          content: Array.isArray(document.content) ? (document.content as unknown[]) : [],
        },
        template: { slug, meta, options },
        options: {
          format: "pdf",
          ...(input?.exportOptions?.pageSize ? { pageSize: input.exportOptions.pageSize } : {}),
          includeMetadata,
        },
      });

      const completed = await prisma.$transaction(async (tx) => {
        await tx.document.update({
          where: { id: documentId },
          data: { typstSource: path.basename(result.typstPath) },
        });

        return tx.renderOutput.update({
          where: { id: output.id },
          data: {
            status: "COMPLETED",
            typstPath: result.typstPath,
            pdfPath: result.pdfPath,
            pdfUrl: `/files/pdf/${path.basename(result.pdfPath)}`,
            error: null,
            contentSnapshot: (document.content ?? []) as object,
            metadataSnapshot: meta as object,
            templateSnapshot: manifest as object,
          },
        });
      });

      void sweepRenderArtifacts().catch((error) => {
        console.warn("storage-cleanup: post-render sweep failed", error);
      });

      return {
        id: completed.id,
        documentId: completed.documentId,
        status: completed.status,
        pdfUrl: completed.pdfUrl,
      };
    } catch (error) {
      const message =
        error instanceof HttpError
          ? typeof error.details === "string"
            ? error.details
            : error.message
          : error instanceof Error
            ? error.message
            : "Unknown render error";

      await prisma.renderOutput.update({
        where: { id: output.id },
        data: { status: "FAILED", error: message },
      });

      throw error;
    }
  }

  // Result lookup (not progress polling): rendering is synchronous, so the
  // record is already terminal (COMPLETED or FAILED) by the time it's queried.
  async getRenderOutput(id: string) {
    const output = await prisma.renderOutput.findUnique({ where: { id } });
    if (!output) {
      throw new HttpError(404, "Render output not found");
    }
    return mapRenderOutput(output);
  }
}
