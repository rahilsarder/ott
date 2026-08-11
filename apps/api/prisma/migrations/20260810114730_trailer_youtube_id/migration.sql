/*
  Warnings:

  - You are about to drop the column `trailerStreamPath` on the `Title` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Title" DROP COLUMN "trailerStreamPath",
ADD COLUMN     "trailerYoutubeId" TEXT;
