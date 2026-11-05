import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, recordAudit, userCanManage } from "@/lib/session";

const customerSchema = z.object({
  name: z.string().trim().min(2).max(160),
  taxId: z.string().trim().max(20).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  postalCode: z.string().trim().max(12).optional().or(z.literal("")),
  street: z.string().trim().max(160).optional().or(z.literal("")),
  number: z.string().trim().max(20).optional().or(z.literal("")),
  district: z.string().trim().max(100).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  state: z.string().trim().max(2).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

function normalizeTaxId(value?: string) { return value?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() || null; }

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const customers = await prisma.customer.findMany({
    where: { companyId: user.companyId, deletedAt: null, ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { taxId: { contains: normalizeTaxId(query) ?? query } }, { phone: { contains: query } }, { whatsapp: { contains: query } }] } : {}) },
    orderBy: [{ isGeneric: "desc" }, { name: "asc" }], take: 250,
  });
  return NextResponse.json({ customers });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = customerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira o nome e os dados informados." }, { status: 400 });
  const input = parsed.data;
  const taxId = normalizeTaxId(input.taxId ?? undefined);
  if (taxId) {
    const existing = await prisma.customer.findFirst({ where: { companyId: user.companyId, taxId, deletedAt: null } });
    if (existing) return NextResponse.json({ error: `Este documento já pertence ao cadastro de ${existing.name}.`, customerId: existing.id }, { status: 409 });
  }
  try {
    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({ data: {
        companyId: user.companyId, name: input.name, taxId,
        phone: input.phone || null, whatsapp: input.whatsapp || null, email: input.email?.toLowerCase() || null,
        postalCode: input.postalCode || null, street: input.street || null, number: input.number || null,
        district: input.district || null, city: input.city || null, state: input.state?.toUpperCase() || null, notes: input.notes || null,
      } });
      await tx.auditLog.create({ data: { companyId: user.companyId, branchId: user.defaultBranchId, userId: user.id, action: "CREATE", entity: "Customer", entityId: created.id } });
      return created;
    });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    return NextResponse.json({ error: duplicate ? "Já existe um cliente com esse documento." : "Não foi possível cadastrar o cliente." }, { status: duplicate ? 409 : 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = z.string().uuid().safeParse(body?.id);
  const parsed = customerSchema.safeParse(body);
  if (!id.success || !parsed.success) return NextResponse.json({ error: "Confira o cadastro do cliente." }, { status: 400 });
  const input = parsed.data;
  const taxId = normalizeTaxId(input.taxId ?? undefined);
  if (taxId) {
    const duplicate = await prisma.customer.findFirst({ where: { companyId: user.companyId, taxId, id: { not: id.data }, deletedAt: null }, select: { id: true } });
    if (duplicate) return NextResponse.json({ error: "Este documento já está vinculado a outro cliente." }, { status: 409 });
  }
  try {
    const customer = await prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({ where: { id: id.data, companyId: user.companyId, deletedAt: null }, data: {
        name: input.name, taxId, phone: input.phone || null, whatsapp: input.whatsapp || null, email: input.email?.toLowerCase() || null,
        postalCode: input.postalCode || null, street: input.street || null, number: input.number || null,
        district: input.district || null, city: input.city || null, state: input.state?.toUpperCase() || null, notes: input.notes || null,
      } });
      await tx.auditLog.create({ data: { companyId: user.companyId, branchId: user.defaultBranchId, userId: user.id, action: "UPDATE", entity: "Customer", entityId: updated.id } });
      return updated;
    });
    return NextResponse.json({ customer });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar o cliente." }, { status: 404 });
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!userCanManage(user)) return NextResponse.json({ error: "Somente a gestão pode inativar clientes." }, { status: 403 });
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
  const customer = await prisma.customer.findFirst({ where: { id: parsed.data.id, companyId: user.companyId, deletedAt: null } });
  if (!customer || customer.isGeneric) return NextResponse.json({ error: customer?.isGeneric ? "O cliente genérico não pode ser removido." : "Cliente não encontrado." }, { status: 404 });
  await prisma.$transaction([
    prisma.customer.update({ where: { id: customer.id }, data: { deletedAt: new Date() } }),
    prisma.auditLog.create({ data: { companyId: user.companyId, branchId: user.defaultBranchId, userId: user.id, action: "DELETE", entity: "Customer", entityId: customer.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
