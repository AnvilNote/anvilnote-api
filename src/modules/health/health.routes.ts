import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "anvilnote-api",
    time: new Date().toISOString(),
  });
});

export const healthRouter = router;
