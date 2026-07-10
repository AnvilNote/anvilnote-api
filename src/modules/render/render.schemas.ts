import { z } from "zod";
import { metadataValueSchema } from "../documents/document.schemas";

export const renderDocumentParamsSchema = z.object({
  id: z.string().min(1),
});

export const renderOutputParamsSchema = z.object({
  id: z.string().min(1),
});

export const renderBodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    // The web app sends the in-memory Tiptap doc object here; the API wraps it
    // back into the stored `[doc]` shape before handing it to the renderer.
    content: z.unknown().optional(),
    // Unsaved form state from the client should be renderable without first
    // persisting it back to the document row.
    metadata: z.record(z.string(), metadataValueSchema).optional(),
    templateSettings: z.record(z.string(), metadataValueSchema).optional(),
    // Override the document's template for this render (defaults to the
    // document's own templateId, then DEFAULT_TEMPLATE_SLUG).
    templateId: z.string().trim().min(1).optional(),
    // Override specific template options (e.g. previewing unsaved settings).
    options: z.record(z.string(), metadataValueSchema).optional(),
    // Document-level override, NOT part of the per-template `options` dict
    // above — see anvilnote-web's numberedHeadings field for why this stays
    // top-level.
    numberedHeadings: z.boolean().optional(),
    // Same reasoning as numberedHeadings above — document-level, not part
    // of the per-template `options` dict.
    marginTopCm: z.number().positive().nullable().optional(),
    marginBottomCm: z.number().positive().nullable().optional(),
    marginLeftCm: z.number().positive().nullable().optional(),
    marginRightCm: z.number().positive().nullable().optional(),
    exportOptions: z
      .object({
        pageSize: z.enum(["A4", "Letter"]).optional(),
        includeMetadata: z.boolean().optional(),
      })
      .optional(),
  })
  .optional();

export type RenderBodyInput = z.infer<typeof renderBodySchema>;
