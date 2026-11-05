import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, userCanSeeAllBranches } from "@/lib/session";

function canUseBranch(user: { role: string; canSeeConsolidated: boolean; branches: { branch: { id: string } }[] }, branchId: string) {
  return userCanSeeAllBranches(user) || user.branches.some(({ branch }) => branch.id === branchId);
}
function canManageFinance(role: string) { return ["SUPER_ADMIN", "GENERAL_MANAGER", "BRANCH_MANAGER", "FINANCE"].includes(role); }

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!canManageFinance(user.role)) return NextResponse.json({ error: "Seu perfil não pode consultar o financeiro." }, { status: 403 });
  const branchId = new URL(request.url).searchParams.get("branchId") ?? "";
  if (!z.string().uuid().safeParse(branchId).success || !canUseBranch(user, branchId)) return NextResponse.json({ error: "Unidade fora do seu escopo." }, { status: 403 });
  const [register, receivables, payables, expenses] = await Promise.all([
    prisma.cashRegister.findFirst({ where: { companyId: user.companyId, branchId, status: "OPEN" }, include: { movements: { select: { amount: true } } } }),
    prisma.receivable.findMany({ where: { companyId: user.companyId, branchId, status: { in: ["PENDING", "PARTIAL"] } }, include: { customer: { select: { name: true } } }, orderBy: { dueAt: "asc" }, take: 250 }),
    prisma.payable.findMany({ where: { companyId: user.companyId, branchId, status: { in: ["PENDING", "PARTIAL"] } }, include: { supplier: { select: { name: true } } }, orderBy: { dueAt: "asc" }, take: 250 }),
    prisma.expense.findMany({ where: { companyId: user.companyId, branchId }, orderBy: { incurredAt: "desc" }, take: 100 }),
  ]);
  return NextResponse.json({
    register: register ? { id: register.id, expectedBalance: Number(register.openingBalance) + register.movements.reduce((sum, movement) => sum + Number(movement.amount), 0) } : null,
    receivables: receivables.map((item) => ({ ...item, amount: Number(item.amount), customerName: item.customer?.name ?? "Cliente" })),
    payables: payables.map((item) => ({ ...item, amount: Number(item.amount), supplierName: item.supplier?.name ?? "Fornecedor" })),
    expenses: expenses.map((item) => ({ ...item, amount: Number(item.amount) })),
  });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CREATE_PAYABLE"), branchId: z.string().uuid(), supplierId: z.string().uuid().optional().nullable(), description: z.string().trim().min(2).max(180), category: z.string().trim().max(80).optional(), amount: z.coerce.number().positive().max(99999999), dueAt: z.coerce.date() }),
  z.object({ action: z.literal("PAY"), id: z.string().uuid() }),
  z.object({ action: z.literal("RECEIVE"), id: z.string().uuid() }),
  z.object({ action: z.literal("CREATE_EXPENSE"), branchId: z.string().uuid(), description: z.string().trim().min(2).max(180), category: z.string().trim().max(80).optional(), amount: z.coerce.number().positive().max(99999999) }),
]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!canManageFinance(user.role)) return NextResponse.json({ error: "Seu perfil não pode alterar o financeiro." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira a operação, valor e vencimento." }, { status: 400 });
  const input = parsed.data;
  if ("branchId" in input && !canUseBranch(user, input.branchId)) return NextResponse.json({ error: "Unidade fora do seu escopo." }, { status: 403 });
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (input.action === "CREATE_PAYABLE") {
        const branch = await tx.branch.findFirst({ where: { id: input.branchId, companyId: user.companyId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
        if (!branch) throw new Error("BRANCH_UNAVAILABLE");
        if (input.supplierId) {
          const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, companyId: user.companyId, status: "ACTIVE" }, select: { id: true } });
          if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");
        }
        const payable = await tx.payable.create({ data: { companyId: user.companyId, branchId: input.branchId, supplierId: input.supplierId ?? null, description: input.description, category: input.category || null, amount: input.amount, dueAt: input.dueAt } });
        await tx.auditLog.create({ data: { companyId: user.companyId, branchId: input.branchId, userId: user.id, action: "CREATE", entity: "Payable", entityId: payable.id } });
        return { kind: "PAYABLE", id: payable.id };
      }
      if (input.action === "CREATE_EXPENSE") {
        const branch = await tx.branch.findFirst({ where: { id: input.branchId, companyId: user.companyId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
        if (!branch) throw new Error("BRANCH_UNAVAILABLE");
        const register = await tx.cashRegister.findFirst({ where: { companyId: user.companyId, branchId: input.branchId, status: "OPEN" }, select: { id: true } });
        if (!register) throw new Error("CASH_REQUIRED");
        const expense = await tx.expense.create({ data: { companyId: user.companyId, branchId: input.branchId, userId: user.id, description: input.description, category: input.category || null, amount: input.amount } });
        await tx.cashMovement.create({ data: { companyId: user.companyId, branchId: input.branchId, cashRegisterId: register.id, userId: user.id, kind: "EXPENSE", amount: -input.amount, description: input.description } });
        await tx.auditLog.create({ data: { companyId: user.companyId, branchId: input.branchId, userId: user.id, action: "CREATE", entity: "Expense", entityId: expense.id } });
        return { kind: "EXPENSE", id: expense.id };
      }
      const model = input.action === "PAY" ? "PAYABLE" : "RECEIVABLE";
      const record = input.action === "PAY"
        ? await tx.payable.findFirst({ where: { id: input.id, companyId: user.companyId, status: { in: ["PENDING", "PARTIAL"] } } })
        : await tx.receivable.findFirst({ where: { id: input.id, companyId: user.companyId, status: { in: ["PENDING", "PARTIAL"] } } });
      if (!record) throw new Error("FINANCIAL_RECORD_NOT_FOUND");
      if (!canUseBranch(user, record.branchId)) throw new Error("BRANCH_FORBIDDEN");
      const register = await tx.cashRegister.findFirst({ where: { companyId: user.companyId, branchId: record.branchId, status: "OPEN" }, select: { id: true } });
      if (!register) throw new Error("CASH_REQUIRED");
      if (input.action === "PAY") {
        const changed = await tx.payable.updateMany({ where: { id: record.id, companyId: user.companyId, status: { in: ["PENDING", "PARTIAL"] } }, data: { status: "PAID", paidAt: new Date() } });
        if (changed.count !== 1) throw new Error("FINANCIAL_CONFLICT");
        await tx.cashMovement.create({ data: { companyId: user.companyId, branchId: record.branchId, cashRegisterId: register.id, userId: user.id, kind: "PAYABLE", amount: -record.amount, description: `Pagamento: ${record.description}` } });
      } else {
        const changed = await tx.receivable.updateMany({ where: { id: record.id, companyId: user.companyId, status: { in: ["PENDING", "PARTIAL"] } }, data: { status: "PAID", receivedAt: new Date() } });
        if (changed.count !== 1) throw new Error("FINANCIAL_CONFLICT");
        await tx.cashMovement.create({ data: { companyId: user.companyId, branchId: record.branchId, cashRegisterId: register.id, userId: user.id, kind: "RECEIVABLE", amount: record.amount, description: `Recebimento: ${record.description}` } });
      }
      await tx.auditLog.create({ data: { companyId: user.companyId, branchId: record.branchId, userId: user.id, action: input.action, entity: model, entityId: record.id } });
      return { kind: model, id: record.id };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const errors: Record<string, string> = { SUPPLIER_NOT_FOUND: "Fornecedor não encontrado.", BRANCH_UNAVAILABLE: "Unidade inativa ou inexistente.", CASH_REQUIRED: "Abra o caixa da unidade para registrar esta movimentação.", FINANCIAL_RECORD_NOT_FOUND: "Conta não encontrada ou já quitada.", BRANCH_FORBIDDEN: "Unidade fora do seu escopo.", FINANCIAL_CONFLICT: "A conta foi atualizada em outra operação. Atualize a página." };
    return NextResponse.json({ error: errors[message] ?? "Não foi possível registrar a operação financeira." }, { status: message === "BRANCH_FORBIDDEN" ? 403 : message === "FINANCIAL_RECORD_NOT_FOUND" ? 404 : message === "BRANCH_UNAVAILABLE" || message === "CASH_REQUIRED" ? 409 : 409 });
  }
}
