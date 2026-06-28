import type { Request, Response } from "express";
import { renderBodySchema, renderDocumentParamsSchema, renderJobParamsSchema } from "./render.schemas";
import { RenderService } from "./render.service";

const renderService = new RenderService();

export class RenderController {
  async renderDocument(req: Request, res: Response) {
    const { id } = renderDocumentParamsSchema.parse(req.params);
    const input = renderBodySchema.parse(req.body);
    const job = await renderService.renderDocument(id, input);

    res.status(201).json({ data: job });
  }

  async getRenderJob(req: Request, res: Response) {
    const { id } = renderJobParamsSchema.parse(req.params);
    const job = await renderService.getRenderJob(id);

    res.json({ data: job });
  }
}
