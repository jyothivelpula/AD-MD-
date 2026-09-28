// One-time script to reset a user's password directly in the database.
// Run with: node reset-password.js
// Delete this file afterward — it contains a plaintext password.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const EMAIL = 'workday.kasim@gmail.com';
const NEW_PASSWORD = 'ClickUp@2026';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) {
    console.log(`No user found with email ${EMAIL}. Nothing changed — use Sign Up instead.`);
    return;
  }
  const passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);
  await prisma.user.update({ where: { email: EMAIL }, data: { passwordHash } });
  console.log(`Done. Password for ${EMAIL} has been reset to: ${NEW_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
