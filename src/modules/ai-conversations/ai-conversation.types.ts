import type {
  AIProviderCredential,
  AIWriterIntent,
  AIWriterRequest,
  AIWriterResult,
  WritingStyle,
} from "@anvilnote/ai-writer";
import type {
  AnvilNoteDocumentFragmentV1,
  AnvilNoteDocumentV1,
} from "@anvilnote/ai-writer/document";
import {
  AnvilNoteDocumentFragmentV1Schema,
  AnvilNoteDocumentV1Schema,
} from "@anvilnote/ai-writer/document";
import { z } from "zod";

export type AIConversationMessageRole = "user" | "assistant";

export interface AIConversationRecord {
  id: string;
  documentId: string;
  title: string;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AIConversationDraft =
  | {
      kind: "compose";
      schemaVersion: "anvilnote.ai.compose-result.v1";
      suggestedTitle: string | null;
      document: AnvilNoteDocumentV1;
      summary: string;
    }
  | {
      kind: "rewrite-selection";
      schemaVersion: "anvilnote.ai.rewrite-result.v1";
      replacement: AnvilNoteDocumentFragmentV1;
      changeSummary: string;
    };

export interface AIConversationMessageRecord {
  id: string;
  conversationId: string;
  sequence: number;
  role: AIConversationMessageRole;
  content: string;
  intent: AIWriterIntent;
  draft: AIConversationDraft | null;
  attachments?: AIConversationAttachmentRecord[];
  createdAt: Date;
}

export interface AIConversationAttachmentRecord {
  id: string;
  messageId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  createdAt: Date;
}

export interface PreparedAIConversationAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
}

export interface AIConversationCursor {
  lastMessageAt: Date;
  id: string;
}

export interface AIConversationMessageCursor {
  createdAt: Date;
  id: string;
}

export interface AIConversationPage<T> {
  data: T[];
  nextCursor: string | null;
}

export interface AIConversationTurnRequest {
  requestId: string;
  conversationId?: string;
  provider: { id: string; model: string };
  instruction: string;
  context: {
    locale: string;
    requestedOutputLocale?: string;
    documentType?: string;
    writingStyle: WritingStyle;
    selectedContent?: AnvilNoteDocumentFragmentV1;
    attachments?: AIWriterRequest["context"]["attachments"];
  };
  options: AIWriterRequest["options"];
  preparedAttachments?: PreparedAIConversationAttachment[];
}

export const AIConversationDraftSchema: z.ZodType<AIConversationDraft> = z.discriminatedUnion(
  "kind",
  [
    z
      .object({
        kind: z.literal("compose"),
        schemaVersion: z.literal("anvilnote.ai.compose-result.v1"),
        suggestedTitle: z.string().max(1_000).nullable(),
        document: AnvilNoteDocumentV1Schema,
        summary: z.string().max(50_000),
      })
      .strict(),
    z
      .object({
        kind: z.literal("rewrite-selection"),
        schemaVersion: z.literal("anvilnote.ai.rewrite-result.v1"),
        replacement: AnvilNoteDocumentFragmentV1Schema,
        changeSummary: z.string().max(50_000),
      })
      .strict(),
  ],
);

export interface ExecuteAIConversationTurnInput {
  documentId: string;
  conversationId?: string;
  request: AIConversationTurnRequest;
}

export interface AIConversationWriterPort {
  execute(
    request: AIWriterRequest,
    credential: AIProviderCredential,
    signal?: AbortSignal,
  ): Promise<AIWriterResult>;
}

export interface PersistUserTurnInput {
  documentId: string;
  messageId: string;
  conversationId?: string;
  newConversationTitle?: string;
  userMessage: Pick<AIConversationMessageRecord, "content" | "intent"> & {
    attachments: PreparedAIConversationAttachment[];
  };
}

export interface PersistUserTurnResult {
  conversation: AIConversationRecord;
  message: AIConversationMessageRecord;
}

export interface PersistAssistantTurnInput {
  conversationId: string;
  messageId: string;
  automaticTitle?: {
    expectedTitle: string;
    title: string;
  };
  assistantMessage: {
    content: string;
    intent: AIWriterIntent;
    draft: AIConversationDraft;
  };
}

export interface PersistAssistantTurnResult {
  conversation: AIConversationRecord;
  message: AIConversationMessageRecord;
}

export interface PersistCompletedTurnResult {
  conversation: AIConversationRecord;
  messages: [AIConversationMessageRecord, AIConversationMessageRecord];
}

export interface DeleteAIConversationResult {
  conversation: AIConversationRecord;
  orphanedStorageKeys: string[];
}
