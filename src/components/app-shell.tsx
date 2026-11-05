"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PasswordDialog } from "@/components/password-dialog";
import {
  Activity, ArrowLeftRight, Banknote, Boxes, BriefcaseBusiness, Building2,
  ChevronDown, ClipboardList, CreditCard, FileBarChart, Gauge, LogOut, Menu, PackageSearch,
  Settings2, ShieldCheck, UsersRound, Warehouse, X,
} from "lucide-react";

type BranchOption = { id: string; name: string; code: string; isHeadquarters: boolean };
type CurrentUser = { name: string; email: string; role: string; defaultBranchId: string | null; mustChangePassword: boolean; company: { tradeName: string } };

const roleNames: Record<string, string> = {
  SUPER_ADMIN: "Administrador geral", GENERAL_MANAGER: "Gerente geral", BRANCH_MANAGER: "Gerente de unidade",
  ATTENDANT: "Atendente", STOCKKEEPER: "Estoquista", FINANCE: "Financeiro",
};

const mainLinks = [
  { label: "Visão geral", href: "/dashboard", icon: Gauge, ready: true },
  { label: "Empresa", href: "/empresa", icon: BriefcaseBusiness, ready: true },
  { label: "Unidades", href: "/unidades", icon: Building2, ready: true },
  { label: "Equipe", href: "/equipe", icon: UsersRound, ready: true },
];
const operationLinks = [
  { label: "Clientes", href: "/clientes", icon: BriefcaseBusiness, ready: true },
  { label: "Produtos e serviços", href: "/catalogo", icon: PackageSearch, ready: true },
  { label: "Estoque", href: "/estoque", icon: Boxes, ready: true },
  { label: "Transferências", href: "/transferencias", icon: ArrowLeftRight, ready: true },
  { label: "Ordens de serviço", href: "/ordens-de-servico", icon: ClipboardList, ready: true },
  { label: "Vendas e caixa", href: "/vendas", icon: Banknote, ready: true },
];
const managementLinks = [
  { label: "Financeiro", href: "/financeiro", icon: CreditCard, ready: true },
  { label: "Relatórios", href: "/relatorios", icon: FileBarChart, ready: true },
  { label: "Auditoria", href: "/auditoria", icon: Activity, ready: true },
];

function NavItem({ href, label, icon: Icon, ready, close }: { href: string; label: string; icon: typeof Gauge; ready?: boolean; close: () => void }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  return <Link href={href} onClick={close} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
    <Icon size={18} strokeWidth={active ? 2.15 : 1.8} /><span>{label}</span>{!ready && <span className="nav-phase">2+</span>}
  </Link>;
}

export function AppShell({ user, branches, children }: { user: CurrentUser; branches: BranchOption[]; children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(user.mustChangePassword);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();
  const search = useSearchParams();
  const canViewFinance = ["SUPER_ADMIN", "GENERAL_MANAGER", "BRANCH_MANAGER", "FINANCE"].includes(user.role);
  const canViewAudit = ["SUPER_ADMIN", "GENERAL_MANAGER", "BRANCH_MANAGER"].includes(user.role);
  const selectedBranch = search.get("branch") ?? "all";
  const branchLabel = selectedBranch === "all" ? "Todas as unidades" : branches.find((branch) => branch.id === selectedBranch)?.name ?? "Unidade";

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function changeBranch(value: string) {
    router.push(value === "all" ? "/dashboard" : `/dashboard?branch=${encodeURIComponent(value)}`);
  }

  const navContent = (close: () => void) => <>
    <div className="sidebar-brand"><div className="brand-mark"><Warehouse size={21} strokeWidth={2.5} /></div><span>RODO<span className="brand-accent">ERP</span></span><span className="brand-tag">GESTÃO</span></div>
    <div className="sidebar-company"><div className="company-avatar">{user.company.tradeName.slice(0, 1).toUpperCase()}</div><div className="company-copy"><b>{user.company.tradeName}</b><span>Operação local</span></div><ChevronDown size={15} /></div>
    <div className="sidebar-scroll">
      <div className="nav-section-label">PRINCIPAL</div>
      <nav className="side-nav" aria-label="Navegação principal">{mainLinks.map((item) => <NavItem key={item.href} {...item} close={close} />)}</nav>
      <div className="nav-section-label nav-section-gap">OPERAÇÃO</div>
      <nav className="side-nav" aria-label="Operação">{operationLinks.map((item) => <NavItem key={item.href} {...item} close={close} />)}</nav>
      <div className="nav-section-label nav-section-gap">GESTÃO</div>
      <nav className="side-nav" aria-label="Gestão">{managementLinks.filter((item) => item.href === "/auditoria" ? canViewAudit : canViewFinance).map((item) => <NavItem key={item.href} {...item} close={close} />)}</nav>
    </div>
    <div className="sidebar-bottom"><div className="sidebar-help"><div className="help-icon"><Settings2 size={16} /></div><span><b>Ambiente local</b><small>Dados separados por unidade</small></span><span className="help-progress">LAN</span></div><div className="sidebar-version">RODOERP <span>•</span> VERSÃO INICIAL</div></div>
  </>;

  return <div className="app-shell">
    {menuOpen && <button className="mobile-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar${menuOpen ? " sidebar-open" : ""}`}>{navContent(() => setMenuOpen(false))}<button className="mobile-close icon-button" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X size={18} /></button></aside>
    <div className="app-main">
      <header className="topbar">
        <div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button><div className="breadcrumb"><span>RODOERP</span><span className="breadcrumb-slash">/</span><b>{usePathname() === "/dashboard" ? "Visão geral" : "Gestão"}</b></div></div>
        <div className="topbar-right">
          <label className="branch-picker"><Building2 size={16} /><span>{branchLabel}</span><select value={selectedBranch} onChange={(event) => changeBranch(event.target.value)} aria-label="Filtrar painel por unidade"><option value="all">Todas as unidades</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><ChevronDown size={14} /></label>
          <div className="topbar-divider" />
          <button className="user-summary account-button" onClick={() => setPasswordOpen(true)} title="Alterar senha" aria-label="Alterar senha da conta"><div className="user-avatar">{user.name.split(/\s+/).slice(0, 2).map((name) => name[0]).join("").toUpperCase()}</div><div className="user-summary-copy"><b>{user.name}</b><span>{roleNames[user.role] ?? user.role}</span></div></button>
          <button className="logout-button icon-button" onClick={logout} disabled={loggingOut} title="Sair" aria-label="Sair"><LogOut size={18} /></button>
        </div>
      </header>
      <main className="page-content">{children}</main>
      <footer className="app-footer"><span><ShieldCheck size={14} /> Ambiente local protegido</span><span>RODOERP · Gestão de borracharia</span></footer>
    </div>
    {passwordOpen && <PasswordDialog forced={user.mustChangePassword} onClose={() => setPasswordOpen(false)} onSaved={() => setPasswordOpen(false)} />}
  </div>;
}
