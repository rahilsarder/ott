-- DropIndex
DROP INDEX "Channel_searchText_trgm_idx";

-- DropIndex
DROP INDEX "Title_searchText_trgm_idx";

-- CreateTable
CREATE TABLE "Subtitle" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "episodeId" TEXT,
    "episodeKey" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "vttUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subtitle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subtitle_titleId_episodeKey_idx" ON "Subtitle"("titleId", "episodeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Subtitle_titleId_episodeKey_language_key" ON "Subtitle"("titleId", "episodeKey", "language");

-- AddForeignKey
ALTER TABLE "Subtitle" ADD CONSTRAINT "Subtitle_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtitle" ADD CONSTRAINT "Subtitle_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
