/*
  Warnings:

  - The primary key for the `Cursor` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `itemId` on the `Cursor` table. All the data in the column will be lost.
  - Added the required column `accountId` to the `Cursor` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Cursor" DROP CONSTRAINT "Cursor_itemId_fkey";

-- AlterTable
ALTER TABLE "public"."Cursor" DROP CONSTRAINT "Cursor_pkey",
DROP COLUMN "itemId",
ADD COLUMN     "accountId" TEXT NOT NULL,
ADD CONSTRAINT "Cursor_pkey" PRIMARY KEY ("accountId");

-- AddForeignKey
ALTER TABLE "public"."Cursor" ADD CONSTRAINT "Cursor_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
