"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Banknote, Building2, Check, CirclePlus, CreditCard, LoaderCircle, Plus, ReceiptText, TrendingDown, TrendingUp, X } from "lucide-react";

type Branch = { id: string; name: string; code: string };
type Supplier = { id: string; name: string };
type Account = { id: string; description: string; amount: number; dueAt: string; createdAt: string; status: string; customerName?: string; supplierName?: string };
type Expense = { id: string; description: string; category: string | null; amount: number; incurredAt: string };
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function FinanceWorkspace({ branches, suppliers, defaultBranchId }: { branches: Branch[]; suppliers: Supplier[]; defaultBranchId: string | null }) {
  const [branchId, setBranchId] = useState(branches.find((branch) => branch.id === defaultBranchId)?.id ?? branches[0]?.id ?? "");
  const [register, setRegister] = useState<{ id: string; expectedBalance: number } | null>(null);
  const [receivables, setReceivables] = useState<Account[]>([]);
  const [payables, setPayables] = useState<Account[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [form, setForm] = useState<"PAYABLE" | "EXPENSE" | null>(null);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueAt, setDueAt] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    if (!branchId) { setLoading(false); return; }
    setLoading(true); setError("");
    try { const response = await fetch(`/api/finance?branchId=${encodeURIComponent(branchId)}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o financeiro."); setRegister(data.register); setReceivables(data.receivables); setPayables(data.payables); setExpenses(data.expenses); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar o financeiro."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [branchId]);
  function openForm(next: "PAYABLE" | "EXPENSE") { setForm(next); setDescription(""); setCategory(""); setSupplierId(""); setAmount(""); setDueAt(new Date().toISOString().slice(0, 10)); setError(""); }
  async function saveForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!form) return; setSaving(true); setError(""); setNotice("");
    try { const body = form === "PAYABLE" ? { action: "CREATE_PAYABLE", branchId, description, category, supplierId: supplierId || null, amount, dueAt: new Date(`${dueAt}T12:00:00`).toISOString() } : { action: "CREATE_EXPENSE", branchId, description, category, amount }; const response = await fetch("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Não foi possível registrar."); setForm(null); setNotice(form === "PAYABLE" ? "Conta a pagar registrada." : "Despesa registrada no caixa."); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível registrar."); }
    finally { setSaving(false); }
  }
  async function settle(item: Account, action: "PAY" | "RECEIVE") {
    setSaving(true); setError(""); setNotice("");
    try { const response = await fetch("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: item.id }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Não foi possível registrar a baixa."); setNotice(action === "PAY" ? "Pagamento registrado no caixa." : "Recebimento registrado no caixa."); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível registrar a baixa."); }
    finally { setSaving(false); }
  }
  const openAmount = receivables.reduce((sum, item) => sum + item.amount, 0);
  const dueAmount = payables.reduce((sum, item) => sum + item.amount, 0);

  return <div className="workspace-page">
    <div className="page-heading"><div><div className="eyebrow page-eyebrow"><span className="status-dot" /> CONTAS DA UNIDADE</div><h1>Financeiro</h1><p>Contas pendentes e despesas vinculadas ao caixa da filial.</p></div><label className="cash-branch-select"><Building2 size={15} /><select value={branchId} onChange={(event) => setBranchId(event.target.value)} aria-label="Selecionar unidade">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div>
    {error && !form && <div className="notice notice-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Fechar"><X size={16} /></button></div>}{notice && <div className="notice notice-success" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Fechar"><X size={16} /></button></div>}
    <div className="workspace-summary-grid"><div className="workspace-summary-card"><span className="summary-icon summary-green"><TrendingUp size={16} /></span><div><small>Contas a receber</small><b>{currency.format(openAmount)}</b></div></div><div className="workspace-summary-card"><span className="summary-icon summary-orange"><TrendingDown size={16} /></span><div><small>Contas a pagar</small><b>{currency.format(dueAmount)}</b></div></div><div className="workspace-summary-card"><span className="summary-icon summary-blue"><Banknote size={16} /></span><div><small>Saldo esperado no caixa</small><b>{register ? currency.format(register.expectedBalance) : "Caixa fechado"}</b></div></div></div>
    <section className="panel data-panel sales-history-panel"><div className="data-panel-heading"><div><span className="panel-kicker">PENDÊNCIAS</span><h2>Contas a receber <span className="heading-count">{receivables.length}</span></h2></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>CLIENTE / ORIGEM</th><th>VENCIMENTO</th><th className="price-col">VALOR</th><th>AÇÃO</th></tr></thead><tbody>{receivables.map((item) => <tr key={item.id}><td><b>{item.customerName}</b><small className="table-muted">{item.description}</small></td><td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(item.dueAt))}</td><td className="price-col"><b>{currency.format(item.amount)}</b></td><td><button className="button button-quiet table-button" onClick={() => void settle(item, "RECEIVE")} disabled={saving || !register}><CirclePlus size={14} /> Receber</button></td></tr>)}</tbody></table></div>{!receivables.length && <div className="table-empty"><ReceiptText size={19} /><b>Nenhum recebível pendente</b><span>Fiados de vendas e ordens concluídas aparecerão aqui.</span></div>}</section>
    <section className="panel data-panel sales-history-panel"><div className="data-panel-heading"><div><span className="panel-kicker">FORNECEDORES E DESPESAS</span><h2>Contas a pagar <span className="heading-count">{payables.length}</span></h2></div><button className="button button-quiet table-button" onClick={() => openForm("PAYABLE")}><Plus size={14} /> Nova conta</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>FORNECEDOR</th><th>DESCRIÇÃO</th><th>VENCIMENTO</th><th className="price-col">VALOR</th><th>AÇÃO</th></tr></thead><tbody>{payables.map((item) => <tr key={item.id}><td>{item.supplierName}</td><td>{item.description}</td><td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(item.dueAt))}</td><td className="price-col"><b>{currency.format(item.amount)}</b></td><td><button className="button button-quiet table-button" onClick={() => void settle(item, "PAY")} disabled={saving || !register}><CreditCard size={14} /> Pagar</button></td></tr>)}</tbody></table></div>{!payables.length && <div className="table-empty"><CreditCard size={19} /><b>Nenhuma conta a pagar pendente</b><span>Registre despesas futuras por unidade.</span></div>}</section>
    <section className="panel data-panel sales-history-panel"><div className="data-panel-heading"><div><span className="panel-kicker">SAÍDAS REALIZADAS</span><h2>Despesas recentes <span className="heading-count">{expenses.length}</span></h2></div><button className="button button-primary table-button" onClick={() => openForm("EXPENSE")} disabled={!register}><Plus size={14} /> Registrar despesa</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>DATA</th><th>DESPESA</th><th>CATEGORIA</th><th className="price-col">VALOR</th></tr></thead><tbody>{expenses.map((item) => <tr key={item.id}><td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(item.incurredAt))}</td><td>{item.description}</td><td>{item.category ?? "—"}</td><td className="price-col"><b>{currency.format(item.amount)}</b></td></tr>)}</tbody></table></div>{!expenses.length && <div className="table-empty"><TrendingDown size={19} /><b>Nenhuma despesa lançada</b><span>As saídas pagas pelo caixa aparecerão aqui.</span></div>}</section>
    {loading && <div className="cash-state"><LoaderCircle size={18} className="spin" /> Carregando financeiro...</div>}
    {form && <div className="modal-backdrop"><section className="modal-card cash-modal" role="dialog" aria-modal="true" aria-labelledby="finance-form-title"><div className="modal-heading"><div><span className="panel-kicker">{branches.find((branch) => branch.id === branchId)?.name}</span><h2 id="finance-form-title">{form === "PAYABLE" ? "Nova conta a pagar" : "Registrar despesa"}</h2><p>{form === "PAYABLE" ? "O pagamento será baixado pelo caixa da unidade." : "A despesa será lançada como saída no caixa aberto."}</p></div><button className="icon-button" onClick={() => setForm(null)} aria-label="Fechar"><X size={19} /></button></div><form className="modal-form" onSubmit={saveForm}><label className="form-field"><span>Descrição <i>*</i></span><input required minLength={2} maxLength={180} value={description} onChange={(event) => setDescription(event.target.value)} /></label>{form === "PAYABLE" && <label className="form-field"><span>Fornecedor</span><select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Não informado</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>}<div className="form-grid-two"><label className="form-field"><span>Categoria</span><input maxLength={80} value={category} onChange={(event) => setCategory(event.target.value)} /></label><label className="form-field"><span>Valor (R$) <i>*</i></span><input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label></div>{form === "PAYABLE" && <label className="form-field"><span>Vencimento <i>*</i></span><input required type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>}{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setForm(null)}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving || (form === "EXPENSE" && !register)}>{saving ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} Confirmar</button></div></form></section></div>}
  </div>;
}
