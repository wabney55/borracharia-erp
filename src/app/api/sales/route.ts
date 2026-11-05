import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, userCanSeeAllBranches } from "@/lib/session";

const itemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PRODUCT"), id: z.string().uuid(), quantity: z.coerce.number().positive().max(10000) }),
  z.object({ kind: z.literal("SERVICE"), id: z.string().uuid(), quantity: z.coerce.number().positive().max(10000) }),
]);
const saleSchema = z.object({
  requestId: z.string().uuid(), branchId: z.string().uuid(), customerId: z.string().uuid().optional().nullable(),
  discount: z.coerce.number().min(0).max(99999999).default(0), items: z.array(itemSchema).min(1).max(50),
  payments: z.array(z.object({ method: z.enum(["CASH", "PIX", "DEBIT", "CREDIT", "TRANSFER", "ON_ACCOUNT"]), amount: z.coerce.number().positive().max(99999999) })).min(1).max(6),
});
const toCents = (value: number) => Math.round((value + Number.EPSILON) * 100);

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const branchId = new URL(request.url).searchParams.get("branchId") ?? "";
  const authorized = userCanSeeAllBranches(user) || user.branches.some(({ branch }) => branch.id === branchId);
  if (!z.string().uuid().safeParse(branchId).success || !authorized) return NextResponse.json({ error: "Unidade fora do seu escopo." }, { status: 403 });
  const sales = await prisma.sale.findMany({ where: { companyId: user.companyId, branchId, status: "COMPLETED" }, include: { customer: { select: { name: true } }, items: { select: { id: true, description: true, quantity: true, total: true } }, payments: { select: { method: true, amount: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ sales: sales.map((sale) => ({ id: sale.id, number: sale.number, total: Number(sale.total), createdAt: sale.createdAt, customer: sale.customer?.name ?? "Consumidor", items: sale.items.map((item) => ({ ...item, quantity: Number(item.quantity), total: Number(item.total) })), payments: sale.payments.map((payment) => ({ ...payment, amount: Number(payment.amount) })) })) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = saleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira os itens, quantidades e pagamentos da venda." }, { status: 400 });
  const input = parsed.data;
  const allowed = userCanSeeAllBranches(user) || user.branches.some(({ branch }) => branch.id === input.branchId);
  if (!allowed) return NextResponse.json({ error: "Unidade fora do seu escopo." }, { status: 403 });
  if (input.discount > 0 && !user.canApplyDiscount) return NextResponse.json({ error: "Seu perfil não permite aplicar descontos." }, { status: 403 });

  const prior = await prisma.sale.findFirst({ where: { requestId: input.requestId, companyId: user.companyId, branchId: input.branchId }, select: { id: true, number: true, total: true } });
  if (prior) return NextResponse.json({ sale: { ...prior, total: Number(prior.total) }, repeated: true });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({ where: { id: input.branchId, companyId: user.companyId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
      if (!branch) throw new Error("BRANCH_UNAVAILABLE");
      const cashRegister = await tx.cashRegister.findFirst({ where: { companyId: user.companyId, branchId: branch.id, status: "OPEN" }, select: { id: true } });
      if (!cashRegister) throw new Error("CASH_REQUIRED");

      let customerId = input.customerId ?? null;
      let customerIsGeneric = false;
      if (customerId) {
        const customer = await tx.customer.findFirst({ where: { id: customerId, companyId: user.companyId, deletedAt: null }, select: { id: true, isGeneric: true } });
        if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
        customerIsGeneric = customer.isGeneric;
      } else {
        const generic = await tx.customer.findFirst({ where: { companyId: user.companyId, isGeneric: true, deletedAt: null }, select: { id: true } });
        customerId = generic?.id ?? null; customerIsGeneric = true;
      }

      const productIds = input.items.filter((item) => item.kind === "PRODUCT").map((item) => item.id);
      const serviceIds = input.items.filter((item) => item.kind === "SERVICE").map((item) => item.id);
      const [products, services, overrides, balances] = await Promise.all([
        tx.product.findMany({ where: { companyId: user.companyId, id: { in: productIds }, status: "ACTIVE", deletedAt: null }, select: { id: true, name: true, salePrice: true, cost: true } }),
        tx.service.findMany({ where: { companyId: user.companyId, id: { in: serviceIds }, status: "ACTIVE" }, select: { id: true, name: true, price: true } }),
        tx.branchProductPrice.findMany({ where: { companyId: user.companyId, branchId: branch.id, productId: { in: productIds } }, select: { productId: true, salePrice: true } }),
        tx.inventoryBalance.findMany({ where: { companyId: user.companyId, branchId: branch.id, productId: { in: productIds } }, select: { productId: true, averageCost: true } }),
      ]);
      const productMap = new Map(products.map((item) => [item.id, item]));
      const serviceMap = new Map(services.map((item) => [item.id, item]));
      const overrideMap = new Map(overrides.map((item) => [item.productId, item.salePrice]));
      const averageCostMap = new Map(balances.map((item) => [item.productId, item.averageCost]));
      const lines = input.items.map((line) => {
        if (line.kind === "PRODUCT") {
          const product = productMap.get(line.id);
          if (!product) throw new Error("ITEM_UNAVAILABLE");
          const unitPrice = Number(overrideMap.get(product.id) ?? product.salePrice);
          return { productId: product.id, serviceId: null, description: product.name, quantity: line.quantity, unitPrice, total: Math.round(unitPrice * line.quantity * 100) / 100, unitCost: Number(averageCostMap.get(product.id) ?? product.cost) };
        }
        const service = serviceMap.get(line.id);
        if (!service) throw new Error("ITEM_UNAVAILABLE");
        const unitPrice = Number(service.price);
        return { productId: null, serviceId: service.id, description: service.name, quantity: line.quantity, unitPrice, total: Math.round(unitPrice * line.quantity * 100) / 100, unitCost: null };
      });
      const subtotal = Math.round(lines.reduce((sum, line) => sum + line.total, 0) * 100) / 100;
      const discount = Math.round(input.discount * 100) / 100;
      if (discount > subtotal) throw new Error("DISCOUNT_TOO_HIGH");
      const total = Math.round((subtotal - discount) * 100) / 100;
      if (total <= 0) throw new Error("TOTAL_INVALID");
      const payments = input.payments.map((payment) => ({ ...payment, amount: toCents(payment.amount) / 100 }));
      const paymentsTotalCents = payments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
      if (paymentsTotalCents !== toCents(total)) throw new Error("PAYMENT_TOTAL_MISMATCH");

      const maxNumber = await tx.sale.aggregate({ where: { companyId: user.companyId, branchId: branch.id }, _max: { number: true } });
      const number = (maxNumber._max.number ?? 0) + 1;
      const saleId = randomUUID();
      const sale = await tx.sale.create({ data: {
        id: saleId, requestId: input.requestId, companyId: user.companyId, branchId: branch.id, userId: user.id, customerId, number,
        subtotal, discount, total,
        items: { create: lines.map(({ unitCost: _unitCost, ...line }) => line) },
      } });
      const paymentRows = [];
      for (const payment of payments) paymentRows.push(await tx.salePayment.create({ data: { companyId: user.companyId, saleId: sale.id, method: payment.method, amount: payment.amount } }));

      const productLines = new Map<string, { quantity: number; cost: number }>();
      for (const line of lines) if (line.productId) {
        const previous = productLines.get(line.productId) ?? { quantity: 0, cost: line.unitCost ?? 0 };
        previous.quantity += line.quantity;
        productLines.set(line.productId, previous);
      }
      for (const [productId, line] of productLines) {
        const changed = await tx.inventoryBalance.updateMany({ where: { companyId: user.companyId, branchId: branch.id, productId, quantity: { gte: line.quantity } }, data: { quantity: { decrement: line.quantity } } });
        if (changed.count !== 1) throw new Error(`INSUFFICIENT_STOCK:${productMap.get(productId)?.name ?? "Produto"}`);
        await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: branch.id, productId, userId: user.id, type: "SALE", quantity: -line.quantity, unitCost: line.cost, originType: "SALE", originId: sale.id } });
      }

      let accountAmount = 0;
      for (let index = 0; index < payments.length; index++) {
        const payment = payments[index];
        if (payment.method === "ON_ACCOUNT") { accountAmount += payment.amount; continue; }
        await tx.cashMovement.create({ data: { companyId: user.companyId, branchId: branch.id, cashRegisterId: cashRegister.id, userId: user.id, salePaymentId: paymentRows[index].id, kind: `SALE_${payment.method}`, amount: payment.amount, description: `Venda ${number}` } });
      }
      if (accountAmount > 0) {
        if (customerIsGeneric || !customerId) throw new Error("CUSTOMER_REQUIRED_FOR_CREDIT");
        const dueAt = new Date(); dueAt.setDate(dueAt.getDate() + 30);
        await tx.receivable.create({ data: { companyId: user.companyId, branchId: branch.id, customerId, saleId: sale.id, description: `Venda ${number}`, amount: accountAmount, dueAt } });
      }
      await tx.auditLog.create({ data: { companyId: user.companyId, branchId: branch.id, userId: user.id, action: "CREATE", entity: "Sale", entityId: sale.id } });
      return { id: sale.id, number, total, branchId: branch.id, createdAt: sale.createdAt };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ sale: result }, { status: 201 });
  } catch (error) {
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    const message = error instanceof Error ? error.message : "";
    if (duplicate) {
      const existing = await prisma.sale.findFirst({ where: { requestId: input.requestId, companyId: user.companyId, branchId: input.branchId }, select: { id: true, number: true, total: true } });
      if (existing) return NextResponse.json({ sale: { ...existing, total: Number(existing.total) }, repeated: true });
    }
    const errors: Record<string, string> = {
      BRANCH_UNAVAILABLE: "Unidade inativa ou inexistente.", CASH_REQUIRED: "Abra o caixa desta unidade antes de registrar vendas.",
      CUSTOMER_NOT_FOUND: "Cliente não encontrado.", ITEM_UNAVAILABLE: "Um dos itens não está ativo no catálogo.",
      DISCOUNT_TOO_HIGH: "O desconto não pode ultrapassar o subtotal.", TOTAL_INVALID: "O total da venda precisa ser maior que zero.",
      PAYMENT_TOTAL_MISMATCH: "A soma dos pagamentos precisa ser igual ao total da venda.",
      CUSTOMER_REQUIRED_FOR_CREDIT: "Selecione um cliente identificado para registrar uma venda fiada.",
    };
    const stockFailure = message.startsWith("INSUFFICIENT_STOCK:");
    return NextResponse.json({ error: stockFailure ? `Estoque insuficiente para ${message.split(":").slice(1).join(":")}.` : errors[message] ?? (duplicate ? "Conflito ao gerar o número da venda. Tente novamente." : "Não foi possível finalizar a venda.") }, { status: duplicate ? 409 : message === "CASH_REQUIRED" ? 409 : 400 });
  }
}
