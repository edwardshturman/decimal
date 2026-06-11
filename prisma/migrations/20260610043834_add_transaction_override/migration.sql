-- CreateTable
CREATE TABLE "TransactionOverride" (
    "transactionId" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionOverride_pkey" PRIMARY KEY ("transactionId")
);

-- AddForeignKey
ALTER TABLE "TransactionOverride" ADD CONSTRAINT "TransactionOverride_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
