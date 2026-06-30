import { z } from "zod";

export const metadataValueSchema = z.union([z.string(), z.boolean(), z.null()]);

export const documentIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const createDocumentSchema = z.object({
  title: z.string().trim().max(255).default("Untitled Note"),
  content: z.array(z.unknown()).default([]),
  metadata: z.record(z.string(), metadataValueSchema).default({}),
  templateSettings: z.record(z.string(), metadataValueSchema).default({}),
  templateId: z.string().trim().min(1).nullable().default(null),
});

export const updateDocumentSchema = z
  .object({
    title: z.string().trim().max(255).optional(),
    content: z.array(z.unknown()).optional(),
    metadata: z.record(z.string(), metadataValueSchema).optional(),
    templateSettings: z.record(z.string(), metadataValueSchema).optional(),
    templateId: z.string().trim().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
