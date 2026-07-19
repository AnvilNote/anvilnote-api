import type { AIProviderCredential } from "@anvilnote/ai-writer";
import type { Request, Response } from "express";
import { resolveAIProviderCredential, type AIRequestPolicyConfig } from "../ai/ai-credential-resolver";
import { AIRequestCancellationRegistry } from "../ai/ai-cancellation-registry";
import {
  aiConversationTurnBodySchema,
  conversationCursorQuerySchema,
  conversationParamsSchema,
  documentConversationParamsSchema,
  renameConversationBodySchema,
} from "./ai-conversation.schemas";
import { AIConversationService } from "./ai-conversation.service";
import type {
  AIConversationMessageRecord,
  AIConversationRecord,
  ExecuteAIConversationTurnInput,
  PersistCompletedTurnResult,
} from "./ai-conversation.types";
import { HttpError } from "../../lib/http-error";

export interface AIConversationApplicationPort {
  listConversations(documentId: string, cursor: string | undefined): ReturnType<AIConversationService["listConversations"]>;
  listMessages(
    documentId: string,
    conversationId: string,
    cursor: string | undefined,
  ): ReturnType<AIConversationService["listMessages"]>;
  renameConversation(
    documentId: string,
    conversationId: string,
    title: string,
  ): ReturnType<AIConversationService["renameConversation"]>;
  deleteConversation(
    documentId: string,
    conversationId: string,
  ): ReturnType<AIConversationService["deleteConversation"]>;
  executeTurn(
    input: ExecuteAIConversationTurnInput,
    credential: AIProviderCredential,
    signal?: AbortSignal,
  ): Promise<PersistCompletedTurnResult>;
}

function createRequestSignal(req: Request): AbortController {
  const controller = new AbortController();
  req.once("aborted", () => controller.abort());
  return controller;
}

function mapConversation(conversation: AIConversationRecord) {
  return {
    id: conversation.id,
    documentId: conversation.documentId,
    title: conversation.title,
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

function mapMessage(message: AIConversationMessageRecord) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    sequence: message.sequence,
    role: message.role,
    content: message.content,
    intent: message.intent,
    ...(message.draft ? { draft: message.draft } : {}),
    ...(message.attachments?.length
      ? {
          attachments: message.attachments.map((attachment) => ({
            id: attachment.id,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
          })),
        }
      : {}),
    createdAt: message.createdAt.toISOString(),
  };
}

export class AIConversationController {
  private readonly service: AIConversationApplicationPort;
  private readonly policy: AIRequestPolicyConfig;
  private readonly cancellations: AIRequestCancellationRegistry;

  constructor(options: {
    service: AIConversationApplicationPort;
    policy: AIRequestPolicyConfig;
    cancellationRegistry: AIRequestCancellationRegistry;
  }) {
    this.service = options.service;
    this.policy = options.policy;
    this.cancellations = options.cancellationRegistry;
  }

  async list(req: Request, res: Response) {
    const { documentId } = documentConversationParamsSchema.parse(req.params);
    const { cursor } = conversationCursorQuerySchema.parse(req.query);
    const page = await this.service.listConversations(documentId, cursor);
    res.json({
      data: page.data.map(mapConversation),
      meta: { nextCursor: page.nextCursor },
    });
  }

  async listMessages(req: Request, res: Response) {
    const { documentId, conversationId } = conversationParamsSchema.parse(req.params);
    const { cursor } = conversationCursorQuerySchema.parse(req.query);
    const page = await this.service.listMessages(documentId, conversationId, cursor);
    res.json({
      data: page.data.map(mapMessage),
      meta: { nextCursor: page.nextCursor },
    });
  }

  async turn(req: Request, res: Response) {
    const { documentId } = documentConversationParamsSchema.parse(req.params);
    const body = aiConversationTurnBodySchema.parse(req.body);
    if (body.preparedAttachments?.length && this.policy.runtime !== "desktop") {
      throw new HttpError(403, "Persisted attachments require the trusted desktop runtime.", {
        code: "permission_denied",
        messageKey: "ai.errors.permission_denied",
        retryable: false,
      });
    }
    const credential = resolveAIProviderCredential(req.headers, this.policy);
    const caller = createRequestSignal(req);
    const signal = this.cancellations.start(body.requestId, caller.signal);
    try {
      const result = await this.service.executeTurn(
        {
          documentId,
          ...(body.conversationId ? { conversationId: body.conversationId } : {}),
          request: body,
        },
        credential,
        signal,
      );
      res.status(body.conversationId ? 200 : 201).json({
        data: {
          conversation: mapConversation(result.conversation),
          messages: result.messages.map(mapMessage),
        },
      });
    } finally {
      this.cancellations.finish(body.requestId);
    }
  }

  async rename(req: Request, res: Response) {
    const { documentId, conversationId } = conversationParamsSchema.parse(req.params);
    const { title } = renameConversationBodySchema.parse(req.body);
    const conversation = await this.service.renameConversation(
      documentId,
      conversationId,
      title,
    );
    res.json({ data: mapConversation(conversation) });
  }

  async delete(req: Request, res: Response) {
    const { documentId, conversationId } = conversationParamsSchema.parse(req.params);
    const deleted = await this.service.deleteConversation(documentId, conversationId);
    res.json({
      data: {
        id: deleted.id,
        ...(this.policy.runtime === "desktop"
          ? { orphanedStorageKeys: deleted.orphanedStorageKeys }
          : {}),
      },
    });
  }
}
