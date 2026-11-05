"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Building2, Check, CirclePlus, Clock3, CreditCard, LoaderCircle, Minus, Plus, Printer, ReceiptText, Search, ShoppingCart, Trash2, UserRound, X } from "lucide-react";

type Branch = { id: string; name: string; code: string; isHeadquarters: boolean };
type Product = { id: string; name: string; code: string; salePrice: number; unit: string; quantity: number };
type Service = { id: string; name: string; code: string; price: number };
type Customer = { id: string; name: string; isGeneric: boolean };
type CashRegister = { id: string; branchId: string; openingBalance: number; movementTotal: number; expectedBalance: number; openedAt: string; movementCount: number };
type SaleRecord = { id: string; number: number; total: number; createdAt: string; customer: string; items: { id: string; description: string; quantity: number; total: number }[]; payments: { method: string; amount: number }[] };
type Line = { key: number; selection: string; quantity: string };
type PaymentLine = { key: number; method: string; amount: string };
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const methodNames: Record<string, string> = { CASH: "Dinheiro", PIX: "PIX", DEBIT: "Débito", CREDIT: "Crédito", TRANSFER: "Transferência", ON_ACCOUNT: "Fiado" };
function formatRegisterTime(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? timeFormat.format(date) : "—";
}
function newRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => { const random = Math.floor(Math.random() * 16); return (character === "x" ? random : (random & 3) | 8).toString(16); });
}

