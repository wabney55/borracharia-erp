"use client";

import { useState, type FormEvent } from "react";
import { Building2, Search } from "lucide-react";

type Branch = { id: string; name: string };
export function ReportFilters({ branches, branchId, from, to }: { branches: Branch[]; branchId: string; from: string; to: string }) {
  const [selectedBranch, setSelectedBranch] = useState(branchId);
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const query = new URLSearchParams({ branchId: selectedBranch, from: start, to: end }); window.location.assign(`/relatorios?${query.toString()}`); }
  return <form className="panel report-filter-panel" onSubmit={submit}><label className="form-field"><span>Unidade</span><span className="select-icon-wrap"><Building2 size={14} /><select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)}>{branches.length > 1 && <option value="all">Todas as unidades</option>}{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></span></label><label className="form-field"><span>De</span><input type="date" value={start} onChange={(event) => setStart(event.target.value)} required /></label><label className="form-field"><span>Até</span><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} required /></label><button className="button button-primary" type="submit"><Search size={15} /> Aplicar filtro</button></form>;
}
