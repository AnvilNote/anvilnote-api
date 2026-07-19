import assert from "node:assert/strict";
import test from "node:test";
import type { AIWriterRequest, AIWriterResult } from "@anvilnote/ai-writer";
import {
  AIConversationService,
  type AIConversationRepositoryPort,
} from "./ai-conversation.service";
import type {
  AIConversationCursor,
  AIConversationDraft,
  AIConversationMessageCursor,
  AIConversationMessageRecord,
  AIConversationRecord,
} from "./ai-conversation.types";

const documentRecord = {
  id: "document-a",
  title: "Current note",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "The persisted document." }],
    },
  ],
  metadata: {},
  templateSettings: {},
  templateId: null,
  numberedHeadings: true,
  marginTopCm: null,
  marginBottomCm: null,
  marginLeftCm: null,
  marginRightCm: null,
  projectId: null,
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
};

const result: AIWriterResult = {
  schemaVersion: "anvilnote.ai.compose-result.v1",
  kind: "compose",
  suggestedTitle: "Suggested title",
  document: {
    schemaVersion: "anvilnote.document.v1",
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Generated draft." }],
      },
    ],
  },
  summary: "A safe display summary.",
  warnings: ["This warning must not be persisted."],
  metadata: {
    profileId: "compose.default.v1",
    profileVersion: 1,
    promptTemplateId: "prompt.compose.v1",
    promptVersion: 1,
    schemaVersion: "anvilnote.ai.compose-result.v1",
    policyVersions: [
      { id: "policy.factual-integrity.v1", version: 1 },
      { id: "policy.protected-content.v1", version: 1 },
      { id: "policy.style.natural.v1", version: 1 },
    ],
  },
  usage: {
    provider: "openai",
    model: "gpt-5.6-terra",
    inputTokens: 12,
    outputTokens: 8,
    totalTokens: 20,
    estimatedActualCostUsd: 0.0001,
    pricingVersion: "2026-07-18",
  },
};

class FakeConversationRepository implements AIConversationRepositoryPort {
  readonly conversations = new Map<string, {
    id: string;
    documentId: string;
    title: string;
    lastMessageAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }>();
  readonly messages = new Map<string, Array<{
    id: string;
    conversationId: string;
    sequence: number;
    role: "user" | "assistant";
    content: string;
    intent: "compose" | "compose-from-attachments" | "rewrite-selection";
    draft: AIConversationDraft | null;
    createdAt: Date;
  }>>();

  async findConversation(id: string) {
    return this.conversations.get(id) ?? null;
  }

  async listRecentMessages(conversationId: string, take: number) {
    return [...(this.messages.get(conversationId) ?? [])]
      .sort((left, right) => right.sequence - left.sequence)
      .slice(0, take);
  }

  async listConversations(
    documentId: string,
    cursor: AIConversationCursor | undefined,
    take: number,
  ) {
    return [...this.conversations.values()]
      .filter((conversation) => conversation.documentId === documentId)
      .filter(
        (conversation) =>
          !cursor ||
          conversation.lastMessageAt < cursor.lastMessageAt ||
          (conversation.lastMessageAt.getTime() === cursor.lastMessageAt.getTime() &&
            conversation.id < cursor.id),
      )
      .sort(
        (left, right) =>
          right.lastMessageAt.getTime() - left.lastMessageAt.getTime() ||
          right.id.localeCompare(left.id),
      )
      .slice(0, take);
  }

