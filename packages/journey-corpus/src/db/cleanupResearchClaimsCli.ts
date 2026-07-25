import { PrismaClient } from "@prisma/client";
import { cleanupResearchClaims } from "./researchClaims.js";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await cleanupResearchClaims(prisma);
    console.log(`Deleted ${result.deleted} expired research claims.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error("Research-claim cleanup failed.");
  process.exit(1);
});
