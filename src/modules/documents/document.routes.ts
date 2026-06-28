import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { DocumentController } from "./document.controller";

const router = Router();
const controller = new DocumentController();

router.get("/", asyncHandler((req, res) => controller.list(req, res)));
router.post("/", asyncHandler((req, res) => controller.create(req, res)));
router.get("/:id", asyncHandler((req, res) => controller.getById(req, res)));
router.patch("/:id", asyncHandler((req, res) => controller.update(req, res)));
router.delete("/:id", asyncHandler((req, res) => controller.delete(req, res)));

export const documentRouter = router;
