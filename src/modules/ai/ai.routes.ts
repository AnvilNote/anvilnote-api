import type { AIWriterRequest, AIWriterResult, ConnectionTestResult } from "@anvilnote/ai-writer";
import { Router, type Request } from "express";
import multer from "multer";
import { asyncHandler } from "../../lib/async-handler";
import { HttpError } from "../../lib/http-error";
import {
  assertAIRequestAuthorized,
  resolveAIProviderCredential,
  type AIRequestPolicyConfig,
} from "./ai-credential-resolver";
import { AIWriterApplicationService } from "./ai-application.service";
import { AIRequestCancellationRegistry } from "./ai-cancellation-registry";
import { aiCancelParamsSchema, aiConnectionTestBodySchema, aiWriterBodySchema } from "./ai.schemas";
import { AttachmentExtractionService } from "./attachment-extraction.service";
import { AI_ATTACHMENT_LIMITS } from "@anvilnote/ai-writer";

export interface AIApplicationPort {
  getProviderMetadata(): unknown;
  estimate(request: AIWriterRequest): unknown;
  testConnection(
    providerId: string,
    model: string,
    credential: { apiKey: string },
    signal?: AbortSignal,
  ): Promise<ConnectionTestResult>;
  execute(
    request: AIWriterRequest,
    credential: { apiKey: string },
    signal?: AbortSignal,
  ): Promise<AIWriterResult>;
}

export interface CreateAIRouterOptions {
  service?: AIApplicationPort;
  extractionService?: AttachmentExtractionService;
  cancellationRegistry?: AIRequestCancellationRegistry;
  policy: AIRequestPolicyConfig;
}

function createRequestSignal(req: Request): AbortController {
  const controller = new AbortController();
  req.once("aborted", () => controller.abort());
  return controller;
}

export function createAIRouter(options: CreateAIRouterOptions) {
  const router = Router();
  const service = options.service ?? new AIWriterApplicationService();
  const extraction = options.extractionService ?? new AttachmentExtractionService();
  const cancellations = options.cancellationRegistry ?? new AIRequestCancellationRegistry();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      files: AI_ATTACHMENT_LIMITS.maxFiles,
      fileSize: AI_ATTACHMENT_LIMITS.maxFileSizeBytes,
      fields: 4,
      parts: AI_ATTACHMENT_LIMITS.maxFiles + 4,
    },
  });

  router.get("/providers", (_req, res) => {
    res.json({
      data: {
        ...(service.getProviderMetadata() as object),
        capability: {
          runtime: options.policy.runtime === "desktop" ? "desktop" : "browser",
          persistentCredentialStorage: options.policy.runtime === "desktop",
          sessionCredentialStorage:
            options.policy.runtime !== "desktop" && options.policy.browserSessionByok,
          smartModeAvailable:
            options.policy.runtime === "desktop" || options.policy.browserSessionByok,
          ...(!options.policy.browserSessionByok && options.policy.runtime !== "desktop"
            ? { reason: "desktop_only" }
            : {}),
        },
      },
    });
  });

  router.post(
    "/estimate",
    asyncHandler(async (req, res) => {
      const request = aiWriterBodySchema.parse(req.body);
      res.json({ data: service.estimate(request) });
    }),
  );

  router.post(
    "/test-connection",
    asyncHandler(async (req, res) => {
      const body = aiConnectionTestBodySchema.parse(req.body);
      const credential = resolveAIProviderCredential(req.headers, options.policy);
      const abort = createRequestSignal(req);
      res.json({
        data: await service.testConnection(
          body.providerId,
          body.model,
          credential,
          abort.signal,
        ),
      });
    }),
  );

  async function execute(req: Request, expected: "compose" | "rewrite", res: Parameters<Parameters<typeof asyncHandler>[0]>[1]) {
    const request = aiWriterBodySchema.parse(req.body);
    if (
      (expected === "compose" && request.intent === "rewrite-selection") ||
      (expected === "rewrite" && request.intent !== "rewrite-selection")
    ) {
      throw new HttpError(400, "AI request context does not match this operation.", {
        code: "invalid_request",
        messageKey: "ai.errors.invalid_request",
        retryable: false,
      });
    }
    const credential = resolveAIProviderCredential(req.headers, options.policy);
    const caller = createRequestSignal(req);
    const signal = cancellations.start(request.requestId, caller.signal);
    try {
      res.json({ data: await service.execute(request, credential, signal) });
    } finally {
      cancellations.finish(request.requestId);
    }
  }

  router.post("/compose", asyncHandler((req, res) => execute(req, "compose", res)));
  router.post(
    "/rewrite-selection",
    asyncHandler((req, res) => execute(req, "rewrite", res)),
  );

  router.post(
    "/attachments/extract",
    upload.array("files", AI_ATTACHMENT_LIMITS.maxFiles),
    asyncHandler(async (req, res) => {
      const files = Array.isArray(req.files) ? req.files : [];
      const abort = createRequestSignal(req);
      res.json({ data: await extraction.extract(files, abort.signal) });
    }),
  );

  router.post(
    "/requests/:requestId/cancel",
    asyncHandler(async (req, res) => {
      assertAIRequestAuthorized(req.headers, options.policy);
      const { requestId } = aiCancelParamsSchema.parse(req.params);
      res.json({ data: { cancelled: cancellations.cancel(requestId) } });
    }),
  );

  return router;
}
