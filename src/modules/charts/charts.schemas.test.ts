// src/modules/charts/charts.schemas.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartsRenderBodySchema } from "./charts.schemas";

test("accepts a valid single-curve function-plot spec", () => {
  const result = chartsRenderBodySchema.parse({
    kind: "functionPlot",
    curves: [{ formula: "sin(x)", color: "#000000", dash: "solid" }],
    xMin: -10,
    xMax: 10,
    showGridlines: true,
  });
  assert.equal(result.kind, "functionPlot");
  if (result.kind === "functionPlot") {
    assert.equal(result.curves.length, 1);
  }
});

test("rejects xMin >= xMax", () => {
  assert.throws(() =>
    chartsRenderBodySchema.parse({
      kind: "functionPlot",
      curves: [{ formula: "x", color: "#000000", dash: "solid" }],
      xMin: 10,
      xMax: -10,
      showGridlines: true,
    }),
  );
});

test("rejects more than 6 curves", () => {
  const curve = { formula: "x", color: "#000000", dash: "solid" as const };
  assert.throws(() =>
    chartsRenderBodySchema.parse({
      kind: "functionPlot",
      curves: Array(7).fill(curve),
      xMin: -10,
      xMax: 10,
      showGridlines: true,
    }),
  );
});

test("defaults showAxisTicks to true when omitted", () => {
  const result = chartsRenderBodySchema.parse({
    kind: "functionPlot",
    curves: [{ formula: "sin(x)", color: "#000000", dash: "solid" }],
    xMin: -10,
    xMax: 10,
    showGridlines: true,
  });
  if (result.kind === "functionPlot") {
    assert.equal(result.showAxisTicks, true);
  }
});

test("rejects a request missing kind entirely", () => {
  assert.throws(() =>
    chartsRenderBodySchema.parse({
      curves: [{ formula: "sin(x)", color: "#000000", dash: "solid" }],
      xMin: -10,
      xMax: 10,
      showGridlines: true,
    }),
  );
});

test("accepts a valid stats-chart bar spec", () => {
  const result = chartsRenderBodySchema.parse({
    kind: "statsChart",
    chartType: "bar",
    data: [{ label: "Mon", value: 10 }],
  });
  assert.equal(result.kind, "statsChart");
});

test("accepts a valid stats-chart pie spec with showLegend default", () => {
  const result = chartsRenderBodySchema.parse({
    kind: "statsChart",
    chartType: "pie",
    data: [{ label: "Male", value: 10 }],
  });
  if (result.kind === "statsChart" && result.chartType === "pie") {
    assert.equal(result.showLegend, true);
  }
});

test("rejects stats-chart boxwhisker with out-of-order values", () => {
  assert.throws(() =>
    chartsRenderBodySchema.parse({
      kind: "statsChart",
      chartType: "boxwhisker",
      data: [{ label: "A", min: 50, q1: 10, median: 30, q3: 40, max: 50 }],
    }),
  );
});
