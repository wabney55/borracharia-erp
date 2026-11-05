import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, userCanSeeAllBranches } from "@/lib/session";

function canUseBranch(user: { role: string; canSeeConsolidated: boolean; branches: { branch: { id: string } }[] }, branchId: string) {
  return userCanSeeAllBranches(user) || user.branches.some(({ branch }) => branch.id === branchId);
}
function canManageStock(role: string) { return ["SUPER_ADMIN", "GENERAL_MANAGER", "BRANCH_MANAGER", "STOCKKEEPER"].includes(role); }

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const branchIds = userCanSeeAllBranches(user)
    ? (await prisma.branch.findMany({ where: { companyId: user.companyId, status: "ACTIVE", deletedAt: null }, select: { id: true } })).map(({ id }) => id)
    : user.branches.map(({ branch }) => branch.id);
  const transfers = await prisma.stockTransfer.findMany({ where: { companyId: user.companyId, OR: [{ originBranchId: { in: branchIds } }, { destinationBranchId: { in: branchIds } }] }, include: { originBranch: { select: { id: true, name: true, code: true } }, destinationBranch: { select: { id: true, name: true, code: true } }, items: { include: { product: { select: { id: true, code: true, name: true, unit: true } } } } }, orderBy: { createdAt: "desc" }, take: 200 });
  return NextResponse.json({ transfers: transfers.map((transfer) => ({ ...transfer, items: transfer.items.map((item) => ({ ...item, quantity: Number(item.quantity), receivedQuantity: Number(item.receivedQuantity) })) })) });
}

const createSchema = z.object({
  originBranchId: z.string().uuid(), destinationBranchId: z.string().uuid(), notes: z.string().trim().max(240).optional(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.coerce.number().positive().max(1000000) })).min(1).max(50),
}).refine((value) => value.originBranchId !== value.destinationBranchId, { message: "A origem e o destino precisam ser diferentes." }).refine((value) => new Set(value.items.map((item) => item.productId)).size === value.items.length, { message: "Cada produto deve aparecer uma vez." });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!canManageStock(user.role)) return NextResponse.json({ error: "Seu perfil não pode criar transferências." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe filiais diferentes e itens válidos, sem repetir produtos." }, { status: 400 });
  const input = parsed.data;
  if (!canUseBranch(user, input.originBranchId) || !canUseBranch(user, input.destinationBranchId)) return NextResponse.json({ error: "As duas unidades precisam estar no seu escopo." }, { status: 403 });
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  try {
    const transfer = await prisma.$transaction(async (tx) => {
      const activeBranches = await tx.branch.findMany({ where: { companyId: user.companyId, id: { in: [input.originBranchId, input.destinationBranchId] }, status: "ACTIVE", deletedAt: null }, select: { id: true } });
      if (activeBranches.length !== 2) throw new Error("BRANCH_UNAVAILABLE");
      const products = await tx.product.findMany({ where: { companyId: user.companyId, id: { in: input.items.map(({ productId }) => productId) }, status: "ACTIVE", deletedAt: null }, select: { id: true } });
      if (products.length !== input.items.length) throw new Error("PRODUCT_UNAVAILABLE");
      const created = await tx.stockTransfer.create({ data: {
        companyId: user.companyId, originBranchId: input.originBranchId, destinationBranchId: input.destinationBranchId,
        code: `TR-${stamp}-${randomUUID().slice(0, 6).toUpperCase()}`, status: "DRAFT", notes: input.notes || null,
        items: { create: input.items.map((item) => ({ companyId: user.companyId, productId: item.productId, quantity: item.quantity })) },
      }, include: { originBranch: { select: { id: true, name: true, code: true } }, destinationBranch: { select: { id: true, name: true, code: true } }, items: { include: { product: { select: { id: true, code: true, name: true, unit: true } } } } } });
      await tx.auditLog.create({ data: { companyId: user.companyId, branchId: input.originBranchId, userId: user.id, action: "CREATE", entity: "StockTransfer", entityId: created.id, details: { destinationBranchId: input.destinationBranchId, itemCount: input.items.length } } });
      return created;
    });
    return NextResponse.json({ transfer }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: message === "BRANCH_UNAVAILABLE" ? "Unidade inativa ou inexistente." : message === "PRODUCT_UNAVAILABLE" ? "Um produto está inativo ou não existe." : "Não foi possível criar a transferência." }, { status: 400 });
  }
}

