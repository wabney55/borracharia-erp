import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const seedCompanyId = "00000000-0000-4000-8000-000000000001";
const seedBranchId = "00000000-0000-4000-8000-000000000002";
const genericCustomerId = "00000000-0000-4000-8000-000000000003";

async function main() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error("Defina SESSION_SECRET com pelo menos 32 caracteres antes de iniciar o sistema.");
  const company = await prisma.company.upsert({
    where: { id: seedCompanyId },
    update: {},
    create: { id: seedCompanyId, legalName: "Minha Borracharia Ltda.", tradeName: "Minha Borracharia" },
  });

  const branch = await prisma.branch.upsert({
    where: { id: seedBranchId },
    update: {},
    create: { id: seedBranchId, companyId: company.id, code: "MATRIZ", name: "Matriz", isHeadquarters: true },
  });

  await prisma.customer.upsert({
    where: { id: genericCustomerId },
    update: {},
    create: { id: genericCustomerId, companyId: company.id, name: "Consumidor", isGeneric: true },
  });

  const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
  if (!initialPassword || initialPassword.length < 12) throw new Error("Defina INITIAL_ADMIN_PASSWORD com pelo menos 12 caracteres antes de iniciar o sistema.");
  const passwordHash = await hash(initialPassword, 12);
  await prisma.user.upsert({
    where: { companyId_email: { companyId: company.id, email: "admin@borracharia.local" } },
    update: {},
    create: {
      companyId: company.id,
      defaultBranchId: branch.id,
      name: "Administrador geral",
      email: "admin@borracharia.local",
      passwordHash,
      role: "SUPER_ADMIN",
      canSeeConsolidated: true,
      canApplyDiscount: true,
      canCancel: true,
      mustChangePassword: true,
      branches: { create: { branchId: branch.id } },
    },
  });
  console.info(`Base inicial pronta para ${company.tradeName}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
