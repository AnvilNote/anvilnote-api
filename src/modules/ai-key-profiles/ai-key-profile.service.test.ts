import assert from "node:assert/strict";
import test from "node:test";
import {
  AIKeyProfileService,
  type AIKeyProfileRepositoryPort,
} from "./ai-key-profile.service";

class FakeKeyProfileRepository implements AIKeyProfileRepositoryPort {
  readonly profiles = new Map<string, {
    id: string;
    providerId: string;
    label: string;
    encryptedSecret: string;
    safeDisplayPrefix: string;
    lastFour: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>();

  async list(providerId: string) {
    return [...this.profiles.values()]
      .filter((profile) => profile.providerId === providerId)
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  }

  async findById(id: string) {
    return this.profiles.get(id) ?? null;
  }

  async create(input: Parameters<AIKeyProfileRepositoryPort["create"]>[0]) {
    const now = new Date("2026-07-19T00:00:00.000Z");
    const profile = { id: `profile-${this.profiles.size + 1}`, ...input, createdAt: now, updatedAt: now };
    if (input.isActive) {
      for (const [id, existing] of this.profiles) {
        if (existing.providerId === input.providerId) this.profiles.set(id, { ...existing, isActive: false });
      }
    }
    this.profiles.set(profile.id, profile);
    return profile;
  }

  async rename(id: string, label: string) {
    const profile = this.profiles.get(id);
    assert.ok(profile);
    const updated = { ...profile, label };
    this.profiles.set(id, updated);
    return updated;
  }

  async setActive(id: string) {
    const profile = this.profiles.get(id);
    assert.ok(profile);
    for (const [candidateId, existing] of this.profiles) {
      if (existing.providerId === profile.providerId) {
        this.profiles.set(candidateId, { ...existing, isActive: candidateId === id });
      }
    }
    return this.profiles.get(id)!;
  }

  async deactivate(id: string) {
    const profile = this.profiles.get(id);
    assert.ok(profile);
    const updated = { ...profile, isActive: false };
    this.profiles.set(id, updated);
    return updated;
  }

  async delete(id: string) {
    const profile = this.profiles.get(id);
    assert.ok(profile);
    this.profiles.delete(id);
    return profile;
  }

  async findActive(providerId: string) {
    return [...this.profiles.values()].find(
      (profile) => profile.providerId === providerId && profile.isActive,
    ) ?? null;
  }
}

test("key profiles expose fixed-mask metadata while only the trusted secret path sees ciphertext", async () => {
  const repository = new FakeKeyProfileRepository();
  const service = new AIKeyProfileService({ repository });
  const first = await service.create({
    providerId: "openai",
    label: "Personal",
    encryptedSecret: "ZW5jcnlwdGVkLXBheWxvYWQ=",
    safeDisplayPrefix: "sk-proj-",
    lastFour: "5YA_",
    isActive: true,
  });
  const second = await service.create({
    providerId: "openai",
    label: "Work",
    encryptedSecret: "YW5vdGhlci1lbmNyeXB0ZWQtcGF5bG9hZA==",
    safeDisplayPrefix: "sk-",
    lastFour: "ABCD",
    isActive: true,
  });

  assert.deepEqual(await service.list("openai"), [
    {
      id: second.id,
      providerId: "openai",
      label: "Work",
      display: "OpenAI · sk-****ABCD",
      isActive: true,
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
    },
    {
      id: first.id,
      providerId: "openai",
      label: "Personal",
      display: "OpenAI · sk-proj-****5YA_",
      isActive: false,
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
    },
  ]);
  assert.equal(JSON.stringify(await service.list("openai")).includes("encrypted"), false);
  assert.deepEqual(await service.getActiveEncryptedSecret("openai"), {
    id: second.id,
    providerId: "openai",
    encryptedSecret: "YW5vdGhlci1lbmNyeXB0ZWQtcGF5bG9hZA==",
  });
});
