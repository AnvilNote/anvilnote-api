import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AIConversationDraftSchema } from "./ai-conversation.types";
import type {
  AIConversationCursor,
  AIConversationDraft,
  DeleteAIConversationResult,
  AIConversationMessageCursor,
  AIConversationMessageRecord,
  AIConversationRecord,
  PersistAssistantTurnInput,
  PersistAssistantTurnResult,
  PersistUserTurnInput,
  PersistUserTurnResult,
} from "./ai-conversation.types";
import type { AIConversationRepositoryPort } from "./ai-conversation.service";

function toConversation(row: {
  id: string;
  documentId: string;
  title: string;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): AIConversationRecord {
  return {
    id: row.id,
    documentId: row.documentId,
    title: row.title,
    lastMessageAt: row.lastMessageAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toIntent(value: AIConversationMessageRecord["intent"]) {
  switch (value) {
    case "compose-from-attachments":
      return "compose_from_attachments" as const;
    case "rewrite-selection":
      return "rewrite_selection" as const;
    default:
      return "compose" as const;
  }
}

function fromIntent(value: string): AIConversationMessageRecord["intent"] {
  switch (value) {
    case "compose_from_attachments":
      return "compose-from-attachments";
    case "rewrite_selection":
      return "rewrite-selection";
    case "compose":
      return "compose";
    default:
      throw new Error("Stored conversation intent is invalid.");
  }
}

function toMessage(row: {
  id: string;
  conversationId: string;
  sequence: number;
  role: string;
  content: string;
  intent: string;
  draft: unknown;
  createdAt: Date;
  attachments?: Array<{
    id: string;
    messageId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    storageKey: string;
    createdAt: Date;
  }>;
}): AIConversationMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    sequence: row.sequence,
    role:
      row.role === "assistant"
        ? "assistant"
        : row.role === "user"
          ? "user"
          : (() => {
              throw new Error("Stored conversation role is invalid.");
            })(),
    content: row.content,
    intent: fromIntent(row.intent),
    draft: row.draft === null ? null : AIConversationDraftSchema.parse(row.draft),
    attachments: row.attachments ?? [],
    createdAt: row.createdAt,
  };
}

function toJsonValue(value: AIConversationDraft): Prisma.InputJsonValue {
  return AIConversationDraftSchema.parse(value) as unknown as Prisma.InputJsonValue;
}

export class AIConversationRepository implements AIConversationRepositoryPort {
  async findConversation(id: string): Promise<AIConversationRecord | null> {
    const row = await prisma.aIConversation.findUnique({ where: { id } });
    return row ? toConversation(row) : null;
  }

  async listRecentMessages(
    conversationId: string,
    take: number,
  ): Promise<AIConversationMessageRecord[]> {
    const rows = await prisma.aIConversationMessage.findMany({
      where: { conversationId },
      orderBy: { sequence: "desc" },
      take,
      include: { attachments: true },
    });
    return rows.map(toMessage);
  }

  async listConversations(
    documentId: string,
    cursor: AIConversationCursor | undefined,
    take: number,
  ): Promise<AIConversationRecord[]> {
    const rows = await prisma.aIConversation.findMany({
      where: {
        documentId,
        ...(cursor
          ? {
              OR: [
                { lastMessageAt: { lt: cursor.lastMessageAt } },
                { lastMessageAt: cursor.lastMessageAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      take,
    });
    return rows.map(toConversation);
  }

  async listMessages(
    conversationId: string,
    cursor: AIConversationMessageCursor | undefined,
    take: number,
  ): Promise<AIConversationMessageRecord[]> {
    const rows = await prisma.aIConversationMessage.findMany({
      where: {
        conversationId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      include: { attachments: true },
    });
    return rows.map(toMessage);
  }

  async renameConversation(id: string, title: string): Promise<AIConversationRecord> {
    return toConversation(
      await prisma.aIConversation.update({ where: { id }, data: { title } }),
    );
  }

  async deleteConversation(id: string): Promise<DeleteAIConversationResult> {
    return prisma.$transaction(async (transaction) => {
      const attachmentRows = await transaction.aIConversationAttachment.findMany({
        where: { message: { conversationId: id } },
        select: { storageKey: true },
        distinct: ["storageKey"],
      });
      const conversation = toConversation(
        await transaction.aIConversation.delete({ where: { id } }),
      );
      const orphanedStorageKeys: string[] = [];
      for (const { storageKey } of attachmentRows) {
        const remaining = await transaction.aIConversationAttachment.count({
          where: { storageKey },
        });
        if (remaining === 0) orphanedStorageKeys.push(storageKey);
      }
      return { conversation, orphanedStorageKeys };
    });
  }

  async persistUserTurn(
    input: PersistUserTurnInput,
  ): Promise<PersistUserTurnResult> {
    return prisma.$transaction(async (transaction) => {
      const existingMessage = await transaction.aIConversationMessage.findUnique({
        where: { id: input.messageId },
      });
      if (existingMessage) {
        const existingConversation = await transaction.aIConversation.findUnique({
          where: { id: existingMessage.conversationId },
        });
        if (
          !existingConversation ||
          existingConversation.documentId !== input.documentId ||
          existingMessage.role !== "user" ||
          existingMessage.content !== input.userMessage.content ||
          fromIntent(existingMessage.intent) !== input.userMessage.intent
        ) {
          throw new Error("Conversation user-message idempotency conflict.");
        }
        return {
          conversation: toConversation(existingConversation),
          message: toMessage(existingMessage),
        };
      }

      let conversation;
      if (input.conversationId) {
        conversation = await transaction.aIConversation.findUnique({
          where: { id: input.conversationId },
        });
        if (!conversation || conversation.documentId !== input.documentId) {
          throw new Error("Conversation no longer belongs to the document.");
        }
      } else {
        if (!input.newConversationTitle) {
          throw new Error("A new conversation requires a title.");
        }
        conversation = await transaction.aIConversation.create({
          data: {
            documentId: input.documentId,
            title: input.newConversationTitle,
          },
        });
      }

      const latest = await transaction.aIConversationMessage.findFirst({
        where: { conversationId: conversation.id },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      const userSequence = (latest?.sequence ?? 0) + 1;
      const now = new Date();
      const user = await transaction.aIConversationMessage.create({
        data: {
          id: input.messageId,
          conversationId: conversation.id,
          sequence: userSequence,
          role: "user",
          content: input.userMessage.content,
          intent: toIntent(input.userMessage.intent),
          ...(input.userMessage.attachments.length
            ? {
                attachments: {
                  create: input.userMessage.attachments.map((attachment) => ({
                    id: attachment.id,
                    originalName: attachment.originalName,
                    mimeType: attachment.mimeType,
                    sizeBytes: attachment.sizeBytes,
                    sha256: attachment.sha256,
                    storageKey: attachment.storageKey,
                  })),
                },
              }
            : {}),
        },
        include: { attachments: true },
      });
      const updatedConversation = await transaction.aIConversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: now },
      });
      return {
        conversation: toConversation(updatedConversation),
        message: toMessage(user),
      };
    });
  }

  async persistAssistantTurn(
    input: PersistAssistantTurnInput,
  ): Promise<PersistAssistantTurnResult> {
    return prisma.$transaction(async (transaction) => {
      const existingMessage = await transaction.aIConversationMessage.findUnique({
        where: { id: input.messageId },
      });
      if (existingMessage) {
        const existingConversation = await transaction.aIConversation.findUnique({
          where: { id: existingMessage.conversationId },
        });
        if (
          !existingConversation ||
          existingConversation.id !== input.conversationId ||
          existingMessage.role !== "assistant"
        ) {
          throw new Error("Conversation assistant-message idempotency conflict.");
        }
        return {
          conversation: toConversation(existingConversation),
          message: toMessage(existingMessage),
        };
      }

      const conversation = await transaction.aIConversation.findUnique({
        where: { id: input.conversationId },
      });
      if (!conversation) throw new Error("Conversation no longer exists.");
      const latest = await transaction.aIConversationMessage.findFirst({
        where: { conversationId: conversation.id },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      const now = new Date();
      const assistant = await transaction.aIConversationMessage.create({
        data: {
          id: input.messageId,
          conversationId: conversation.id,
          sequence: (latest?.sequence ?? 0) + 1,
          role: "assistant",
          content: input.assistantMessage.content,
          intent: toIntent(input.assistantMessage.intent),
          draft: toJsonValue(input.assistantMessage.draft),
        },
        include: { attachments: true },
      });
      const updatedConversation = await transaction.aIConversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: now },
      });
      return {
        conversation: toConversation(updatedConversation),
        message: toMessage(assistant),
      };
    });
  }
}
