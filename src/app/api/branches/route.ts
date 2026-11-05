import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, recordAudit, userCanManage, userCanSeeAllBranches } from "@/lib/session";

const branchSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(120),
  taxId: z.string().trim().max(20).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  manager: z.string().trim().max(120).optional().or(z.literal("")),
  postalCode: z.string().trim().max(12).optional().or(z.literal("")),
  street: z.string().trim().max(160).optional().or(z.literal("")),
  number: z.string().trim().max(20).optional().or(z.literal("")),
  district: z.string().trim().max(100).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  state: z.string().trim().max(2).optional().or(z.literal("")),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const where = userCanSeeAllBranches(user)
    ? { companyId: user.companyId, deletedAt: null }
    : { companyId: user.companyId, deletedAt: null, id: { in: user.branches.map(({ branch }) => branch.id) } };
  const branches = await prisma.branch.findMany({ where, orderBy: [{ isHeadquarters: "desc" }, { name: "asc" }] });
  return NextResponse.json({ branches });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!userCanManage(user)) return NextResponse.json({ error: "Você não tem permissão para cadastrar unidades." }, { status: 403 });
  if (!userCanSeeAllBranches(user)) return NextResponse.json({ error: "Somente a gestão geral pode criar novas unidades." }, { status: 403 });
  const parsed = branchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira os campos obrigatórios." }, { status: 400 });
  const input = parsed.data;
  try {
    const branch = await prisma.$transaction(async (tx) => {
      const created = await tx.branch.create({
        data: {
          companyId: user.companyId,
          code: input.code.toUpperCase(),
          name: input.name,
          taxId: input.taxId || null,
          phone: input.phone || null,
          manager: input.manager || null,
          postalCode: input.postalCode || null,
          street: input.street || null,
          number: input.number || null,
          district: input.district || null,
          city: input.city || null,
          state: input.state?.toUpperCase() || null,
        },
      });
      const products = await tx.product.findMany({ where: { companyId: user.companyId, status: "ACTIVE", deletedAt: null }, select: { id: true, cost: true } });
      if (products.length) await tx.inventoryBalance.createMany({ data: products.map((product) => ({ companyId: user.companyId, branchId: created.id, productId: product.id, quantity: 0, averageCost: product.cost })) });
      await tx.auditLog.create({ data: { companyId: user.companyId, branchId: created.id, userId: user.id, action: "CREATE", entity: "Branch", entityId: created.id } });
      return created;
    });
    return NextResponse.json({ branch }, { status: 201 });
  } catch (error) {
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    return NextResponse.json({ error: duplicate ? "Já existe uma unidade com esse código." : "Não foi possível cadastrar a unidade." }, { status: duplicate ? 409 : 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!userCanManage(user)) return NextResponse.json({ error: "Você não tem permissão para editar unidades." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const id = z.string().uuid().safeParse(body?.id);
  const parsed = branchSchema.safeParse(body);
  if (!id.success || !parsed.success) return NextResponse.json({ error: "Confira os campos da unidade." }, { status: 400 });
  if (!userCanSeeAllBranches(user) && !user.branches.some(({ branch }) => branch.id === id.data)) return NextResponse.json({ error: "Esta unidade não está no seu escopo de acesso." }, { status: 403 });
  try {
    const branch = await prisma.$transaction(async (tx) => {
      const updated = await tx.branch.update({
        where: { id: id.data, companyId: user.companyId, deletedAt: null },
        data: {
          code: parsed.data.code.toUpperCase(), name: parsed.data.name, taxId: parsed.data.taxId || null,
          phone: parsed.data.phone || null, manager: parsed.data.manager || null,
          postalCode: parsed.data.postalCode || null, street: parsed.data.street || null,
          number: parsed.data.number || null, district: parsed.data.district || null,
          city: parsed.data.city || null, state: parsed.data.state?.toUpperCase() || null,
        },
      });
      await tx.auditLog.create({ data: { companyId: user.companyId, branchId: updated.id, userId: user.id, action: "UPDATE", entity: "Branch", entityId: updated.id } });
      return updated;
    });
    return NextResponse.json({ branch });
  } catch (error) {
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    const missing = typeof error === "object" && error !== null && "code" in error && error.code === "P2025";
    return NextResponse.json({ error: duplicate ? "Já existe uma unidade com esse código." : missing ? "Unidade não encontrada." : "Não foi possível atualizar a unidade." }, { status: duplicate ? 409 : missing ? 404 : 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!userCanManage(user)) return NextResponse.json({ error: "Você não tem permissão para alterar unidades." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const parsed = z.object({ id: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Unidade inválida." }, { status: 400 });
  if (!userCanSeeAllBranches(user) && !user.branches.some(({ branch }) => branch.id === parsed.data.id)) return NextResponse.json({ error: "Esta unidade não está no seu escopo de acesso." }, { status: 403 });
  const existing = await prisma.branch.findFirst({ where: { id: parsed.data.id, companyId: user.companyId, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "Unidade não encontrada." }, { status: 404 });
  if (existing.isHeadquarters) return NextResponse.json({ error: "A matriz não pode ser desativada." }, { status: 409 });
  const status = existing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  await prisma.$transaction([
    prisma.branch.update({ where: { id: existing.id }, data: { status } }),
    prisma.auditLog.create({ data: { companyId: user.companyId, branchId: existing.id, userId: user.id, action: status === "ACTIVE" ? "UPDATE" : "DELETE", entity: "Branch", entityId: existing.id, details: { status } } }),
  ]);
  return NextResponse.json({ status });
}
