import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

async function start() {
  const app = await createApp();

  const server = app.listen(env.PORT, env.HOST, () => {
    console.log(`anvilnote-api listening on http://${env.HOST}:${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void start().catch(async (error) => {
  console.error("Failed to start anvilnote-api", error);
  await prisma.$disconnect();
  process.exit(1);
});
