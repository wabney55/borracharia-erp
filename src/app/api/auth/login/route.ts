import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { issueSessionCookie, recordAudit } from "@/lib/session";

const loginSchema = z.object({ email: z.string().email().max(160), password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Informe e-mail e senha válidos." }, { status: 400 });

  const email = parsed.data.email.trim().toLowerCase();
  const candidates = await prisma.user.findMany({
    where: { email, status: "ACTIVE", deletedAt: null },
    include: { branches: true, defaultBranch: true },
    take: 10,
  });
  let user = null as (typeof candidates)[number] | null;
  for (const candidate of candidates) {
    if (await compare(parsed.data.password, candidate.passwordHash)) {
      user = candidate;
      break;
    }
  }
  if (!user) return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });

  const updatedUser = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() }, select: { sessionVersion: true } });
  await issueSessionCookie(user.id, updatedUser.sessionVersion);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await recordAudit({ companyId: user.companyId, branchId: user.defaultBranchId, userId: user.id, action: "LOGIN", entity: "User", entityId: user.id, ipAddress: forwarded });
  return NextResponse.json({ ok: true, redirectTo: "/dashboard" });
}
