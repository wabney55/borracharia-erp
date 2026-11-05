import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, issueSessionCookie } from "@/lib/session";

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(100),
}).refine((value) => value.currentPassword !== value.newPassword, { path: ["newPassword"], message: "A nova senha precisa ser diferente da atual." });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const parsed = passwordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A nova senha deve ter pelo menos 12 caracteres e ser diferente da atual." }, { status: 400 });
  if (!(await compare(parsed.data.currentPassword, user.passwordHash))) return NextResponse.json({ error: "A senha atual não confere." }, { status: 401 });
  const passwordHash = await hash(parsed.data.newPassword, 12);
  const updated = await prisma.$transaction(async (tx) => {
    const account = await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } } });
    await tx.auditLog.create({ data: { companyId: user.companyId, branchId: user.defaultBranchId, userId: user.id, action: "UPDATE", entity: "User", entityId: user.id, details: { changedField: "password" } } });
    return account;
  });
  await issueSessionCookie(user.id, updated.sessionVersion);
  return NextResponse.json({ ok: true });
}
