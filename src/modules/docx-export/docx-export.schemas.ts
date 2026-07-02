import { z } from "zod";

export const docxExportParamsSchema = z.object({
  id: z.string().min(1),
});
