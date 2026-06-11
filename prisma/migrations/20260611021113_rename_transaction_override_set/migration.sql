/*
  Warnings:

  - You are about to drop the `TransactionOverride` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TransactionOverride" DROP CONSTRAINT "TransactionOverride_transactionId_fkey";

-- DropTable
DROP TABLE "TransactionOverride";

-- CreateTable
CREATE TABLE "TransactionOverrideSet" (
    "transactionId" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionOverrideSet_pkey" PRIMARY KEY ("transactionId")
);

-- AddForeignKey
ALTER TABLE "TransactionOverrideSet" ADD CONSTRAINT "TransactionOverrideSet_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
