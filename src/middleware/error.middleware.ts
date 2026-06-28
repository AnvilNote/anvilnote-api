import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/http-error";
import { env } from "../config/env";

export const errorMiddleware: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        message: "Validation failed",
        details: error.issues,
      },
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: {
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
        ...(env.NODE_ENV === "development" ? { stack: error.stack } : {}),
      },
    });
    return;
  }

  const unexpected = error instanceof Error ? error : new Error("Unknown error");
  res.status(500).json({
    error: {
      message: "Internal server error",
      ...(env.NODE_ENV === "development"
        ? {
            details: unexpected.message,
            stack: unexpected.stack,
            requestId: req.header("X-Request-Id") ?? null,
          }
        : {}),
    },
  });
};
