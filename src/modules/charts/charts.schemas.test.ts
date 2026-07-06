// src/modules/charts/charts.schemas.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartsRenderBodySchema } from "./charts.schemas";

test("accepts a valid single-curve spec", () => {
  const result = chartsRenderBodySchema.parse({
    curves: [{ formula: "sin(x)", color: "#000000", dash: "solid" }],
    xMin: -10,
    xMax: 10,
    showGridlines: true,
  });
  assert.equal(result.curves.length, 1);
});

test("rejects xMin >= xMax", () => {
  assert.throws(() =>
    chartsRenderBodySchema.parse({
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
      curves: Array(7).fill(curve),
      xMin: -10,
      xMax: 10,
      showGridlines: true,
    }),
  );
});
