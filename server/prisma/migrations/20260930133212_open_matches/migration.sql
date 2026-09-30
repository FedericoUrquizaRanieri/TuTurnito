-- CreateTable
CREATE TABLE "OpenMatch" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "spots" INTEGER NOT NULL,
    "joinedCount" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "id" TEXT NOT NULL,
    "openMatchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpenMatch_reservationId_key" ON "OpenMatch"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_openMatchId_userId_key" ON "MatchPlayer"("openMatchId", "userId");

-- AddForeignKey
ALTER TABLE "OpenMatch" ADD CONSTRAINT "OpenMatch_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenMatch" ADD CONSTRAINT "OpenMatch_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_openMatchId_fkey" FOREIGN KEY ("openMatchId") REFERENCES "OpenMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
