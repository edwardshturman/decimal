/*
  Warnings:

  - You are about to drop the column `institutionName` on the `Item` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Item" DROP COLUMN "institutionName",
ADD COLUMN     "institutionId" TEXT NOT NULL DEFAULT '';
