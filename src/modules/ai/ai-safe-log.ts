import type { AIWriterIntent } from "@anvilnote/ai-writer";

export interface SafeAIHttpLogMetadata {
  requestId: string;
  route: string;
  intent: AIWriterIntent;
  provider: string;
  model: string;
  locale: string;
  attachmentCount: number;
  attachmentMimeTypes: string[];
  selectedCharacterCount: number;
  estimatedInputCharacters: number;
  humanizerEnabled: boolean;
}

export function toSafeAIHttpLogMetadata(
  metadata: SafeAIHttpLogMetadata,
): SafeAIHttpLogMetadata {
  return {
    requestId: metadata.requestId,
    route: metadata.route,
    intent: metadata.intent,
    provider: metadata.provider,
    model: metadata.model,
    locale: metadata.locale,
    attachmentCount: metadata.attachmentCount,
    attachmentMimeTypes: [...metadata.attachmentMimeTypes],
    selectedCharacterCount: metadata.selectedCharacterCount,
    estimatedInputCharacters: metadata.estimatedInputCharacters,
    humanizerEnabled: metadata.humanizerEnabled,
  };
}
