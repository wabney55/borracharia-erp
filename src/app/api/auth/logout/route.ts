import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentUser, recordAudit } from "@/lib/session";

export async function POST() {
  const user = await getCurrentUser();
  if (user) await recordAudit({ companyId: user.companyId, branchId: user.defaultBranchId, userId: user.id, action: "LOGOUT", entity: "User", entityId: user.id });
  await clearSessionCookie();
  return NextResponse.json({ ok: true, redirectTo: "/login" });
}
