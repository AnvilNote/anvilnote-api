import type { RenderJob } from "@prisma/client";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../lib/http-error";
import { DocumentRepository } from "../documents/document.repository";
import { TemplateRepository } from "../templates/template.repository";
import { sweepRenderArtifacts } from "../../lib/storage-cleanup";
import type { RenderBodyInput } from "./render.schemas";
import type { RenderJobRecord } from "./render.types";
import { runRendererCli } from "./renderer-cli";

function mapRenderJob(job: RenderJob): RenderJobRecord {
  return {
    id: job.id,
    documentId: job.documentId,
    status: job.status,
    typstPath: job.typstPath,
    pdfPath: job.pdfPath,
    pdfUrl: job.pdfUrl,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export class RenderService {
  private readonly documentRepository = new DocumentRepository();
  private readonly templateRepository = new TemplateRepository();

  async renderDocument(documentId: string, input?: RenderBodyInput) {
    const document = await this.documentRepository.findById(documentId);

    if (!document) {
      throw new HttpError(404, "Document not found");
    }

    const template = document.templateId
      ? await this.templateRepository.findById(document.templateId)
      : null;

    // Rendering runs synchronously within this request, so there is no real
    // queued/processing window for anyone to observe. The RenderJob row is a
    // durable record of the render outcome (paths on success, error on
    // failure), not an async job to be polled. Create it as PROCESSING so a
    // failure mid-render still leaves an accurate record for the catch block.
    const job = await prisma.renderJob.create({
      data: {
        documentId,
        status: "PROCESSING",
      },
    });

    try {
      // Honor the includeMetadata export option: when disabled, no metadata
      // fields are forwarded to the renderer. Defaults to included.
      const includeMetadata = input?.exportOptions?.includeMetadata ?? true;
      const documentMetadata =
        document.metadata && typeof document.metadata === "object" && !Array.isArray(document.metadata)
          ? (document.metadata as Record<string, string | boolean | null>)
          : {};
      const mergedMetadata = includeMetadata
        ? (input?.metadata ?? documentMetadata)
        : {};

      const templateConfig =
        template?.config && typeof template.config === "object" && !Array.isArray(template.config)
          ? (template.config as Record<string, unknown>)
          : null;
      const rendererTemplateId =
        typeof templateConfig?.rendererTemplateId === "string"
          ? templateConfig.rendererTemplateId
          : "minimal-lecture";

      const result = await runRendererCli({
        document: {
          id: document.id,
          title: document.title,
          content: Array.isArray(document.content) ? (document.content as unknown[]) : [],
        },
        template: {
          id: rendererTemplateId,
          fields: {
            title: document.title,
            ...mergedMetadata,
          },
        },
        options: {
          format: "pdf",
          ...input?.exportOptions,
        },
      });

      const completedJob = await prisma.$transaction(async (tx) => {
        await tx.document.update({
          where: { id: documentId },
          data: {
            typstSource: path.basename(result.typstPath),
          },
        });

        return tx.renderJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            typstPath: result.typstPath,
            pdfPath: result.pdfPath,
            pdfUrl: `/files/pdf/${path.basename(result.pdfPath)}`,
            error: null,
          },
        });
      });

      // Keep storage bounded by sweeping stale artifacts after each render.
      // Best-effort and non-blocking so it never delays the render response.
      void sweepRenderArtifacts().catch((error) => {
        console.warn("storage-cleanup: post-render sweep failed", error);
      });

      return {
        jobId: completedJob.id,
        documentId: completedJob.documentId,
        status: completedJob.status,
        pdfUrl: completedJob.pdfUrl,
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

      await prisma.renderJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          error: message,
        },
      });

      throw error;
    }
  }

  // Fetch a past render's recorded outcome by id. Because rendering is
  // synchronous, by the time a caller can request this the record is already
  // in its terminal state (COMPLETED or FAILED) — this is a result lookup, not
  // progress polling.
  async getRenderJob(id: string) {
    const job = await prisma.renderJob.findUnique({
      where: { id },
    });

    if (!job) {
      throw new HttpError(404, "Render job not found");
    }

    return mapRenderJob(job);
  }
}
