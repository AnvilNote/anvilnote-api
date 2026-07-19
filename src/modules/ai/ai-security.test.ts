import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAIProviderCredential } from "./ai-credential-resolver";
import { toSafeAIHttpLogMetadata } from "./ai-safe-log";

const canary = "sk-test-this-must-never-appear";

test("desktop credentials require desktop runtime and an exact per-launch token", () => {
  const headers = {
    "x-anvilnote-desktop-token": "launch-token",
    "x-anvilnote-ai-credential": canary,
  };
  assert.equal(
    resolveAIProviderCredential(headers, {
      runtime: "desktop",
      desktopTrustToken: "launch-token",
      browserSessionByok: false,
    }).apiKey,
    canary,
  );
  assert.throws(() =>
    resolveAIProviderCredential(headers, {
      runtime: "remote",
      desktopTrustToken: "launch-token",
      browserSessionByok: false,
    }),
  );
  assert.throws(() =>
    resolveAIProviderCredential(headers, {
      runtime: "desktop",
      desktopTrustToken: "different",
      browserSessionByok: false,
    }),
  );
});

test("safe HTTP metadata never serializes content or credentials", () => {
  const metadata = toSafeAIHttpLogMetadata({
    requestId: "req-1",
    route: "/api/ai/compose",
    intent: "compose",
    provider: "openai",
    model: "gpt-5.6-terra",
    locale: "en",
    attachmentCount: 1,
    attachmentMimeTypes: ["text/plain"],
    selectedCharacterCount: 12,
    estimatedInputCharacters: 120,
    humanizerEnabled: true,
  });
  const serialized = JSON.stringify({ metadata, apiKey: undefined });
  assert.doesNotMatch(serialized, /sk-test|secret source|selected prose/);
  assert.deepEqual(Object.keys(metadata).sort(), [
    "attachmentCount",
    "attachmentMimeTypes",
    "estimatedInputCharacters",
    "humanizerEnabled",
    "intent",
    "locale",
    "model",
    "provider",
    "requestId",
    "route",
    "selectedCharacterCount",
  ]);
});
