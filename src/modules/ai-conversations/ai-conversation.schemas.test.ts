import assert from "node:assert/strict";
import test from "node:test";
import { aiConversationTurnBodySchema } from "./ai-conversation.schemas";

const request = {
  requestId: "conversation-schema-1",
  provider: { id: "openai", model: "gpt-5.6-terra" },
  instruction: "Create a concise draft.",
  context: { locale: "en", writingStyle: "auto" },
  options: { humanizerEnabled: true },
};

test("conversation turn input accepts only the current user request", () => {
  const parsed = aiConversationTurnBodySchema.parse(request);
  assert.equal(parsed.requestId, request.requestId);
  assert.equal("currentDocument" in parsed.context, false);
  assert.equal("conversation" in parsed.context, false);

  for (const forbiddenContext of [
    { currentDocument: { schemaVersion: "anvilnote.document.v1" } },
    { conversation: { messages: [{ role: "user", content: "untrusted history" }] } },
    { assistantDraft: { document: "untrusted" } },
  ]) {
    assert.throws(() =>
      aiConversationTurnBodySchema.parse({
        ...request,
        context: { ...request.context, ...forbiddenContext },
      }),
    );
  }
});
