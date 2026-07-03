import { z } from "zod";

export const documentIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const versionParamsSchema = z.object({
  id: z.string().min(1),
  versionId: z.string().min(1),
});
