-- CreateEnum
CREATE TYPE "CancelledBy" AS ENUM ('PLAYER', 'OWNER', 'PROFESSOR');

-- AlterTable
ALTER TABLE "Complex" ADD COLUMN     "cancellationHours" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ReservationCancellation" (
    "id" TEXT NOT NULL,
    "complexId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "type" "ReservationType" NOT NULL,
    "wasFixed" BOOLEAN NOT NULL DEFAULT false,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "cancelledBy" "CancelledBy" NOT NULL,
    "minutesBefore" INTEGER NOT NULL,
    "cancelledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationCancellation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReservationCancellation_complexId_date_idx" ON "ReservationCancellation"("complexId", "date");

-- AddForeignKey
ALTER TABLE "ReservationCancellation" ADD CONSTRAINT "ReservationCancellation_complexId_fkey" FOREIGN KEY ("complexId") REFERENCES "Complex"("id") ON DELETE CASCADE ON UPDATE CASCADE;
