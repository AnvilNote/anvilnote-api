import type { AIProviderCredential, AIWriterRequest, AIWriterResult } from "@anvilnote/ai-writer";
import { HttpError } from "../../lib/http-error";
import type { DocumentRecord } from "../documents/document.types";
import { persistedDocumentToAIContext } from "./persisted-document-ai-context";
import {
  type AIConversationCursor,
  type AIConversationMessageCursor,
  type AIConversationMessageRecord,
  type AIConversationPage,
  type AIConversationRecord,
  type AIConversationTurnRequest,
  type AIConversationWriterPort,
  type ExecuteAIConversationTurnInput,
  type DeleteAIConversationResult,
  type PersistAssistantTurnInput,
  type PersistAssistantTurnResult,
  type PersistCompletedTurnResult,
  type PersistUserTurnInput,
  type PersistUserTurnResult,
} from "./ai-conversation.types";

const MAX_CONTEXT_MESSAGES = 8;
const MAX_CONTEXT_MESSAGE_CHARACTERS = 6_000;
const MAX_CONTEXT_CHARACTERS = 48_000;
const MAX_AUTOMATIC_CONVERSATION_TITLE_CHARACTERS = 12;
const CONVERSATION_PAGE_SIZE = 20;
const MESSAGE_PAGE_SIZE = 30;

export interface AIConversationRepositoryPort {
  findConversation(id: string): Promise<AIConversationRecord | null>;
  listRecentMessages(
    conversationId: string,
    take: number,
  ): Promise<AIConversationMessageRecord[]>;
  listConversations(
    documentId: string,
    cursor: AIConversationCursor | undefined,
    take: number,
  ): Promise<AIConversationRecord[]>;
  listMessages(
    conversationId: string,
    cursor: AIConversationMessageCursor | undefined,
    take: number,
  ): Promise<AIConversationMessageRecord[]>;
  renameConversation(id: string, title: string): Promise<AIConversationRecord>;
  deleteConversation(id: string): Promise<DeleteAIConversationResult>;
  persistUserTurn(input: PersistUserTurnInput): Promise<PersistUserTurnResult>;
  persistAssistantTurn(
    input: PersistAssistantTurnInput,
  ): Promise<PersistAssistantTurnResult>;
}

interface DocumentReaderPort {
  getDocument(id: string): Promise<DocumentRecord>;
}

export interface AIConversationServiceOptions {
  repository: AIConversationRepositoryPort;
  documents: DocumentReaderPort;
  writer: AIConversationWriterPort;
}

function deriveIntent(request: AIConversationTurnRequest): AIWriterRequest["intent"] {
  if (request.context.selectedContent) return "rewrite-selection";
  return (request.context.attachments?.length ?? 0) > 0
    ? "compose-from-attachments"
    : "compose";
}

function safeTitle(instruction: string): string {
  const normalized = instruction
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const firstSentence = normalized.match(/^.+?[.!?。！？](?:\s|$)/)?.[0].trim();
  const source = firstSentence || normalized || "New chat";
  return Array.from(source)
    .slice(0, MAX_AUTOMATIC_CONVERSATION_TITLE_CHARACTERS)
    .join("")
    .trim();
}

function automaticTitle(result: AIWriterResult): string | null {
  const candidate = result.kind === "compose"
    ? result.suggestedTitle || result.summary
    : result.changeSummary;
  const normalized = candidate
    .normalize("NFKC")
    .replace(/\p{P}+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  return Array.from(normalized)
    .slice(0, MAX_AUTOMATIC_CONVERSATION_TITLE_CHARACTERS)
    .join("")
    .trim() || null;
}

function clipText(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join("");
}

function toPromptHistory(rows: AIConversationMessageRecord[]) {
  const chronological = rows.slice().reverse();
  const completed: AIConversationMessageRecord[] = [];
  for (let index = 0; index < chronological.length - 1; index += 1) {
    const user = chronological[index];
    const assistant = chronological[index + 1];
    if (
      user.role === "user" &&
      assistant.role === "assistant" &&
      assistant.sequence === user.sequence + 1
    ) {
      completed.push(user, assistant);
      index += 1;
    }
  }
  const newestFirst = completed.slice(-MAX_CONTEXT_MESSAGES).reverse();
  const selected: AIConversationMessageRecord[] = [];
  let characterCount = 0;
  for (const row of newestFirst) {
    const content = clipText(row.content, MAX_CONTEXT_MESSAGE_CHARACTERS);
    if (characterCount + content.length > MAX_CONTEXT_CHARACTERS) continue;
    selected.push({ ...row, content });
    characterCount += content.length;
  }
  return selected.reverse().map(({ role, content }) => ({ role, content }));
}

function toDraft(result: AIWriterResult) {
  if (result.kind === "compose") {
    return {
      kind: "compose" as const,
      schemaVersion: result.schemaVersion,
      suggestedTitle: result.suggestedTitle,
      document: result.document,
      summary: result.summary,
    };
  }
  return {
    kind: "rewrite-selection" as const,
    schemaVersion: result.schemaVersion,
    replacement: result.replacement,
    changeSummary: result.changeSummary,
  };
}

function assistantDisplayText(result: AIWriterResult): string {
  return result.kind === "compose" ? result.summary : result.changeSummary;
}

function encodeCursor(value: Record<string, string>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined, timestampKey: string) {
  if (!value) return undefined;
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      throw new Error("invalid");
    }
    const record = decoded as Record<string, unknown>;
    const timestamp = record[timestampKey];
    if (
      typeof timestamp !== "string" ||
      typeof record.id !== "string" ||
      record.id.length === 0 ||
      !Number.isFinite(Date.parse(timestamp))
    ) {
      throw new Error("invalid");
    }
    return { date: new Date(timestamp), id: record.id };
  } catch {
    throw new HttpError(400, "Conversation cursor is invalid.", {
      code: "invalid_request",
      retryable: false,
    });
  }
}

