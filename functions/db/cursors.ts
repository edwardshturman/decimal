import prisma from "@/functions/db"

type CursorInput = {
  accountId: string
  string: string
}

export async function getCursor(accountId: string) {
  return await prisma.cursor.findUnique({
    where: { accountId }
  })
}

export async function createCursor(cursorInput: CursorInput) {
  return await prisma.cursor.create({
    data: {
      accountId: cursorInput.accountId,
      string: cursorInput.string
    }
  })
}

export async function updateCursor(cursorInput: CursorInput) {
  return await prisma.cursor.update({
    where: { accountId: cursorInput.accountId },
    data: { string: cursorInput.string }
  })
}
