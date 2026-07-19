import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  AIProviderAdapter,
  AIProviderExecutionResult,
} from "@anvilnote/ai-writer/server";
import type { AIProviderCredential } from "@anvilnote/ai-writer";
import {
  AIProviderRegistry,
  AIWriterApplicationService,
} from "./ai-application.service";
import { AIRequestCancellationRegistry } from "./ai-cancellation-registry";

const rawRequest = {
  requestId: "req-service",
  provider: { id: "openai", model: "gpt-5.6-terra" },
  instruction: "Write a paragraph.",
  intent: "compose" as const,
  context: { locale: "en", writingStyle: "auto" as const },
  options: { humanizerEnabled: true },
};

function fakeAdapter(capture: { credential?: AIProviderCredential }): AIProviderAdapter {
  return {
    definition: {
      id: "openai",
      displayName: "OpenAI",
      enabled: true,
      models: [],
      setupGuide: { titleKey: "", descriptionKey: "", documentationUrl: "", steps: [], notices: [] },
    },
    async testConnection(credential, options) {
      capture.credential = credential;
      return { status: "success", provider: "openai", model: options.model, messageKey: "ok" };
    },
    async execute(request, credential): Promise<AIProviderExecutionResult> {
      capture.credential = credential;
      return {
        provider: "openai",
        model: request.provider.model,
        durationMs: 1,
        attempts: 1,
        payload: {
          suggestedTitle: null,
          document: {
            schemaVersion: "anvilnote.document.v1",
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Result" }] }],
          },
          summary: "Done",
          warnings: [],
        },
        usage: {
          provider: "openai",
          model: request.provider.model,
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          estimatedActualCostUsd: 0.0001,
          pricingVersion: "2026-07-18",
        },
      };
    },
  };
}

test("application service keeps credential separate and returns trusted result", async () => {
  const capture: { credential?: AIProviderCredential } = {};
  const service = new AIWriterApplicationService({
    providerRegistry: new AIProviderRegistry([fakeAdapter(capture)]),
  });
  const result = await service.execute(rawRequest, { apiKey: "fake-key" });
  assert.equal(result.kind, "compose");
  assert.equal(capture.credential?.apiKey, "fake-key");
  assert.equal("apiKey" in rawRequest, false);
});

test("cost estimate includes prepared prompt and registered pricing", () => {
  const service = new AIWriterApplicationService();
  const estimate = service.estimate(rawRequest);
  assert.equal(estimate.cost?.currency, "USD");
  assert.equal(estimate.tokenEstimate.confidence, "low");
  assert.ok(estimate.tokenEstimate.inputTokens > 0);
});

test("cancellation registry aborts and cleans request-scoped state", () => {
  const registry = new AIRequestCancellationRegistry();
  const signal = registry.start("request-1");
  assert.equal(signal.aborted, false);
  assert.equal(registry.cancel("request-1"), true);
  assert.equal(signal.aborted, true);
  registry.finish("request-1");
  assert.equal(registry.cancel("request-1"), false);
});
