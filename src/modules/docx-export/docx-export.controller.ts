import type { Request, Response } from "express";
import { docxExportParamsSchema } from "./docx-export.schemas";
import { DocxExportService } from "./docx-export.service";

const docxExportService = new DocxExportService();

export class DocxExportController {
  async exportDocument(req: Request, res: Response) {
    const { id } = docxExportParamsSchema.parse(req.params);
    const { buffer, filename } = await docxExportService.exportDocument(id);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  }
}
