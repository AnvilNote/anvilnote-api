import assert from "node:assert/strict";
import express from "express";
import { test } from "node:test";
import { errorMiddleware } from "../../middleware/error.middleware";
import { createAIRouter, type AIApplicationPort } from "./ai.routes";
import type { AIRequestPolicyConfig } from "./ai-credential-resolver";

const fakeResult = {
  schemaVersion: "anvilnote.ai.compose-result.v1" as const,
  kind: "compose" as const,
  suggestedTitle: null,
  document: {
    schemaVersion: "anvilnote.document.v1" as const,
    type: "doc" as const,
    content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Result" }] }],
  },
  summary: "Done",
  warnings: [],
  metadata: {
    profileId: "compose.default.v1" as const,
    profileVersion: 1 as const,
    promptTemplateId: "prompt.compose.v1" as const,
    promptVersion: 1 as const,
    schemaVersion: "anvilnote.ai.compose-result.v1" as const,
    policyVersions: [
      { id: "policy.factual-integrity.v1" as const, version: 1 as const },
      { id: "policy.protected-content.v1" as const, version: 1 as const },
      { id: "policy.style.natural.v1" as const, version: 1 as const },
    ],
  },
  usage: {
    provider: "openai",
    model: "gpt-5.6-terra",
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    estimatedActualCostUsd: 0.0001,
    pricingVersion: "2026-07-18",
  },
};

async function withServer(
  run: (baseUrl: string) => Promise<void>,
  policy: AIRequestPolicyConfig = {
    runtime: "desktop",
    desktopTrustToken: "launch-token",
    browserSessionByok: false,
  },
) {
  const service: AIApplicationPort = {
    getProviderMetadata: () => ({ providers: [{ id: "openai" }] }),
    estimate: () => ({ approximate: true }),
    testConnection: async () => ({
      status: "success",
      provider: "openai",
      model: "gpt-5.6-terra",
      messageKey: "ai.connection.success",
    }),
    execute: async () => fakeResult,
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/ai",
    createAIRouter({
      service,
      policy,
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

test("provider metadata is public but execution requires the exact desktop trust token", async () => {
  await withServer(async (baseUrl) => {
    const metadata = await fetch(`${baseUrl}/api/ai/providers`);
    assert.equal(metadata.status, 200);

    const denied = await fetch(`${baseUrl}/api/ai/compose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(denied.status, 400);

    const request = {
      requestId: "route-1",
      provider: { id: "openai", model: "gpt-5.6-terra" },
      instruction: "Write.",
      context: { locale: "en", writingStyle: "auto" },
      options: { humanizerEnabled: true },
    };
    const unauthorized = await fetch(`${baseUrl}/api/ai/compose`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-anvilnote-ai-credential": "fake-key",
        "x-anvilnote-desktop-token": "wrong",
      },
      body: JSON.stringify(request),
    });
    assert.equal(unauthorized.status, 403);

    const accepted = await fetch(`${baseUrl}/api/ai/compose`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-anvilnote-ai-credential": "fake-key",
        "x-anvilnote-desktop-token": "launch-token",
      },
      body: JSON.stringify(request),
    });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).data.kind, "compose");
  });
});

test("session-only browser BYOK capability and authorization use the same policy", async () => {
  await withServer(
    async (baseUrl) => {
      const metadata = await fetch(`${baseUrl}/api/ai/providers`).then((response) => response.json());
      assert.deepEqual(metadata.data.capability, {
        runtime: "browser",
        persistentCredentialStorage: false,
        sessionCredentialStorage: true,
        smartModeAvailable: true,
      });

      const response = await fetch(`${baseUrl}/api/ai/test-connection`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-anvilnote-ai-credential": "request-scoped-key",
        },
        body: JSON.stringify({ providerId: "openai", model: "gpt-5.6-terra" }),
      });
      assert.equal(response.status, 200);
    },
    { runtime: "remote", browserSessionByok: true },
  );
});
