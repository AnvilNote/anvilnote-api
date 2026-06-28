-- CreateEnum
CREATE TYPE "public"."RenderStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "metadata" JSONB,
    "templateSettings" JSONB,
    "templateId" TEXT,
    "typstSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RenderOutput" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "templateId" TEXT,
    "templateVersion" TEXT,
    "format" TEXT NOT NULL DEFAULT 'pdf',
    "status" "public"."RenderStatus" NOT NULL DEFAULT 'PROCESSING',
    "typstPath" TEXT,
    "pdfPath" TEXT,
    "pdfUrl" TEXT,
    "error" TEXT,
    "contentSnapshot" JSONB,
    "metadataSnapshot" JSONB,
    "templateSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenderOutput_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."RenderOutput" ADD CONSTRAINT "RenderOutput_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
