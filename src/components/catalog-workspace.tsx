"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Check, CirclePlus, LoaderCircle, Package, Pencil, Search, ToggleLeft, ToggleRight, Wrench, X } from "lucide-react";

type Product = { id: string; code: string; barcode: string | null; name: string; description: string | null; unit: string; cost: number | null; salePrice: number; minimumStock: number; quantity: number; status: "ACTIVE" | "INACTIVE"; category: string | null; supplier: string | null };
type Service = { id: string; code: string; name: string; description: string | null; price: number; status: "ACTIVE" | "INACTIVE"; category: string | null };
type ProductDraft = { kind: "PRODUCT"; code: string; barcode: string; name: string; description: string; category: string; supplier: string; unit: string; cost: string; salePrice: string; minimumStock: string };
type ServiceDraft = { kind: "SERVICE"; code: string; name: string; description: string; category: string; price: string };
type CatalogData = { products: Product[]; services: Service[] };
const emptyProduct: ProductDraft = { kind: "PRODUCT", code: "", barcode: "", name: "", description: "", category: "", supplier: "", unit: "UN", cost: "0", salePrice: "0", minimumStock: "0" };
const emptyService: ServiceDraft = { kind: "SERVICE", code: "", name: "", description: "", category: "", price: "0" };
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function CatalogWorkspace({ initialProducts, initialServices, canManage }: { initialProducts: Product[]; initialServices: Service[]; canManage: boolean }) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [services, setServices] = useState(initialServices);
  const [tab, setTab] = useState<"PRODUCT" | "SERVICE">("PRODUCT");
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProduct);
  const [serviceDraft, setServiceDraft] = useState<ServiceDraft>(emptyService);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const current = tab === "PRODUCT" ? products : services;
  const visible = useMemo(() => current.filter((item) => (showInactive || item.status === "ACTIVE") && `${item.name} ${item.code} ${"barcode" in item ? item.barcode ?? "" : ""} ${item.category ?? ""}`.toLowerCase().includes(query.toLowerCase())), [current, showInactive, query]);
  const activeCount = products.filter((item) => item.status === "ACTIVE").length + services.filter((item) => item.status === "ACTIVE").length;

  function openCreate(kind: "PRODUCT" | "SERVICE" = tab) {
    setTab(kind); setEditingId(null); setProductDraft(emptyProduct); setServiceDraft(emptyService); setError(""); setFormOpen(true);
  }
  function openEdit(item: Product | Service) {
    setEditingId(item.id); setError(""); setFormOpen(true);
    if ("salePrice" in item) {
      setTab("PRODUCT"); setProductDraft({ kind: "PRODUCT", code: item.code, barcode: item.barcode ?? "", name: item.name, description: item.description ?? "", category: item.category ?? "", supplier: item.supplier ?? "", unit: item.unit, cost: String(item.cost ?? 0), salePrice: String(item.salePrice), minimumStock: String(item.minimumStock) });
    } else {
      setTab("SERVICE"); setServiceDraft({ kind: "SERVICE", code: item.code, name: item.name, description: item.description ?? "", category: item.category ?? "", price: String(item.price) });
    }
  }

  async function refreshCatalog() {
    const response = await fetch("/api/catalog", { cache: "no-store" });
    const data = await response.json() as CatalogData;
    setProducts(data.products); setServices(data.services); router.refresh();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const data = tab === "PRODUCT" ? productDraft : serviceDraft;
    try {
      const response = await fetch("/api/catalog", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingId ? { ...data, id: editingId } : data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar o item.");
      await refreshCatalog(); setNotice(editingId ? "Item atualizado." : "Item cadastrado no catálogo central."); setFormOpen(false); setEditingId(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível salvar o item."); }
    finally { setBusy(false); }
  }

  async function toggleStatus(item: Product | Service) {
    if (!window.confirm(`${item.status === "ACTIVE" ? "Inativar" : "Reativar"} ${item.name}?`)) return;
    const kind = "salePrice" in item ? "PRODUCT" : "SERVICE";
    const response = await fetch("/api/catalog", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, kind }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Não foi possível alterar o item."); return; }
    await refreshCatalog(); setNotice(result.status === "ACTIVE" ? "Item reativado." : "Item inativado. O histórico foi preservado.");
  }

  return <div className="workspace-page">
    <div className="page-heading"><div><div className="eyebrow page-eyebrow"><span className="status-dot" /> CATÁLOGO CENTRAL</div><h1>Produtos e serviços</h1><p>Cadastre os itens compartilhados pela empresa e personalize preços por unidade depois.</p></div>{canManage && <div className="heading-actions"><button className="button button-quiet" onClick={() => openCreate("SERVICE")}><Wrench size={16} /> Novo serviço</button><button className="button button-primary" onClick={() => openCreate("PRODUCT")}><CirclePlus size={17} /> Novo produto</button></div>}</div>
    <div className="workspace-summary-grid"><div className="workspace-summary-card"><span className="summary-icon summary-orange"><Package size={18} /></span><div><small>Produtos ativos</small><b>{activeCount ? products.filter((item) => item.status === "ACTIVE").length : 0}</b></div></div><div className="workspace-summary-card"><span className="summary-icon summary-blue"><Wrench size={18} /></span><div><small>Serviços ativos</small><b>{services.filter((item) => item.status === "ACTIVE").length}</b></div></div><div className="workspace-summary-card"><span className="summary-icon summary-green"><Boxes size={18} /></span><div><small>Estoque inicial</small><b>Separado por unidade</b></div></div></div>
    {error && !formOpen && <div className="notice notice-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Fechar"><X size={16} /></button></div>}{notice && <div className="notice notice-success" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Fechar"><X size={16} /></button></div>}
    {formOpen && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="catalog-title"><div className="modal-heading"><div><span className="panel-kicker">CATÁLOGO DA EMPRESA</span><h2 id="catalog-title">{editingId ? "Editar item" : tab === "PRODUCT" ? "Novo produto" : "Novo serviço"}</h2><p>O catálogo é compartilhado pelas unidades.</p></div><button className="icon-button" onClick={() => setFormOpen(false)} aria-label="Fechar"><X size={19} /></button></div><form onSubmit={save} className="modal-form">
      {tab === "PRODUCT" ? <>
        <div className="form-grid-two"><label className="form-field"><span>Código interno</span><input value={editingId ? productDraft.code : "Gerado automaticamente ao cadastrar"} readOnly /><small>{editingId ? "Código permanente do produto" : "Sequencial e nunca reutilizado"}</small></label><label className="form-field"><span>Código de barras</span><input value={productDraft.barcode} onChange={(event) => setProductDraft((draft) => ({ ...draft, barcode: event.target.value }))} placeholder="EAN / GTIN" maxLength={80} /></label></div>
        <label className="form-field"><span>Nome do produto <i>*</i></span><input required value={productDraft.name} onChange={(event) => setProductDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Nome do produto" maxLength={160} /></label>
        <div className="form-grid-two"><label className="form-field"><span>Categoria</span><input value={productDraft.category} onChange={(event) => setProductDraft((draft) => ({ ...draft, category: event.target.value }))} placeholder="Ex.: Pneus" maxLength={100} /></label><label className="form-field"><span>Fornecedor</span><input value={productDraft.supplier} onChange={(event) => setProductDraft((draft) => ({ ...draft, supplier: event.target.value }))} placeholder="Nome do fornecedor" maxLength={160} /></label></div>
        <div className="form-grid-three"><label className="form-field"><span>Unidade</span><input value={productDraft.unit} onChange={(event) => setProductDraft((draft) => ({ ...draft, unit: event.target.value }))} maxLength={10} /></label><label className="form-field"><span>Custo (R$)</span><input required type="number" min="0" step="0.01" value={productDraft.cost} onChange={(event) => setProductDraft((draft) => ({ ...draft, cost: event.target.value }))} /></label><label className="form-field"><span>Preço de venda (R$)</span><input required type="number" min="0" step="0.01" value={productDraft.salePrice} onChange={(event) => setProductDraft((draft) => ({ ...draft, salePrice: event.target.value }))} /></label></div>
        <label className="form-field"><span>Estoque mínimo</span><input type="number" min="0" step="0.001" value={productDraft.minimumStock} onChange={(event) => setProductDraft((draft) => ({ ...draft, minimumStock: event.target.value }))} /></label>
      </> : <>
        <div className="form-grid-two"><label className="form-field"><span>Código interno</span><input value={editingId ? serviceDraft.code : "Gerado automaticamente ao cadastrar"} readOnly /><small>{editingId ? "Código permanente do serviço" : "Sequencial e nunca reutilizado"}</small></label><label className="form-field"><span>Categoria</span><input value={serviceDraft.category} onChange={(event) => setServiceDraft((draft) => ({ ...draft, category: event.target.value }))} placeholder="Ex.: Mão de obra" maxLength={100} /></label></div>
        <label className="form-field"><span>Nome do serviço <i>*</i></span><input required value={serviceDraft.name} onChange={(event) => setServiceDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Ex.: Conserto de pneu" maxLength={160} /></label>
        <label className="form-field"><span>Preço (R$) <i>*</i></span><input required type="number" min="0" step="0.01" value={serviceDraft.price} onChange={(event) => setServiceDraft((draft) => ({ ...draft, price: event.target.value }))} /></label>
      </>}
      <label className="form-field"><span>Descrição</span><textarea value={tab === "PRODUCT" ? productDraft.description : serviceDraft.description} onChange={(event) => tab === "PRODUCT" ? setProductDraft((draft) => ({ ...draft, description: event.target.value })) : setServiceDraft((draft) => ({ ...draft, description: event.target.value }))} placeholder="Detalhes adicionais" maxLength={1000} /></label>
      {error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setFormOpen(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{editingId ? "Salvar alterações" : "Cadastrar"}</button></div>
    </form></section></div>}
    <section className="panel data-panel"><div className="data-panel-heading catalog-heading"><div><span className="panel-kicker">ITENS DISPONÍVEIS</span><h2>Catálogo <span className="heading-count">{visible.length}</span></h2></div><div className="table-tools"><div className="catalog-tabs"><button className={tab === "PRODUCT" ? "catalog-tab active" : "catalog-tab"} onClick={() => { setTab("PRODUCT"); setQuery(""); }}>Produtos</button><button className={tab === "SERVICE" ? "catalog-tab active" : "catalog-tab"} onClick={() => { setTab("SERVICE"); setQuery(""); }}>Serviços</button></div><label className="table-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar item" aria-label="Buscar item do catálogo" /></label><button className={`filter-button${showInactive ? " filter-active" : ""}`} onClick={() => setShowInactive(!showInactive)}>{showInactive ? "Todos" : "Ativos"}</button></div></div>
      <div className="table-scroll"><table className="data-table"><thead>{tab === "PRODUCT" ? <tr><th>PRODUTO</th><th>CÓDIGO</th><th>CATEGORIA</th><th>ESTOQUE</th><th>PREÇO</th>{canManage && <th>CUSTO</th>}<th>STATUS</th>{canManage && <th className="table-actions-head">AÇÕES</th>}</tr> : <tr><th>SERVIÇO</th><th>CÓDIGO</th><th>CATEGORIA</th><th>PREÇO</th><th>STATUS</th>{canManage && <th className="table-actions-head">AÇÕES</th>}</tr>}</thead><tbody>{visible.map((item) => <tr key={item.id}>{"salePrice" in item ? <><td><div className="catalog-item-name"><span className="catalog-item-icon"><Package size={15} /></span><span><b>{item.name}</b><small>{item.barcode || item.unit}</small></span></div></td><td><span className="code-tag">{item.code}</span></td><td><span className="table-muted">{item.category || "—"}</span></td><td><span className={`stock-quantity${item.minimumStock > 0 && item.quantity <= item.minimumStock ? " stock-low" : ""}`}>{item.quantity} <small>{item.unit}</small></span></td><td><b className="price-value">{currency.format(item.salePrice)}</b></td>{canManage && <td><span className="table-muted">{item.cost === null ? "—" : currency.format(item.cost)}</span></td>}<td><span className={`status-pill${item.status === "ACTIVE" ? " status-active" : " status-inactive"}`}><i />{item.status === "ACTIVE" ? "Ativo" : "Inativo"}</span></td>{canManage && <td><div className="row-actions"><button className="row-action" onClick={() => openEdit(item)} title="Editar produto" aria-label={`Editar ${item.name}`}><Pencil size={15} /></button><button className="row-action" onClick={() => toggleStatus(item)} title={item.status === "ACTIVE" ? "Inativar produto" : "Reativar produto"} aria-label={item.status === "ACTIVE" ? "Inativar produto" : "Reativar produto"}>{item.status === "ACTIVE" ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}</button></div></td>}</> : <><td><div className="catalog-item-name"><span className="catalog-item-icon service-item-icon"><Wrench size={15} /></span><span><b>{item.name}</b><small>{item.description || "Serviço"}</small></span></div></td><td><span className="code-tag">{item.code}</span></td><td><span className="table-muted">{item.category || "—"}</span></td><td><b className="price-value">{currency.format(item.price)}</b></td><td><span className={`status-pill${item.status === "ACTIVE" ? " status-active" : " status-inactive"}`}><i />{item.status === "ACTIVE" ? "Ativo" : "Inativo"}</span></td>{canManage && <td><div className="row-actions"><button className="row-action" onClick={() => openEdit(item)} title="Editar serviço" aria-label={`Editar ${item.name}`}><Pencil size={15} /></button><button className="row-action" onClick={() => toggleStatus(item)} title={item.status === "ACTIVE" ? "Inativar serviço" : "Reativar serviço"} aria-label={item.status === "ACTIVE" ? "Inativar serviço" : "Reativar serviço"}>{item.status === "ACTIVE" ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}</button></div></td>}</>}</tr>)}</tbody></table></div>
      {!visible.length && <div className="table-empty"><Search size={19} /><b>{tab === "PRODUCT" ? "Nenhum produto cadastrado" : "Nenhum serviço cadastrado"}</b><span>Adicione os primeiros itens para formar o catálogo da empresa.</span></div>}<div className="table-footer"><span>Mostrando {visible.length} de {current.length} {tab === "PRODUCT" ? "produto(s)" : "serviço(s)"}</span><span><Boxes size={13} /> Estoque por filial</span></div>
    </section>
    <div className="workspace-footnote"><Check size={14} /> Produtos compartilham um cadastro; saldos permanecem separados por unidade. O preço por filial será configurado no módulo de estoque.</div>
  </div>;
}
