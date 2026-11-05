import { Activity, Banknote, Boxes, BriefcaseBusiness, Building2, CircleDollarSign, ClipboardCheck, Clock3, PackageX, TrendingUp, UsersRound, Warehouse } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser, userCanSeeAllBranches } from "@/lib/session";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

function money(value: number | { toNumber(): number } | null | undefined) {
  return currency.format(typeof value === "number" ? value : value?.toNumber() ?? 0);
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const user = await requireUser();
  const canViewFinancialInfo = ["SUPER_ADMIN", "GENERAL_MANAGER", "BRANCH_MANAGER", "FINANCE"].includes(user.role);
  const branches = userCanSeeAllBranches(user)
    ? await prisma.branch.findMany({ where: { companyId: user.companyId, deletedAt: null, status: "ACTIVE" }, orderBy: { name: "asc" } })
    : user.branches.map(({ branch }) => branch).filter((branch) => branch.status === "ACTIVE" && !branch.deletedAt);
  const query = await searchParams;
  const selected = query.branch ? branches.find((branch) => branch.id === query.branch) : null;
  const scope = selected ? [selected.id] : branches.map((branch) => branch.id);
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const weekStart = new Date(startToday);
  weekStart.setDate(weekStart.getDate() - 6);

  const [salesToday, saleCount, openOrders, openRegisters, pendingPayables, pendingReceivables, branchSales, weekSales, lowStockRows, auditLogs] = await Promise.all([
    prisma.sale.aggregate({ where: { companyId: user.companyId, branchId: { in: scope }, status: "COMPLETED", createdAt: { gte: startToday } }, _sum: { total: true } }),
    prisma.sale.count({ where: { companyId: user.companyId, branchId: { in: scope }, status: "COMPLETED", createdAt: { gte: startToday } } }),
    prisma.workOrder.count({ where: { companyId: user.companyId, branchId: { in: scope }, status: { notIn: ["COMPLETED", "CANCELED"] } } }),
    prisma.cashRegister.count({ where: { companyId: user.companyId, branchId: { in: scope }, status: "OPEN" } }),
    prisma.payable.count({ where: { companyId: user.companyId, branchId: { in: scope }, status: { in: ["PENDING", "PARTIAL"] } } }),
    prisma.receivable.count({ where: { companyId: user.companyId, branchId: { in: scope }, status: { in: ["PENDING", "PARTIAL"] } } }),
    prisma.sale.groupBy({ by: ["branchId"], where: { companyId: user.companyId, branchId: { in: scope }, status: "COMPLETED", createdAt: { gte: weekStart } }, _sum: { total: true }, _count: { id: true } }),
    prisma.sale.findMany({ where: { companyId: user.companyId, branchId: { in: scope }, status: "COMPLETED", createdAt: { gte: weekStart } }, select: { total: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 2000 }),
    prisma.inventoryBalance.findMany({ where: { companyId: user.companyId, branchId: { in: scope } }, select: { quantity: true, product: { select: { name: true, minimumStock: true } }, branch: { select: { name: true } } }, take: 500 }),
    prisma.auditLog.findMany({ where: { companyId: user.companyId, branchId: { in: scope } }, include: { user: { select: { name: true } }, branch: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    const key = date.toLocaleDateString("pt-BR");
    const total = weekSales.filter((sale) => sale.createdAt.toLocaleDateString("pt-BR") === key).reduce((sum, sale) => sum + Number(sale.total), 0);
    return { date, total };
  });
  const maxDaily = Math.max(...daily.map((item) => item.total), 1);
  const orderedBranches = branches.filter((branch) => scope.includes(branch.id)).map((branch) => {
    const row = branchSales.find((item) => item.branchId === branch.id);
    return { id: branch.id, name: branch.name, code: branch.code, total: Number(row?._sum.total ?? 0), sales: row?._count.id ?? 0 };
  }).sort((a, b) => b.total - a.total);
  const lowStock = lowStockRows.filter((row) => Number(row.product.minimumStock) > 0 && Number(row.quantity) <= Number(row.product.minimumStock));
  const totalPending = pendingPayables + pendingReceivables;
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date());
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const scopedUserCount = await prisma.user.count({ where: { companyId: user.companyId, deletedAt: null, status: "ACTIVE", branches: { some: { branchId: { in: scope } } } } });

  return <div className="dashboard-page">
    <div className="page-heading dashboard-heading">
      <div><div className="eyebrow page-eyebrow"><span className="status-dot" /> PAINEL DE CONTROLE</div><h1>{greeting}, {user.name.split(" ")[0]} <span className="wave">✳</span></h1><p>Acompanhe o que está acontecendo na sua operação.</p></div>
      <div className="date-chip"><Clock3 size={15} /><span>{monthLabel}</span></div>
    </div>
    <div className="dashboard-scope-note"><span className="scope-dot" /> Exibindo <b>{selected ? selected.name : scope.length === 1 ? branches.find((branch) => branch.id === scope[0])?.name ?? "unidade autorizada" : "todas as unidades autorizadas"}</b><span className="scope-separator">·</span><span>Hoje, {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(new Date())}</span></div>

    <section className="stat-grid" aria-label="Indicadores do dia">
      <article className="stat-card stat-card-highlight"><div className="stat-card-top"><span>Faturamento hoje</span><span className="stat-icon orange"><CircleDollarSign size={18} /></span></div><div className="stat-value">{canViewFinancialInfo ? money(salesToday._sum.total) : "Restrito"}</div><div className="stat-foot">{canViewFinancialInfo ? <><span className="stat-foot-accent"><TrendingUp size={13} /> {saleCount} venda{saleCount === 1 ? "" : "s"}</span><span>realizadas hoje</span></> : <span>Disponível para gestão e financeiro</span>}</div><div className="stat-card-accent" /></article>
      <article className="stat-card"><div className="stat-card-top"><span>Ordens em aberto</span><span className="stat-icon blue"><ClipboardCheck size={18} /></span></div><div className="stat-value">{openOrders}</div><div className="stat-foot"><span className="stat-foot-neutral">Acompanhe</span><span>os serviços pendentes</span></div></article>
      <article className="stat-card"><div className="stat-card-top"><span>Caixas abertos</span><span className="stat-icon green"><Banknote size={18} /></span></div><div className="stat-value">{openRegisters}</div><div className="stat-foot"><span className="stat-foot-neutral">Por unidade</span><span>em operação</span></div></article>
      <article className="stat-card"><div className="stat-card-top"><span>Contas pendentes</span><span className="stat-icon violet"><BriefcaseBusiness size={18} /></span></div><div className="stat-value">{canViewFinancialInfo ? totalPending : "Restrito"}</div><div className="stat-foot">{canViewFinancialInfo ? <><span className="stat-foot-neutral">{pendingPayables} a pagar</span><span>· {pendingReceivables} a receber</span></> : <span>Disponível para gestão e financeiro</span>}</div></article>
    </section>

    {canViewFinancialInfo ? <section className="dashboard-main-grid">
      <article className="panel sales-panel">
        <div className="panel-heading"><div><span className="panel-kicker">MOVIMENTO</span><h2>Vendas da semana</h2></div><span className="panel-period">Últimos 7 dias</span></div>
        <div className="chart-total"><b>{money(weekSales.reduce((sum, sale) => sum + Number(sale.total), 0))}</b><span>em vendas registradas</span></div>
        <div className="bar-chart" aria-label="Vendas por dia nos últimos sete dias">
          {daily.map((item) => <div className="bar-column" key={item.date.toISOString()} title={`${shortDate.format(item.date)}: ${money(item.total)}`}><div className="bar-track"><div className={`bar-fill${item.total ? " bar-fill-active" : ""}`} style={{ height: `${Math.max(item.total ? 9 : 3, Math.round((item.total / maxDaily) * 100))}%` }} /></div><span>{new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(item.date).replace(".", "")}</span></div>)}
        </div>
        <div className="chart-legend"><span><i /> Faturamento bruto</span><span>Valores registrados no PDV</span></div>
      </article>
      <article className="panel branch-panel">
        <div className="panel-heading"><div><span className="panel-kicker">MULTIFILIAL</span><h2>Desempenho por unidade</h2></div><span className="branch-count">{orderedBranches.length} unidade{orderedBranches.length === 1 ? "" : "s"}</span></div>
        {orderedBranches.length ? <div className="branch-performance-list">{orderedBranches.map((branch, index) => <div className="branch-performance" key={branch.id}><div className="branch-performance-head"><div className="branch-performance-name"><span className={`branch-rank rank-${Math.min(index + 1, 3)}`}>{String(index + 1).padStart(2, "0")}</span><span><b>{branch.name}</b><small>{branch.code} · {branch.sales} venda{branch.sales === 1 ? "" : "s"} nesta semana</small></span></div><strong>{money(branch.total)}</strong></div><div className="performance-track"><span style={{ width: `${Math.max(2, Math.round((branch.total / Math.max(...orderedBranches.map((item) => item.total), 1)) * 100))}%` }} /></div></div>)}</div> : <div className="empty-panel"><span className="empty-icon"><Building2Icon /></span><b>Suas unidades aparecem aqui</b><p>Cadastre uma unidade e acompanhe o desempenho em um só lugar.</p><a href="/unidades">Cadastrar unidade <span>→</span></a></div>}
        <div className="panel-bottom-note"><span className="tiny-accent" /> Comparativo dos últimos 7 dias</div>
      </article>
    </section> : <section className="panel empty-panel dashboard-finance-locked"><span className="empty-icon"><BriefcaseBusiness size={18} /></span><b>Indicadores financeiros restritos</b><p>O faturamento consolidado está disponível para gestão e financeiro.</p></section>}

    <section className="dashboard-bottom-grid">
      <article className="panel quick-status-panel"><div className="panel-heading"><div><span className="panel-kicker">ACOMPANHAMENTO</span><h2>Pontos de atenção</h2></div></div>
        <div className="attention-list">
          <div className={`attention-row${lowStock.length ? " attention-warning" : ""}`}><span className="attention-icon"><Boxes size={17} /></span><span><b>Estoque baixo</b><small>{lowStock.length ? `${lowStock.length} item(ns) no limite mínimo` : "Sem alertas de estoque"}</small></span><span className={`attention-number${lowStock.length ? " warn-number" : ""}`}>{lowStock.length}</span></div>
          <div className="attention-row"><span className="attention-icon attention-icon-blue"><UsersRound size={17} /></span><span><b>Equipe cadastrada</b><small>Usuários com acesso às unidades exibidas</small></span><span className="attention-number">{scopedUserCount}</span></div>
          <div className="attention-row"><span className="attention-icon attention-icon-green"><PackageX size={17} /></span><span><b>Financeiro pendente</b><small>{canViewFinancialInfo ? "Contas a pagar e a receber" : "Indicador restrito ao financeiro"}</small></span><span className="attention-number">{canViewFinancialInfo ? totalPending : "—"}</span></div>
        </div>
      </article>
      <article className="panel activity-panel"><div className="panel-heading"><div><span className="panel-kicker">REGISTRO DO SISTEMA</span><h2>Atividade recente</h2></div>{["SUPER_ADMIN", "GENERAL_MANAGER", "BRANCH_MANAGER"].includes(user.role) && <a className="panel-link" href="/auditoria">Ver histórico <span>→</span></a>}</div>
        {auditLogs.length ? <div className="activity-list">{auditLogs.map((item) => <div className="activity-row" key={item.id}><span className={`activity-marker${item.action === "LOGIN" ? " activity-marker-green" : ""}`}><Activity size={14} /></span><span className="activity-copy"><b>{item.user?.name ?? "Sistema"}</b><small>{actionName(item.action)} · {item.entity === "User" ? "Usuário" : item.entity === "Branch" ? "Unidade" : item.entity}</small></span><span className="activity-meta"><b>{item.branch?.name ?? "Geral"}</b><small>{timeFormat.format(item.createdAt)}</small></span></div>)}</div> : <div className="empty-activity"><Clock3 size={20} /><span>As atividades do sistema aparecerão aqui.</span></div>}
      </article>
    </section>
  </div>;
}

function actionName(action: string) {
  const names: Record<string, string> = { LOGIN: "Acessou o sistema", LOGOUT: "Saiu do sistema", CREATE: "Cadastro criado", UPDATE: "Cadastro atualizado", DELETE: "Cadastro removido", CANCEL: "Operação cancelada" };
  return names[action] ?? action;
}

function Building2Icon() { return <Building2 size={21} />; }
