import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, userCanManage, userCanSeeAllBranches } from "@/lib/session";

const productInput = z.object({
  kind: z.literal("PRODUCT"), barcode: z.string().trim().max(80).optional().or(z.literal("")),
  name: z.string().trim().min(2).max(160), description: z.string().trim().max(1000).optional().or(z.literal("")),
  category: z.string().trim().max(100).optional().or(z.literal("")), supplier: z.string().trim().max(160).optional().or(z.literal("")),
  unit: z.string().trim().min(1).max(10).default("UN"), cost: z.coerce.number().min(0).max(99999999),
  salePrice: z.coerce.number().min(0).max(99999999), minimumStock: z.coerce.number().min(0).max(99999999).default(0),
});
const serviceInput = z.object({
  kind: z.literal("SERVICE"), name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().or(z.literal("")), category: z.string().trim().max(100).optional().or(z.literal("")),
  price: z.coerce.number().min(0).max(99999999),
});
const createInput = z.discriminatedUnion("kind", [productInput, serviceInput]);
const updateInput = z.discriminatedUnion("kind", [productInput.extend({ id: z.string().uuid() }), serviceInput.extend({ id: z.string().uuid() })]);

async function categoryFor(tx: Prisma.TransactionClient, companyId: string, name: string | undefined, kind: string) {
  if (!name) return null;
  return tx.category.upsert({ where: { companyId_name_kind: { companyId, name, kind } }, update: {}, create: { companyId, name, kind } });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const branchIds = userCanSeeAllBranches(user)
    ? (await prisma.branch.findMany({ where: { companyId: user.companyId, status: "ACTIVE", deletedAt: null }, select: { id: true } })).map(({ id }) => id)
    : user.branches.map(({ branch }) => branch).filter((branch) => branch.status === "ACTIVE" && !branch.deletedAt).map(({ id }) => id);
  const [products, services, categories, suppliers] = await Promise.all([
    prisma.product.findMany({ where: { companyId: user.companyId, deletedAt: null }, include: { category: { select: { name: true } }, supplier: { select: { name: true } }, inventory: { where: { branchId: { in: branchIds } }, select: { quantity: true } } }, orderBy: { name: "asc" }, take: 500 }),
    prisma.service.findMany({ where: { companyId: user.companyId }, include: { category: { select: { name: true } } }, orderBy: { name: "asc" }, take: 500 }),
    prisma.category.findMany({ where: { companyId: user.companyId }, select: { id: true, name: true, kind: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { companyId: user.companyId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 250 }),
  ]);
  const canSeeCost = userCanManage(user) || user.role === "FINANCE" || user.role === "STOCKKEEPER";
  return NextResponse.json({
    products: products.map((item) => ({ id: item.id, code: item.code, barcode: item.barcode, name: item.name, description: item.description, unit: item.unit, cost: canSeeCost ? Number(item.cost) : null, salePrice: Number(item.salePrice), minimumStock: Number(item.minimumStock), quantity: item.inventory.reduce((sum, stock) => sum + Number(stock.quantity), 0), status: item.status, category: item.category?.name ?? null, supplier: item.supplier?.name ?? null })),
    services: services.map((item) => ({ id: item.id, code: item.code, name: item.name, description: item.description, price: Number(item.price), status: item.status, category: item.category?.name ?? null })),
    categories, suppliers,
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!userCanManage(user)) return NextResponse.json({ error: "Somente a gestão geral pode alterar o catálogo central." }, { status: 403 });
  const parsed = createInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira o nome e os valores do cadastro." }, { status: 400 });
  const input = parsed.data;
  try {
    const created = await prisma.$transaction(async (tx) => {
      if (input.kind === "PRODUCT") {
        const [{ value: codeNumber }] = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('product_code_seq') AS value`;
        const code = `PROD-${codeNumber.toString().padStart(6, "0")}`;
        const [category, supplier] = await Promise.all([
          categoryFor(tx, user.companyId, input.category || undefined, "PRODUCT"),
          input.supplier ? tx.supplier.upsert({ where: { companyId_name: { companyId: user.companyId, name: input.supplier } }, update: {}, create: { companyId: user.companyId, name: input.supplier } }) : null,
        ]);
        const product = await tx.product.create({ data: {
          companyId: user.companyId, categoryId: category?.id ?? null, supplierId: supplier?.id ?? null,
          code, barcode: input.barcode || null, name: input.name, description: input.description || null,
          unit: input.unit.toUpperCase(), cost: input.cost, salePrice: input.salePrice, minimumStock: input.minimumStock,
        } });
        const activeBranches = await tx.branch.findMany({ where: { companyId: user.companyId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
        if (activeBranches.length) await tx.inventoryBalance.createMany({ data: activeBranches.map(({ id }) => ({ companyId: user.companyId, branchId: id, productId: product.id, quantity: 0, averageCost: input.cost })) });
        await tx.auditLog.create({ data: { companyId: user.companyId, branchId: user.defaultBranchId, userId: user.id, action: "CREATE", entity: "Product", entityId: product.id } });
        return { kind: "PRODUCT", item: { ...product, cost: Number(product.cost), salePrice: Number(product.salePrice), minimumStock: Number(product.minimumStock) } };
      }
      const [{ value: codeNumber }] = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('service_code_seq') AS value`;
      const code = `SERV-${codeNumber.toString().padStart(6, "0")}`;
      const category = await categoryFor(tx, user.companyId, input.category || undefined, "SERVICE");
      const service = await tx.service.create({ data: { companyId: user.companyId, categoryId: category?.id ?? null, code, name: input.name, description: input.description || null, price: input.price } });
      await tx.auditLog.create({ data: { companyId: user.companyId, branchId: user.defaultBranchId, userId: user.id, action: "CREATE", entity: "Service", entityId: service.id } });
      return { kind: "SERVICE", item: { ...service, price: Number(service.price) } };
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    return NextResponse.json({ error: duplicate ? "Este código, código de barras ou nome já está cadastrado." : "Não foi possível cadastrar o item." }, { status: duplicate ? 409 : 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!userCanManage(user)) return NextResponse.json({ error: "Somente a gestão geral pode alterar o catálogo central." }, { status: 403 });
  const parsed = updateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira os dados do item." }, { status: 400 });
  const input = parsed.data;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (input.kind === "PRODUCT") {
        const [category, supplier] = await Promise.all([
          categoryFor(tx, user.companyId, input.category || undefined, "PRODUCT"),
          input.supplier ? tx.supplier.upsert({ where: { companyId_name: { companyId: user.companyId, name: input.supplier } }, update: {}, create: { companyId: user.companyId, name: input.supplier } }) : null,
        ]);
        const item = await tx.product.update({ where: { id: input.id, companyId: user.companyId, deletedAt: null }, data: {
          categoryId: category?.id ?? null, supplierId: supplier?.id ?? null, barcode: input.barcode || null,
          name: input.name, description: input.description || null, unit: input.unit.toUpperCase(), cost: input.cost, salePrice: input.salePrice, minimumStock: input.minimumStock,
        } });
        await tx.auditLog.create({ data: { companyId: user.companyId, branchId: user.defaultBranchId, userId: user.id, action: "UPDATE", entity: "Product", entityId: item.id } });
        return { kind: "PRODUCT", item: { ...item, cost: Number(item.cost), salePrice: Number(item.salePrice), minimumStock: Number(item.minimumStock) } };
      }
      const category = await categoryFor(tx, user.companyId, input.category || undefined, "SERVICE");
      const item = await tx.service.update({ where: { id: input.id, companyId: user.companyId }, data: { categoryId: category?.id ?? null, name: input.name, description: input.description || null, price: input.price } });
      await tx.auditLog.create({ data: { companyId: user.companyId, branchId: user.defaultBranchId, userId: user.id, action: "UPDATE", entity: "Service", entityId: item.id } });
      return { kind: "SERVICE", item: { ...item, price: Number(item.price) } };
    });
    return NextResponse.json(updated);
  } catch (error) {
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    return NextResponse.json({ error: duplicate ? "Este código ou código de barras já está em uso." : "Não foi possível atualizar o item." }, { status: duplicate ? 409 : 404 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!userCanManage(user)) return NextResponse.json({ error: "Somente a gestão geral pode inativar itens do catálogo." }, { status: 403 });
  const parsed = z.object({ id: z.string().uuid(), kind: z.enum(["PRODUCT", "SERVICE"]) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Item inválido." }, { status: 400 });
  const status = parsed.data.kind === "PRODUCT"
    ? await prisma.product.findFirst({ where: { id: parsed.data.id, companyId: user.companyId, deletedAt: null }, select: { status: true } })
    : await prisma.service.findFirst({ where: { id: parsed.data.id, companyId: user.companyId }, select: { status: true } });
  if (!status) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
  const nextStatus = status.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  await prisma.$transaction(async (tx) => {
    if (parsed.data.kind === "PRODUCT") await tx.product.update({ where: { id: parsed.data.id }, data: { status: nextStatus } });
    else await tx.service.update({ where: { id: parsed.data.id }, data: { status: nextStatus } });
    await tx.auditLog.create({ data: { companyId: user.companyId, branchId: user.defaultBranchId, userId: user.id, action: nextStatus === "ACTIVE" ? "UPDATE" : "DELETE", entity: parsed.data.kind === "PRODUCT" ? "Product" : "Service", entityId: parsed.data.id, details: { status: nextStatus } } });
  });
  return NextResponse.json({ status: nextStatus });
}
