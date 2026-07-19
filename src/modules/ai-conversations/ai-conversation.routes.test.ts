import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { errorMiddleware } from "../../middleware/error.middleware";
import { AIRequestCancellationRegistry } from "../ai/ai-cancellation-registry";
import type { AIRequestPolicyConfig } from "../ai/ai-credential-resolver";
import { createAIConversationRouter } from "./ai-conversation.routes";
import type { AIConversationApplicationPort } from "./ai-conversation.controller";
import type { ExecuteAIConversationTurnInput, PersistCompletedTurnResult } from "./ai-conversation.types";

const createdAt = new Date("2026-07-19T00:00:00.000Z");
const conversation = {
  id: "conversation-1",
  documentId: "document-1",
  title: "First request.",
  lastMessageAt: createdAt,
  createdAt,
  updatedAt: createdAt,
};

const completedTurn: PersistCompletedTurnResult = {
  conversation,
  messages: [
    {
      id: "message-1",
      conversationId: "conversation-1",
      sequence: 1,
      role: "user",
      content: "Create a draft.",
      intent: "compose",
      draft: null,
      attachments: [{
        id: "attachment-1",
        messageId: "message-1",
        originalName: "notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: 42,
        sha256: "a".repeat(64),
        storageKey: "b".repeat(64),
        createdAt,
      }],
      createdAt,
    },
    {
      id: "message-2",
      conversationId: "conversation-1",
      sequence: 2,
      role: "assistant",
      content: "A concise display summary.",
      intent: "compose",
      draft: {
        kind: "compose",
        schemaVersion: "anvilnote.ai.compose-result.v1",
        suggestedTitle: null,
        document: {
          schemaVersion: "anvilnote.document.v1",
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Draft" }] }],
        },
        summary: "A concise display summary.",
      },
      createdAt,
    },
  ],
};

async function withServer(
  service: AIConversationApplicationPort,
  run: (baseUrl: string) => Promise<void>,
  policy: AIRequestPolicyConfig = {
    runtime: "desktop" as const,
    desktopTrustToken: "launch-token",
    browserSessionByok: false,
  },
) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createAIConversationRouter({
      service,
      policy,
      cancellationRegistry: new AIRequestCancellationRegistry(),
    }),
  );
  app.use(errorMiddleware);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("conversation routes paginate document-scoped history and persist only trusted turn results", async () => {
  const calls: { turn?: ExecuteAIConversationTurnInput } = {};
  const service: AIConversationApplicationPort = {
    async listConversations(documentId, cursor) {
      assert.equal(documentId, "document-1");
      assert.equal(cursor, undefined);
      return { data: [conversation], nextCursor: "opaque-next" };
    },
    async listMessages(documentId, conversationId, cursor) {
      assert.equal(documentId, "document-1");
      assert.equal(conversationId, "conversation-1");
      assert.equal(cursor, undefined);
      return { data: completedTurn.messages, nextCursor: null };
    },
    async renameConversation(_documentId, _conversationId, title) {
      return { ...conversation, title };
    },
    async deleteConversation() {
      return { id: "conversation-1", orphanedStorageKeys: [] };
    },
    async executeTurn(input) {
      calls.turn = input;
      return completedTurn;
    },
  };

  await withServer(service, async (baseUrl) => {
    const listed = await fetch(
      `${baseUrl}/api/documents/document-1/ai-conversations`,
    );
    assert.equal(listed.status, 200);
    assert.deepEqual(await listed.json(), {
      data: [
        {
          id: "conversation-1",
          documentId: "document-1",
          title: "First request.",
          lastMessageAt: "2026-07-19T00:00:00.000Z",
          createdAt: "2026-07-19T00:00:00.000Z",
          updatedAt: "2026-07-19T00:00:00.000Z",
        },
      ],
      meta: { nextCursor: "opaque-next" },
    });

    const turn = await fetch(
      `${baseUrl}/api/documents/document-1/ai-conversations/turns`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-anvilnote-desktop-token": "launch-token",
          "x-anvilnote-ai-credential": "fake-key",
        },
        body: JSON.stringify({
          requestId: "route-turn-1",
          provider: { id: "openai", model: "gpt-5.6-terra" },
          instruction: "Create a draft.",
          context: { locale: "en", writingStyle: "auto" },
          options: { humanizerEnabled: true },
        }),
      },
    );
    assert.equal(turn.status, 201);
    const body = await turn.json();
    assert.equal(body.data.messages[1].draft.kind, "compose");
    assert.equal(JSON.stringify(body).includes("inputTokens"), false);
    assert.deepEqual(body.data.messages[0].attachments, [{
      id: "attachment-1",
      originalName: "notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42,
    }]);
    assert.equal(JSON.stringify(body).includes("storageKey"), false);
    assert.equal(JSON.stringify(body).includes("sha256"), false);
    assert.equal(calls.turn?.documentId, "document-1");
    assert.equal(calls.turn?.request.conversationId, undefined);

    const forbidden = await fetch(
      `${baseUrl}/api/documents/document-1/ai-conversations/turns`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: "route-turn-forbidden",
          provider: { id: "openai", model: "gpt-5.6-terra" },
          instruction: "Create a draft.",
          context: {
            locale: "en",
            writingStyle: "auto",
            conversation: { messages: [{ role: "user", content: "untrusted" }] },
          },
          options: { humanizerEnabled: true },
        }),
      },
    );
    assert.equal(forbidden.status, 400);
    assert.equal(calls.turn?.request.requestId, "route-turn-1");
  });

  await withServer(service, async (baseUrl) => {
    const forged = await fetch(
      `${baseUrl}/api/documents/document-1/ai-conversations/turns`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-anvilnote-ai-credential": "browser-session-key",
        },
        body: JSON.stringify({
          requestId: "browser-forged-attachment",
          provider: { id: "openai", model: "gpt-5.6-terra" },
          instruction: "Use this file.",
          context: { locale: "en", writingStyle: "auto" },
          options: { humanizerEnabled: true },
          preparedAttachments: [{
            id: "attachment-forged",
            originalName: "notes.pdf",
            mimeType: "application/pdf",
            sizeBytes: 42,
            sha256: "a".repeat(64),
            storageKey: "b".repeat(64),
          }],
        }),
      },
    );
    assert.equal(forged.status, 403);
    assert.equal(calls.turn?.request.requestId, "route-turn-1");
  }, {
    runtime: "remote",
    browserSessionByok: true,
  });
});
