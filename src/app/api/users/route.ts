import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, userCanManage, userCanSeeAllBranches } from "@/lib/session";

const userSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(160),
  password: z.string().min(10).max(100),
  role: z.enum(["GENERAL_MANAGER", "BRANCH_MANAGER", "ATTENDANT", "STOCKKEEPER", "FINANCE"]),
  branchIds: z.array(z.string().uuid()).min(1),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const scope = userCanSeeAllBranches(user) ? undefined : { branches: { some: { branchId: { in: user.branches.map(({ branch }) => branch.id) } } } };
  const users = await prisma.user.findMany({
    where: { companyId: user.companyId, deletedAt: null, ...(scope ?? {}) },
    select: { id: true, name: true, email: true, role: true, status: true, lastLoginAt: true, branches: { include: { branch: { select: { id: true, name: true } } } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!userCanManage(actor)) return NextResponse.json({ error: "Você não tem permissão para cadastrar usuários." }, { status: 403 });
  const parsed = userSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Preencha os campos corretamente. A senha deve ter ao menos 10 caracteres." }, { status: 400 });
  const input = parsed.data;
  const branchScope = userCanSeeAllBranches(actor) ? undefined : { id: { in: actor.branches.map(({ branch }) => branch.id) } };
  const accessibleBranches = await prisma.branch.findMany({ where: { companyId: actor.companyId, id: { in: input.branchIds }, deletedAt: null, status: "ACTIVE", ...(branchScope ?? {}) }, select: { id: true } });
  if (accessibleBranches.length !== new Set(input.branchIds).size) return NextResponse.json({ error: "Selecione unidades ativas desta empresa." }, { status: 400 });
  const canAssignGeneralManager = actor.role === "SUPER_ADMIN";
  if (input.role === "GENERAL_MANAGER" && !canAssignGeneralManager) return NextResponse.json({ error: "Somente o administrador geral pode criar gerentes gerais." }, { status: 403 });
  const passwordHash = await hash(input.password, 12);
  try {
    const created = await prisma.$transaction(async (tx) => {
      const account = await tx.user.create({
        data: {
          companyId: actor.companyId,
          name: input.name,
          email: input.email.trim().toLowerCase(),
          passwordHash,
          role: input.role,
          defaultBranchId: input.branchIds[0],
          canSeeConsolidated: actor.role === "SUPER_ADMIN" && input.role === "GENERAL_MANAGER",
          branches: { create: input.branchIds.map((branchId) => ({ companyId: actor.companyId, branchId })) },
        },
        select: { id: true, name: true, email: true, role: true },
      });
      await tx.auditLog.create({ data: { companyId: actor.companyId, branchId: input.branchIds[0], userId: actor.id, action: "CREATE", entity: "User", entityId: account.id } });
      return account;
    });
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (error) {
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    return NextResponse.json({ error: duplicate ? "Esse e-mail já está cadastrado." : "Não foi possível cadastrar o usuário." }, { status: duplicate ? 409 : 500 });
  }
}

export async function PATCH(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!userCanManage(actor)) return NextResponse.json({ error: "Você não tem permissão para alterar usuários." }, { status: 403 });
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(["ACTIVE", "INACTIVE"]) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
  if (parsed.data.id === actor.id && parsed.data.status === "INACTIVE") return NextResponse.json({ error: "Não é possível desativar a própria conta." }, { status: 409 });
  const existing = await prisma.user.findFirst({ where: { id: parsed.data.id, companyId: actor.companyId, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  if (!userCanSeeAllBranches(actor)) {
    const userBranches = await prisma.userBranch.findMany({ where: { userId: existing.id }, select: { branchId: true } });
    const authorized = new Set(actor.branches.map(({ branch }) => branch.id));
    if (!userBranches.length || userBranches.some(({ branchId }) => !authorized.has(branchId))) return NextResponse.json({ error: "Você não pode alterar um usuário de outra unidade." }, { status: 403 });
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: existing.id }, data: { status: parsed.data.status, sessionVersion: { increment: 1 } } }),
    prisma.auditLog.create({ data: { companyId: actor.companyId, branchId: existing.defaultBranchId, userId: actor.id, action: "UPDATE", entity: "User", entityId: existing.id, details: { status: parsed.data.status } } }),
  ]);
  return NextResponse.json({ status: parsed.data.status });
}
