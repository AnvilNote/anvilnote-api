import { z } from "zod";

const templateFieldSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  type: z.enum(["text", "date", "select", "boolean"]),
  required: z.boolean(),
  placeholder: z.string().optional(),
  defaultValue: z.union([z.string(), z.boolean(), z.null()]).optional(),
  options: z.array(z.string()).optional(),
});

const templateConfigSchema = z
  .object({
    fields: z.array(templateFieldSchema).optional(),
  })
  .catchall(z.unknown());

export const templateIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).nullable().optional(),
  config: templateConfigSchema.nullable().optional(),
  typstBody: z.string().nullable().optional(),
  isBuiltIn: z.boolean().default(false),
});

export const updateTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    config: templateConfigSchema.nullable().optional(),
    typstBody: z.string().nullable().optional(),
    isBuiltIn: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
