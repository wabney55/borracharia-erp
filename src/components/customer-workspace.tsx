"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CirclePlus, LoaderCircle, Mail, MapPin, Pencil, Phone, Search, ShieldCheck, Trash2, UserRound, X } from "lucide-react";

type Customer = { id: string; name: string; taxId: string | null; phone: string | null; whatsapp: string | null; email: string | null; city: string | null; state: string | null; isGeneric: boolean; notes: string | null; postalCode: string | null; street: string | null; number: string | null; district: string | null };
type Draft = Omit<Customer, "id" | "isGeneric">;
const blank: Draft = { name: "", taxId: "", phone: "", whatsapp: "", email: "", city: "", state: "", notes: "", postalCode: "", street: "", number: "", district: "" };

export function CustomerWorkspace({ initialCustomers, canManage }: { initialCustomers: Customer[]; canManage: boolean }) {
  const router = useRouter();
  const [customers, setCustomers] = useState(initialCustomers);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const visible = useMemo(() => customers.filter((customer) => `${customer.name} ${customer.taxId ?? ""} ${customer.phone ?? ""} ${customer.whatsapp ?? ""}`.toLowerCase().includes(query.toLowerCase())), [customers, query]);

  function openCreate() { setEditingId(null); setDraft(blank); setError(""); setFormOpen(true); }
  function openEdit(customer: Customer) {
    setEditingId(customer.id);
    setDraft({ name: customer.name, taxId: customer.taxId ?? "", phone: customer.phone ?? "", whatsapp: customer.whatsapp ?? "", email: customer.email ?? "", city: customer.city ?? "", state: customer.state ?? "", notes: customer.notes ?? "", postalCode: customer.postalCode ?? "", street: customer.street ?? "", number: customer.number ?? "", district: customer.district ?? "" });
    setError(""); setFormOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/customers", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingId ? { ...draft, id: editingId } : draft) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar o cliente.");
      const customer: Customer = { ...result.customer, taxId: result.customer.taxId ?? null, phone: result.customer.phone ?? null, whatsapp: result.customer.whatsapp ?? null, email: result.customer.email ?? null, city: result.customer.city ?? null, state: result.customer.state ?? null, notes: result.customer.notes ?? null, postalCode: result.customer.postalCode ?? null, street: result.customer.street ?? null, number: result.customer.number ?? null, district: result.customer.district ?? null };
      setCustomers((current) => editingId ? current.map((item) => item.id === editingId ? customer : item) : [...current, customer].sort((a, b) => Number(b.isGeneric) - Number(a.isGeneric) || a.name.localeCompare(b.name, "pt-BR")));
      setNotice(editingId ? "Cadastro atualizado." : "Cliente cadastrado e compartilhado entre as unidades."); setFormOpen(false); setDraft(blank); setEditingId(null); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível salvar o cliente."); }
    finally { setBusy(false); }
  }

  async function remove(customer: Customer) {
    if (!window.confirm(`Inativar o cadastro de ${customer.name}? O histórico será preservado.`)) return;
    const response = await fetch("/api/customers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: customer.id }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Não foi possível inativar o cliente."); return; }
    setCustomers((current) => current.filter((item) => item.id !== customer.id)); setNotice("Cadastro inativado. O histórico foi preservado."); router.refresh();
  }

  function setField(field: keyof Draft, value: string) { setDraft((current) => ({ ...current, [field]: value })); }
  return <div className="workspace-page">
    <div className="page-heading"><div><div className="eyebrow page-eyebrow"><span className="status-dot" /> CADASTRO COMPARTILHADO</div><h1>Clientes</h1><p>Um cadastro central, com atendimento identificado pela unidade responsável.</p></div><button className="button button-primary" onClick={openCreate}><CirclePlus size={17} /> Novo cliente</button></div>
    <div className="workspace-summary-grid"><div className="workspace-summary-card"><span className="summary-icon summary-orange"><UserRound size={18} /></span><div><small>Cadastros ativos</small><b>{customers.length}</b></div></div><div className="workspace-summary-card"><span className="summary-icon summary-blue"><Phone size={18} /></span><div><small>Pesquisa rápida</small><b>Nome, documento e telefone</b></div></div><div className="workspace-summary-card"><span className="summary-icon summary-green"><ShieldCheck size={18} /></span><div><small>Compartilhamento</small><b>Todas as unidades</b></div></div></div>
    {error && !formOpen && <div className="notice notice-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Fechar"><X size={16} /></button></div>}{notice && <div className="notice notice-success" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Fechar"><X size={16} /></button></div>}
    {formOpen && <div className="modal-backdrop"><section className="modal-card modal-card-customer" role="dialog" aria-modal="true" aria-labelledby="customer-title"><div className="modal-heading"><div><span className="panel-kicker">CADASTRO COMPARTILHADO</span><h2 id="customer-title">{editingId ? "Editar cliente" : "Novo cliente"}</h2><p>Os dados ficam disponíveis para os atendimentos das unidades.</p></div><button className="icon-button" onClick={() => setFormOpen(false)} aria-label="Fechar"><X size={19} /></button></div><form onSubmit={save} className="modal-form">
      <label className="form-field"><span>Nome ou razão social <i>*</i></span><input required value={draft.name} onChange={(event) => setField("name", event.target.value)} placeholder="Nome do cliente" maxLength={160} /></label>
      <div className="form-grid-two"><label className="form-field"><span>CPF/CNPJ</span><input value={draft.taxId} onChange={(event) => setField("taxId", event.target.value)} placeholder="000.000.000-00" maxLength={20} /></label><label className="form-field"><span>Telefone</span><input value={draft.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="(00) 00000-0000" maxLength={30} /></label></div>
      <div className="form-grid-two"><label className="form-field"><span>WhatsApp</span><input value={draft.whatsapp} onChange={(event) => setField("whatsapp", event.target.value)} placeholder="(00) 00000-0000" maxLength={30} /></label><label className="form-field"><span>E-mail</span><input type="email" value={draft.email} onChange={(event) => setField("email", event.target.value)} placeholder="cliente@email.com" maxLength={160} /></label></div>
      <div className="form-grid-city"><label className="form-field"><span>CEP</span><input value={draft.postalCode} onChange={(event) => setField("postalCode", event.target.value)} placeholder="00000-000" maxLength={12} /></label><label className="form-field"><span>Número</span><input value={draft.number} onChange={(event) => setField("number", event.target.value)} placeholder="Nº" maxLength={20} /></label></div>
      <div className="form-grid-two"><label className="form-field"><span>Endereço</span><input value={draft.street} onChange={(event) => setField("street", event.target.value)} placeholder="Rua, avenida" maxLength={160} /></label><label className="form-field"><span>Bairro</span><input value={draft.district} onChange={(event) => setField("district", event.target.value)} placeholder="Bairro" maxLength={100} /></label></div>
      <div className="form-grid-two"><label className="form-field"><span>Cidade</span><input value={draft.city} onChange={(event) => setField("city", event.target.value)} placeholder="Cidade" maxLength={100} /></label><label className="form-field"><span>UF</span><input value={draft.state} onChange={(event) => setField("state", event.target.value)} placeholder="MT" maxLength={2} /></label></div>
      <label className="form-field"><span>Observações</span><textarea value={draft.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="Informações úteis para o atendimento" maxLength={1000} /></label>
      {error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setFormOpen(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <CirclePlus size={16} />}{editingId ? "Salvar cadastro" : "Cadastrar cliente"}</button></div>
    </form></section></div>}
    <section className="panel data-panel"><div className="data-panel-heading"><div><span className="panel-kicker">BASE DE CLIENTES</span><h2>Cadastros <span className="heading-count">{visible.length}</span></h2></div><label className="table-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, documento ou telefone" aria-label="Buscar clientes" /></label></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>CLIENTE</th><th>DOCUMENTO</th><th>CONTATO</th><th>LOCALIZAÇÃO</th><th>TIPO</th><th className="table-actions-head">AÇÕES</th></tr></thead><tbody>{visible.map((customer) => <tr key={customer.id}><td><div className="team-table-person"><span className={`customer-avatar${customer.isGeneric ? " generic-avatar" : ""}`}><UserRound size={14} /></span><span><b>{customer.name}</b><small>{customer.email || "Cadastro compartilhado"}</small></span></div></td><td><span className="table-muted">{customer.taxId || "—"}</span></td><td><div className="customer-contact">{customer.phone && <span><Phone size={12} />{customer.phone}</span>}{customer.whatsapp && <span><Phone size={12} />{customer.whatsapp}</span>}{!customer.phone && !customer.whatsapp && <span className="table-muted">—</span>}</div></td><td><span className="table-muted">{customer.city ? `${customer.city}${customer.state ? `, ${customer.state}` : ""}` : "—"}</span></td><td><span className={`customer-type${customer.isGeneric ? " customer-type-generic" : ""}`}>{customer.isGeneric ? "Genérico" : "Cliente"}</span></td><td><div className="row-actions"><button className="row-action" onClick={() => openEdit(customer)} title="Editar cliente" aria-label={`Editar ${customer.name}`}><Pencil size={15} /></button>{canManage && !customer.isGeneric && <button className="row-action danger-action" onClick={() => remove(customer)} title="Inativar cliente" aria-label={`Inativar ${customer.name}`}><Trash2 size={15} /></button>}</div></td></tr>)}</tbody></table></div>
      {!visible.length && <div className="table-empty"><Search size={19} /><b>Nenhum cliente encontrado</b><span>Cadastre um novo cliente para começar a formar o histórico.</span></div>}<div className="table-footer"><span>Mostrando {visible.length} de {customers.length} cliente{customers.length === 1 ? "" : "s"}</span><span><MapPin size={13} /> Cadastro central por empresa</span></div>
    </section>
    <div className="workspace-footnote"><ShieldCheck size={14} /> O cliente é compartilhado; cada venda e serviço continuará registrado na filial que realizou o atendimento.</div>
  </div>;
}
