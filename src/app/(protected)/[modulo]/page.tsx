import Link from "next/link";
import { ArrowRight, Boxes, ClipboardList, Construction, LockKeyhole } from "lucide-react";

const modules: Record<string, { title: string; phase: number; description: string; icon: typeof Boxes; next: string[] }> = {
};

export default async function ModuleRoadmapPage({ params }: { params: Promise<{ modulo: string }> }) {
  const { modulo } = await params;
  const item = modules[modulo] ?? { title: "Módulo", phase: 2, description: "Este módulo será liberado em uma das próximas fases do projeto.", icon: Construction, next: ["Estrutura multifilial", "Acesso por perfil", "Registros auditáveis"] };
  const Icon = item.icon;
  return <div className="roadmap-page"><div className="page-heading"><div><div className="eyebrow page-eyebrow"><span className="status-dot" /> ROTEIRO DE ENTREGA</div><h1>{item.title}</h1><p>{item.description}</p></div></div><section className="roadmap-card panel"><div className="roadmap-art"><span className="roadmap-icon"><Icon size={25} /></span><span className="roadmap-phase">FASE {String(item.phase).padStart(2, "0")}</span><Construction className="roadmap-watermark" size={104} /></div><div className="roadmap-copy"><span className="panel-kicker">PRÓXIMO NA FILA</span><h2>Este módulo ainda está em desenvolvimento</h2><p>A base do sistema está pronta. Este módulo será conectado à estrutura multifilial nas próximas fases, com regras e registros integrados.</p><div className="roadmap-checklist">{item.next.map((line) => <div key={line}><span><ArrowRight size={13} /></span>{line}</div>)}</div><Link href="/dashboard" className="button button-primary">Voltar à visão geral <ArrowRight size={16} /></Link></div></section><div className="roadmap-note"><LockKeyhole size={15} /> A tela ainda não processa operações deste módulo.</div></div>;
}
