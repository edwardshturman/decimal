import prisma from "@/functions/db"

export async function upsertTransactionOverrideSetInDb({
  transactionId,
  name
}: {
  transactionId: string
  name: string | null
}) {
  return await prisma.transactionOverrideSet.upsert({
    where: { transactionId },
    update: { name },
    create: { transactionId, name }
  })
}