const actionSchema = z.object({ id: z.string().uuid(), action: z.enum(["SHIP", "RECEIVE", "CANCEL"]), items: z.array(z.object({ itemId: z.string().uuid(), quantity: z.coerce.number().positive().max(1000000) })).max(50).optional() });

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!canManageStock(user.role)) return NextResponse.json({ error: "Seu perfil não pode atualizar transferências." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ação ou transferência inválida." }, { status: 400 });
  const input = parsed.data;
  try {
    const transfer = await prisma.$transaction(async (tx) => {
      const existing = await tx.stockTransfer.findFirst({ where: { id: input.id, companyId: user.companyId }, include: { items: { include: { product: { select: { name: true, cost: true } } } } } });
      if (!existing) throw new Error("TRANSFER_NOT_FOUND");
      const branchId = input.action === "RECEIVE" ? existing.destinationBranchId : existing.originBranchId;
      if (!canUseBranch(user, branchId)) throw new Error("BRANCH_FORBIDDEN");
      if (input.action === "CANCEL") {
        if (existing.status !== "DRAFT") throw new Error("TRANSFER_STATE");
        await tx.stockTransfer.update({ where: { id: existing.id }, data: { status: "CANCELED" } });
      } else if (input.action === "SHIP") {
        if (existing.status !== "DRAFT") throw new Error("TRANSFER_STATE");
        const eventId = randomUUID();
        for (const item of existing.items) {
          const balance = await tx.inventoryBalance.findFirst({ where: { companyId: user.companyId, branchId: existing.originBranchId, productId: item.productId } });
          if (!balance || Number(balance.quantity) < Number(item.quantity)) throw new Error(`INSUFFICIENT_STOCK:${item.product.name}`);
          const changed = await tx.inventoryBalance.updateMany({ where: { id: balance.id, companyId: user.companyId, branchId: existing.originBranchId, quantity: { gte: item.quantity } }, data: { quantity: { decrement: item.quantity } } });
          if (changed.count !== 1) throw new Error(`INSUFFICIENT_STOCK:${item.product.name}`);
          await tx.transferItem.update({ where: { id: item.id }, data: { unitCost: balance.averageCost } });
          await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: existing.originBranchId, productId: item.productId, userId: user.id, type: "TRANSFER_OUT", quantity: -item.quantity, unitCost: balance.averageCost, originType: "TRANSFER_SHIPMENT", originId: eventId, notes: `Transferência ${existing.code}` } });
        }
        await tx.stockTransfer.update({ where: { id: existing.id }, data: { status: "IN_TRANSIT", shippedAt: new Date() } });
      } else {
        if (!["IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(existing.status)) throw new Error("TRANSFER_STATE");
        if (!input.items?.length || new Set(input.items.map((item) => item.itemId)).size !== input.items.length) throw new Error("RECEIPT_INVALID");
        const eventId = randomUUID();
        let hasPending = false;
        for (const line of input.items) {
          const item = existing.items.find(({ id }) => id === line.itemId);
          if (!item) throw new Error("RECEIPT_INVALID");
          const nextReceived = Number(item.receivedQuantity) + line.quantity;
          if (nextReceived > Number(item.quantity)) throw new Error("RECEIPT_TOO_HIGH");
          const received = await tx.transferItem.updateMany({ where: { id: item.id, companyId: user.companyId, receivedQuantity: item.receivedQuantity }, data: { receivedQuantity: nextReceived } });
          if (received.count !== 1) throw new Error("TRANSFER_CONFLICT");
          const destinationBalance = await tx.inventoryBalance.findFirst({ where: { companyId: user.companyId, branchId: existing.destinationBranchId, productId: item.productId } });
          const currentQuantity = Number(destinationBalance?.quantity ?? 0);
          const currentCost = Number(destinationBalance?.averageCost ?? item.unitCost ?? item.product.cost);
          const incomingCost = Number(item.unitCost ?? item.product.cost);
          const averageCost = Math.round(((currentQuantity * currentCost + line.quantity * incomingCost) / (currentQuantity + line.quantity)) * 100) / 100;
          await tx.inventoryBalance.upsert({ where: { branchId_productId: { branchId: existing.destinationBranchId, productId: item.productId } }, create: { companyId: user.companyId, branchId: existing.destinationBranchId, productId: item.productId, quantity: line.quantity, averageCost: incomingCost }, update: { quantity: { increment: line.quantity }, averageCost } });
          await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: existing.destinationBranchId, productId: item.productId, userId: user.id, type: "TRANSFER_IN", quantity: line.quantity, unitCost: incomingCost, originType: "TRANSFER_RECEIPT", originId: eventId, notes: `Recebimento ${existing.code}` } });
        }
        for (const item of existing.items) if (Number(item.receivedQuantity) + (input.items.find((line) => line.itemId === item.id)?.quantity ?? 0) < Number(item.quantity)) hasPending = true;
        await tx.stockTransfer.update({ where: { id: existing.id }, data: { status: hasPending ? "PARTIALLY_RECEIVED" : "RECEIVED", receivedAt: hasPending ? null : new Date() } });
      }
      await tx.auditLog.create({ data: { companyId: user.companyId, branchId, userId: user.id, action: input.action, entity: "StockTransfer", entityId: existing.id, details: { code: existing.code } } });
      return tx.stockTransfer.findUniqueOrThrow({ where: { id: existing.id }, select: { id: true, code: true, status: true } });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ transfer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const errors: Record<string, string> = { TRANSFER_NOT_FOUND: "Transferência não encontrada.", BRANCH_FORBIDDEN: "Unidade fora do seu escopo.", TRANSFER_STATE: "A transferência não aceita esta ação no status atual.", RECEIPT_INVALID: "Informe itens recebidos válidos.", RECEIPT_TOO_HIGH: "A quantidade recebida não pode superar a enviada.", TRANSFER_CONFLICT: "O recebimento foi atualizado em outra operação. Atualize a página." };
    const insufficient = message.startsWith("INSUFFICIENT_STOCK:");
    return NextResponse.json({ error: insufficient ? `Estoque insuficiente de ${message.split(":").slice(1).join(":")}.` : errors[message] ?? "Não foi possível atualizar a transferência." }, { status: message === "TRANSFER_NOT_FOUND" ? 404 : message === "BRANCH_FORBIDDEN" ? 403 : 409 });
  }
}
