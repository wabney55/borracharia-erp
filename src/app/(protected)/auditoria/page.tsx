import { Activity, Building2, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser, userCanSeeAllBranches } from "@/lib/session";

const actionNames: Record<string, string> = { CREATE: "Criou", UPDATE: "Alterou", DELETE: "Inativou", OPEN: "Abriu", CLOSE: "Fechou", ENTRY: "Entrada de estoque", EXIT: "Saída de estoque", COUNT: "Contagem de estoque", SHIP: "Enviou transferência", RECEIVE: "Recebeu transferência", PAY: "Pagou conta", RECEIVABLE: "Recebeu valor", CANCEL: "Cancelou", START: "Iniciou atendimento", WAIT_APPROVAL: "Aguardando aprovação", WAIT_PARTS: "Aguardando peças", COMPLETE: "Concluiu" };
const entityNames: Record<string, string> = { Branch: "unidade", User: "usuário", Customer: "cliente", Product: "produto", Service: "serviço", Sale: "venda", CashRegister: "caixa", StockMovement: "estoque", StockTransfer: "transferência", WorkOrder: "ordem de serviço", Payable: "conta a pagar", Receivable: "conta a receber", Expense: "despesa" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ branchId?: string }> }) {
  const user = await requireUser(); const params = await searchParams;
  if (!["SUPER_ADMIN", "GENERAL_MANAGER", "BRANCH_MANAGER"].includes(user.role)) return <div className="roadmap-note"><ShieldCheck size={15} /> Seu perfil não pode consultar a trilha de auditoria.</div>;
  const branches = userCanSeeAllBranches(user)
    ? await prisma.branch.findMany({ where: { companyId: user.companyId, status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : user.branches.map(({ branch }) => branch).filter((branch) => branch.status === "ACTIVE" && !branch.deletedAt).map(({ id, name }) => ({ id, name }));
  const ids = branches.map(({ id }) => id);
  const branchId = ids.includes(params.branchId ?? "") ? params.branchId! : "all";
  const logs = await prisma.auditLog.findMany({ where: { companyId: user.companyId, branchId: branchId === "all" ? { in: ids } : branchId }, include: { user: { select: { name: true } }, branch: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  return <div className="workspace-page">
    <div className="page-heading"><div><div className="eyebrow page-eyebrow"><span className="status-dot" /> REGISTROS DO SISTEMA</div><h1>Auditoria</h1><p>Alterações e movimentações registradas nas unidades autorizadas.</p></div><span className="sales-info-icon"><ShieldCheck size={20} /></span></div>
    <section className="panel data-panel sales-history-panel"><div className="data-panel-heading"><div><span className="panel-kicker">TRILHA DE ATIVIDADE</span><h2>Registros recentes <span className="heading-count">{logs.length}</span></h2></div><form className="cash-branch-select" action="/auditoria"><Building2 size={15} /><select name="branchId" defaultValue={branchId} aria-label="Filtrar por unidade"><option value="all">Unidades permitidas</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><button className="filter-button" type="submit">Filtrar</button></form></div><div className="table-scroll"><table className="data-table"><thead><tr><th>DATA</th><th>USUÁRIO</th><th>UNIDADE</th><th>AÇÃO</th><th>REGISTRO</th><th>IDENTIFICADOR</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(log.createdAt))}</td><td>{log.user?.name ?? "Sistema"}</td><td>{log.branch?.name ?? "Empresa"}</td><td><span className="customer-type">{actionNames[log.action] ?? log.action}</span></td><td>{entityNames[log.entity] ?? log.entity}</td><td><span className="table-muted">{log.entityId ?? "—"}</span></td></tr>)}</tbody></table></div>{!logs.length && <div className="table-empty"><Activity size={19} /><b>Nenhuma atividade registrada</b><span>As alterações feitas no sistema aparecerão aqui.</span></div>}<div className="table-footer"><span>Últimos 200 registros</span><span>Os registros seguem a permissão por unidade</span></div></section>
  </div>;
}
