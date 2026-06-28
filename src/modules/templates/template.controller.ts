import type { Request, Response } from "express";
import { createTemplateSchema, templateIdParamsSchema, updateTemplateSchema } from "./template.schemas";
import { TemplateService } from "./template.service";

const templateService = new TemplateService();

export class TemplateController {
  async list(_req: Request, res: Response) {
    const templates = await templateService.listTemplates();

    res.json({
      data: templates,
      meta: {
        count: templates.length,
      },
    });
  }

  async create(req: Request, res: Response) {
    const input = createTemplateSchema.parse(req.body);
    const template = await templateService.createTemplate(input);

    res.status(201).json({ data: template });
  }

  async getById(req: Request, res: Response) {
    const { id } = templateIdParamsSchema.parse(req.params);
    const template = await templateService.getTemplate(id);

    res.json({ data: template });
  }

  async update(req: Request, res: Response) {
    const { id } = templateIdParamsSchema.parse(req.params);
    const input = updateTemplateSchema.parse(req.body);
    const template = await templateService.updateTemplate(id, input);

    res.json({ data: template });
  }

  async delete(req: Request, res: Response) {
    const { id } = templateIdParamsSchema.parse(req.params);
    const result = await templateService.deleteTemplate(id);

    res.json({ data: result });
  }
}
