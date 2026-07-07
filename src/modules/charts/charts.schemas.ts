import { z } from "zod";

// Mirrors anvilnote-charts's own schema (a separate hand-maintained copy,
// same as docx-export/render never share schemas cross-repo) — split into
// function-plot and stats-chart sections for the same decoupling reason
// the CLI repo itself is split into src/function-plot/ + src/stats-chart/.

// ─── function-plot ──────────────────────────────────────────────────────
const FORMULA_PATTERN = /^[a-zA-Z0-9+\-*/^().,\s]+$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DASH_VALUES = ["solid", "dashed", "dotted", "dash-dot"] as const;

const functionPlotBodySchema = z
  .object({
    // Defaulted for convenience when parsing this member schema in
    // isolation (e.g. a future direct test) — the outer
    // z.discriminatedUnion below still requires "kind" present in the raw
    // request body to route to this branch at all (confirmed: the default
    // does not help the union pick a branch for an input missing "kind"
    // entirely). anvilnote-web always sends "kind" explicitly for every
    // /api/charts/render call — see function-plot-render.ts /
    // stats-chart-render.ts.
    kind: z.literal("functionPlot").default("functionPlot"),
    curves: z
      .array(
        z.object({
          formula: z.string().min(1).max(200).regex(FORMULA_PATTERN, "Formula contains unsupported characters"),
          color: z.string().regex(HEX_COLOR_PATTERN, "Color must be a 6-digit hex value"),
          dash: z.enum(DASH_VALUES),
          thickness: z.number().min(0.5).max(4).default(1.5),
        }),
      )
      .min(1)
      .max(6),
    xMin: z.number().finite(),
    xMax: z.number().finite(),
    showGridlines: z.boolean(),
    showAxisTicks: z.boolean().default(true),
  })
  .refine((spec) => spec.xMin < spec.xMax, {
    message: "xMin must be less than xMax",
    path: ["xMin"],
  });

// ─── stats-chart ─────────────────────────────────────────────────────────
const LABEL_MAX_LEN = 100;
const MAX_ENTRIES = 20;

const categoricalEntrySchema = z.object({
  label: z.string().min(1).max(LABEL_MAX_LEN),
  value: z.number().finite(),
  color: z.string().regex(HEX_COLOR_PATTERN, "Color must be a 6-digit hex value").optional(),
});

// Mirrors anvilnote-charts's own scatterEntrySchema.
const SCATTER_MAX_ENTRIES = 200;
const scatterEntrySchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const boxWhiskerEntrySchema = z
  .object({
    label: z.string().min(1).max(LABEL_MAX_LEN),
    min: z.number().finite(),
    q1: z.number().finite(),
    median: z.number().finite(),
    q3: z.number().finite(),
    max: z.number().finite(),
  })
  .refine((e) => e.min <= e.q1 && e.q1 <= e.median && e.median <= e.q3 && e.q3 <= e.max, {
    message: "Values must satisfy min <= q1 <= median <= q3 <= max",
    path: ["min"],
  });

// Mirrors anvilnote-charts's own schema.ts fontFamilySchema.
const fontFamilySchema = z.enum(["sans", "serif"]).default("sans");

// Mirrors anvilnote-charts's own axisLabelFields.
const axisLabelFields = {
  xLabel: z.string().max(50).default(""),
  yLabel: z.string().max(50).default(""),
  yLabelRotated: z.boolean().default(true),
};

const categoricalBase = z.object({
  kind: z.literal("statsChart"),
  data: z.array(categoricalEntrySchema).min(1).max(MAX_ENTRIES),
  fontFamily: fontFamilySchema,
});

const barChartSchema = categoricalBase.extend({
  chartType: z.literal("bar"),
  showValues: z.boolean().default(false),
  showGridLines: z.boolean().default(true),
  ...axisLabelFields,
});
const columnChartSchema = categoricalBase.extend({
  chartType: z.literal("column"),
  showValues: z.boolean().default(false),
  showGridLines: z.boolean().default(true),
  ...axisLabelFields,
});
const lineChartSchema = categoricalBase.extend({ chartType: z.literal("line"), ...axisLabelFields });
const pieChartSchema = categoricalBase.extend({
  chartType: z.literal("pie"),
  showLegend: z.boolean().default(true),
  showPercentage: z.enum(["none", "onSlice", "beside"]).default("none"),
});

// Mirrors anvilnote-charts's own scatterChartSchema.
const scatterChartSchema = z.object({
  kind: z.literal("statsChart"),
  chartType: z.literal("scatter"),
  data: z.array(scatterEntrySchema).min(1).max(SCATTER_MAX_ENTRIES),
  fontFamily: fontFamilySchema,
  trendLine: z.enum(["none", "linear", "lowess"]).default("none"),
  trendLineColor: z.string().regex(HEX_COLOR_PATTERN, "Color must be a 6-digit hex value").default("#737373"),
  showGridLines: z.boolean().default(true),
  ...axisLabelFields,
});

const boxWhiskerChartSchema = z.object({
  kind: z.literal("statsChart"),
  chartType: z.literal("boxwhisker"),
  data: z.array(boxWhiskerEntrySchema).min(1).max(MAX_ENTRIES),
  fontFamily: fontFamilySchema,
});

const statsChartBodySchema = z.discriminatedUnion("chartType", [
  barChartSchema,
  columnChartSchema,
  pieChartSchema,
  lineChartSchema,
  scatterChartSchema,
  boxWhiskerChartSchema,
]);

// ─── top-level dispatch ─────────────────────────────────────────────────
export const chartsRenderBodySchema = z.discriminatedUnion("kind", [
  functionPlotBodySchema,
  statsChartBodySchema,
]);
