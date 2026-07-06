import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { ChartsController } from "./charts.controller";

const router = Router();
const controller = new ChartsController();

router.post(
  "/charts/render",
  asyncHandler((req, res) => controller.render(req, res)),
);

export const chartsRouter = router;
