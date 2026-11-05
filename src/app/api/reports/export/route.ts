import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, userCanSeeAllBranches } from "@/lib/session";

function quote(value: string | number) {
  const raw = String(value);
  const safe = typeof value === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
function day(value: string | null, fallback: Date) { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback; const parsed = new Date(`${value}T00:00:00.000Z`); return Number.isNaN(parsed.getTime()) ? fallback : parsed; }

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  if (!["SUPER_ADMIN", "GENERAL_MANAGER", "BRANCH_MANAGER", "FINANCE"].includes(user.role)) return NextResponse.json({ error: "Seu perfil não pode exportar relatórios financeiros." }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const allowedIds = userCanSeeAllBranches(user)
    ? (await prisma.branch.findMany({ where: { companyId: user.companyId, status: "ACTIVE", deletedAt: null }, select: { id: true } })).map(({ id }) => id)
    : user.branches.map(({ branch }) => branch).filter((branch) => branch.status === "ACTIVE" && !branch.deletedAt).map(({ id }) => id);
  const branchId = params.get("branchId");
  if (branchId && branchId !== "all" && !allowedIds.includes(branchId)) return NextResponse.json({ error: "Unidade fora do seu escopo." }, { status: 403 });
  const now = new Date(); const defaultFrom = new Date(now); defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29); defaultFrom.setUTCHours(0, 0, 0, 0);
  const from = day(params.get("from"), defaultFrom); const untilDay = day(params.get("to"), now); untilDay.setUTCHours(23, 59, 59, 999);
  const branches = await prisma.branch.findMany({ where: { companyId: user.companyId, id: { in: branchId && branchId !== "all" ? [branchId] : allowedIds } }, select: { id: true, name: true } });
  const [sales, workOrders, expenses] = await Promise.all([
    prisma.sale.findMany({ where: { companyId: user.companyId, branchId: { in: branches.map(({ id }) => id) }, status: "COMPLETED", createdAt: { gte: from, lte: untilDay } }, include: { branch: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.workOrder.findMany({ where: { companyId: user.companyId, branchId: { in: branches.map(({ id }) => id) }, status: "COMPLETED", completedAt: { gte: from, lte: untilDay } }, include: { branch: { select: { name: true } } }, orderBy: { completedAt: "asc" } }),
    prisma.expense.findMany({ where: { companyId: user.companyId, branchId: { in: branches.map(({ id }) => id) }, incurredAt: { gte: from, lte: untilDay } }, include: { branch: { select: { name: true } } }, orderBy: { incurredAt: "asc" } }),
  ]);
  const rows = [
    ["tipo", "data", "unidade", "documento", "descrição", "valor"],
    ...sales.map((item) => ["VENDA", item.createdAt.toISOString(), item.branch.name, String(item.number), "Venda no PDV", Number(item.total)]),
    ...workOrders.map((item) => ["ORDEM_DE_SERVICO", item.completedAt?.toISOString() ?? item.createdAt.toISOString(), item.branch.name, String(item.number), item.problem, Number(item.total)]),
    ...expenses.map((item) => ["DESPESA", item.incurredAt.toISOString(), item.branch.name, item.id, item.description, -Number(item.amount)]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(quote).join(";")).join("\r\n")}`;
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="relatorio-borracharia-${from.toISOString().slice(0, 10)}-${untilDay.toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
