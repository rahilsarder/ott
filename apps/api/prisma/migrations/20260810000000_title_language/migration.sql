-- AlterTable
ALTER TABLE "Title" ADD COLUMN     "originalLanguage" TEXT;

-- CreateIndex
CREATE INDEX "Title_isPublished_publishedAt_id_idx" ON "Title"("isPublished", "publishedAt", "id");

-- CreateIndex
CREATE INDEX "Title_originalLanguage_idx" ON "Title"("originalLanguage");

