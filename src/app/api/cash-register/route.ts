import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, userCanSeeAllBranches } from "@/lib/session";

function canUseBranch(user: { role: string; canSeeConsolidated: boolean; branches: { branch: { id: string } }[] }, branchId: string) {
  return userCanSeeAllBranches(user) || user.branches.some(({ branch }) => branch.id === branchId);
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const branchId = new URL(request.url).searchParams.get("branchId") ?? "";
  if (!z.string().uuid().safeParse(branchId).success || !canUseBranch(user, branchId)) return NextResponse.json({ error: "Unidade fora do seu escopo." }, { status: 403 });
  const register = await prisma.cashRegister.findFirst({ where: { companyId: user.companyId, branchId, status: "OPEN" }, include: { movements: { select: { amount: true, kind: true } } } });
  if (!register) return NextResponse.json({ register: null });
  const movementTotal = register.movements.reduce((sum, movement) => sum + Number(movement.amount), 0);
  return NextResponse.json({ register: { id: register.id, branchId, openedAt: register.openedAt, openingBalance: Number(register.openingBalance), movementTotal, expectedBalance: Number(register.openingBalance) + movementTotal, movementCount: register.movements.length } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = z.object({ branchId: z.string().uuid(), openingBalance: z.coerce.number().min(0).max(99999999) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe a unidade e o saldo inicial." }, { status: 400 });
  const { branchId, openingBalance } = parsed.data;
  if (!canUseBranch(user, branchId)) return NextResponse.json({ error: "Unidade fora do seu escopo." }, { status: 403 });
  const branch = await prisma.branch.findFirst({ where: { id: branchId, companyId: user.companyId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
  if (!branch) return NextResponse.json({ error: "Unidade inativa ou inexistente." }, { status: 404 });
  try {
    const register = await prisma.$transaction(async (tx) => {
      const open = await tx.cashRegister.findFirst({ where: { companyId: user.companyId, branchId, status: "OPEN" }, select: { id: true } });
      if (open) throw new Error("CASH_ALREADY_OPEN");
      const created = await tx.cashRegister.create({ data: { companyId: user.companyId, branchId, userId: user.id, openingBalance } });
      await tx.auditLog.create({ data: { companyId: user.companyId, branchId, userId: user.id, action: "OPEN", entity: "CashRegister", entityId: created.id } });
      return created;
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ register: { id: register.id, branchId, openedAt: register.openedAt, openingBalance: Number(register.openingBalance), expectedBalance: Number(register.openingBalance), movementTotal: 0, movementCount: 0 } }, { status: 201 });
  } catch (error) {
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    return NextResponse.json({ error: error instanceof Error && error.message === "CASH_ALREADY_OPEN" || duplicate ? "Já existe um caixa aberto nesta unidade." : "Não foi possível abrir o caixa." }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = z.object({ id: z.string().uuid(), closingBalance: z.coerce.number().min(0).max(99999999) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe o valor contado no fechamento." }, { status: 400 });
  const existing = await prisma.cashRegister.findFirst({ where: { id: parsed.data.id, companyId: user.companyId, status: "OPEN" }, select: { id: true, branchId: true } });
  if (!existing) return NextResponse.json({ error: "Caixa aberto não encontrado." }, { status: 404 });
  if (!canUseBranch(user, existing.branchId)) return NextResponse.json({ error: "Unidade fora do seu escopo." }, { status: 403 });
  const result = await prisma.$transaction(async (tx) => {
    const closed = await tx.cashRegister.updateMany({ where: { id: existing.id, status: "OPEN" }, data: { status: "CLOSED", closingBalance: parsed.data.closingBalance, closedAt: new Date() } });
    if (closed.count !== 1) throw new Error("CASH_ALREADY_CLOSED");
    await tx.auditLog.create({ data: { companyId: user.companyId, branchId: existing.branchId, userId: user.id, action: "CLOSE", entity: "CashRegister", entityId: existing.id } });
    return tx.cashRegister.findUniqueOrThrow({ where: { id: existing.id }, select: { id: true, closingBalance: true, closedAt: true } });
  });
  return NextResponse.json({ register: { ...result, closingBalance: Number(result.closingBalance) } });
}
