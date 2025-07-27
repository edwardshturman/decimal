import prisma from "@/functions/db"

type CreateUserInput = {
  name: string
  email: string
}

export async function getUserByEmail(email: string) {
  return await prisma.user.findUnique({
    where: { email }
  })
}

export async function createUser(user: CreateUserInput) {
  return await prisma.user.create({
    data: {
      name: user.name,
      email: user.email
    }
  })
}
