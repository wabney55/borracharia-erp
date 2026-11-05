import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser, userCanSeeAllBranches } from "@/lib/session";
import { PrintButton } from "@/components/print-button";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const paymentNames: Record<string, string> = { CASH: "Dinheiro", PIX: "PIX", DEBIT: "Cartão de débito", CREDIT: "Cartão de crédito", TRANSFER: "Transferência", ON_ACCOUNT: "Fiado / conta a receber" };

export default async function SaleReceiptPage({ params }: { params: Promise<{ saleId: string }> }) {
  const user = await requireUser();
  const { saleId } = await params;
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, companyId: user.companyId, status: "COMPLETED" },
    include: { branch: true, customer: true, user: { select: { name: true } }, items: true, payments: true },
  });
  if (!sale) notFound();
  if (!userCanSeeAllBranches(user) && !user.branches.some(({ branch }) => branch.id === sale.branchId)) redirect("/vendas");

  const branch = sale.branch;
  const company = user.company;
  const address = [
    branch.street ? `${branch.street}, ${branch.number ?? "s/n"}` : null,
    branch.district,
    branch.city ? `${branch.city}${branch.state ? `/${branch.state}` : ""}` : null,
    branch.postalCode ? `CEP ${branch.postalCode}` : null,
  ].filter(Boolean).join(" · ");
  const taxId = branch.taxId ?? company.taxId;

  return <div className="print-page-wrap sale-receipt-wrap">
    <div className="print-actions">
      <Link className="button button-quiet" href="/vendas"><ArrowLeft size={15} /> Voltar para vendas</Link>
      <PrintButton />
    </div>
    <article className="document-print sale-receipt">
      <header className="document-header">
        <div className="document-brand"><span className="document-mark"><Building2 size={20} /></span><span><b>{company.tradeName}</b><small>{company.legalName}</small></span></div>
        <div className="document-number"><small>COMPROVANTE DE VENDA</small><b>#{String(sale.number).padStart(5, "0")}</b><span>{dateTime.format(sale.createdAt)}</span></div>
      </header>
      <div className="sale-receipt-label">COMPROVANTE SEM VALOR FISCAL</div>
      <section className="document-branch">
        <b>{branch.name}</b>
        {address && <span>{address}</span>}
        <span>{[taxId ? `CNPJ/CPF ${taxId}` : null, branch.phone].filter(Boolean).join(" · ") || "Dados de contato não cadastrados"}</span>
      </section>
      <div className="document-rule" />
      <section className="document-customer-grid">
        <div><small>CLIENTE</small><b>{sale.customer?.name ?? "Consumidor"}</b><span>{[sale.customer?.taxId, sale.customer?.phone].filter(Boolean).join(" · ") || "Consumidor final"}</span></div>
        <div><small>ATENDIMENTO</small><b>{sale.user.name}</b><span>Unidade: {branch.code} · {branch.name}</span></div>
      </section>
      <table className="document-items sale-receipt-items">
        <thead><tr><th>DESCRIÇÃO</th><th>QTD.</th><th>VALOR UNIT.</th><th>TOTAL</th></tr></thead>
        <tbody>{sale.items.map((item) => <tr key={item.id}><td>{item.description}</td><td>{Number(item.quantity).toLocaleString("pt-BR")}</td><td>{currency.format(Number(item.unitPrice))}</td><td>{currency.format(Number(item.total))}</td></tr>)}</tbody>
      </table>
      <section className="document-total">
        <span>Subtotal <b>{currency.format(Number(sale.subtotal))}</b></span>
        {Number(sale.discount) > 0 && <span>Desconto <b>− {currency.format(Number(sale.discount))}</b></span>}
        <strong>Total da venda <b>{currency.format(Number(sale.total))}</b></strong>
      </section>
      <section className="sale-receipt-payments">
        <small>FORMAS DE PAGAMENTO</small>
        {sale.payments.map((payment) => <div key={payment.id}><span>{paymentNames[payment.method] ?? payment.method}</span><b>{currency.format(Number(payment.amount))}</b></div>)}
      </section>
      <footer className="document-footer"><span>Venda #{String(sale.number).padStart(5, "0")}</span><span>{branch.name}</span></footer>
      <p className="document-disclaimer">Este comprovante registra a venda no sistema e não substitui NF-e, NFC-e ou outro documento fiscal aplicável.</p>
    </article>
  </div>;
}