  async listMessages(
    conversationId: string,
    cursor: AIConversationMessageCursor | undefined,
    take: number,
  ) {
    return [...(this.messages.get(conversationId) ?? [])]
      .filter(
        (message) =>
          !cursor ||
          message.createdAt < cursor.createdAt ||
          (message.createdAt.getTime() === cursor.createdAt.getTime() &&
            message.id < cursor.id),
      )
      .sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() ||
          right.id.localeCompare(left.id),
      )
      .slice(0, take);
  }

  async renameConversation(id: string, title: string): Promise<AIConversationRecord> {
    const conversation = this.conversations.get(id);
    assert.ok(conversation);
    const updated = { ...conversation, title };
    this.conversations.set(id, updated);
    return updated;
  }

  async deleteConversation(id: string) {
    const conversation = this.conversations.get(id);
    assert.ok(conversation);
    this.conversations.delete(id);
    this.messages.delete(id);
    return { conversation, orphanedStorageKeys: [] };
  }

  async persistUserTurn(input: Parameters<AIConversationRepositoryPort["persistUserTurn"]>[0]) {
    const now = new Date("2026-07-19T01:00:00.000Z");
    for (const [conversationId, existingMessages] of this.messages) {
      const existingMessage = existingMessages.find(
        (message) => message.id === input.messageId,
      );
      if (existingMessage) {
        return {
          conversation: this.conversations.get(conversationId)!,
          message: existingMessage,
        };
      }
    }
    const conversation = input.conversationId
      ? this.conversations.get(input.conversationId)
      : {
          id: "conversation-1",
          documentId: input.documentId,
          title: input.newConversationTitle!,
          lastMessageAt: now,
          createdAt: now,
          updatedAt: now,
        };
    assert.ok(conversation);
    this.conversations.set(conversation.id, {
      ...conversation,
      lastMessageAt: now,
      updatedAt: now,
    });
    const existing = this.messages.get(conversation.id) ?? [];
    const firstSequence = existing.length + 1;
    const message: AIConversationMessageRecord = {
      id: input.messageId,
      conversationId: conversation.id,
      sequence: firstSequence,
      role: "user",
      content: input.userMessage.content,
      intent: input.userMessage.intent,
      draft: null,
      attachments: input.userMessage.attachments.map((attachment) => ({
        ...attachment,
        messageId: input.messageId,
        createdAt: now,
      })),
      createdAt: now,
    };
    this.messages.set(conversation.id, [...existing, message]);
    return { conversation: this.conversations.get(conversation.id)!, message };
  }

  async persistAssistantTurn(
    input: Parameters<AIConversationRepositoryPort["persistAssistantTurn"]>[0],
  ) {
    const now = new Date("2026-07-19T01:00:01.000Z");
    const conversation = this.conversations.get(input.conversationId);
    assert.ok(conversation);
    const existing = this.messages.get(conversation.id) ?? [];
    const existingMessage = existing.find((message) => message.id === input.messageId);
    if (existingMessage) return { conversation, message: existingMessage };
    const message: AIConversationMessageRecord = {
      id: input.messageId,
      conversationId: conversation.id,
      sequence: existing.length + 1,
      role: "assistant",
      content: input.assistantMessage.content,
      intent: input.assistantMessage.intent,
      draft: input.assistantMessage.draft,
      createdAt: now,
    };
    this.messages.set(conversation.id, [...existing, message]);
    const updated = { ...conversation, lastMessageAt: now, updatedAt: now };
    this.conversations.set(conversation.id, updated);
    return { conversation: updated, message };
  }
}

test("conversation turn loads the persisted document and only the latest eight same-conversation messages", async () => {
  const repository = new FakeConversationRepository();
  const captured: { request?: unknown } = {};
  const service = new AIConversationService({
    repository,
    documents: { getDocument: async () => documentRecord },
    writer: {
      execute: async (request) => {
        captured.request = request;
        return result;
      },
    },
  });

  const first = await service.executeTurn(
    {
      documentId: "document-a",
      request: {
        requestId: "conversation-turn-1",
        provider: { id: "openai", model: "gpt-5.6-terra" },
        instruction: "Create a useful first draft.",
        context: { locale: "en", writingStyle: "natural" },
        options: { humanizerEnabled: true },
      },
    },
    { apiKey: "fake-key" },
  );

  assert.equal(first.conversation.title, "Create a useful first draft.");
  assert.equal(repository.messages.get(first.conversation.id)?.length, 2);
  assert.deepEqual(captured.request, {
    requestId: "conversation-turn-1",
    intent: "compose",
    provider: { id: "openai", model: "gpt-5.6-terra" },
    instruction: "Create a useful first draft.",
    context: {
      locale: "en",
      writingStyle: "natural",
      currentDocument: {
        schemaVersion: "anvilnote.document.v1",
        type: "doc",
        content: documentRecord.content,
      },
    },
    options: { humanizerEnabled: true },
  });

  const storedAssistant = repository.messages.get(first.conversation.id)?.[1];
  assert.deepEqual(storedAssistant?.draft, {
    kind: "compose",
    schemaVersion: "anvilnote.ai.compose-result.v1",
    suggestedTitle: "Suggested title",
    document: result.document,
    summary: "A safe display summary.",
  });
  assert.equal(JSON.stringify(storedAssistant).includes("inputTokens"), false);
  assert.equal(JSON.stringify(storedAssistant).includes("warning"), false);
});

