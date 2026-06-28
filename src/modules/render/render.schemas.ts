import { z } from "zod";
import { metadataValueSchema } from "../documents/document.schemas";

export const renderDocumentParamsSchema = z.object({
  id: z.string().min(1),
});

export const renderJobParamsSchema = z.object({
  id: z.string().min(1),
});

export const renderBodySchema = z
  .object({
    metadata: z.record(z.string(), metadataValueSchema).optional(),
    exportOptions: z
      .object({
        pageSize: z.enum(["A4", "Letter"]).optional(),
        fontPreset: z.enum(["sans", "serif", "mono"]).optional(),
        includeMetadata: z.boolean().optional(),
      })
      .optional(),
  })
  .optional();

export type RenderBodyInput = z.infer<typeof renderBodySchema>;
