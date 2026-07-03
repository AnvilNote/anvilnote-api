import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { DocumentVersionController } from "./document-version.controller";

const router = Router();
const controller = new DocumentVersionController();

router.get("/documents/:id/versions", asyncHandler((req, res) => controller.list(req, res)));
router.get("/documents/:id/versions/:versionId", asyncHandler((req, res) => controller.getById(req, res)));
router.post("/documents/:id/versions", asyncHandler((req, res) => controller.create(req, res)));
router.post("/documents/:id/versions/:versionId/restore", asyncHandler((req, res) => controller.restore(req, res)));

export const documentVersionRouter = router;
