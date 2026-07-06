import { z } from "zod";

const FORMULA_PATTERN = /^[a-zA-Z0-9+\-*/^().,\s]+$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DASH_VALUES = ["solid", "dashed", "dotted", "dash-dot"] as const;

export const chartsRenderBodySchema = z
  .object({
    curves: z
      .array(
        z.object({
          formula: z.string().min(1).max(200).regex(FORMULA_PATTERN),
          color: z.string().regex(HEX_COLOR_PATTERN),
          dash: z.enum(DASH_VALUES),
        }),
      )
      .min(1)
      .max(6),
    xMin: z.number().finite(),
    xMax: z.number().finite(),
    showGridlines: z.boolean(),
  })
  .refine((spec) => spec.xMin < spec.xMax, {
    message: "xMin must be less than xMax",
    path: ["xMin"],
  });
