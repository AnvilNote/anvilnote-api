import {
  AI_CONVERSATION_LIMITS,
  AIWriterRequestSchema,
  getModelDefinition,
  type AIWriterRequest,
} from "@anvilnote/ai-writer";
import { z } from "zod";
import type { AIConversationTurnRequest } from "./ai-conversation.types";

const identifierSchema = z.string().trim().min(1).max(128);
const preparedAttachmentSchema = z.object({
  id: identifierSchema,
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().nonnegative().max(10_485_760),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  storageKey: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const turnBodySchema = z
  .object({
    requestId: z.string().trim().min(1).max(128),
    intent: z
      .enum(["compose", "compose-from-attachments", "rewrite-selection"])
      .optional(),
    conversationId: identifierSchema.optional(),
    provider: z
      .object({
        id: z.string().trim().min(1).max(64),
        model: z.string().trim().min(1).max(128),
      })
      .strict(),
    instruction: z
      .string()
      .trim()
      .min(1)
      .max(AI_CONVERSATION_LIMITS.maxCharactersPerMessage),
    context: z
      .object({
        locale: z.string().trim().min(2).max(64),
        requestedOutputLocale: z.string().trim().min(2).max(64).optional(),
        documentType: z.string().trim().min(1).max(128).optional(),
        writingStyle: z.enum(["auto", "neutral", "natural", "preserve-source"]),
        selectedContent: z.unknown().optional(),
        attachments: z.array(z.unknown()).optional(),
      })
      .strict(),
    options: z
      .object({
        humanizerEnabled: z.boolean(),
        maxOutputTokens: z.number().int().positive().max(128_000).optional(),
      })
      .strict(),
    preparedAttachments: z.array(preparedAttachmentSchema).max(5).optional(),
  })
  .strict();

function deriveIntent(body: z.infer<typeof turnBodySchema>): AIWriterRequest["intent"] {
  if (body.context.selectedContent !== undefined) return "rewrite-selection";
  return (body.context.attachments?.length ?? 0) > 0
    ? "compose-from-attachments"
    : "compose";
}

export const aiConversationTurnBodySchema = turnBodySchema.transform(
  (body, context): AIConversationTurnRequest => {
    if (!getModelDefinition(body.provider.id, body.provider.model)?.enabled) {
      context.addIssue({
        code: "custom",
        path: ["provider", "model"],
        message: "Provider or model is not supported.",
      });
      return z.NEVER;
    }
    const intent = deriveIntent(body);
    if (body.intent !== undefined && body.intent !== intent) {
      context.addIssue({
        code: "custom",
        path: ["intent"],
        message: "AI writer intent does not match the submitted context.",
      });
      return z.NEVER;
    }
    const parsed = AIWriterRequestSchema.safeParse({
      requestId: body.requestId,
      intent,
      provider: body.provider,
      instruction: body.instruction,
      context: body.context,
      options: body.options,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      }
      return z.NEVER;
    }
    const { currentDocument: _currentDocument, conversation: _conversation, ...safeContext } =
      parsed.data.context;
    return {
      requestId: parsed.data.requestId,
      provider: parsed.data.provider,
      instruction: parsed.data.instruction,
      context: safeContext,
      options: parsed.data.options,
      ...(body.preparedAttachments?.length
        ? { preparedAttachments: body.preparedAttachments }
        : {}),
      ...(body.conversationId ? { conversationId: body.conversationId } : {}),
    };
  },
);

export const documentConversationParamsSchema = z
  .object({ documentId: identifierSchema })
  .strict();

export const conversationParamsSchema = z
  .object({ documentId: identifierSchema, conversationId: identifierSchema })
  .strict();

export const conversationCursorQuerySchema = z
  .object({ cursor: z.string().trim().min(1).max(512).optional() })
  .strict();

export const renameConversationBodySchema = z
  .object({ title: z.string().trim().min(1).max(255) })
  .strict();
