"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, LoaderCircle, MapPin, Save, Shield, X } from "lucide-react";

type Company = { legalName: string; tradeName: string; taxId: string | null; email: string | null; phone: string | null; postalCode: string | null; street: string | null; number: string | null; district: string | null; city: string | null; state: string | null };

export function CompanyProfile({ initialCompany, canManage }: { initialCompany: Company; canManage: boolean }) {
  const router = useRouter();
  const [company, setCompany] = useState<Company>(initialCompany);
  const [draft, setDraft] = useState<Company>(initialCompany);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function change(field: keyof Company, value: string) { setDraft((current) => ({ ...current, [field]: value })); }
  function reset() { setDraft(company); setError(""); setSuccess(""); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canManage) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/company", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar os dados.");
      setCompany(result.company); setDraft(result.company); setSuccess("Dados da empresa atualizados."); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível salvar os dados."); }
    finally { setBusy(false); }
  }

  const fields: { key: keyof Company; label: string; placeholder: string; required?: boolean }[] = [
    { key: "legalName", label: "Razão social", placeholder: "Razão social", required: true },
    { key: "tradeName", label: "Nome fantasia", placeholder: "Nome exibido no sistema", required: true },
    { key: "taxId", label: "CNPJ", placeholder: "00.000.000/0000-00" },
    { key: "email", label: "E-mail", placeholder: "contato@empresa.com.br" },
    { key: "phone", label: "Telefone", placeholder: "(00) 00000-0000" },
    { key: "postalCode", label: "CEP", placeholder: "00000-000" },
    { key: "street", label: "Endereço", placeholder: "Rua, avenida, rodovia" },
    { key: "number", label: "Número", placeholder: "Nº" },
    { key: "district", label: "Bairro", placeholder: "Bairro" },
    { key: "city", label: "Cidade", placeholder: "Cidade" },
    { key: "state", label: "UF", placeholder: "MT" },
  ];

  return <div className="workspace-page">
    <div className="page-heading"><div><div className="eyebrow page-eyebrow"><span className="status-dot" /> IDENTIFICAÇÃO EMPRESARIAL</div><h1>Empresa</h1><p>Dados compartilhados pelas unidades e exibidos nos documentos.</p></div><div className="company-status-badge"><Shield size={15} /> {canManage ? "Acesso de gestão geral" : "Somente leitura"}</div></div>
    {error && <div className="notice notice-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Fechar"><X size={16} /></button></div>}{success && <div className="notice notice-success" role="status">{success}<button onClick={() => setSuccess("")} aria-label="Fechar"><X size={16} /></button></div>}
    <form onSubmit={save} className="company-form panel">
      <div className="company-form-heading"><span className="company-form-icon"><Building2 size={19} /></span><div><span className="panel-kicker">CADASTRO PRINCIPAL</span><h2>Identificação da empresa</h2><p>Preencha os dados da matriz e da pessoa jurídica responsável.</p></div></div>
      <div className="company-form-section"><div className="company-section-title"><span className="company-section-number">01</span><div><b>Dados empresariais</b><small>Informações legais e de contato</small></div></div><div className="company-field-grid">{fields.slice(0, 5).map((field) => <label className={`form-field${field.key === "legalName" || field.key === "tradeName" ? " field-wide" : ""}`} key={field.key}><span>{field.label}{field.required && <i> *</i>}</span><input required={field.required} type={field.key === "email" ? "email" : "text"} value={draft[field.key] ?? ""} onChange={(event) => change(field.key, event.target.value)} placeholder={field.placeholder} maxLength={field.key === "legalName" ? 180 : field.key === "tradeName" ? 120 : 160} disabled={!canManage} /></label>)}</div></div>
      <div className="company-form-section"><div className="company-section-title"><span className="company-section-number">02</span><div><b>Endereço da matriz</b><small>Endereço para identificação e documentos</small></div></div><div className="company-field-grid company-address-grid">{fields.slice(5).map((field) => <label className={`form-field${field.key === "street" ? " field-wide" : ""}`} key={field.key}><span>{field.label}</span><input value={draft[field.key] ?? ""} onChange={(event) => change(field.key, event.target.value)} placeholder={field.placeholder} maxLength={field.key === "street" ? 160 : 100} disabled={!canManage} /></label>)}</div></div>
      <div className="company-form-footer"><div><MapPin size={15} /><span>Esta identificação será usada nos documentos impressos.</span></div>{canManage && <div className="company-form-actions"><button type="button" className="button button-quiet" onClick={reset} disabled={busy}>Descartar</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Save size={15} />}Salvar dados</button></div>}</div>
    </form>
    <div className="workspace-footnote"><Check size={14} /> Cada filial mantém endereço, telefone e CNPJ próprios quando aplicável.</div>
  </div>;
}
