"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Boxes, Building2, CirclePlus, ClipboardList, LoaderCircle, PackageCheck, Search, X } from "lucide-react";

type Branch = { id: string; name: string; code: string };
type Item = { id: string; code: string; name: string; unit: string; minimumStock: number; quantity: number; averageCost: number; status: string };
type Movement = { id: string; type: string; quantity: number; notes: string | null; createdAt: string; product: { name: string; code: string; unit: string }; user: string };
const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const movementLabels: Record<string, string> = { ENTRY: "Entrada", SALE: "Venda", WORK_ORDER: "Ordem de serviço", ADJUSTMENT: "Ajuste", TRANSFER_OUT: "Transferência enviada", TRANSFER_IN: "Transferência recebida", RETURN: "Devolução" };

export function InventoryWorkspace({ branches, defaultBranchId, canMoveStock }: { branches: Branch[]; defaultBranchId: string; canMoveStock: boolean }) {
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [items, setItems] = useState<Item[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Item | null>(null);
  const [kind, setKind] = useState<"ENTRY" | "EXIT" | "COUNT">("ENTRY");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lowStock = useMemo(() => items.filter((item) => item.minimumStock > 0 && item.quantity <= item.minimumStock).length, [items]);
  const filtered = items.filter((item) => `${item.name} ${item.code}`.toLowerCase().includes(search.toLowerCase()));

  async function load() {
    if (!branchId) { setItems([]); setMovements([]); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/inventory?branchId=${encodeURIComponent(branchId)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o estoque.");
      setItems(data.items); setMovements(data.movements);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar o estoque."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [branchId]);

  function openMovement(item: Item, nextKind: "ENTRY" | "EXIT" | "COUNT" = "ENTRY") {
    setSelected(item); setKind(nextKind); setQuantity(nextKind === "COUNT" ? String(item.quantity) : ""); setUnitCost(item.averageCost.toFixed(2)); setNotes(""); setError("");
  }
  async function saveMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, branchId, productId: selected.id, quantity, ...(kind === "ENTRY" ? { unitCost } : {}), notes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível registrar a movimentação.");
      setSelected(null); setNotice(`Estoque de ${data.result.product} atualizado para ${numberFormat.format(data.result.quantity)} unidade(s).`); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível registrar a movimentação."); }
    finally { setSaving(false); }
  }

  return <div className="workspace-page">
    <div className="page-heading"><div><div className="eyebrow page-eyebrow"><span className="status-dot" /> SALDOS E MOVIMENTAÇÕES</div><h1>Estoque</h1><p>Entradas, saídas e conferência separados por unidade.</p></div><label className="cash-branch-select"><Building2 size={15} /><select value={branchId} onChange={(event) => setBranchId(event.target.value)} aria-label="Selecionar unidade">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div>
    {error && !selected && <div className="notice notice-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Fechar"><X size={16} /></button></div>}{notice && <div className="notice notice-success" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Fechar"><X size={16} /></button></div>}
    <div className="sales-top-grid"><section className="panel cash-panel"><span className="panel-kicker">POSIÇÃO DA UNIDADE</span><div className="cash-balance-row"><div><small>Produtos cadastrados</small><b>{items.length}</b></div><span className="sales-info-icon"><Boxes size={20} /></span></div><div className="cash-meta"><span>{numberFormat.format(items.reduce((sum, item) => sum + item.quantity, 0))} unidades em estoque</span><span>{lowStock} abaixo do mínimo</span></div></section><section className="panel sales-info-card"><span className="sales-info-icon"><PackageCheck size={20} /></span><span className="panel-kicker">RÁPIDO E RASTREÁVEL</span><h2>Saldo por filial</h2><p>Cada movimento registra produto, usuário, data e unidade. Saídas não podem ultrapassar o saldo disponível.</p><div className="sales-info-foot"><ClipboardList size={14} /> Custo médio atualizado nas entradas</div></section></div>
    <section className="panel data-panel sales-history-panel"><div className="data-panel-heading"><div><span className="panel-kicker">CATÁLOGO E SALDOS</span><h2>Produtos <span className="heading-count">{filtered.length}</span></h2></div><label className="table-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto ou código" aria-label="Buscar produto" /></label></div><div className="table-scroll"><table className="data-table"><thead><tr><th>CÓDIGO</th><th>PRODUTO</th><th className="price-col">SALDO</th><th className="price-col">CUSTO MÉDIO</th><th>ESTOQUE MÍNIMO</th>{canMoveStock && <th>AÇÕES</th>}</tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><span className="sale-number">{item.code}</span></td><td><b>{item.name}</b></td><td className="price-col"><b className="price-value">{numberFormat.format(item.quantity)} {item.unit}</b></td><td className="price-col">{currency.format(item.averageCost)}</td><td>{item.minimumStock > 0 ? numberFormat.format(item.minimumStock) : "—"}{item.minimumStock > 0 && item.quantity <= item.minimumStock && <span className="status-pill status-pending">Baixo</span>}</td>{canMoveStock && <td><button className="button button-quiet table-button" onClick={() => openMovement(item)}><CirclePlus size={15} /> Movimentar</button></td>}</tr>)}</tbody></table></div>{loading ? <div className="cash-state"><LoaderCircle size={18} className="spin" /> Carregando estoque...</div> : !filtered.length ? <div className="table-empty"><Boxes size={19} /><b>Nenhum produto encontrado</b><span>Cadastre os produtos no catálogo central.</span></div> : null}<div className="table-footer"><span>{branches.find((branch) => branch.id === branchId)?.name} · Últimos saldos</span><span>Consulta atualizada ao carregar a página</span></div></section>
    <section className="panel data-panel sales-history-panel"><div className="data-panel-heading"><div><span className="panel-kicker">AUDITORIA DE ESTOQUE</span><h2>Movimentações recentes <span className="heading-count">{movements.length}</span></h2></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>DATA</th><th>PRODUTO</th><th>MOVIMENTO</th><th className="price-col">QUANTIDADE</th><th>USUÁRIO</th><th>OBSERVAÇÃO</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(movement.createdAt))}</td><td>{movement.product.name}</td><td>{movementLabels[movement.type] ?? movement.type}</td><td className="price-col"><b>{movement.quantity > 0 ? "+" : ""}{numberFormat.format(movement.quantity)} {movement.product.unit}</b></td><td>{movement.user}</td><td>{movement.notes ?? "—"}</td></tr>)}</tbody></table></div>{!movements.length && <div className="table-empty"><ClipboardList size={19} /><b>Sem movimentações registradas</b><span>Entradas, saídas e vendas aparecerão aqui.</span></div>}</section>
    {selected && <div className="modal-backdrop"><section className="modal-card cash-modal" role="dialog" aria-modal="true" aria-labelledby="movement-title"><div className="modal-heading"><div><span className="panel-kicker">{branches.find((branch) => branch.id === branchId)?.name}</span><h2 id="movement-title">Movimentar estoque</h2><p>{selected.code} · {selected.name} · saldo atual {numberFormat.format(selected.quantity)} {selected.unit}</p></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Fechar"><X size={19} /></button></div><form className="modal-form" onSubmit={saveMovement}><label className="form-field"><span>Tipo de operação</span><select value={kind} onChange={(event) => { const next = event.target.value as "ENTRY" | "EXIT" | "COUNT"; setKind(next); setQuantity(next === "COUNT" ? String(selected.quantity) : ""); }}><option value="ENTRY">Entrada</option><option value="EXIT">Saída</option><option value="COUNT">Contagem / ajuste de saldo</option></select></label><label className="form-field"><span>{kind === "COUNT" ? `Quantidade contada (${selected.unit})` : `Quantidade (${selected.unit})`} <i>*</i></span><input required autoFocus type="number" min={kind === "COUNT" ? "0" : "0.001"} step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>{kind === "ENTRY" && <label className="form-field"><span>Custo unitário da entrada (R$) <i>*</i></span><input required type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></label>}<label className="form-field"><span>Observação</span><input maxLength={240} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Nota, documento ou motivo" /></label>{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setSelected(null)}>Cancelar</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? <LoaderCircle size={16} className="spin" /> : <CirclePlus size={16} />} Registrar operação</button></div></form></section></div>}
  </div>;
}
