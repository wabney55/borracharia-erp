"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Check, ChevronDown, CirclePlus, Eye, EyeOff, LoaderCircle, Mail, Search, Shield, ToggleLeft, ToggleRight, UsersRound, X } from "lucide-react";

type Branch = { id: string; name: string; code: string; status: "ACTIVE" | "INACTIVE" };
type TeamUser = { id: string; name: string; email: string; role: string; status: "ACTIVE" | "INACTIVE"; lastLoginAt: Date | string | null; branches: { branch: { id: string; name: string } }[] };
type Role = "GENERAL_MANAGER" | "BRANCH_MANAGER" | "ATTENDANT" | "STOCKKEEPER" | "FINANCE";
const roleNames: Record<string, string> = { SUPER_ADMIN: "Administrador geral", GENERAL_MANAGER: "Gerente geral", BRANCH_MANAGER: "Gerente de unidade", ATTENDANT: "Atendente", STOCKKEEPER: "Estoquista", FINANCE: "Financeiro" };
const blank = { name: "", email: "", password: "", role: "ATTENDANT" as Role, branchIds: [] as string[] };

export function TeamWorkspace({ initialUsers, branches, canManage, isSuperAdmin }: { initialUsers: TeamUser[]; branches: Branch[]; canManage: boolean; isSuperAdmin: boolean }) {
  const [users, setUsers] = useState(initialUsers);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState(blank);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const activeUsers = users.filter((user) => user.status === "ACTIVE").length;
  const visible = useMemo(() => users.filter((user) => (showInactive || user.status === "ACTIVE") && `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(query.toLowerCase())), [users, showInactive, query]);
  const roleOptions: Role[] = isSuperAdmin ? ["GENERAL_MANAGER", "BRANCH_MANAGER", "ATTENDANT", "STOCKKEEPER", "FINANCE"] : ["BRANCH_MANAGER", "ATTENDANT", "STOCKKEEPER", "FINANCE"];

  function openForm() { setDraft({ ...blank, branchIds: branches[0] ? [branches[0].id] : [] }); setError(""); setNotice(""); setFormOpen(true); }
  function toggleBranch(id: string) { setDraft((current) => ({ ...current, branchIds: current.branchIds.includes(id) ? current.branchIds.filter((item) => item !== id) : [...current.branchIds, id] })); }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível cadastrar.");
      const created: TeamUser = { ...result.user, status: "ACTIVE", lastLoginAt: null, branches: branches.filter((branch) => draft.branchIds.includes(branch.id)).map((branch) => ({ branch: { id: branch.id, name: branch.name } })) };
      setUsers((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setNotice("Usuário cadastrado com acesso às unidades selecionadas."); setFormOpen(false); setDraft(blank);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível cadastrar."); }
    finally { setBusy(false); }
  }

  async function toggleStatus(target: TeamUser) {
    const nextStatus = target.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    if (!window.confirm(`${nextStatus === "INACTIVE" ? "Desativar" : "Reativar"} o acesso de ${target.name}?`)) return;
    setError(""); setNotice("");
    const response = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: target.id, status: nextStatus }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Não foi possível alterar o usuário."); return; }
    setUsers((current) => current.map((user) => user.id === target.id ? { ...user, status: result.status } : user));
    setNotice(nextStatus === "INACTIVE" ? "Acesso desativado. O histórico foi preservado." : "Acesso reativado.");
  }

  return <div className="workspace-page">
    <div className="page-heading"><div><div className="eyebrow page-eyebrow"><span className="status-dot" /> ACESSO E PERMISSÕES</div><h1>Equipe</h1><p>Gerencie quem acessa o sistema e as unidades autorizadas.</p></div>{canManage && <button className="button button-primary" onClick={openForm}><CirclePlus size={17} /> Novo usuário</button>}</div>
    <div className="workspace-summary-grid"><div className="workspace-summary-card"><span className="summary-icon summary-orange"><UsersRound size={18} /></span><div><small>Usuários cadastrados</small><b>{users.length}</b></div></div><div className="workspace-summary-card"><span className="summary-icon summary-green"><Check size={18} /></span><div><small>Acessos ativos</small><b>{activeUsers}</b></div></div><div className="workspace-summary-card"><span className="summary-icon summary-blue"><Shield size={18} /></span><div><small>Controle</small><b>Por perfil e unidade</b></div></div></div>
    {error && !formOpen && <div className="notice notice-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Fechar"><X size={16} /></button></div>}{notice && <div className="notice notice-success" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Fechar"><X size={16} /></button></div>}
    {formOpen && <div className="modal-backdrop"><section className="modal-card modal-card-team" role="dialog" aria-modal="true" aria-labelledby="team-form-title"><div className="modal-heading"><div><span className="panel-kicker">ACESSO AO SISTEMA</span><h2 id="team-form-title">Novo usuário</h2><p>Defina o perfil e as unidades que ele poderá acessar.</p></div><button className="icon-button" onClick={() => setFormOpen(false)} aria-label="Fechar"><X size={19} /></button></div><form onSubmit={createUser} className="modal-form">
      <label className="form-field"><span>Nome completo <i>*</i></span><input required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do usuário" maxLength={120} /></label>
      <label className="form-field"><span>E-mail de acesso <i>*</i></span><div className="form-input-icon"><Mail size={15} /><input required type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} placeholder="nome@empresa.com.br" maxLength={160} /></div></label>
      <label className="form-field"><span>Senha inicial <i>*</i></span><div className="form-input-icon"><input required type={showPassword ? "text" : "password"} minLength={10} maxLength={100} value={draft.password} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} placeholder="Mínimo de 10 caracteres" /><button type="button" className="icon-button" onClick={() => setShowPassword(!showPassword)} aria-label="Mostrar ou ocultar senha">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
      <label className="form-field"><span>Perfil de acesso <i>*</i></span><div className="select-wrap"><select value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as Role }))}>{roleOptions.map((role) => <option key={role} value={role}>{roleNames[role]}</option>)}</select><ChevronDown size={15} /></div></label>
      <fieldset className="branch-checks"><legend>Unidades autorizadas <i>*</i></legend><div className="branch-check-list">{branches.filter((branch) => branch.status === "ACTIVE").map((branch) => <label key={branch.id} className="branch-check"><input type="checkbox" checked={draft.branchIds.includes(branch.id)} onChange={() => toggleBranch(branch.id)} /><span className="custom-check"><Check size={12} /></span><span><b>{branch.name}</b><small>{branch.code}</small></span></label>)}</div></fieldset>
      {error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setFormOpen(false)}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Cadastrar usuário</button></div>
    </form></section></div>}
    <section className="panel data-panel"><div className="data-panel-heading"><div><span className="panel-kicker">USUÁRIOS</span><h2>Controle de acesso <span className="heading-count">{visible.length}</span></h2></div><div className="table-tools"><label className="table-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pessoa" aria-label="Buscar pessoa" /></label><button className={`filter-button${showInactive ? " filter-active" : ""}`} onClick={() => setShowInactive(!showInactive)}>{showInactive ? "Todos" : "Ativos"}<ChevronDown size={13} /></button></div></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>USUÁRIO</th><th>PERFIL</th><th>UNIDADES</th><th>ÚLTIMO ACESSO</th><th>STATUS</th>{canManage && <th className="table-actions-head">AÇÕES</th>}</tr></thead><tbody>{visible.map((teamUser) => <tr key={teamUser.id}><td><div className="team-table-person"><span className="user-avatar table-user-avatar">{teamUser.name.split(/\s+/).slice(0, 2).map((name) => name[0]).join("").toUpperCase()}</span><span><b>{teamUser.name}</b><small>{teamUser.email}</small></span></div></td><td><span className={`role-tag role-${teamUser.role.toLowerCase()}`}>{roleNames[teamUser.role] ?? teamUser.role}</span></td><td><div className="branch-pill-list">{teamUser.branches.slice(0, 2).map(({ branch }) => <span key={branch.id}>{branch.name}</span>)}{teamUser.branches.length > 2 && <span>+{teamUser.branches.length - 2}</span>}{!teamUser.branches.length && <span className="table-muted">—</span>}</div></td><td><span className="table-muted">{teamUser.lastLoginAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(teamUser.lastLoginAt)) : "Ainda não acessou"}</span></td><td><span className={`status-pill${teamUser.status === "ACTIVE" ? " status-active" : " status-inactive"}`}><i />{teamUser.status === "ACTIVE" ? "Ativo" : "Inativo"}</span></td>{canManage && <td><div className="row-actions"><button className="row-action" onClick={() => toggleStatus(teamUser)} title={teamUser.status === "ACTIVE" ? "Desativar acesso" : "Reativar acesso"} aria-label={teamUser.status === "ACTIVE" ? "Desativar acesso" : "Reativar acesso"}>{teamUser.status === "ACTIVE" ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}</button></div></td>}</tr>)}</tbody></table></div>
      {!visible.length && <div className="table-empty"><Search size={19} /><b>Nenhum usuário encontrado</b><span>Ajuste a busca ou cadastre alguém da equipe.</span></div>}
      <div className="table-footer"><span>Mostrando {visible.length} de {users.length} usuário{users.length === 1 ? "" : "s"}</span><span><Shield size={13} /> Senhas armazenadas com proteção</span></div>
    </section>
    <div className="workspace-footnote"><Shield size={14} /> O usuário só acessa as unidades vinculadas ao seu cadastro. O administrador geral pode visualizar os dados consolidados.</div>
  </div>;
}
