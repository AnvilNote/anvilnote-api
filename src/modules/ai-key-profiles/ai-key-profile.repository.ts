import { prisma } from "../../lib/prisma";
import type { AIKeyProfileRepositoryPort } from "./ai-key-profile.service";
import type {
  AIKeyProfileRecord,
  CreateAIKeyProfileInput,
} from "./ai-key-profile.types";

function toProfile(row: {
  id: string;
  providerId: string;
  label: string;
  encryptedSecret: string;
  safeDisplayPrefix: string;
  lastFour: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AIKeyProfileRecord {
  return {
    id: row.id,
    providerId: row.providerId,
    label: row.label,
    encryptedSecret: row.encryptedSecret,
    safeDisplayPrefix: row.safeDisplayPrefix,
    lastFour: row.lastFour,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class AIKeyProfileRepository implements AIKeyProfileRepositoryPort {
  async list(providerId: string): Promise<AIKeyProfileRecord[]> {
    const rows = await prisma.aIKeyProfile.findMany({
      where: { providerId },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toProfile);
  }

  async findById(id: string): Promise<AIKeyProfileRecord | null> {
    const row = await prisma.aIKeyProfile.findUnique({ where: { id } });
    return row ? toProfile(row) : null;
  }

  async create(input: CreateAIKeyProfileInput): Promise<AIKeyProfileRecord> {
    return prisma.$transaction(async (transaction) => {
      if (input.isActive) {
        await transaction.aIKeyProfile.updateMany({
          where: { providerId: input.providerId, isActive: true },
          data: { isActive: false },
        });
      }
      return toProfile(await transaction.aIKeyProfile.create({ data: input }));
    });
  }

  async rename(id: string, label: string): Promise<AIKeyProfileRecord> {
    return toProfile(
      await prisma.aIKeyProfile.update({ where: { id }, data: { label } }),
    );
  }

  async setActive(id: string): Promise<AIKeyProfileRecord> {
    return prisma.$transaction(async (transaction) => {
      const profile = await transaction.aIKeyProfile.findUnique({ where: { id } });
      if (!profile) throw new Error("AI key profile no longer exists.");
      await transaction.aIKeyProfile.updateMany({
        where: { providerId: profile.providerId, isActive: true },
        data: { isActive: false },
      });
      return toProfile(
        await transaction.aIKeyProfile.update({
          where: { id: profile.id },
          data: { isActive: true },
        }),
      );
    });
  }

  async deactivate(id: string): Promise<AIKeyProfileRecord> {
    return toProfile(
      await prisma.aIKeyProfile.update({ where: { id }, data: { isActive: false } }),
    );
  }

  async delete(id: string): Promise<AIKeyProfileRecord> {
    return toProfile(await prisma.aIKeyProfile.delete({ where: { id } }));
  }

  async findActive(providerId: string): Promise<AIKeyProfileRecord | null> {
    const row = await prisma.aIKeyProfile.findFirst({
      where: { providerId, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    return row ? toProfile(row) : null;
  }
}
