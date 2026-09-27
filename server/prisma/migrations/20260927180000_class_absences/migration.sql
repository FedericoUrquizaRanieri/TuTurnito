-- CreateTable
CREATE TABLE "ClassAbsence" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassAbsence_enrollmentId_date_key" ON "ClassAbsence"("enrollmentId", "date");

-- AddForeignKey
ALTER TABLE "ClassAbsence" ADD CONSTRAINT "ClassAbsence_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ClassEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

