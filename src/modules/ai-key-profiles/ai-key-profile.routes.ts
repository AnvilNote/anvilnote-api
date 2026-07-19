import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { HttpError } from "../../lib/http-error";
import {
  assertAIRequestAuthorized,
  type AIRequestPolicyConfig,
} from "../ai/ai-credential-resolver";
import {
  activeKeyProfileSecretParamsSchema,
  createKeyProfileBodySchema,
  keyProfileListQuerySchema,
  keyProfileParamsSchema,
  renameKeyProfileBodySchema,
} from "./ai-key-profile.schemas";
import { AIKeyProfileRepository } from "./ai-key-profile.repository";
import {
  AIKeyProfileService,
  type AIKeyProfileApplicationPort,
} from "./ai-key-profile.service";

function assertDesktopKeyProfileAuthorized(
  headers: Record<string, string | string[] | undefined>,
  policy: AIRequestPolicyConfig,
): void {
  if (policy.runtime !== "desktop") {
    throw new HttpError(403, "Desktop key profiles are unavailable in this runtime.", {
      code: "permission_denied",
      messageKey: "ai.errors.permission_denied",
      retryable: false,
    });
  }
  assertAIRequestAuthorized(headers, policy);
}

export function createAIKeyProfileRouter(options: {
  policy: AIRequestPolicyConfig;
  service?: AIKeyProfileApplicationPort;
}) {
  const router = Router();
  const service = options.service ?? new AIKeyProfileService({
    repository: new AIKeyProfileRepository(),
  });

  router.get(
    "/key-profiles",
    asyncHandler(async (req, res) => {
      assertDesktopKeyProfileAuthorized(req.headers, options.policy);
      const { providerId } = keyProfileListQuerySchema.parse(req.query);
      res.json({ data: await service.list(providerId) });
    }),
  );
  router.post(
    "/key-profiles",
    asyncHandler(async (req, res) => {
      assertDesktopKeyProfileAuthorized(req.headers, options.policy);
      res.status(201).json({ data: await service.create(createKeyProfileBodySchema.parse(req.body)) });
    }),
  );
  router.patch(
    "/key-profiles/:profileId",
    asyncHandler(async (req, res) => {
      assertDesktopKeyProfileAuthorized(req.headers, options.policy);
      const { profileId } = keyProfileParamsSchema.parse(req.params);
      const { label } = renameKeyProfileBodySchema.parse(req.body);
      res.json({ data: await service.rename(profileId, label) });
    }),
  );
  router.post(
    "/key-profiles/:profileId/activate",
    asyncHandler(async (req, res) => {
      assertDesktopKeyProfileAuthorized(req.headers, options.policy);
      const { profileId } = keyProfileParamsSchema.parse(req.params);
      res.json({ data: await service.activate(profileId) });
    }),
  );
  router.post(
    "/key-profiles/:profileId/deactivate",
    asyncHandler(async (req, res) => {
      assertDesktopKeyProfileAuthorized(req.headers, options.policy);
      const { profileId } = keyProfileParamsSchema.parse(req.params);
      res.json({ data: await service.deactivate(profileId) });
    }),
  );
  router.delete(
    "/key-profiles/:profileId",
    asyncHandler(async (req, res) => {
      assertDesktopKeyProfileAuthorized(req.headers, options.policy);
      const { profileId } = keyProfileParamsSchema.parse(req.params);
      res.json({ data: await service.delete(profileId) });
    }),
  );
  router.get(
    "/key-profiles/active/:providerId/secret",
    asyncHandler(async (req, res) => {
      assertDesktopKeyProfileAuthorized(req.headers, options.policy);
      const { providerId } = activeKeyProfileSecretParamsSchema.parse(req.params);
      const secret = await service.getActiveEncryptedSecret(providerId);
      if (!secret) {
        throw new HttpError(404, "No active AI key profile exists.", {
          code: "invalid_api_key",
          messageKey: "ai.errors.invalid_api_key",
          retryable: false,
        });
      }
      res.json({ data: secret });
    }),
  );

  return router;
}