export class AIConversationService {
  private readonly repository: AIConversationRepositoryPort;
  private readonly documents: DocumentReaderPort;
  private readonly writer: AIConversationWriterPort;

  constructor(options: AIConversationServiceOptions) {
    this.repository = options.repository;
    this.documents = options.documents;
    this.writer = options.writer;
  }

  async executeTurn(
    input: ExecuteAIConversationTurnInput,
    credential: AIProviderCredential,
    signal?: AbortSignal,
  ): Promise<PersistCompletedTurnResult> {
    const document = await this.documents.getDocument(input.documentId);
    const existingConversation = input.conversationId
      ? await this.requireOwnedConversation(input.documentId, input.conversationId)
      : null;
    const provisionalTitle = existingConversation ? null : safeTitle(input.request.instruction);
    const intent = deriveIntent(input.request);
    const persistedUser = await this.repository.persistUserTurn({
      documentId: input.documentId,
      messageId: input.request.requestId,
      ...(existingConversation
        ? { conversationId: existingConversation.id }
        : { newConversationTitle: provisionalTitle! }),
      userMessage: {
        content: input.request.instruction,
        intent,
        attachments: input.request.preparedAttachments ?? [],
      },
    });
    const history = toPromptHistory(
      (await this.repository.listRecentMessages(
        persistedUser.conversation.id,
        MAX_CONTEXT_MESSAGES + 1,
      ))
        .filter((message) => message.id !== persistedUser.message.id)
        .slice(0, MAX_CONTEXT_MESSAGES),
    );
    const currentDocument = persistedDocumentToAIContext(document.content);
    const request: AIWriterRequest = {
      requestId: input.request.requestId,
      intent,
      provider: input.request.provider,
      instruction: input.request.instruction,
      context: {
        ...input.request.context,
        currentDocument,
        ...(history.length > 0 ? { conversation: { messages: history } } : {}),
      },
      options: input.request.options,
    };
    const result = await this.writer.execute(request, credential, signal);
    const generatedTitle = provisionalTitle ? automaticTitle(result) : null;
    const persistedAssistant = await this.repository.persistAssistantTurn({
      conversationId: persistedUser.conversation.id,
      messageId: `${input.request.requestId}:assistant`,
      ...(generatedTitle
        ? {
            automaticTitle: {
              expectedTitle: provisionalTitle!,
              title: generatedTitle,
            },
          }
        : {}),
      assistantMessage: {
        content: assistantDisplayText(result),
        intent: request.intent,
        draft: toDraft(result),
      },
    });
    return {
      conversation: persistedAssistant.conversation,
      messages: [persistedUser.message, persistedAssistant.message],
    };
  }

  async listConversations(
    documentId: string,
    cursor: string | undefined,
  ): Promise<AIConversationPage<AIConversationRecord>> {
    await this.documents.getDocument(documentId);
    const decoded = decodeCursor(cursor, "lastMessageAt");
    const rows = await this.repository.listConversations(
      documentId,
      decoded ? { lastMessageAt: decoded.date, id: decoded.id } : undefined,
      CONVERSATION_PAGE_SIZE + 1,
    );
    const data = rows.slice(0, CONVERSATION_PAGE_SIZE);
    const last = data.at(-1);
    return {
      data,
      nextCursor:
        rows.length > CONVERSATION_PAGE_SIZE && last
          ? encodeCursor({
              lastMessageAt: last.lastMessageAt.toISOString(),
              id: last.id,
            })
          : null,
    };
  }

  async listMessages(
    documentId: string,
    conversationId: string,
    cursor: string | undefined,
  ): Promise<AIConversationPage<AIConversationMessageRecord>> {
    await this.requireOwnedConversation(documentId, conversationId);
    const decoded = decodeCursor(cursor, "createdAt");
    const rows = await this.repository.listMessages(
      conversationId,
      decoded ? { createdAt: decoded.date, id: decoded.id } : undefined,
      MESSAGE_PAGE_SIZE + 1,
    );
    const newestPage = rows.slice(0, MESSAGE_PAGE_SIZE);
    const last = newestPage.at(-1);
    return {
      data: newestPage.reverse(),
      nextCursor:
        rows.length > MESSAGE_PAGE_SIZE && last
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  async renameConversation(documentId: string, conversationId: string, title: string) {
    await this.requireOwnedConversation(documentId, conversationId);
    return this.repository.renameConversation(conversationId, title);
  }

  async deleteConversation(documentId: string, conversationId: string) {
    await this.requireOwnedConversation(documentId, conversationId);
    const deleted = await this.repository.deleteConversation(conversationId);
    return {
      id: deleted.conversation.id,
      orphanedStorageKeys: deleted.orphanedStorageKeys,
    };
  }

  private async requireOwnedConversation(documentId: string, conversationId: string) {
    const conversation = await this.repository.findConversation(conversationId);
    if (!conversation || conversation.documentId !== documentId) {
      throw new HttpError(404, "Conversation not found", {
        code: "conversation_not_found",
        retryable: false,
      });
    }
    return conversation;
  }
}
