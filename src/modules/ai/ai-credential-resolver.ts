import { timingSafeEqual } from "node:crypto";
import type { AIProviderCredential } from "@anvilnote/ai-writer";
import { HttpError } from "../../lib/http-error";

export const AI_DESKTOP_TOKEN_HEADER = "x-anvilnote-desktop-token";
export const AI_CREDENTIAL_HEADER = "x-anvilnote-ai-credential";

export interface AIRequestPolicyConfig {
  runtime: "desktop" | "remote";
  desktopTrustToken?: string;
  browserSessionByok: boolean;
}

type HeaderSource = Record<string, string | string[] | undefined>;

function readSingleHeader(headers: HeaderSource, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function exactSecretMatch(actual: string | undefined, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function assertAIRequestAuthorized(
  headers: HeaderSource,
  policy: AIRequestPolicyConfig,
): void {
  if (policy.runtime === "desktop") {
    const trustToken = readSingleHeader(headers, AI_DESKTOP_TOKEN_HEADER);
    if (!exactSecretMatch(trustToken, policy.desktopTrustToken)) {
      throw new HttpError(403, "Desktop AI request is not authorized.", {
        code: "permission_denied",
        messageKey: "ai.errors.permission_denied",
        retryable: false,
      });
    }
    return;
  }
  if (!policy.browserSessionByok) {
    throw new HttpError(403, "Browser session AI is not available.", {
      code: "permission_denied",
      messageKey: "ai.errors.browser_unavailable",
      retryable: false,
    });
  }
}

export function resolveAIProviderCredential(
  headers: HeaderSource,
  policy: AIRequestPolicyConfig,
): AIProviderCredential {
  const apiKey = readSingleHeader(headers, AI_CREDENTIAL_HEADER)?.trim();
  if (!apiKey || apiKey.length > 4096) {
    throw new HttpError(401, "AI credential is not configured.", {
      code: "invalid_api_key",
      messageKey: "ai.errors.invalid_api_key",
      retryable: false,
    });
  }

  assertAIRequestAuthorized(headers, policy);

  return { apiKey };
}
