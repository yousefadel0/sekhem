const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); async function run() { console.log(await prisma.user.findMany()); } run().finally(() => prisma.$disconnect());
