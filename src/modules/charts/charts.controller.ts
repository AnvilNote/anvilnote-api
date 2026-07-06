import type { Request, Response } from "express";
import { chartsRenderBodySchema } from "./charts.schemas";
import { ChartsService } from "./charts.service";

const chartsService = new ChartsService();

export class ChartsController {
  async render(req: Request, res: Response) {
    const spec = chartsRenderBodySchema.parse(req.body);
    const result = await chartsService.render(spec);
    res.json(result);
  }
}
