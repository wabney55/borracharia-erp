import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "borracharia_session";
const SESSION_SECONDS = 60 * 60 * 8;

type SessionPayload = { userId: string; sessionVersion: number; expiresAt: number };

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET deve ter ao menos 32 caracteres.");
  return value;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(userId: string, sessionVersion: number) {
  const payload: SessionPayload = { userId, sessionVersion, expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function readSessionToken(token?: string): SessionPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = Buffer.from(sign(encoded));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.userId || !Number.isInteger(payload.sessionVersion) || payload.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function issueSessionCookie(userId: string, sessionVersion: number) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, createSessionToken(userId, sessionVersion), {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  const jar = await cookies();
  const payload = readSessionToken(jar.get(COOKIE_NAME)?.value);
  if (!payload) return null;
  const user = await prisma.user.findFirst({
    where: { id: payload.userId, status: "ACTIVE", deletedAt: null },
    include: {
      company: true,
      defaultBranch: true,
      branches: { include: { branch: true } },
    },
  });
  if (!user || user.sessionVersion !== payload.sessionVersion) return null;
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function userCanManage(user: { role: string }) {
  return user.role === "SUPER_ADMIN" || user.role === "GENERAL_MANAGER";
}

export function userCanSeeAllBranches(user: { role: string; canSeeConsolidated: boolean }) {
  return user.role === "SUPER_ADMIN" || user.canSeeConsolidated;
}

export async function recordAudit(input: {
  companyId: string;
  branchId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: object;
  ipAddress?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      companyId: input.companyId,
      branchId: input.branchId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      details: input.details ? JSON.parse(JSON.stringify(input.details)) : undefined,
      ipAddress: input.ipAddress ?? null,
    },
  });
}
