import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, userCanSeeAllBranches } from "@/lib/session";

function canUseBranch(user: { role: string; canSeeConsolidated: boolean; branches: { branch: { id: string } }[] }, branchId: string) {
  return userCanSeeAllBranches(user) || user.branches.some(({ branch }) => branch.id === branchId);
}
function canManageStock(role: string) { return ["SUPER_ADMIN", "GENERAL_MANAGER", "BRANCH_MANAGER", "STOCKKEEPER"].includes(role); }

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const branchId = new URL(request.url).searchParams.get("branchId") ?? "";
  if (!z.string().uuid().safeParse(branchId).success || !canUseBranch(user, branchId)) return NextResponse.json({ error: "Unidade fora do seu escopo." }, { status: 403 });
  const [balances, movements] = await Promise.all([
    prisma.inventoryBalance.findMany({ where: { companyId: user.companyId, branchId, product: { deletedAt: null } }, include: { product: { select: { id: true, code: true, name: true, unit: true, minimumStock: true, cost: true, salePrice: true, status: true } } }, orderBy: { product: { name: "asc" } }, take: 1000 }),
    prisma.stockMovement.findMany({ where: { companyId: user.companyId, branchId }, include: { product: { select: { name: true, code: true, unit: true } }, user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return NextResponse.json({
    items: balances.map(({ product, quantity, averageCost }) => ({ ...product, cost: Number(product.cost), salePrice: Number(product.salePrice), minimumStock: Number(product.minimumStock), quantity: Number(quantity), averageCost: Number(averageCost) })),
    movements: movements.map(({ id, type, quantity, notes, createdAt, product, user: actor }) => ({ id, type, quantity: Number(quantity), notes, createdAt, product, user: actor.name })),
  });
}

const movementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ENTRY"), branchId: z.string().uuid(), productId: z.string().uuid(), quantity: z.coerce.number().positive().max(1000000), unitCost: z.coerce.number().min(0).max(99999999), notes: z.string().trim().max(240).optional() }),
  z.object({ kind: z.literal("EXIT"), branchId: z.string().uuid(), productId: z.string().uuid(), quantity: z.coerce.number().positive().max(1000000), notes: z.string().trim().max(240).optional() }),
  z.object({ kind: z.literal("COUNT"), branchId: z.string().uuid(), productId: z.string().uuid(), quantity: z.coerce.number().min(0).max(1000000), notes: z.string().trim().max(240).optional() }),
]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = movementSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira o produto e a quantidade informada." }, { status: 400 });
  const input = parsed.data;
  if (!canUseBranch(user, input.branchId)) return NextResponse.json({ error: "Unidade fora do seu escopo." }, { status: 403 });
  if (!canManageStock(user.role)) return NextResponse.json({ error: "Seu perfil não pode movimentar estoque." }, { status: 403 });
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const [branch, product] = await Promise.all([
        tx.branch.findFirst({ where: { id: input.branchId, companyId: user.companyId, status: "ACTIVE", deletedAt: null }, select: { id: true } }),
        tx.product.findFirst({ where: { id: input.productId, companyId: user.companyId, status: "ACTIVE", deletedAt: null }, select: { id: true, name: true, cost: true } }),
      ]);
      if (!branch) throw new Error("BRANCH_UNAVAILABLE");
      if (!product) throw new Error("PRODUCT_UNAVAILABLE");
      const balance = await tx.inventoryBalance.findFirst({ where: { companyId: user.companyId, branchId: branch.id, productId: product.id } });
      if (!balance) throw new Error("BALANCE_UNAVAILABLE");
      let signedQuantity = 0;
      let unitCost = Number(balance.averageCost);
      let nextQuantity = Number(balance.quantity);
      if (input.kind === "ENTRY") {
        const newQuantity = nextQuantity + input.quantity;
        const incomingCost = input.unitCost;
        unitCost = newQuantity === 0 ? incomingCost : Math.round(((nextQuantity * unitCost + input.quantity * incomingCost) / newQuantity) * 100) / 100;
        nextQuantity = newQuantity;
        signedQuantity = input.quantity;
      } else if (input.kind === "EXIT") {
        if (nextQuantity < input.quantity) throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
        nextQuantity -= input.quantity;
        signedQuantity = -input.quantity;
      } else {
        signedQuantity = input.quantity - nextQuantity;
        nextQuantity = input.quantity;
      }
      const balanceUpdate = await tx.inventoryBalance.updateMany({ where: { id: balance.id, companyId: user.companyId, branchId: branch.id, quantity: input.kind === "EXIT" ? { gte: input.quantity } : balance.quantity }, data: { quantity: nextQuantity, averageCost: unitCost } });
      if (balanceUpdate.count !== 1) throw new Error("STOCK_CONFLICT");
      if (signedQuantity !== 0) {
        const movementId = randomUUID();
        await tx.stockMovement.create({ data: { id: movementId, companyId: user.companyId, branchId: branch.id, productId: product.id, userId: user.id, type: input.kind === "ENTRY" ? "ENTRY" : "ADJUSTMENT", quantity: signedQuantity, unitCost, originType: "MANUAL", originId: movementId, notes: input.notes || (input.kind === "COUNT" ? "Contagem de estoque" : input.kind === "ENTRY" ? "Entrada manual" : "Saída manual") } });
        await tx.auditLog.create({ data: { companyId: user.companyId, branchId: branch.id, userId: user.id, action: input.kind, entity: "StockMovement", entityId: movementId, details: { productId: product.id, quantity: signedQuantity } } });
      }
      return { product: product.name, quantity: nextQuantity, averageCost: unitCost };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ result: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const failure: Record<string, string> = { BRANCH_UNAVAILABLE: "Unidade inativa ou inexistente.", PRODUCT_UNAVAILABLE: "Produto não encontrado ou inativo.", BALANCE_UNAVAILABLE: "Produto sem saldo inicial para esta unidade.", STOCK_CONFLICT: "O estoque mudou durante a operação. Atualize a página e tente novamente." };
    return NextResponse.json({ error: message.startsWith("INSUFFICIENT_STOCK:") ? `Saldo insuficiente de ${message.split(":").slice(1).join(":")}.` : failure[message] ?? "Não foi possível registrar a movimentação." }, { status: message === "STOCK_CONFLICT" ? 409 : 400 });
  }
}
