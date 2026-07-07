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
    kind: z.literal("functionPlot"),
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
const MAX_SERIES = 6;

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

// Mirrors anvilnote-charts's own customSizeFields.
const customSizeFields = {
  width: z.number().min(1).max(50).optional(),
  height: z.number().min(1).max(50).optional(),
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
  showBorder: z.boolean().default(true),
  ...axisLabelFields,
  ...customSizeFields,
});
const columnChartSchema = categoricalBase.extend({
  chartType: z.literal("column"),
  showValues: z.boolean().default(false),
  showGridLines: z.boolean().default(true),
  showBorder: z.boolean().default(true),
  ...axisLabelFields,
  ...customSizeFields,
});
const lineChartSchema = categoricalBase.extend({
  chartType: z.literal("line"),
  ...axisLabelFields,
  ...customSizeFields,
});
const pieChartSchema = categoricalBase.extend({
  chartType: z.literal("pie"),
  showLegend: z.boolean().default(true),
  showPercentage: z.enum(["none", "onSlice", "beside"]).default("none"),
  ...customSizeFields,
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
  ...customSizeFields,
});

const boxWhiskerChartSchema = z.object({
  kind: z.literal("statsChart"),
  chartType: z.literal("boxwhisker"),
  data: z.array(boxWhiskerEntrySchema).min(1).max(MAX_ENTRIES),
  fontFamily: fontFamilySchema,
  ...customSizeFields,
});

const stackedEntrySchema = z.object({
  label: z.string().min(1).max(LABEL_MAX_LEN),
  values: z.array(z.number().finite()).min(1).max(MAX_SERIES),
});

const stackedChartBase = z.object({
  kind: z.literal("statsChart"),
  data: z.array(stackedEntrySchema).min(1).max(MAX_ENTRIES),
  seriesLabels: z.array(z.string().min(1).max(LABEL_MAX_LEN)).min(1).max(MAX_SERIES),
  seriesColors: z
    .array(z.string().regex(HEX_COLOR_PATTERN, "Color must be a 6-digit hex value"))
    .max(MAX_SERIES)
    .optional(),
  showLegend: z.boolean().default(true),
  showGridLines: z.boolean().default(true),
  showBorder: z.boolean().default(true),
  fontFamily: fontFamilySchema,
  ...axisLabelFields,
  ...customSizeFields,
});

const stackedBarChartSchema = stackedChartBase.extend({ chartType: z.literal("stackedBar") });
const stackedColumnChartSchema = stackedChartBase.extend({ chartType: z.literal("stackedColumn") });

const statsChartBodySchema = z
  .discriminatedUnion("chartType", [
    barChartSchema,
    columnChartSchema,
    pieChartSchema,
    lineChartSchema,
    scatterChartSchema,
    boxWhiskerChartSchema,
    stackedBarChartSchema,
    stackedColumnChartSchema,
  ])
  .superRefine((spec, ctx) => {
    if (spec.chartType !== "stackedBar" && spec.chartType !== "stackedColumn") return;
    for (const [index, entry] of spec.data.entries()) {
      if (entry.values.length !== spec.seriesLabels.length) {
        ctx.addIssue({
          code: "custom",
          message: `Entry ${index} has ${entry.values.length} values but seriesLabels has ${spec.seriesLabels.length}`,
          path: ["data", index, "values"],
        });
      }
    }
  });

// ─── top-level dispatch ─────────────────────────────────────────────────
export const chartsRenderBodySchema = z.union([functionPlotBodySchema, statsChartBodySchema]);
