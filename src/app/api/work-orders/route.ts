import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, userCanSeeAllBranches } from "@/lib/session";

function canUseBranch(user: { role: string; canSeeConsolidated: boolean; branches: { branch: { id: string } }[] }, branchId: string) {
  return userCanSeeAllBranches(user) || user.branches.some(({ branch }) => branch.id === branchId);
}
const itemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PRODUCT"), id: z.string().uuid(), quantity: z.coerce.number().positive().max(10000) }),
  z.object({ kind: z.literal("SERVICE"), id: z.string().uuid(), quantity: z.coerce.number().positive().max(10000) }),
]);
const createSchema = z.object({ branchId: z.string().uuid(), customerId: z.string().uuid(), vehicle: z.string().trim().max(120).optional(), problem: z.string().trim().min(3).max(1000), notes: z.string().trim().max(1000).optional(), discount: z.coerce.number().min(0).max(99999999).default(0), items: z.array(itemSchema).min(1).max(50) });

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const branchId = new URL(request.url).searchParams.get("branchId") ?? "";
  if (!z.string().uuid().safeParse(branchId).success || !canUseBranch(user, branchId)) return NextResponse.json({ error: "Unidade fora do seu escopo." }, { status: 403 });
  const workOrders = await prisma.workOrder.findMany({ where: { companyId: user.companyId, branchId }, include: { customer: { select: { id: true, name: true, phone: true } }, user: { select: { name: true } }, items: { select: { id: true, productId: true, serviceId: true, description: true, quantity: true, unitPrice: true, total: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ workOrders: workOrders.map((order) => ({ ...order, subtotal: Number(order.subtotal), discount: Number(order.discount), total: Number(order.total), items: order.items.map((item) => ({ ...item, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), total: Number(item.total) })) })) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira cliente, problema, itens e quantidades." }, { status: 400 });
  const input = parsed.data;
  if (!canUseBranch(user, input.branchId)) return NextResponse.json({ error: "Unidade fora do seu escopo." }, { status: 403 });
  if (input.discount > 0 && !user.canApplyDiscount) return NextResponse.json({ error: "Seu perfil não permite aplicar descontos." }, { status: 403 });
  try {
    const order = await prisma.$transaction(async (tx) => {
      const [branch, customer] = await Promise.all([
        tx.branch.findFirst({ where: { id: input.branchId, companyId: user.companyId, status: "ACTIVE", deletedAt: null }, select: { id: true } }),
        tx.customer.findFirst({ where: { id: input.customerId, companyId: user.companyId, deletedAt: null }, select: { id: true, isGeneric: true } }),
      ]);
      if (!branch) throw new Error("BRANCH_UNAVAILABLE");
      if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      if (customer.isGeneric) throw new Error("CUSTOMER_IDENTIFIED_REQUIRED");
      const productIds = input.items.filter((item) => item.kind === "PRODUCT").map((item) => item.id);
      const serviceIds = input.items.filter((item) => item.kind === "SERVICE").map((item) => item.id);
      const [products, services, prices] = await Promise.all([
        tx.product.findMany({ where: { companyId: user.companyId, id: { in: productIds }, status: "ACTIVE", deletedAt: null }, select: { id: true, name: true, salePrice: true } }),
        tx.service.findMany({ where: { companyId: user.companyId, id: { in: serviceIds }, status: "ACTIVE" }, select: { id: true, name: true, price: true } }),
        tx.branchProductPrice.findMany({ where: { companyId: user.companyId, branchId: branch.id, productId: { in: productIds } }, select: { productId: true, salePrice: true } }),
      ]);
      const productMap = new Map(products.map((product) => [product.id, product]));
      const serviceMap = new Map(services.map((service) => [service.id, service]));
      const priceMap = new Map(prices.map((price) => [price.productId, price.salePrice]));
      const lines = input.items.map((line) => {
        if (line.kind === "PRODUCT") {
          const product = productMap.get(line.id); if (!product) throw new Error("ITEM_UNAVAILABLE");
          const unitPrice = Number(priceMap.get(product.id) ?? product.salePrice);
          return { companyId: user.companyId, productId: product.id, serviceId: null, description: product.name, quantity: line.quantity, unitPrice, total: Math.round(unitPrice * line.quantity * 100) / 100 };
        }
        const service = serviceMap.get(line.id); if (!service) throw new Error("ITEM_UNAVAILABLE");
        const unitPrice = Number(service.price);
        return { companyId: user.companyId, productId: null, serviceId: service.id, description: service.name, quantity: line.quantity, unitPrice, total: Math.round(unitPrice * line.quantity * 100) / 100 };
      });
      const subtotal = Math.round(lines.reduce((sum, line) => sum + line.total, 0) * 100) / 100;
      if (input.discount > subtotal) throw new Error("DISCOUNT_TOO_HIGH");
      const total = Math.round((subtotal - input.discount) * 100) / 100;
      const current = await tx.workOrder.aggregate({ where: { companyId: user.companyId, branchId: branch.id }, _max: { number: true } });
      const created = await tx.workOrder.create({ data: { companyId: user.companyId, branchId: branch.id, customerId: customer.id, userId: user.id, number: (current._max.number ?? 0) + 1, vehicle: input.vehicle || null, problem: input.problem, notes: input.notes || null, subtotal, discount: input.discount, total, items: { create: lines } } });
      await tx.auditLog.create({ data: { companyId: user.companyId, branchId: branch.id, userId: user.id, action: "CREATE", entity: "WorkOrder", entityId: created.id } });
      return { id: created.id, number: created.number, status: created.status, total: Number(created.total), branchId: created.branchId };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ workOrder: order }, { status: 201 });
  } catch (error) {
    const messages: Record<string, string> = { BRANCH_UNAVAILABLE: "Unidade inativa ou inexistente.", CUSTOMER_NOT_FOUND: "Cliente não encontrado.", CUSTOMER_IDENTIFIED_REQUIRED: "Selecione um cliente identificado para abrir uma ordem de serviço.", ITEM_UNAVAILABLE: "Um dos produtos ou serviços está inativo.", DISCOUNT_TOO_HIGH: "O desconto não pode ultrapassar o subtotal." };
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: messages[message] ?? (duplicate ? "Conflito ao gerar número da ordem. Tente novamente." : "Não foi possível abrir a ordem de serviço.") }, { status: duplicate ? 409 : 400 });
  }
}

const actionSchema = z.object({ id: z.string().uuid(), action: z.enum(["START", "WAIT_APPROVAL", "WAIT_PARTS", "COMPLETE", "CANCEL"]) });
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ação ou ordem inválida." }, { status: 400 });
  const input = parsed.data;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.workOrder.findFirst({ where: { id: input.id, companyId: user.companyId }, include: { items: true, customer: { select: { isGeneric: true } } } });
      if (!existing) throw new Error("ORDER_NOT_FOUND");
      if (!canUseBranch(user, existing.branchId)) throw new Error("BRANCH_FORBIDDEN");
      const transitions: Record<string, string[]> = { START: ["OPEN"], WAIT_APPROVAL: ["OPEN", "IN_PROGRESS"], WAIT_PARTS: ["OPEN", "IN_PROGRESS", "WAITING_APPROVAL"], COMPLETE: ["OPEN", "IN_PROGRESS", "WAITING_APPROVAL", "WAITING_PARTS"], CANCEL: ["OPEN", "IN_PROGRESS", "WAITING_APPROVAL", "WAITING_PARTS"] };
      if (!transitions[input.action].includes(existing.status)) throw new Error("ORDER_STATE");
      const nextStatus = input.action === "START" ? "IN_PROGRESS" : input.action === "WAIT_APPROVAL" ? "WAITING_APPROVAL" : input.action === "WAIT_PARTS" ? "WAITING_PARTS" : input.action === "COMPLETE" ? "COMPLETED" : "CANCELED";
      const claimed = await tx.workOrder.updateMany({ where: { id: existing.id, companyId: user.companyId, status: existing.status }, data: { status: nextStatus, ...(nextStatus === "COMPLETED" ? { completedAt: new Date() } : {}) } });
      if (claimed.count !== 1) throw new Error("ORDER_CONFLICT");
      if (nextStatus === "COMPLETED") {
        const productQuantities = new Map<string, number>();
        for (const item of existing.items) if (item.productId) productQuantities.set(item.productId, (productQuantities.get(item.productId) ?? 0) + Number(item.quantity));
        for (const [productId, quantity] of productQuantities) {
          const balance = await tx.inventoryBalance.findFirst({ where: { companyId: user.companyId, branchId: existing.branchId, productId } });
          if (!balance || Number(balance.quantity) < quantity) throw new Error(`INSUFFICIENT_STOCK:${existing.items.find((item) => item.productId === productId)?.description ?? "Produto"}`);
          const changed = await tx.inventoryBalance.updateMany({ where: { id: balance.id, companyId: user.companyId, branchId: existing.branchId, quantity: { gte: quantity } }, data: { quantity: { decrement: quantity } } });
          if (changed.count !== 1) throw new Error(`INSUFFICIENT_STOCK:${existing.items.find((item) => item.productId === productId)?.description ?? "Produto"}`);
          await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: existing.branchId, productId, userId: user.id, type: "WORK_ORDER", quantity: -quantity, originType: "WORK_ORDER", originId: existing.id, notes: `Ordem de serviço ${existing.number}`, unitCost: balance.averageCost } });
        }
        if (Number(existing.total) > 0) {
          const dueAt = new Date(); dueAt.setDate(dueAt.getDate() + 30);
          await tx.receivable.create({ data: { companyId: user.companyId, branchId: existing.branchId, customerId: existing.customerId, workOrderId: existing.id, description: `Ordem de serviço ${existing.number}`, amount: existing.total, dueAt } });
        }
      }
      await tx.auditLog.create({ data: { companyId: user.companyId, branchId: existing.branchId, userId: user.id, action: input.action, entity: "WorkOrder", entityId: existing.id } });
      return { id: existing.id, number: existing.number, status: nextStatus, total: Number(existing.total) };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ workOrder: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const messages: Record<string, string> = { ORDER_NOT_FOUND: "Ordem de serviço não encontrada.", BRANCH_FORBIDDEN: "Unidade fora do seu escopo.", ORDER_STATE: "A ordem não aceita esta ação no status atual.", ORDER_CONFLICT: "A ordem foi atualizada em outra operação. Atualize a página." };
    const insufficient = message.startsWith("INSUFFICIENT_STOCK:");
    return NextResponse.json({ error: insufficient ? `Estoque insuficiente para concluir: ${message.split(":").slice(1).join(":")}.` : messages[message] ?? "Não foi possível atualizar a ordem de serviço." }, { status: message === "ORDER_NOT_FOUND" ? 404 : message === "BRANCH_FORBIDDEN" ? 403 : 409 });
  }
}
