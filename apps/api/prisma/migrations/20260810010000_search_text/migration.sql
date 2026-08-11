-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Title" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';


-- Trigram matching, for queries that are misspelled rather than merely
-- punctuated differently ("spidermn"). Prisma's schema language cannot express
-- either the extension or a GIN index, so both are written by hand here.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Title_searchText_trgm_idx" ON "Title" USING GIN ("searchText" gin_trgm_ops);
CREATE INDEX "Channel_searchText_trgm_idx" ON "Channel" USING GIN ("searchText" gin_trgm_ops);
