import {
  AIWriterRequestSchema,
  getModelDefinition,
  type AIWriterRequest,
} from "@anvilnote/ai-writer";
import { z } from "zod";

const bodySchema = z
  .object({
    requestId: z.string(),
    intent: z
      .enum(["compose", "compose-from-attachments", "rewrite-selection"])
      .optional(),
    provider: z
      .object({ id: z.string(), model: z.string() })
      .strict(),
    instruction: z.string(),
    context: z
      .object({
        locale: z.string(),
        requestedOutputLocale: z.string().optional(),
        documentType: z.string().optional(),
        writingStyle: z.enum(["auto", "neutral", "natural", "preserve-source"]),
        currentDocument: z.unknown().optional(),
        selectedContent: z.unknown().optional(),
        attachments: z.array(z.unknown()).optional(),
      })
      .strict(),
    options: z
      .object({
        humanizerEnabled: z.boolean(),
        maxOutputTokens: z.number().optional(),
      })
      .strict(),
  })
  .strict();

function deriveIntent(body: z.infer<typeof bodySchema>): AIWriterRequest["intent"] {
  if (body.context.selectedContent !== undefined) return "rewrite-selection";
  if ((body.context.attachments?.length ?? 0) > 0) return "compose-from-attachments";
  return "compose";
}

export const aiWriterBodySchema = bodySchema.transform((body, context) => {
  if (!getModelDefinition(body.provider.id, body.provider.model)?.enabled) {
    context.addIssue({
      code: "custom",
      path: ["provider", "model"],
      message: "Provider or model is not supported.",
    });
    return z.NEVER;
  }
  const derivedIntent = deriveIntent(body);
  if (body.intent !== undefined && body.intent !== derivedIntent) {
    context.addIssue({
      code: "custom",
      path: ["intent"],
      message: "AI writer intent does not match the submitted context.",
    });
    return z.NEVER;
  }
  const { intent: _submittedIntent, ...domainBody } = body;
  const parsed = AIWriterRequestSchema.safeParse({
    ...domainBody,
    intent: derivedIntent,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      context.addIssue({
        code: "custom",
        path: issue.path,
        message: issue.message,
      });
    }
    return z.NEVER;
  }
  return parsed.data;
});

export const aiConnectionTestBodySchema = z
  .object({
    providerId: z.literal("openai"),
    model: z.string().trim().min(1).max(128),
  })
  .strict()
  .superRefine((body, context) => {
    if (!getModelDefinition(body.providerId, body.model)?.enabled) {
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: "Provider or model is not supported.",
      });
    }
  });

export const aiCancelParamsSchema = z
  .object({ requestId: z.string().trim().min(1).max(128) })
  .strict();
