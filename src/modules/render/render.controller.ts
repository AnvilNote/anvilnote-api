import type { Request, Response } from "express";
import { renderBodySchema, renderDocumentParamsSchema, renderOutputParamsSchema } from "./render.schemas";
import { RenderService } from "./render.service";

const renderService = new RenderService();

export class RenderController {
  async renderDocument(req: Request, res: Response) {
    const { id } = renderDocumentParamsSchema.parse(req.params);
    const input = renderBodySchema.parse(req.body);
    const output = await renderService.renderDocument(id, input);

    res.status(201).json({ data: output });
  }

  async getRenderOutput(req: Request, res: Response) {
    const { id } = renderOutputParamsSchema.parse(req.params);
    const output = await renderService.getRenderOutput(id);

    res.json({ data: output });
  }
}
