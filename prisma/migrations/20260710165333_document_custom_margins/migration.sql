-- AlterTable
ALTER TABLE "public"."Document" ADD COLUMN     "marginBottomCm" DOUBLE PRECISION,
ADD COLUMN     "marginLeftCm" DOUBLE PRECISION,
ADD COLUMN     "marginRightCm" DOUBLE PRECISION,
ADD COLUMN     "marginTopCm" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "public"."DocumentVersion" ADD COLUMN     "marginBottomCm" DOUBLE PRECISION,
ADD COLUMN     "marginLeftCm" DOUBLE PRECISION,
ADD COLUMN     "marginRightCm" DOUBLE PRECISION,
ADD COLUMN     "marginTopCm" DOUBLE PRECISION;
