-- CreateTable
CREATE TABLE "AIKeyProfile" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "safeDisplayPrefix" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIKeyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIKeyProfile_providerId_isActive_idx"
  ON "AIKeyProfile"("providerId", "isActive");