test("conversation turn converts the persisted wrapped Tiptap doc into AI document context", async () => {
  const repository = new FakeConversationRepository();
  const captured: { request?: AIWriterRequest } = {};
  const service = new AIConversationService({
    repository,
    documents: {
      getDocument: async () => ({
        ...documentRecord,
        content: [
          {
            type: "doc",
            content: [
              {
                type: "heading",
                attrs: { id: "heading-1", level: 1 },
                content: [{ type: "text", text: "Stored heading" }],
              },
              { type: "paragraph" },
            ],
          },
        ],
      }),
    },
    writer: {
      execute: async (request) => {
        captured.request = request;
        return result;
      },
    },
  });

  await service.executeTurn(
    {
      documentId: "document-a",
      request: {
        requestId: "wrapped-tiptap-document",
        provider: { id: "openai", model: "gpt-5.6-terra" },
        instruction: "Continue this document.",
        context: { locale: "en", writingStyle: "natural" },
        options: { humanizerEnabled: true },
      },
    },
    { apiKey: "fake-key" },
  );

  assert.deepEqual(captured.request?.context.currentDocument, {
    schemaVersion: "anvilnote.document.v1",
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { id: "heading-1", level: 1 },
        content: [{ type: "text", text: "Stored heading" }],
      },
      { type: "paragraph", content: [] },
    ],
  });
});

test("a sent user message remains persisted when provider execution fails", async () => {
  const repository = new FakeConversationRepository();
  const service = new AIConversationService({
    repository,
    documents: { getDocument: async () => documentRecord },
    writer: {
      execute: async () => {
        throw new Error("provider stopped");
      },
    },
  });

  await assert.rejects(
    service.executeTurn(
      {
        documentId: "document-a",
        request: {
          requestId: "sent-user-message-1",
          provider: { id: "openai", model: "gpt-5.6-terra" },
          instruction: "This instruction was sent.",
          context: { locale: "en", writingStyle: "natural" },
          options: { humanizerEnabled: true },
        },
      },
      { apiKey: "fake-key" },
    ),
    /provider stopped/,
  );

  assert.equal(repository.conversations.size, 1);
  const [conversation] = repository.conversations.values();
  assert.deepEqual(repository.messages.get(conversation.id)?.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
  })), [{
    id: "sent-user-message-1",
    role: "user",
    content: "This instruction was sent.",
  }]);
});

