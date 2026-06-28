import type { Request, Response } from "express";
import { HttpError } from "../../lib/http-error";
import { templateSlugParamsSchema } from "./template.schemas";
import { TemplateService } from "./template.service";

const templateService = new TemplateService();

export class TemplateController {
  async list(_req: Request, res: Response) {
    const templates = templateService.listTemplates();
    res.json({
      data: templates,
      meta: { count: templates.length },
    });
  }

  async getBySlug(req: Request, res: Response) {
    const { slug } = templateSlugParamsSchema.parse(req.params);
    const template = templateService.getTemplate(slug);
    res.json({ data: template });
  }

  async preview(req: Request, res: Response) {
    const { slug } = templateSlugParamsSchema.parse(req.params);
    const previewPath = templateService.getPreviewPath(slug);
    res.sendFile(previewPath, (error) => {
      if (error) {
        // File missing on disk (preview is optional) → 404.
        res.headersSent || res.status(404).json({
          error: { message: "Template preview not found" },
        });
      }
    });
  }
}
