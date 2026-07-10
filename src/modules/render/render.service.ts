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

function normalizeContentShape(content: unknown): unknown[] {
  if (Array.isArray(content)) {
    return content as unknown[];
  }
  if (content && typeof content === "object") {
    return [content];
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clampHeadingLevel(level: number) {
  return Math.min(Math.max(level, 1), 6);
}

function normalizeHeadingLevels(content: unknown[], targetMinLevel = 1): unknown[] {
  let minLevel = Number.POSITIVE_INFINITY;

  const collect = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!isRecord(value)) {
      return;
    }
    if (value.type === "heading") {
      const attrs = isRecord(value.attrs) ? value.attrs : {};
      const level = typeof attrs.level === "number" ? attrs.level : 1;
      minLevel = Math.min(minLevel, level);
    }
    if (Array.isArray(value.content)) {
      value.content.forEach(collect);
    }
  };

  content.forEach(collect);

  if (
    !Number.isFinite(minLevel) ||
    minLevel <= targetMinLevel
  ) {
    return content;
  }

  const shift = minLevel - targetMinLevel;

  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(rewrite);
    }
    if (!isRecord(value)) {
      return value;
    }

    const next: Record<string, unknown> = { ...value };
    if (value.type === "heading") {
      const attrs = isRecord(value.attrs) ? value.attrs : {};
      const level = typeof attrs.level === "number" ? attrs.level : 1;
      next.attrs = {
        ...attrs,
        level: clampHeadingLevel(level - shift),
      };
    }
    if (Array.isArray(value.content)) {
      next.content = value.content.map(rewrite);
    }
    return next;
  };

  return content.map(rewrite);
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
    const metadataOverrides = normalizeRecord(input?.metadata ?? {});
    const templateSettingsOverrides = normalizeRecord(input?.templateSettings ?? {});
    const optionOverrides = normalizeRecord(input?.options ?? {});

    let meta = applyDefaults(metaFields, storedMetadata, metadataOverrides);
    const options = applyDefaults(
      optionFields,
      storedSettings,
      { ...templateSettingsOverrides, ...optionOverrides },
    );

    // Required-field gate runs before any metadata stripping (400 → no render).
    validateRequiredFields(manifest.fields, { ...meta, ...options });

    // Convert "today" sentinels; honor includeMetadata (false → drop all meta).
    meta = resolveDates(metaFields, meta);
    const includeMetadata = input?.exportOptions?.includeMetadata ?? true;
    if (!includeMetadata) {
      meta = {};
    }

    const normalizedTarget =
      slug === "plain-note" ? 2 : 1;
    const content = normalizeHeadingLevels(
      normalizeContentShape(input?.content ?? document.content),
      normalizedTarget,
    );
    const title = input?.title ?? document.title;

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
          title,
          content,
        },
        template: { slug, meta, options },
        numberedHeadings: input?.numberedHeadings ?? document.numberedHeadings,
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
            contentSnapshot: content as object,
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