test("user-only stopped turns stay in the transcript but not in alternating prompt history", async () => {
  const repository = new FakeConversationRepository();
  const createdAt = new Date("2026-07-19T00:00:00.000Z");
  repository.conversations.set("conversation-a", {
    id: "conversation-a",
    documentId: "document-a",
    title: "Existing",
    lastMessageAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  });
  repository.messages.set("conversation-a", [
    {
      id: "completed-user",
      conversationId: "conversation-a",
      sequence: 1,
      role: "user",
      content: "Completed question.",
      intent: "compose",
      draft: null,
      createdAt,
    },
    {
      id: "completed-assistant",
      conversationId: "conversation-a",
      sequence: 2,
      role: "assistant",
      content: "Completed answer.",
      intent: "compose",
      draft: null,
      createdAt: new Date(createdAt.getTime() + 1),
    },
    {
      id: "stopped-user-1",
      conversationId: "conversation-a",
      sequence: 3,
      role: "user",
      content: "Stopped question one.",
      intent: "compose",
      draft: null,
      createdAt: new Date(createdAt.getTime() + 2),
    },
    {
      id: "stopped-user-2",
      conversationId: "conversation-a",
      sequence: 4,
      role: "user",
      content: "Stopped question two.",
      intent: "compose",
      draft: null,
      createdAt: new Date(createdAt.getTime() + 3),
    },
  ]);
  const captured: { request?: AIWriterRequest } = {};
  const service = new AIConversationService({
    repository,
    documents: { getDocument: async () => documentRecord },
    writer: {
      execute: async (request) => {
        captured.request = request;
        return result;
      },
    },
  });

  await service.executeTurn(
    {
      documentId: "document-a",
      conversationId: "conversation-a",
      request: {
        requestId: "next-user",
        provider: { id: "openai", model: "gpt-5.6-terra" },
        instruction: "Try again.",
        context: { locale: "en", writingStyle: "auto" },
        options: { humanizerEnabled: true },
      },
    },
    { apiKey: "fake-key" },
  );

  assert.deepEqual(captured.request?.context.conversation?.messages, [
    { role: "user", content: "Completed question." },
    { role: "assistant", content: "Completed answer." },
  ]);
  assert.deepEqual(
    repository.messages
      .get("conversation-a")
      ?.filter((message) => message.role === "user")
      .map((message) => message.content),
    [
      "Completed question.",
      "Stopped question one.",
      "Stopped question two.",
      "Try again.",
    ],
  );
});

test("existing conversation sends only its latest eight chronological messages", async () => {
  const repository = new FakeConversationRepository();
  const createdAt = new Date("2026-07-19T00:00:00.000Z");
  repository.conversations.set("conversation-a", {
    id: "conversation-a",
    documentId: "document-a",
    title: "Existing",
    lastMessageAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  });
  repository.messages.set(
    "conversation-a",
    Array.from({ length: 10 }, (_, index) => ({
      id: `history-${index + 1}`,
      conversationId: "conversation-a",
      sequence: index + 1,
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `History ${index + 1}`,
      intent: "compose" as const,
      draft: null,
      createdAt: new Date(createdAt.getTime() + index),
    })),
  );
  const captured: { request?: unknown } = {};
  const service = new AIConversationService({
    repository,
    documents: { getDocument: async () => documentRecord },
    writer: {
      execute: async (request) => {
        captured.request = request;
        return result;
      },
    },
  });

  await service.executeTurn(
    {
      documentId: "document-a",
      conversationId: "conversation-a",
      request: {
        requestId: "conversation-turn-2",
        provider: { id: "openai", model: "gpt-5.6-terra" },
        instruction: "Continue the draft.",
        context: { locale: "en", writingStyle: "auto" },
        options: { humanizerEnabled: false },
      },
    },
    { apiKey: "fake-key" },
  );

  const request = captured.request as {
    context: { conversation?: { messages: Array<{ content: string }> } };
  };
  assert.deepEqual(
    request.context.conversation?.messages.map((message) => message.content),
    [
      "History 3",
      "History 4",
      "History 5",
      "History 6",
      "History 7",
      "History 8",
      "History 9",
      "History 10",
    ],
  );
});

test("trusted prepared attachment metadata is persisted with the user message", async () => {
  const repository = new FakeConversationRepository();
  const service = new AIConversationService({
    repository,
    documents: { getDocument: async () => documentRecord },
    writer: { execute: async () => result },
  });

  const completed = await service.executeTurn(
    {
      documentId: "document-a",
      request: {
        requestId: "conversation-attachment-turn",
        provider: { id: "openai", model: "gpt-5.6-terra" },
        instruction: "Use the attached notes.",
        context: { locale: "en", writingStyle: "auto" },
        options: { humanizerEnabled: true },
        preparedAttachments: [{
          id: "attachment-1",
          originalName: "notes.pdf",
          mimeType: "application/pdf",
          sizeBytes: 42,
          sha256: "a".repeat(64),
          storageKey: "b".repeat(64),
        }],
      },
    },
    { apiKey: "fake-key" },
  );

  assert.equal(completed.messages[0].attachments?.[0]?.originalName, "notes.pdf");
  assert.equal(completed.messages[0].attachments?.[0]?.storageKey, "b".repeat(64));
});
