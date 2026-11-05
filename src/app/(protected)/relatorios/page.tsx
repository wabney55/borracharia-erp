import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Download, FileBarChart, ReceiptText, TrendingDown, Wrench } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser, userCanSeeAllBranches } from "@/lib/session";
import { ReportFilters } from "@/components/report-filters";
import { PrintButton } from "@/components/print-button";

function dateValue(value: string | undefined, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ branchId?: string; from?: string; to?: string }> }) {
  const user = await requireUser(); const params = await searchParams;
  if (!["SUPER_ADMIN", "GENERAL_MANAGER", "BRANCH_MANAGER", "FINANCE"].includes(user.role)) redirect("/dashboard");
  const branches = userCanSeeAllBranches(user)
    ? await prisma.branch.findMany({ where: { companyId: user.companyId, status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : user.branches.map(({ branch }) => branch).filter((branch) => branch.status === "ACTIVE" && !branch.deletedAt).map(({ id, name }) => ({ id, name }));
  const allowedIds = branches.map(({ id }) => id);
  const branchId = params.branchId === "all" && userCanSeeAllBranches(user) ? "all" : allowedIds.includes(params.branchId ?? "") ? params.branchId! : (allowedIds.length === 1 ? allowedIds[0] : "all");
  const selectedIds = branchId === "all" ? allowedIds : [branchId];
  const now = new Date(); const fallbackFrom = new Date(now); fallbackFrom.setUTCDate(fallbackFrom.getUTCDate() - 29); fallbackFrom.setUTCHours(0, 0, 0, 0);
  const from = dateValue(params.from, fallbackFrom); const until = dateValue(params.to, now); until.setUTCHours(23, 59, 59, 999);
  const [sales, orders, expenses, byBranch] = await Promise.all([
    prisma.sale.findMany({ where: { companyId: user.companyId, branchId: { in: selectedIds }, status: "COMPLETED", createdAt: { gte: from, lte: until } }, select: { total: true, branchId: true } }),
    prisma.workOrder.findMany({ where: { companyId: user.companyId, branchId: { in: selectedIds }, status: "COMPLETED", completedAt: { gte: from, lte: until } }, select: { total: true, branchId: true } }),
    prisma.expense.findMany({ where: { companyId: user.companyId, branchId: { in: selectedIds }, incurredAt: { gte: from, lte: until } }, select: { amount: true, branchId: true } }),
    prisma.sale.groupBy({ by: ["branchId"], where: { companyId: user.companyId, branchId: { in: selectedIds }, status: "COMPLETED", createdAt: { gte: from, lte: until } }, _sum: { total: true }, _count: { _all: true } }),
  ]);
  const salesTotal = sales.reduce((sum, item) => sum + Number(item.total), 0);
  const ordersTotal = orders.reduce((sum, item) => sum + Number(item.total), 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const branchSummary = branches.filter((branch) => selectedIds.includes(branch.id)).map((branch) => ({ ...branch, sales: byBranch.find((item) => item.branchId === branch.id)?._sum.total ? Number(byBranch.find((item) => item.branchId === branch.id)?._sum.total) : 0, count: byBranch.find((item) => item.branchId === branch.id)?._count._all ?? 0, services: orders.filter((order) => order.branchId === branch.id).length, expenses: expenses.filter((item) => item.branchId === branch.id).reduce((sum, item) => sum + Number(item.amount), 0) }));
  const query = new URLSearchParams({ from: from.toISOString().slice(0, 10), to: until.toISOString().slice(0, 10), branchId });

  return <div className="workspace-page">
    <div className="page-heading"><div><div className="eyebrow page-eyebrow"><span className="status-dot" /> VISÃO DO PERÍODO</div><h1>Relatórios</h1><p>Vendas, ordens concluídas e despesas das unidades autorizadas.</p></div><div className="report-actions"><Link className="button button-quiet" href={`/api/reports/export?${query.toString()}`}><Download size={15} /> Exportar CSV</Link><PrintButton /></div></div>
    <ReportFilters branches={branches} branchId={branchId} from={from.toISOString().slice(0, 10)} to={until.toISOString().slice(0, 10)} />
    <div className="workspace-summary-grid"><div className="workspace-summary-card"><span className="summary-icon summary-green"><ReceiptText size={16} /></span><div><small>Faturamento em vendas</small><b>{currency.format(salesTotal)}</b></div></div><div className="workspace-summary-card"><span className="summary-icon summary-blue"><Wrench size={16} /></span><div><small>Ordens concluídas</small><b>{currency.format(ordersTotal)}</b></div></div><div className="workspace-summary-card"><span className="summary-icon summary-orange"><TrendingDown size={16} /></span><div><small>Despesas registradas</small><b>{currency.format(expenseTotal)}</b></div></div></div>
    <section className="panel data-panel sales-history-panel"><div className="data-panel-heading"><div><span className="panel-kicker">COMPARATIVO</span><h2>Desempenho por unidade <span className="heading-count">{branchSummary.length}</span></h2></div><span className="cash-branch-select"><Building2 size={15} /> {from} — {until.toISOString().slice(0, 10)}</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>UNIDADE</th><th>VENDAS</th><th>ORDENS CONCLUÍDAS</th><th className="price-col">FATURAMENTO</th><th className="price-col">DESPESAS</th></tr></thead><tbody>{branchSummary.map((branch) => <tr key={branch.id}><td><b>{branch.name}</b></td><td>{branch.count}</td><td>{branch.services}</td><td className="price-col"><b>{currency.format(branch.sales + orders.filter((order) => order.branchId === branch.id).reduce((sum, order) => sum + Number(order.total), 0))}</b></td><td className="price-col">{currency.format(branch.expenses)}</td></tr>)}</tbody></table></div><div className="table-footer"><span>Vendas por data de registro; OS por conclusão; despesas por lançamento.</span><span>Relatório operacional inicial</span></div></section>
    <div className="workspace-footnote"><FileBarChart size={14} /> Faturamento não representa lucro: este relatório ainda não desconta custo de produtos, taxas de cartão ou tributos.</div>
  </div>;
}
