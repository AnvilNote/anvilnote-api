import { runChartsCli } from "./charts-cli";
import type { z } from "zod";
import type { chartsRenderBodySchema } from "./charts.schemas";

export class ChartsService {
  async render(spec: z.infer<typeof chartsRenderBodySchema>): Promise<{ svg: string }> {
    const svg = await runChartsCli(spec);
    return { svg };
  }
}