export function SalesWorkspace({ branches, products, services, customers, initialSales, defaultBranchId, canDiscount }: { branches: Branch[]; products: Product[]; services: Service[]; customers: Customer[]; initialSales: SaleRecord[]; defaultBranchId: string | null; canDiscount: boolean }) {
  const router = useRouter();
  const initialBranch = branches.find((branch) => branch.id === defaultBranchId)?.id ?? branches[0]?.id ?? "";
  const [branchId, setBranchId] = useState(initialBranch);
  const [register, setRegister] = useState<CashRegister | null>(null);
  const [sales, setSales] = useState(initialSales);
  const [cashLoading, setCashLoading] = useState(false);
  const [cashAmount, setCashAmount] = useState("0.00");
  const [cashAction, setCashAction] = useState<"OPEN" | "CLOSE" | null>(null);
  const [saleOpen, setSaleOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const requestId = useRef<string | null>(null);

  const productById = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const serviceById = useMemo(() => new Map(services.map((item) => [item.id, item])), [services]);
  const lineDetails = lines.map((line) => {
    const [kind, id] = line.selection.split(":");
    const item = kind === "P" ? productById.get(id) : serviceById.get(id);
    const unitPrice = item ? ("salePrice" in item ? item.salePrice : item.price) : 0;
    const quantity = Number(line.quantity) || 0;
    return { ...line, kind, id, name: item?.name ?? "Selecione um item", unitPrice, quantity, total: Math.round(unitPrice * quantity * 100) / 100 };
  });
  const subtotal = Math.round(lineDetails.reduce((sum, line) => sum + line.total, 0) * 100) / 100;
  const discountValue = canDiscount ? Math.max(0, Number(discount) || 0) : 0;
  const total = Math.max(0, Math.round((subtotal - discountValue) * 100) / 100);
  const explicitPaymentTotal = Math.round(paymentLines.slice(1).reduce((sum, line) => sum + (Number(line.amount) || 0), 0) * 100) / 100;
  const remainingPayment = Math.round((total - explicitPaymentTotal) * 100) / 100;
  const activeProducts = products.filter((item) => item.quantity > 0 || item.salePrice >= 0);
  const filteredSales = sales.filter((sale) => `${sale.number} ${sale.customer}`.toLowerCase().includes(query.toLowerCase()));

  async function loadRegister(id: string) {
    if (!id) { setRegister(null); return; }
    setCashLoading(true);
    try {
      const response = await fetch(`/api/cash-register?branchId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setRegister(data.register);
    } finally { setCashLoading(false); }
  }
  async function loadSales(id: string) {
    if (!id) { setSales([]); return; }
    const response = await fetch(`/api/sales?branchId=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setSales(data.sales);
  }
  useEffect(() => { void loadRegister(branchId); void loadSales(branchId); }, [branchId]);

  async function changeCash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!branchId || !cashAction) return;
    setCashLoading(true); setError(""); setNotice("");
    try {
      const response = cashAction === "OPEN"
        ? await fetch("/api/cash-register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branchId, openingBalance: cashAmount }) })
        : await fetch("/api/cash-register", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: register?.id, closingBalance: cashAmount }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o caixa.");
      setRegister(cashAction === "OPEN" ? data.register : null); setCashAction(null); setCashAmount("0.00"); setNotice(cashAction === "OPEN" ? "Caixa aberto para esta unidade." : "Caixa fechado."); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível atualizar o caixa."); }
    finally { setCashLoading(false); }
  }

  function openSale() {
    const first = activeProducts[0] ? `P:${activeProducts[0].id}` : services[0] ? `S:${services[0].id}` : "";
    setLines(first ? [{ key: Date.now(), selection: first, quantity: "1" }] : []);
    setCustomerId(customers.find((item) => item.isGeneric)?.id ?? ""); setDiscount("0"); setPaymentLines([{ key: Date.now(), method: "CASH", amount: "" }]); setError(""); setSaleOpen(true);
  }
  function addLine() {
    const first = activeProducts[0] ? `P:${activeProducts[0].id}` : services[0] ? `S:${services[0].id}` : "";
    setLines((current) => [...current, { key: Date.now() + Math.random(), selection: first, quantity: "1" }]);
  }
  function updateLine(key: number, change: Partial<Line>) { setLines((current) => current.map((line) => line.key === key ? { ...line, ...change } : line)); }

  async function completeSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    if (!register) { setBusy(false); setError("Abra o caixa desta unidade antes de registrar vendas."); return; }
    if (!lines.length || lineDetails.some((line) => !line.id || line.quantity <= 0)) { setBusy(false); setError("Adicione itens válidos à venda."); return; }
    if (!paymentLines.length || remainingPayment <= 0 || paymentLines.slice(1).some((payment) => !Number(payment.amount) || Number(payment.amount) <= 0)) { setBusy(false); setError("Confira os valores divididos entre as formas de pagamento. Cada valor e o saldo restante precisam ser maiores que zero."); return; }
    requestId.current ??= newRequestId();
    const payload = {
      requestId: requestId.current, branchId, customerId: customerId || null, discount: discountValue,
      items: lineDetails.map((line) => ({ kind: line.kind === "P" ? "PRODUCT" : "SERVICE", id: line.id, quantity: line.quantity })),
      payments: [{ method: paymentLines[0].method, amount: remainingPayment }, ...paymentLines.slice(1).map((line) => ({ method: line.method, amount: Number(line.amount) || 0 }))],
    };
    try {
      const response = await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível finalizar a venda.");
      requestId.current = null; setLastSaleId(data.sale.id); setNotice(`Venda #${data.sale.number} finalizada · ${currency.format(Number(data.sale.total))}`); setSaleOpen(false);
      await Promise.all([loadRegister(branchId), loadSales(branchId)]); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível finalizar a venda."); }
    finally { setBusy(false); }
  }

  return <div className="workspace-page">
    <div className="page-heading"><div><div className="eyebrow page-eyebrow"><span className="status-dot" /> ATENDIMENTO E CAIXA</div><h1>Vendas</h1><p>Registre o atendimento e mantenha o caixa vinculado à unidade.</p></div><button className="button button-primary" onClick={openSale} disabled={!register}><ShoppingCart size={17} /> Nova venda</button></div>
    <div className="sales-top-grid"><section className="panel cash-panel"><div className="cash-panel-top"><div><span className="panel-kicker">CAIXA DA UNIDADE</span><h2>{branches.find((item) => item.id === branchId)?.name ?? "Selecione uma unidade"}</h2></div><label className="cash-branch-select"><Building2 size={15} /><select value={branchId} onChange={(event) => setBranchId(event.target.value)} aria-label="Selecionar unidade">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div>
       {cashLoading ? <div className="cash-state"><LoaderCircle size={18} className="spin" /> Consultando caixa...</div> : register ? <><div className="cash-balance-row"><div><small>Saldo esperado</small><b>{currency.format(register.expectedBalance)}</b></div><span className="cash-open-pill"><i /> Caixa aberto</span></div><div className="cash-meta"><span><Clock3 size={13} /> Aberto às {formatRegisterTime(register.openedAt)}</span><span>{register.movementCount} movimentação(ões)</span></div><button className="button button-quiet cash-action-button" onClick={() => { setCashAmount(register.expectedBalance.toFixed(2)); setCashAction("CLOSE"); }}>Fechar caixa <X size={15} /></button></> : <><div className="cash-empty"><span className="cash-empty-icon"><Banknote size={18} /></span><span><b>Nenhum caixa aberto</b><small>Abra o caixa desta unidade para iniciar as vendas.</small></span></div><button className="button button-primary cash-action-button" onClick={() => { setCashAmount("0.00"); setCashAction("OPEN"); }}><CirclePlus size={16} /> Abrir caixa</button></>}
    </section><section className="panel sales-info-card"><span className="sales-info-icon"><ReceiptText size={20} /></span><span className="panel-kicker">VENDA INTEGRADA</span><h2>Uma finalização, registros consistentes</h2><p>O sistema atualiza a venda, os pagamentos, o caixa e as baixas de estoque na mesma operação.</p><div className="sales-info-foot"><Check size={14} /> Unidade e usuário registrados em cada venda</div></section></div>
    {error && !saleOpen && !cashAction && <div className="notice notice-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Fechar"><X size={16} /></button></div>}{notice && <div className="notice notice-success" role="status">{notice}{lastSaleId && <a className="sale-receipt-action" href={`/vendas/${lastSaleId}/comprovante`}><Printer size={14} /> Comprovante</a>}<button onClick={() => { setNotice(""); setLastSaleId(null); }} aria-label="Fechar"><X size={16} /></button></div>}
    {cashAction && <div className="modal-backdrop"><section className="modal-card cash-modal" role="dialog" aria-modal="true" aria-labelledby="cash-title"><div className="modal-heading"><div><span className="panel-kicker">{cashAction === "OPEN" ? "INÍCIO DO TURNO" : "CONFERÊNCIA DO CAIXA"}</span><h2 id="cash-title">{cashAction === "OPEN" ? "Abrir caixa" : "Fechar caixa"}</h2><p>{branches.find((item) => item.id === branchId)?.name}</p></div><button className="icon-button" onClick={() => setCashAction(null)} aria-label="Fechar"><X size={19} /></button></div><form className="modal-form" onSubmit={changeCash}><label className="form-field"><span>{cashAction === "OPEN" ? "Saldo inicial em dinheiro (R$)" : "Valor contado no caixa (R$)"} <i>*</i></span><input required autoFocus type="number" min="0" step="0.01" value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} /></label>{cashAction === "CLOSE" && register && <div className="cash-expected-note">Saldo esperado: <b>{currency.format(register.expectedBalance)}</b></div>}{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setCashAction(null)}>Cancelar</button><button className="button button-primary" type="submit" disabled={cashLoading}>{cashLoading ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{cashAction === "OPEN" ? "Abrir caixa" : "Confirmar fechamento"}</button></div></form></section></div>}
    {saleOpen && <div className="modal-backdrop"><section className="modal-card sale-modal" role="dialog" aria-modal="true" aria-labelledby="sale-title"><div className="modal-heading"><div><span className="panel-kicker">PDV · {branches.find((item) => item.id === branchId)?.name}</span><h2 id="sale-title">Nova venda</h2><p>Os preços e o saldo serão confirmados no servidor antes de finalizar.</p></div><button className="icon-button" onClick={() => setSaleOpen(false)} aria-label="Fechar"><X size={19} /></button></div><form className="modal-form" onSubmit={completeSale}>
      <label className="form-field"><span>Cliente</span><select value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Consumidor genérico</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.isGeneric ? " · genérico" : ""}</option>)}</select></label>
      <div className="sale-lines-heading"><span>ITENS DA VENDA</span><button type="button" className="text-action" onClick={addLine}><Plus size={14} /> Adicionar item</button></div>
      <div className="sale-line-list">{lines.map((line, index) => <div className="sale-line" key={line.key}><label className="sale-line-item"><span className="sr-only">Item {index + 1}</span><select value={line.selection} onChange={(event) => updateLine(line.key, { selection: event.target.value })}><option value="">Selecione produto ou serviço</option><optgroup label="Produtos">{activeProducts.map((item) => <option key={item.id} value={`P:${item.id}`}>{item.name} · {currency.format(item.salePrice)}</option>)}</optgroup><optgroup label="Serviços">{services.map((item) => <option key={item.id} value={`S:${item.id}`}>{item.name} · {currency.format(item.price)}</option>)}</optgroup></select></label><label className="sale-line-qty"><span className="sr-only">Quantidade</span><input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} /></label><b className="sale-line-total">{currency.format(lineDetails[index]?.total ?? 0)}</b><button type="button" className="row-action danger-action" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} aria-label="Remover item"><Trash2 size={15} /></button></div>)}{!lines.length && <div className="sale-no-lines">Nenhum item adicionado. Use “Adicionar item” para montar a venda.</div>}</div>
      {canDiscount && <label className="form-field"><span>Desconto autorizado (R$)</span><input type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label>}
      <div className="sale-summary"><div><span>Subtotal</span><b>{currency.format(subtotal)}</b></div>{canDiscount && <div><span>Desconto</span><b>− {currency.format(discountValue)}</b></div>}<div className="sale-grand-total"><span>Total</span><b>{currency.format(total)}</b></div></div>
      <div className="sale-lines-heading"><span>FORMAS DE PAGAMENTO</span><button type="button" className="text-action" disabled={paymentLines.length >= 6} onClick={() => setPaymentLines((current) => [...current, { key: Date.now() + Math.random(), method: "PIX", amount: "" }])}><Plus size={14} /> Dividir pagamento</button></div>
      <div className="sale-payment-list">{paymentLines.map((payment, index) => <div className="sale-payment-line" key={payment.key}><select value={payment.method} onChange={(event) => setPaymentLines((current) => current.map((line) => line.key === payment.key ? { ...line, method: event.target.value } : line))} aria-label={`Forma de pagamento ${index + 1}`}>{Object.entries(methodNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label><span className="sr-only">Valor</span><input type="number" min="0.01" step="0.01" value={index === 0 ? remainingPayment.toFixed(2) : payment.amount} readOnly={index === 0} onChange={(event) => setPaymentLines((current) => current.map((line) => line.key === payment.key ? { ...line, amount: event.target.value } : line))} /></label>{index > 0 ? <button type="button" className="row-action danger-action" onClick={() => setPaymentLines((current) => current.filter((line) => line.key !== payment.key))} aria-label="Remover forma de pagamento"><Minus size={15} /></button> : <span className="payment-remainder-label">saldo</span>}</div>)}</div>
      {error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setSaleOpen(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy || !register || total <= 0 || remainingPayment <= 0}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{busy ? "Finalizando..." : "Finalizar venda"}</button></div>
    </form></section></div>}
    <section className="panel data-panel sales-history-panel"><div className="data-panel-heading"><div><span className="panel-kicker">MOVIMENTO DA UNIDADE</span><h2>Vendas recentes <span className="heading-count">{filteredSales.length}</span></h2></div><label className="table-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cliente ou número" aria-label="Buscar vendas" /></label></div><div className="table-scroll"><table className="data-table"><thead><tr><th>VENDA</th><th>CLIENTE</th><th>ITENS</th><th>PAGAMENTO</th><th>HORÁRIO</th><th className="price-col">TOTAL</th><th>COMPROVANTE</th></tr></thead><tbody>{filteredSales.map((sale) => <tr key={sale.id}><td><span className="sale-number">#{String(sale.number).padStart(5, "0")}</span></td><td>{sale.customer}</td><td><span className="table-muted">{sale.items.length} item(ns)</span></td><td><span className="table-muted">{sale.payments.map((payment) => methodNames[payment.method] ?? payment.method).join(" + ")}</span></td><td><span className="table-muted">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(sale.createdAt))}</span></td><td className="price-col"><b className="price-value">{currency.format(sale.total)}</b></td><td><a className="sale-receipt-table-link" href={`/vendas/${sale.id}/comprovante`}><Printer size={13} /> Imprimir</a></td></tr>)}</tbody></table></div>{!filteredSales.length && <div className="table-empty"><ReceiptText size={19} /><b>Nenhuma venda registrada</b><span>As vendas finalizadas nesta unidade aparecerão aqui.</span></div>}<div className="table-footer"><span>Últimas 50 vendas · {branches.find((item) => item.id === branchId)?.name}</span><span><CreditCard size={13} /> Valores registrados no PDV</span></div></section>
    <div className="workspace-footnote"><Banknote size={14} /> O caixa é exclusivo da unidade. Vendas em fiado criam uma conta a receber para o cliente identificado.</div>
  </div>;
}
