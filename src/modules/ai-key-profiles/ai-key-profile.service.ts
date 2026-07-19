import { HttpError } from "../../lib/http-error";
import type {
  AIKeyProfileMetadata,
  AIKeyProfileRecord,
  CreateAIKeyProfileInput,
} from "./ai-key-profile.types";

const PROVIDER_DISPLAY = {
  openai: {
    label: "OpenAI",
    prefixes: new Set(["sk-", "sk-proj-"]),
  },
} as const;

export interface AIKeyProfileRepositoryPort {
  list(providerId: string): Promise<AIKeyProfileRecord[]>;
  findById(id: string): Promise<AIKeyProfileRecord | null>;
  create(input: CreateAIKeyProfileInput): Promise<AIKeyProfileRecord>;
  rename(id: string, label: string): Promise<AIKeyProfileRecord>;
  setActive(id: string): Promise<AIKeyProfileRecord>;
  deactivate(id: string): Promise<AIKeyProfileRecord>;
  delete(id: string): Promise<AIKeyProfileRecord>;
  findActive(providerId: string): Promise<AIKeyProfileRecord | null>;
}

export interface AIKeyProfileApplicationPort {
  list(providerId: string): Promise<AIKeyProfileMetadata[]>;
  create(input: CreateAIKeyProfileInput): Promise<AIKeyProfileMetadata>;
  rename(id: string, label: string): Promise<AIKeyProfileMetadata>;
  activate(id: string): Promise<AIKeyProfileMetadata>;
  deactivate(id: string): Promise<AIKeyProfileMetadata>;
  delete(id: string): Promise<{ id: string }>;
  getActiveEncryptedSecret(providerId: string): Promise<{
    id: string;
    providerId: string;
    encryptedSecret: string;
  } | null>;
}

function requireProvider(providerId: string): keyof typeof PROVIDER_DISPLAY {
  if (!(providerId in PROVIDER_DISPLAY)) {
    throw new HttpError(400, "AI provider is not supported.", {
      code: "invalid_request",
      retryable: false,
    });
  }
  return providerId as keyof typeof PROVIDER_DISPLAY;
}

function isCanonicalBase64(value: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(value) || value.length > 8_192) return false;
  try {
    return Buffer.from(value, "base64").toString("base64") === value;
  } catch {
    return false;
  }
}

function validateCreate(input: CreateAIKeyProfileInput): void {
  const providerId = requireProvider(input.providerId);
  const provider = PROVIDER_DISPLAY[providerId];
  if (
    input.label.trim().length === 0 ||
    input.label.length > 120 ||
    !provider.prefixes.has(input.safeDisplayPrefix as "sk-" | "sk-proj-") ||
    !/^[A-Za-z0-9_-]{4}$/u.test(input.lastFour) ||
    !isCanonicalBase64(input.encryptedSecret)
  ) {
    throw new HttpError(400, "AI key profile is invalid.", {
      code: "invalid_request",
      retryable: false,
    });
  }
}

function toMetadata(profile: AIKeyProfileRecord): AIKeyProfileMetadata {
  const providerId = requireProvider(profile.providerId);
  const provider = PROVIDER_DISPLAY[providerId];
  return {
    id: profile.id,
    providerId: profile.providerId,
    label: profile.label,
    display: `${provider.label} · ${profile.safeDisplayPrefix}****${profile.lastFour}`,
    isActive: profile.isActive,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export class AIKeyProfileService implements AIKeyProfileApplicationPort {
  private readonly repository: AIKeyProfileRepositoryPort;

  constructor(options: { repository: AIKeyProfileRepositoryPort }) {
    this.repository = options.repository;
  }

  async list(providerId: string): Promise<AIKeyProfileMetadata[]> {
    requireProvider(providerId);
    const profiles = await this.repository.list(providerId);
    return profiles
      .sort(
        (left, right) =>
          Number(right.isActive) - Number(left.isActive) ||
          right.updatedAt.getTime() - left.updatedAt.getTime() ||
          right.id.localeCompare(left.id),
      )
      .map(toMetadata);
  }

  async create(input: CreateAIKeyProfileInput): Promise<AIKeyProfileMetadata> {
    validateCreate(input);
    return toMetadata(await this.repository.create({ ...input, label: input.label.trim() }));
  }

  async rename(id: string, label: string): Promise<AIKeyProfileMetadata> {
    if (!label.trim() || label.length > 120) {
      throw new HttpError(400, "AI key profile label is invalid.", {
        code: "invalid_request",
        retryable: false,
      });
    }
    await this.requireProfile(id);
    return toMetadata(await this.repository.rename(id, label.trim()));
  }

  async activate(id: string): Promise<AIKeyProfileMetadata> {
    await this.requireProfile(id);
    return toMetadata(await this.repository.setActive(id));
  }

  async deactivate(id: string): Promise<AIKeyProfileMetadata> {
    await this.requireProfile(id);
    return toMetadata(await this.repository.deactivate(id));
  }

  async delete(id: string): Promise<{ id: string }> {
    await this.requireProfile(id);
    return { id: (await this.repository.delete(id)).id };
  }

  async getActiveEncryptedSecret(providerId: string) {
    requireProvider(providerId);
    const profile = await this.repository.findActive(providerId);
    if (!profile) return null;
    return {
      id: profile.id,
      providerId: profile.providerId,
      encryptedSecret: profile.encryptedSecret,
    };
  }

  private async requireProfile(id: string): Promise<AIKeyProfileRecord> {
    const profile = await this.repository.findById(id);
    if (!profile) {
      throw new HttpError(404, "AI key profile not found.", {
        code: "key_profile_not_found",
        retryable: false,
      });
    }
    requireProvider(profile.providerId);
    return profile;
  }
}
