import { PrismaClient } from "@prisma/client";

// Singleton Prisma client shared across the app.
const prisma = new PrismaClient();

export default prisma;
