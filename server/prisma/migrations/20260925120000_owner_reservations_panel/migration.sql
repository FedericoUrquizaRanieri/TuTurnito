-- AlterEnum
ALTER TYPE "TurnState" ADD VALUE 'TOURNAMENT';

-- DropForeignKey
ALTER TABLE "TemplateCell" DROP CONSTRAINT "TemplateCell_courtId_fkey";

-- AlterTable
ALTER TABLE "Court" ADD COLUMN     "basePrice" DOUBLE PRECISION NOT NULL DEFAULT 12000,
ADD COLUMN     "closeTime" TEXT NOT NULL DEFAULT '23:00',
ADD COLUMN     "openTime" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN     "slotMinutes" INTEGER NOT NULL DEFAULT 90;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "fixedBookingId" TEXT;

-- AlterTable
ALTER TABLE "Turn" ADD COLUMN     "label" TEXT,
ADD COLUMN     "manualOverride" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: derive each court's range (apertura, cierre, duración, precio base)
-- from its old weekly template before the template table is dropped.
UPDATE "Court" AS c
SET "openTime" = t.open_time,
    "closeTime" = t.close_time,
    "basePrice" = t.base_price,
    "slotMinutes" = t.slot_minutes
FROM (
  SELECT
    "courtId",
    MIN("startTime") AS open_time,
    MAX("endTime") AS close_time,
    MODE() WITHIN GROUP (ORDER BY "price") AS base_price,
    MODE() WITHIN GROUP (ORDER BY
      (split_part("endTime", ':', 1)::int * 60 + split_part("endTime", ':', 2)::int)
      - (split_part("startTime", ':', 1)::int * 60 + split_part("startTime", ':', 2)::int)
    ) AS slot_minutes
  FROM "TemplateCell"
  GROUP BY "courtId"
) AS t
WHERE c."id" = t."courtId" AND t.slot_minutes > 0 AND t.open_time < t.close_time;

-- DropTable
DROP TABLE "TemplateCell";

-- DropEnum
DROP TYPE "CellAvailability";

-- CreateTable
CREATE TABLE "FixedBooking" (
    "id" TEXT NOT NULL,
    "complexId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "notes" TEXT,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedBooking_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_fixedBookingId_fkey" FOREIGN KEY ("fixedBookingId") REFERENCES "FixedBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedBooking" ADD CONSTRAINT "FixedBooking_complexId_fkey" FOREIGN KEY ("complexId") REFERENCES "Complex"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedBooking" ADD CONSTRAINT "FixedBooking_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

