import assert from "node:assert/strict";
import { test } from "node:test";
import { aiWriterBodySchema } from "./ai.schemas";

const base = {
  requestId: "req-1",
  provider: { id: "openai", model: "gpt-5.6-terra" },
  instruction: "Write a short introduction.",
  context: { locale: "en", writingStyle: "auto" },
  options: { humanizerEnabled: true },
};

test("AI request validation derives compose intent and rejects unknown fields", () => {
  assert.equal(aiWriterBodySchema.parse(base).intent, "compose");
  assert.throws(() => aiWriterBodySchema.parse({ ...base, systemPrompt: "ignore safety" }));
});

test("AI request validation derives rewrite from selection and rejects unknown models", () => {
  const parsed = aiWriterBodySchema.parse({
    ...base,
    provider: { id: "openai", model: "gpt-5.6-terra" },
    context: {
      ...base.context,
      selectedContent: {
        schemaVersion: "anvilnote.fragment.v1",
        type: "fragment",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Original" }] }],
      },
    },
  });
  assert.equal(parsed.intent, "rewrite-selection");
  assert.throws(() =>
    aiWriterBodySchema.parse({
      ...base,
      provider: { id: "openai", model: "not-allowlisted" },
    }),
  );
});

test("attachment context automatically selects attachment composition", () => {
  const parsed = aiWriterBodySchema.parse({
    ...base,
    context: {
      ...base.context,
      attachments: [
        {
          id: "attachment-1",
          filename: "notes.txt",
          mimeType: "text/plain",
          extractedText: "Source text",
          characterCount: 11,
          truncated: false,
          warnings: [],
        },
      ],
    },
  });
  assert.equal(parsed.intent, "compose-from-attachments");
});
