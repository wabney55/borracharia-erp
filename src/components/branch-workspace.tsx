"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, CirclePlus, LoaderCircle, MapPin, Pencil, Phone, Search, ToggleLeft, ToggleRight, X } from "lucide-react";

type Branch = { id: string; code: string; name: string; taxId: string | null; phone: string | null; manager: string | null; postalCode: string | null; street: string | null; number: string | null; district: string | null; city: string | null; state: string | null; status: "ACTIVE" | "INACTIVE"; isHeadquarters: boolean };
type Draft = { code: string; name: string; taxId: string; phone: string; manager: string; postalCode: string; street: string; number: string; district: string; city: string; state: string };
const blank: Draft = { code: "", name: "", taxId: "", phone: "", manager: "", postalCode: "", street: "", number: "", district: "", city: "", state: "" };

export function BranchWorkspace({ initialBranches, canManage }: { initialBranches: Branch[]; canManage: boolean }) {
  const router = useRouter();
  const [branches, setBranches] = useState(initialBranches);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const visible = useMemo(() => branches.filter((branch) => (showInactive || branch.status === "ACTIVE") && `${branch.name} ${branch.code} ${branch.city ?? ""}`.toLowerCase().includes(query.toLowerCase())), [branches, query, showInactive]);
  const activeCount = branches.filter((branch) => branch.status === "ACTIVE").length;

  function startCreate() { setEditingId(null); setDraft(blank); setError(""); setSuccess(""); setFormOpen(true); }
  function startEdit(branch: Branch) {
    setEditingId(branch.id);
    setDraft({ code: branch.code, name: branch.name, taxId: branch.taxId ?? "", phone: branch.phone ?? "", manager: branch.manager ?? "", postalCode: branch.postalCode ?? "", street: branch.street ?? "", number: branch.number ?? "", district: branch.district ?? "", city: branch.city ?? "", state: branch.state ?? "" });
    setError(""); setSuccess(""); setFormOpen(true);
  }
  function updateField(field: keyof Draft, value: string) { setDraft((current) => ({ ...current, [field]: value })); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/branches", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingId ? { ...draft, id: editingId } : draft) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar.");
      if (editingId) setBranches((current) => current.map((item) => item.id === editingId ? result.branch : item));
      else setBranches((current) => [...current, result.branch].sort((a, b) => Number(b.isHeadquarters) - Number(a.isHeadquarters) || a.name.localeCompare(b.name, "pt-BR")));
      setSuccess(editingId ? "Unidade atualizada." : "Unidade cadastrada.");
      setFormOpen(false); setDraft(blank); setEditingId(null);
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }

  async function toggleStatus(branch: Branch) {
    if (branch.isHeadquarters) return;
    const action = branch.status === "ACTIVE" ? "desativar" : "reativar";
    if (!window.confirm(`Deseja ${action} a unidade ${branch.name}?`)) return;
    setError(""); setSuccess("");
    const response = await fetch("/api/branches", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: branch.id }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Não foi possível alterar a unidade."); return; }
    setBranches((current) => current.map((item) => item.id === branch.id ? { ...item, status: result.status } : item));
    setSuccess(result.status === "ACTIVE" ? "Unidade reativada." : "Unidade desativada. O histórico foi preservado.");
    router.refresh();
  }

  return <div className="workspace-page">
    <div className="page-heading"><div><div className="eyebrow page-eyebrow"><span className="status-dot" /> ESTRUTURA DA EMPRESA</div><h1>Unidades</h1><p>Organize a matriz e as filiais da sua operação.</p></div>{canManage && <button className="button button-primary" onClick={startCreate}><CirclePlus size={17} /> Nova unidade</button>}</div>
    <div className="workspace-summary-grid"><div className="workspace-summary-card"><span className="summary-icon summary-orange"><Building2 size={18} /></span><div><small>Unidades cadastradas</small><b>{branches.length}</b></div></div><div className="workspace-summary-card"><span className="summary-icon summary-green"><Check size={18} /></span><div><small>Unidades ativas</small><b>{activeCount}</b></div></div><div className="workspace-summary-card"><span className="summary-icon summary-blue"><MapPin size={18} /></span><div><small>Estrutura</small><b>Multifilial</b></div></div></div>
    {error && !formOpen && <div className="notice notice-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Fechar"><X size={16} /></button></div>}{success && <div className="notice notice-success" role="status">{success}<button onClick={() => setSuccess("")} aria-label="Fechar"><X size={16} /></button></div>}
    {formOpen && <div className="modal-backdrop" role="presentation"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="branch-form-title"><div className="modal-heading"><div><span className="panel-kicker">CADASTRO DA EMPRESA</span><h2 id="branch-form-title">{editingId ? "Editar unidade" : "Nova unidade"}</h2><p>Preencha os dados para identificar esta operação.</p></div><button className="icon-button" onClick={() => setFormOpen(false)} aria-label="Fechar"><X size={19} /></button></div><form onSubmit={save} className="modal-form">
      <div className="form-grid-two"><label className="form-field"><span>Código da unidade <i>*</i></span><input required value={draft.code} onChange={(event) => updateField("code", event.target.value)} placeholder="Ex.: FILIAL-01" maxLength={20} /></label><label className="form-field"><span>Nome da unidade <i>*</i></span><input required value={draft.name} onChange={(event) => updateField("name", event.target.value)} placeholder="Ex.: Centro" maxLength={120} /></label></div>
      <div className="form-grid-two"><label className="form-field"><span>CNPJ</span><input value={draft.taxId} onChange={(event) => updateField("taxId", event.target.value)} placeholder="00.000.000/0000-00" maxLength={20} /></label><label className="form-field"><span>Telefone</span><input value={draft.phone} onChange={(event) => updateField("phone", event.target.value)} placeholder="(00) 00000-0000" maxLength={30} /></label></div>
      <label className="form-field"><span>Responsável pela unidade</span><input value={draft.manager} onChange={(event) => updateField("manager", event.target.value)} placeholder="Nome do responsável" maxLength={120} /></label>
      <div className="form-grid-city"><label className="form-field"><span>CEP</span><input value={draft.postalCode} onChange={(event) => updateField("postalCode", event.target.value)} placeholder="00000-000" maxLength={12} /></label><label className="form-field"><span>Número</span><input value={draft.number} onChange={(event) => updateField("number", event.target.value)} placeholder="Nº" maxLength={20} /></label></div>
      <div className="form-grid-two"><label className="form-field"><span>Endereço</span><input value={draft.street} onChange={(event) => updateField("street", event.target.value)} placeholder="Rua, avenida, rodovia" maxLength={160} /></label><label className="form-field"><span>Bairro</span><input value={draft.district} onChange={(event) => updateField("district", event.target.value)} placeholder="Bairro" maxLength={100} /></label></div>
      <div className="form-grid-city"><label className="form-field"><span>Cidade</span><input value={draft.city} onChange={(event) => updateField("city", event.target.value)} placeholder="Cidade" maxLength={100} /></label><label className="form-field"><span>UF</span><input value={draft.state} onChange={(event) => updateField("state", event.target.value)} placeholder="MT" maxLength={2} /></label></div>
      {error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setFormOpen(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{editingId ? "Salvar alterações" : "Cadastrar unidade"}</button></div>
    </form></section></div>}
    <section className="panel data-panel"><div className="data-panel-heading"><div><span className="panel-kicker">EMPRESA</span><h2>Estrutura de unidades <span className="heading-count">{visible.length}</span></h2></div><div className="table-tools"><label className="table-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar unidade" aria-label="Buscar unidade" /></label><button className={`filter-button${showInactive ? " filter-active" : ""}`} onClick={() => setShowInactive(!showInactive)}><ChevronDown size={15} />{showInactive ? "Todas" : "Ativas"}<ChevronDown size={13} /></button></div></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>UNIDADE</th><th>CÓDIGO</th><th>LOCALIZAÇÃO</th><th>RESPONSÁVEL</th><th>STATUS</th>{canManage && <th className="table-actions-head">AÇÕES</th>}</tr></thead><tbody>{visible.map((branch) => <tr key={branch.id}><td><div className="branch-table-name"><span className={`table-branch-icon${branch.isHeadquarters ? " headquarters-icon" : ""}`}><Building2 size={16} /></span><span><b>{branch.name}</b>{branch.isHeadquarters && <small>Matriz</small>}</span></div></td><td><span className="code-tag">{branch.code}</span></td><td><span className="table-muted">{branch.city ? `${branch.city}${branch.state ? `, ${branch.state}` : ""}` : "—"}</span></td><td>{branch.manager || <span className="table-muted">—</span>}</td><td><span className={`status-pill${branch.status === "ACTIVE" ? " status-active" : " status-inactive"}`}><i />{branch.status === "ACTIVE" ? "Ativa" : "Inativa"}</span></td>{canManage && <td><div className="row-actions"><button className="row-action" onClick={() => startEdit(branch)} title="Editar unidade" aria-label={`Editar ${branch.name}`}><Pencil size={15} /></button><button className="row-action" onClick={() => toggleStatus(branch)} disabled={branch.isHeadquarters} title={branch.status === "ACTIVE" ? "Desativar unidade" : "Reativar unidade"} aria-label={branch.status === "ACTIVE" ? "Desativar unidade" : "Reativar unidade"}>{branch.status === "ACTIVE" ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}</button></div></td>}</tr>)}</tbody></table></div>
      {!visible.length && <div className="table-empty"><Search size={19} /><b>Nenhuma unidade encontrada</b><span>Ajuste sua busca ou cadastre uma nova unidade.</span></div>}
      <div className="table-footer"><span>Mostrando {visible.length} de {branches.length} unidade{branches.length === 1 ? "" : "s"}</span><span><Phone size={13} /> Dados da operação local</span></div>
    </section>
    <div className="workspace-footnote"><ShieldCheckIcon /> As unidades compartilham a estrutura da empresa e mantêm estoque, caixa e movimentações separados.</div>
  </div>;
}

function ShieldCheckIcon() { return <Check size={14} />; }
