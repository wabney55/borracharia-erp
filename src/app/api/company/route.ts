import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, userCanManage, userCanSeeAllBranches } from "@/lib/session";

const companySchema = z.object({
  legalName: z.string().trim().min(2).max(180),
  tradeName: z.string().trim().min(2).max(120),
  taxId: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  postalCode: z.string().trim().max(12).optional().or(z.literal("")),
  street: z.string().trim().max(160).optional().or(z.literal("")),
  number: z.string().trim().max(20).optional().or(z.literal("")),
  district: z.string().trim().max(100).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  state: z.string().trim().max(2).optional().or(z.literal("")),
});

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!userCanManage(user) || !userCanSeeAllBranches(user)) return NextResponse.json({ error: "Somente a gestão geral autorizada pode editar os dados da empresa." }, { status: 403 });
  const parsed = companySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira os dados obrigatórios." }, { status: 400 });
  const input = parsed.data;
  try {
    const company = await prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id: user.companyId },
        data: {
          legalName: input.legalName, tradeName: input.tradeName, taxId: input.taxId || null,
          email: input.email || null, phone: input.phone || null, postalCode: input.postalCode || null,
          street: input.street || null, number: input.number || null, district: input.district || null,
          city: input.city || null, state: input.state?.toUpperCase() || null,
        },
      });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, action: "UPDATE", entity: "Company", entityId: user.companyId } });
      return updated;
    });
    return NextResponse.json({ company });
  } catch (error) {
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    return NextResponse.json({ error: duplicate ? "Este CNPJ já está vinculado a outra empresa." : "Não foi possível atualizar a empresa." }, { status: duplicate ? 409 : 500 });
  }
}
