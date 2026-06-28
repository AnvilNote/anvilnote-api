import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { TemplateController } from "./template.controller";

const router = Router();
const controller = new TemplateController();

// Read-only: templates are file-based and owned by the renderer.
router.get("/", asyncHandler((req, res) => controller.list(req, res)));
router.get("/:slug", asyncHandler((req, res) => controller.getBySlug(req, res)));
router.get("/:slug/preview", asyncHandler((req, res) => controller.preview(req, res)));

export const templateRouter = router;
