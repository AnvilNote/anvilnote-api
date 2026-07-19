import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { errorMiddleware } from "../../middleware/error.middleware";
import { createAIKeyProfileRouter } from "./ai-key-profile.routes";
import type { AIKeyProfileApplicationPort } from "./ai-key-profile.service";

const profile = {
  id: "profile-1",
  providerId: "openai",
  label: "Personal",
  display: "OpenAI · sk-proj-****5YA_",
  isActive: true,
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
};

async function withServer(
  policy: { runtime: "desktop" | "remote"; desktopTrustToken?: string; browserSessionByok: boolean },
  run: (baseUrl: string) => Promise<void>,
) {
  const service: AIKeyProfileApplicationPort = {
    async list() {
      return [profile];
    },
    async create() {
      return profile;
    },
    async rename() {
      return profile;
    },
    async activate() {
      return profile;
    },
    async deactivate() {
      return { ...profile, isActive: false };
    },
    async delete() {
      return { id: profile.id };
    },
    async getActiveEncryptedSecret() {
      return {
        id: profile.id,
        providerId: "openai",
        encryptedSecret: "ZW5jcnlwdGVkLXBheWxvYWQ=",
      };
    },
  };
  const app = express();
  app.use(express.json());
  app.use("/api/ai", createAIKeyProfileRouter({ policy, service }));
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

test("key-profile routes require Desktop trust and only the internal secret path returns ciphertext", async () => {
  await withServer(
    { runtime: "desktop", desktopTrustToken: "launch-token", browserSessionByok: false },
    async (baseUrl) => {
      const denied = await fetch(`${baseUrl}/api/ai/key-profiles`);
      assert.equal(denied.status, 403);

      const listed = await fetch(`${baseUrl}/api/ai/key-profiles`, {
        headers: { "x-anvilnote-desktop-token": "launch-token" },
      });
      assert.equal(listed.status, 200);
      const listBody = await listed.json();
      assert.deepEqual(listBody.data, [profile]);
      assert.equal(JSON.stringify(listBody).includes("encryptedSecret"), false);

      const secret = await fetch(
        `${baseUrl}/api/ai/key-profiles/active/openai/secret`,
        { headers: { "x-anvilnote-desktop-token": "launch-token" } },
      );
      assert.equal(secret.status, 200);
      assert.deepEqual((await secret.json()).data, {
        id: "profile-1",
        providerId: "openai",
        encryptedSecret: "ZW5jcnlwdGVkLXBheWxvYWQ=",
      });
    },
  );
});

test("key-profile routes stay unavailable for remote browser runtime", async () => {
  await withServer(
    { runtime: "remote", browserSessionByok: true },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/key-profiles`);
      assert.equal(response.status, 403);
    },
  );
});
