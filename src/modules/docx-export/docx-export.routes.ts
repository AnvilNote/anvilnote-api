import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { DocxExportController } from "./docx-export.controller";

const router = Router();
const controller = new DocxExportController();

router.post(
  "/documents/:id/export/docx",
  asyncHandler((req, res) => controller.exportDocument(req, res)),
);

export const docxExportRouter = router;
