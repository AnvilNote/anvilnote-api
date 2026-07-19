-- CreateEnum
CREATE TYPE "AIConversationMessageRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "AIConversationIntent" AS ENUM ('compose', 'compose_from_attachments', 'rewrite_selection');

-- CreateTable
CREATE TABLE "AIConversation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "role" "AIConversationMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "intent" "AIConversationIntent" NOT NULL,
    "draft" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIConversation_documentId_lastMessageAt_id_idx"
  ON "AIConversation"("documentId", "lastMessageAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AIConversationMessage_conversationId_sequence_key"
  ON "AIConversationMessage"("conversationId", "sequence");

-- CreateIndex
CREATE INDEX "AIConversationMessage_conversationId_createdAt_id_idx"
  ON "AIConversationMessage"("conversationId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversationMessage" ADD CONSTRAINT "AIConversationMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
