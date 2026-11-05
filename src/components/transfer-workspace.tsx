"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Building2, CirclePlus, LoaderCircle, PackageCheck, Plus, Trash2, X } from "lucide-react";

type Branch = { id: string; name: string; code: string };
type Product = { id: string; code: string; name: string; unit: string; quantity: number };
type TransferItem = { id: string; productId: string; quantity: number; receivedQuantity: number; product: Product };
type Transfer = { id: string; code: string; status: string; notes: string | null; createdAt: string; originBranch: Branch; destinationBranch: Branch; items: TransferItem[] };
type DraftLine = { key: number; productId: string; quantity: string };
const statusNames: Record<string, string> = { DRAFT: "Rascunho", AWAITING_SHIPMENT: "Aguardando envio", IN_TRANSIT: "Em trânsito", PARTIALLY_RECEIVED: "Recebida parcialmente", RECEIVED: "Recebida", CANCELED: "Cancelada" };
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export function TransferWorkspace({ branches, defaultBranchId, canManage }: { branches: Branch[]; defaultBranchId: string | null; canManage: boolean }) {
  const [originBranchId, setOriginBranchId] = useState(defaultBranchId ?? branches[0]?.id ?? "");
  const [destinationBranchId, setDestinationBranchId] = useState(branches.find((branch) => branch.id !== defaultBranchId)?.id ?? branches[1]?.id ?? "");
  const [products, setProducts] = useState<Product[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ key: Date.now(), productId: "", quantity: "1" }]);
  const [receiveTransfer, setReceiveTransfer] = useState<Transfer | null>(null);
  const [receiveAmounts, setReceiveAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/transfers", { cache: "no-store" }); const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as transferências.");
      setTransfers(data.transfers);
      if (originBranchId) {
        const stockResponse = await fetch(`/api/inventory?branchId=${encodeURIComponent(originBranchId)}`, { cache: "no-store" }); const stockData = await stockResponse.json();
        if (stockResponse.ok) setProducts(stockData.items.map((item: Product) => ({ ...item, quantity: Number(item.quantity) })));
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar as transferências."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [originBranchId]);

  async function createTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ originBranchId, destinationBranchId, notes, items: draftLines.map(({ productId, quantity }) => ({ productId, quantity })) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Não foi possível criar a transferência.");
      setDraftLines([{ key: Date.now(), productId: "", quantity: "1" }]); setNotes(""); setNotice(`Transferência ${data.transfer.code} criada. Confirme os itens antes de enviar.`); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível criar a transferência."); }
    finally { setSaving(false); }
  }
  async function transition(transfer: Transfer, action: "SHIP" | "CANCEL") {
    setSaving(true); setError(""); setNotice("");
    try { const response = await fetch("/api/transfers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: transfer.id, action }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar a transferência."); setNotice(`${transfer.code}: ${statusNames[data.transfer.status] ?? data.transfer.status}.`); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível atualizar a transferência."); }
    finally { setSaving(false); }
  }
  function openReceipt(transfer: Transfer) { setReceiveTransfer(transfer); setReceiveAmounts(Object.fromEntries(transfer.items.map((item) => [item.id, String(Number((item.quantity - item.receivedQuantity).toFixed(3)))]))); setError(""); }
  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!receiveTransfer) return; setSaving(true); setError(""); setNotice("");
    try { const items = Object.entries(receiveAmounts).filter(([, quantity]) => Number(quantity) > 0).map(([itemId, quantity]) => ({ itemId, quantity })); const response = await fetch("/api/transfers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: receiveTransfer.id, action: "RECEIVE", items }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Não foi possível receber os itens."); setNotice(`${receiveTransfer.code}: ${statusNames[data.transfer.status] ?? data.transfer.status}.`); setReceiveTransfer(null); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível receber os itens."); }
    finally { setSaving(false); }
  }

  return <div className="workspace-page">
    <div className="page-heading"><div><div className="eyebrow page-eyebrow"><span className="status-dot" /> ESTOQUE EM TRÂNSITO</div><h1>Transferências</h1><p>Envie produtos entre unidades e confirme cada recebimento.</p></div><span className="sales-info-icon"><ArrowLeftRight size={20} /></span></div>
    {error && !receiveTransfer && <div className="notice notice-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Fechar"><X size={16} /></button></div>}{notice && <div className="notice notice-success" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Fechar"><X size={16} /></button></div>}
    {canManage && <section className="panel data-panel transfer-create-panel"><div className="data-panel-heading"><div><span className="panel-kicker">NOVA OPERAÇÃO</span><h2>Preparar transferência</h2></div><span className="status-pill status-active">Rascunho</span></div><form className="modal-form transfer-form" onSubmit={createTransfer}><div className="form-grid-two"><label className="form-field"><span>Unidade de origem <i>*</i></span><select required value={originBranchId} onChange={(event) => setOriginBranchId(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label className="form-field"><span>Unidade de destino <i>*</i></span><select required value={destinationBranchId} onChange={(event) => setDestinationBranchId(event.target.value)}>{branches.filter((branch) => branch.id !== originBranchId).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div><div className="sale-lines-heading"><span>PRODUTOS</span><button type="button" className="text-action" onClick={() => setDraftLines((lines) => [...lines, { key: Date.now() + Math.random(), productId: "", quantity: "1" }])}><Plus size={14} /> Adicionar produto</button></div><div className="sale-line-list">{draftLines.map((line) => <div className="sale-line" key={line.key}><select value={line.productId} onChange={(event) => setDraftLines((lines) => lines.map((current) => current.key === line.key ? { ...current, productId: event.target.value } : current))} required aria-label="Produto"><option value="">Selecione o produto</option>{products.map((product) => <option key={product.id} value={product.id}>{product.code} · {product.name} · saldo {num.format(product.quantity)} {product.unit}</option>)}</select><input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setDraftLines((lines) => lines.map((current) => current.key === line.key ? { ...current, quantity: event.target.value } : current))} required aria-label="Quantidade" /><button type="button" className="row-action danger-action" onClick={() => setDraftLines((lines) => lines.filter((current) => current.key !== line.key))} aria-label="Remover produto"><Trash2 size={15} /></button></div>)}</div><label className="form-field"><span>Observação</span><input maxLength={240} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Documento ou instrução de transporte" /></label><div className="modal-actions"><button type="submit" className="button button-primary" disabled={saving || !originBranchId || !destinationBranchId || originBranchId === destinationBranchId}>{saving ? <LoaderCircle size={16} className="spin" /> : <CirclePlus size={16} />} Criar rascunho</button></div></form></section>}
    <section className="panel data-panel sales-history-panel"><div className="data-panel-heading"><div><span className="panel-kicker">HISTÓRICO MULTIFILIAL</span><h2>Transferências <span className="heading-count">{transfers.length}</span></h2></div><label className="cash-branch-select"><Building2 size={15} /><select value={originBranchId} onChange={(event) => setOriginBranchId(event.target.value)} aria-label="Unidade de origem dos produtos">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div><div className="table-scroll"><table className="data-table"><thead><tr><th>CÓDIGO</th><th>ORIGEM → DESTINO</th><th>ITENS</th><th>STATUS</th><th>DATA</th><th>AÇÕES</th></tr></thead><tbody>{transfers.map((transfer) => <tr key={transfer.id}><td><b className="sale-number">{transfer.code}</b></td><td>{transfer.originBranch.name} → {transfer.destinationBranch.name}</td><td><span className="table-muted">{transfer.items.map((item) => `${item.product.name} (${num.format(item.receivedQuantity)}/${num.format(item.quantity)})`).join(" · ")}</span></td><td><span className={`status-pill ${["RECEIVED", "IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(transfer.status) ? "status-active" : "status-pending"}`}>{statusNames[transfer.status] ?? transfer.status}</span></td><td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(transfer.createdAt))}</td><td>{canManage && transfer.status === "DRAFT" && <div className="table-actions"><button className="button button-quiet table-button" onClick={() => void transition(transfer, "SHIP")} disabled={saving}><ArrowUpFromLine size={14} /> Enviar</button><button className="row-action danger-action" onClick={() => void transition(transfer, "CANCEL")} disabled={saving} aria-label="Cancelar"><X size={15} /></button></div>}{canManage && ["IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(transfer.status) && <button className="button button-quiet table-button" onClick={() => openReceipt(transfer)}><ArrowDownToLine size={14} /> Receber</button>}</td></tr>)}</tbody></table></div>{loading && <div className="cash-state"><LoaderCircle size={18} className="spin" /> Carregando transferências...</div>}{!loading && !transfers.length && <div className="table-empty"><PackageCheck size={19} /><b>Nenhuma transferência</b><span>As movimentações entre unidades aparecerão aqui.</span></div>}</section>
    {receiveTransfer && <div className="modal-backdrop"><section className="modal-card sale-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-title"><div className="modal-heading"><div><span className="panel-kicker">{receiveTransfer.code}</span><h2 id="receipt-title">Conferir recebimento</h2><p>{receiveTransfer.originBranch.name} → {receiveTransfer.destinationBranch.name}</p></div><button className="icon-button" onClick={() => setReceiveTransfer(null)} aria-label="Fechar"><X size={19} /></button></div><form className="modal-form" onSubmit={receive}>{receiveTransfer.items.map((item) => { const pending = Number((item.quantity - item.receivedQuantity).toFixed(3)); return <label className="form-field" key={item.id}><span>{item.product.name} · faltam {num.format(pending)} {item.product.unit}</span><input type="number" min="0" max={pending} step="0.001" value={receiveAmounts[item.id] ?? "0"} onChange={(event) => setReceiveAmounts((amounts) => ({ ...amounts, [item.id]: event.target.value }))} /></label>; })}{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setReceiveTransfer(null)}>Cancelar</button><button type="submit" className="button button-primary" disabled={saving || !Object.values(receiveAmounts).some((amount) => Number(amount) > 0)}>{saving ? <LoaderCircle size={16} className="spin" /> : <PackageCheck size={16} />} Confirmar recebimento</button></div></form></section></div>}
  </div>;
}
