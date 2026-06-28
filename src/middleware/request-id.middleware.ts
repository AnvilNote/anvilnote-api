import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incomingId = req.header("X-Request-Id");
  const requestId = incomingId || randomUUID();

  req.headers["x-request-id"] = requestId;
  res.setHeader("X-Request-Id", requestId);

  next();
};
