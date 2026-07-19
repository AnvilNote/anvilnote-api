import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import type { AIRequestPolicyConfig } from "../ai/ai-credential-resolver";
import { AIRequestCancellationRegistry } from "../ai/ai-cancellation-registry";
import { AIConversationController, type AIConversationApplicationPort } from "./ai-conversation.controller";

export function createAIConversationRouter(options: {
  service: AIConversationApplicationPort;
  policy: AIRequestPolicyConfig;
  cancellationRegistry: AIRequestCancellationRegistry;
}) {
  const router = Router();
  const controller = new AIConversationController(options);

  router.get(
    "/documents/:documentId/ai-conversations",
    asyncHandler((req, res) => controller.list(req, res)),
  );
  router.get(
    "/documents/:documentId/ai-conversations/:conversationId/messages",
    asyncHandler((req, res) => controller.listMessages(req, res)),
  );
  router.post(
    "/documents/:documentId/ai-conversations/turns",
    asyncHandler((req, res) => controller.turn(req, res)),
  );
  router.patch(
    "/documents/:documentId/ai-conversations/:conversationId",
    asyncHandler((req, res) => controller.rename(req, res)),
  );
  router.delete(
    "/documents/:documentId/ai-conversations/:conversationId",
    asyncHandler((req, res) => controller.delete(req, res)),
  );

  return router;
}
