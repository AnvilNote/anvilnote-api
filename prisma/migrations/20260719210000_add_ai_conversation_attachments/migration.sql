CREATE TABLE "AIConversationAttachment" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AIConversationAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AIConversationAttachment_messageId_createdAt_id_idx"
  ON "AIConversationAttachment"("messageId", "createdAt", "id");

CREATE INDEX "AIConversationAttachment_storageKey_idx"
  ON "AIConversationAttachment"("storageKey");

ALTER TABLE "AIConversationAttachment" ADD CONSTRAINT "AIConversationAttachment_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "AIConversationMessage"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
