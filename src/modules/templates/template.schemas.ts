import { z } from "zod";

// Templates are addressed by slug (the renderer template folder name).
export const templateSlugParamsSchema = z.object({
  slug: z.string().trim().min(1),
});
