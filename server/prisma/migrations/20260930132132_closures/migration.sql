-- AlterTable
ALTER TABLE "Turn" ADD COLUMN     "closureId" TEXT;

-- CreateTable
CREATE TABLE "Closure" (
    "id" TEXT NOT NULL,
    "complexId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Closure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Closure_complexId_startDate_idx" ON "Closure"("complexId", "startDate");

-- AddForeignKey
ALTER TABLE "Closure" ADD CONSTRAINT "Closure_complexId_fkey" FOREIGN KEY ("complexId") REFERENCES "Complex"("id") ON DELETE CASCADE ON UPDATE CASCADE;
