import type { Request, Response } from "express";
import { createDocumentSchema, documentIdParamsSchema, updateDocumentSchema } from "./document.schemas";
import { DocumentService } from "./document.service";

const documentService = new DocumentService();

export class DocumentController {
  async list(_req: Request, res: Response) {
    const documents = await documentService.listDocuments();

    res.json({
      data: documents,
      meta: {
        count: documents.length,
      },
    });
  }

  async create(req: Request, res: Response) {
    const input = createDocumentSchema.parse(req.body);
    const document = await documentService.createDocument(input);

    res.status(201).json({ data: document });
  }

  async getById(req: Request, res: Response) {
    const { id } = documentIdParamsSchema.parse(req.params);
    const document = await documentService.getDocument(id);

    res.json({ data: document });
  }

  async update(req: Request, res: Response) {
    const { id } = documentIdParamsSchema.parse(req.params);
    const input = updateDocumentSchema.parse(req.body);
    const document = await documentService.updateDocument(id, input);

    res.json({ data: document });
  }

  async delete(req: Request, res: Response) {
    const { id } = documentIdParamsSchema.parse(req.params);
    const result = await documentService.deleteDocument(id);

    res.json({ data: result });
  }
}
