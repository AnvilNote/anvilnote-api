import type { Request, Response } from "express";
import { documentIdParamsSchema, versionParamsSchema } from "./document-version.schemas";
import { DocumentVersionService } from "./document-version.service";

const versionService = new DocumentVersionService();

export class DocumentVersionController {
  async list(req: Request, res: Response) {
    const { id } = documentIdParamsSchema.parse(req.params);
    const versions = await versionService.listVersions(id);
    res.json({ data: versions, meta: { count: versions.length } });
  }

  async getById(req: Request, res: Response) {
    const { id, versionId } = versionParamsSchema.parse(req.params);
    const version = await versionService.getVersion(id, versionId);
    res.json({ data: version });
  }

  async create(req: Request, res: Response) {
    const { id } = documentIdParamsSchema.parse(req.params);
    const version = await versionService.createVersion(id);
    res.status(201).json({ data: version });
  }

  async restore(req: Request, res: Response) {
    const { id, versionId } = versionParamsSchema.parse(req.params);
    const document = await versionService.restoreVersion(id, versionId);
    res.json({ data: document });
  }
}
