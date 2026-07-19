import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/http-error";
import { AIWriterError } from "@anvilnote/ai-writer/server";

const AI_STATUS: Record<string, number> = {
  invalid_api_key: 401,
  permission_denied: 403,
  insufficient_credit: 402,
  request_too_large: 413,
  context_length_exceeded: 413,
  invalid_structured_output: 422,
  invalid_request_schema: 422,
  rate_limited: 429,
  request_cancelled: 499,
  provider_timeout: 504,
  network_error: 502,
  provider_error: 502,
  model_unavailable: 422,
  provider_refusal: 422,
  incomplete_response: 502,
};

export const errorMiddleware: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "invalid_request",
        message: "Validation failed",
        messageKey: "ai.errors.invalid_request",
        retryable: false,
        details: error.issues,
        requestId: req.header("X-Request-Id") ?? undefined,
      },
    });
    return;
  }

  if (error instanceof AIWriterError) {
    const safeDiagnosticDetails = error.details
      ? {
          ...(typeof error.details.providerRequestId === "string"
            ? { providerRequestId: error.details.providerRequestId }
            : {}),
          ...(typeof error.details.providerStatus === "number"
            ? { providerStatus: error.details.providerStatus }
            : {}),
          ...(typeof error.details.providerCode === "string"
            ? { providerCode: error.details.providerCode }
            : {}),
          ...(typeof error.details.providerType === "string"
            ? { providerType: error.details.providerType }
            : {}),
          ...(typeof error.details.providerParam === "string"
            ? { providerParam: error.details.providerParam }
            : {}),
          ...(error.details.validationStage === "provider-payload"
            ? { validationStage: error.details.validationStage }
            : {}),
          ...(Array.isArray(error.details.validationIssuePaths) &&
          error.details.validationIssuePaths.every((path) => typeof path === "string")
            ? { validationIssuePaths: error.details.validationIssuePaths.slice(0, 8) }
            : {}),
        }
      : {};
    res.status(AI_STATUS[error.code] ?? 500).json({
      error: {
        code: error.code,
        message: error.message,
        messageKey: error.messageKey ?? `ai.errors.${error.code}`,
        retryable: error.retryable,
        requestId: error.requestId ?? req.header("X-Request-Id") ?? undefined,
        ...(error.retryAfterMs !== undefined || Object.keys(safeDiagnosticDetails).length > 0
          ? {
              details: {
                ...safeDiagnosticDetails,
                ...(error.retryAfterMs !== undefined
                  ? { retryAfterMs: error.retryAfterMs }
                  : {}),
              },
            }
          : {}),
      },
    });
    return;
  }

  if (error instanceof HttpError) {
    const details =
      error.details && typeof error.details === "object" && !Array.isArray(error.details)
        ? (error.details as Record<string, unknown>)
        : {};
    const { code, messageKey, retryable, ...safeDetails } = details;
    res.status(error.statusCode).json({
      error: {
        code: typeof code === "string" ? code : "request_failed",
        message: error.message,
        messageKey:
          typeof messageKey === "string" ? messageKey : "errors.request_failed",
        retryable: retryable === true,
        requestId: req.header("X-Request-Id") ?? undefined,
        ...(Object.keys(safeDetails).length > 0 ? { details: safeDetails } : {}),
      },
    });
    return;
  }

  void error;
  res.status(500).json({
    error: {
      code: "unknown_error",
      message: "Internal server error",
      messageKey: "errors.internal",
      retryable: false,
      requestId: req.header("X-Request-Id") ?? undefined,
    },
  });
};
