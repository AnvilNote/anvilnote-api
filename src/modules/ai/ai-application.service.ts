import {
  AI_ATTACHMENT_LIMITS,
  PRICING_CURRENCY,
  PRICING_SOURCE,
  PRICING_VERSION,
  createTokenEstimate,
  estimateCost,
  getEnabledAIProviders,
  getModelDefinition,
  getModelPricing,
  type AIProviderCredential,
  type AIWriterRequest,
  type AIWriterResult,
  type ConnectionTestResult,
  type CostEstimate,
  type TokenEstimate,
} from "@anvilnote/ai-writer";
import {
  AIProviderRegistry,
  OpenAIProviderAdapter,
  executeWriterRequest,
  prepareWriterRequest,
  type PreparedWriterRequest,
} from "@anvilnote/ai-writer/server";

export { AIProviderRegistry } from "@anvilnote/ai-writer/server";

export interface AIWriterCostEstimate {
  tokenEstimate: TokenEstimate;
  cost: CostEstimate | null;
  pricingSource: string;
  approximate: true;
}

export interface AIWriterApplicationServiceOptions {
  providerRegistry?: AIProviderRegistry;
  prepare?: (request: unknown) => PreparedWriterRequest;
}

const JSON_SCHEMA_OVERHEAD_TOKENS = 1_500;

export class AIWriterApplicationService {
  private readonly providerRegistry: AIProviderRegistry;
  private readonly prepare: (request: unknown) => PreparedWriterRequest;

  constructor(options: AIWriterApplicationServiceOptions = {}) {
    this.providerRegistry =
      options.providerRegistry ??
      new AIProviderRegistry([
        new OpenAIProviderAdapter({
          logger: (metadata) => console.info("ai-provider", metadata),
        }),
      ]);
    this.prepare = options.prepare ?? prepareWriterRequest;
  }

  getProviderMetadata() {
    return {
      providers: getEnabledAIProviders().map((provider) => ({
        ...provider,
        models: provider.models.map((model) => ({
          ...model,
          pricing: getModelPricing(provider.id, model.pricingId),
        })),
      })),
      defaultProviderId: "openai",
      defaultModelId: "gpt-5.6-terra",
      pricing: {
        version: PRICING_VERSION,
        currency: PRICING_CURRENCY,
        source: PRICING_SOURCE,
        approximate: true,
      },
      attachmentLimits: AI_ATTACHMENT_LIMITS,
    };
  }

  estimate(request: AIWriterRequest): AIWriterCostEstimate {
    const prepared = this.prepare(request);
    const maxOutput = prepared.maxOutputTokens;
    const estimate = createTokenEstimate(
      prepared.sections.map((section) => ({ text: section.content })),
      {
        minimum: Math.min(256, maxOutput),
        maximum: maxOutput,
      },
    );
    const tokenEstimate: TokenEstimate = {
      ...estimate,
      inputTokens: estimate.inputTokens + JSON_SCHEMA_OVERHEAD_TOKENS,
      confidence: "low",
    };
    const model = getModelDefinition(request.provider.id, request.provider.model);
    return {
      tokenEstimate,
      cost: model
        ? estimateCost(request.provider.id, model.pricingId, tokenEstimate)
        : null,
      pricingSource: PRICING_SOURCE,
      approximate: true,
    };
  }

  async testConnection(
    providerId: string,
    model: string,
    credential: AIProviderCredential,
    signal?: AbortSignal,
  ): Promise<ConnectionTestResult> {
    const adapter = this.providerRegistry.get(providerId);
    if (!adapter) throw new Error(`AI provider is not registered: ${providerId}`);
    return adapter.testConnection(credential, { model, signal });
  }

  async execute(
    request: AIWriterRequest,
    credential: AIProviderCredential,
    signal?: AbortSignal,
  ): Promise<AIWriterResult> {
    const prepared = this.prepare(request);
    return executeWriterRequest(prepared, credential, {
      signal,
      registry: this.providerRegistry,
    });
  }
}
