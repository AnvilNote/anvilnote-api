import { z } from "zod";

const profileIdSchema = z.string().trim().min(1).max(128);

export const keyProfileListQuerySchema = z
  .object({ providerId: z.literal("openai").default("openai") })
  .strict();

export const createKeyProfileBodySchema = z
  .object({
    providerId: z.literal("openai"),
    label: z.string().trim().min(1).max(120),
    encryptedSecret: z
      .string()
      .min(4)
      .max(8_192)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/u),
    safeDisplayPrefix: z.enum(["sk-", "sk-proj-"]),
    lastFour: z.string().regex(/^[A-Za-z0-9_-]{4}$/u),
    isActive: z.boolean().default(true),
  })
  .strict();

export const keyProfileParamsSchema = z
  .object({ profileId: profileIdSchema })
  .strict();

export const activeKeyProfileSecretParamsSchema = z
  .object({ providerId: z.literal("openai") })
  .strict();

export const renameKeyProfileBodySchema = z
  .object({ label: z.string().trim().min(1).max(120) })
  .strict();
