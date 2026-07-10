-- AlterTable
ALTER TABLE "public"."Document" ADD COLUMN     "numberedHeadings" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."DocumentVersion" ADD COLUMN     "numberedHeadings" BOOLEAN NOT NULL DEFAULT true;
