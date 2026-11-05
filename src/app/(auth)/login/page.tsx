import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "@/components/login-form";
import { Gauge, ShieldCheck, Warehouse } from "lucide-react";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="login-layout">
      <section className="login-brand-panel">
        <div className="login-brand-top"><div className="brand-mark"><Warehouse size={23} strokeWidth={2.5} /></div><span>RODO<span className="brand-accent">ERP</span></span></div>
        <div className="login-hero">
          <div className="eyebrow"><span className="status-dot" /> GESTÃO AUTOMOTIVA</div>
          <h1>O controle da sua operação, <em>em cada unidade.</em></h1>
          <p>Vendas, serviços e gestão organizados para o ritmo da sua borracharia.</p>
          <div className="login-feature-list">
            <div><span className="feature-icon"><Gauge size={17} /></span><span><b>Visão clara do negócio</b><small>Acompanhe cada unidade em um só lugar</small></span></div>
            <div><span className="feature-icon"><ShieldCheck size={17} /></span><span><b>Dados protegidos</b><small>Acesso controlado por perfil e unidade</small></span></div>
          </div>
        </div>
        <div className="login-panel-footer"><span>PLATAFORMA DE GESTÃO</span><span>01 / 06 · FUNDAÇÃO</span></div>
      </section>
      <section className="login-form-panel">
        <div className="login-card-wrap">
          <div className="login-welcome"><span className="login-kicker">BEM-VINDO DE VOLTA</span><h2>Acesse sua conta</h2><p>Entre com seus dados para abrir o painel de gestão.</p></div>
          <LoginForm />
          <div className="login-security"><ShieldCheck size={15} /><span>Conexão protegida · acesso interno</span></div>
        </div>
        <div className="login-mobile-brand"><div className="brand-mark"><Warehouse size={20} strokeWidth={2.5} /></div><span>RODO<span className="brand-accent">ERP</span></span></div>
      </section>
    </main>
  );
}
