import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { RenderController } from "./render.controller";

const router = Router();
const controller = new RenderController();

// Render runs synchronously and returns the finished result directly.
router.post("/documents/:id/render", asyncHandler((req, res) => controller.renderDocument(req, res)));
// Look up a past render's recorded outcome by id (result lookup, not polling).
router.get("/render-jobs/:id", asyncHandler((req, res) => controller.getRenderJob(req, res)));

export const renderRouter = router;
