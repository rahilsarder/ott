-- CreateEnum
CREATE TYPE "CreditKind" AS ENUM ('CAST', 'CREW');

-- AlterTable
ALTER TABLE "Episode" ADD COLUMN     "airDate" TIMESTAMP(3),
ALTER COLUMN "streamPath" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Title" ADD COLUMN     "tmdbId" INTEGER,
ADD COLUMN     "tmdbSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "profilePath" TEXT,
    "biography" TEXT NOT NULL DEFAULT '',
    "knownFor" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credit" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" "CreditKind" NOT NULL DEFAULT 'CAST',
    "role" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Credit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_tmdbId_key" ON "Person"("tmdbId");

-- CreateIndex
CREATE INDEX "Person_name_idx" ON "Person"("name");

-- CreateIndex
CREATE INDEX "Credit_titleId_kind_order_idx" ON "Credit"("titleId", "kind", "order");

-- CreateIndex
CREATE INDEX "Credit_personId_idx" ON "Credit"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Credit_titleId_personId_kind_role_key" ON "Credit"("titleId", "personId", "kind", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Title_type_tmdbId_key" ON "Title"("type", "tmdbId");

-- AddForeignKey
ALTER TABLE "Credit" ADD CONSTRAINT "Credit_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credit" ADD CONSTRAINT "Credit_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

