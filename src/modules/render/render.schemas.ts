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
    // Override the document's template for this render (defaults to the
    // document's own templateId, then DEFAULT_TEMPLATE_SLUG).
    templateId: z.string().trim().min(1).optional(),
    // Override specific template options (e.g. previewing unsaved settings).
    options: z.record(z.string(), metadataValueSchema).optional(),
    exportOptions: z
      .object({
        pageSize: z.enum(["A4", "Letter"]).optional(),
        includeMetadata: z.boolean().optional(),
      })
      .optional(),
  })
  .optional();

export type RenderBodyInput = z.infer<typeof renderBodySchema>;
