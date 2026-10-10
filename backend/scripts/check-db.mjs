import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
prisma.$connect()
  .then(() => {
    console.log('POSTGRES CONNECTED');
    return prisma.$disconnect();
  })
  .catch((e) => {
    console.error('POSTGRES CONNECTION FAILED', e.message);
    process.exit(1);
  });
