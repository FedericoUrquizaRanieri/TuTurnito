-- CreateTable
CREATE TABLE "ClassEnrollmentPrice" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "fromDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassEnrollmentPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassEnrollmentPrice_enrollmentId_fromDate_key" ON "ClassEnrollmentPrice"("enrollmentId", "fromDate");

-- AddForeignKey
ALTER TABLE "ClassEnrollmentPrice" ADD CONSTRAINT "ClassEnrollmentPrice_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ClassEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing enrollment keeps its current price from its start date.
INSERT INTO "ClassEnrollmentPrice" ("id", "enrollmentId", "price", "fromDate")
SELECT gen_random_uuid()::text, "id", "price", "startDate" FROM "ClassEnrollment";
