import { z } from "zod";

export const projectIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(255),
  icon: z.string().trim().min(1).max(64).nullable().default(null),
});

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    icon: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
