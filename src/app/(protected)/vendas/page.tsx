import { prisma } from "@/lib/prisma";
import { requireUser, userCanSeeAllBranches } from "@/lib/session";
import { SalesWorkspace } from "@/components/sales-workspace";

export default async function SalesPage() {
  const user = await requireUser();
  const branches = userCanSeeAllBranches(user)
    ? await prisma.branch.findMany({ where: { companyId: user.companyId, status: "ACTIVE", deletedAt: null }, orderBy: [{ isHeadquarters: "desc" }, { name: "asc" }], select: { id: true, name: true, code: true, isHeadquarters: true } })
    : user.branches.map(({ branch }) => branch).filter((branch) => branch.status === "ACTIVE" && !branch.deletedAt).map(({ id, name, code, isHeadquarters }) => ({ id, name, code, isHeadquarters }));
  const initialBranch = branches.find((branch) => branch.id === user.defaultBranchId)?.id ?? branches[0]?.id;
  const [products, services, customers, sales] = await Promise.all([
    prisma.product.findMany({ where: { companyId: user.companyId, status: "ACTIVE", deletedAt: null }, select: { id: true, name: true, code: true, salePrice: true, unit: true }, orderBy: { name: "asc" }, take: 500 }),
    prisma.service.findMany({ where: { companyId: user.companyId, status: "ACTIVE" }, select: { id: true, name: true, code: true, price: true }, orderBy: { name: "asc" }, take: 500 }),
    prisma.customer.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, name: true, isGeneric: true }, orderBy: [{ isGeneric: "desc" }, { name: "asc" }], take: 250 }),
    initialBranch ? prisma.sale.findMany({ where: { companyId: user.companyId, branchId: initialBranch, status: "COMPLETED" }, include: { customer: { select: { name: true } }, items: { select: { id: true, description: true, quantity: true, total: true } }, payments: { select: { method: true, amount: true } } }, orderBy: { createdAt: "desc" }, take: 50 }) : Promise.resolve([]),
  ]);
  const initialSales = sales.map((sale) => ({ id: sale.id, number: sale.number, total: Number(sale.total), createdAt: sale.createdAt.toISOString(), customer: sale.customer?.name ?? "Consumidor", items: sale.items.map((item) => ({ id: item.id, description: item.description, quantity: Number(item.quantity), total: Number(item.total) })), payments: sale.payments.map((payment) => ({ method: payment.method, amount: Number(payment.amount) })) }));
  return <SalesWorkspace branches={branches} products={products.map((item) => ({ ...item, salePrice: Number(item.salePrice), quantity: 0 }))} services={services.map((item) => ({ ...item, price: Number(item.price) }))} customers={customers} initialSales={initialSales} defaultBranchId={user.defaultBranchId} canDiscount={user.canApplyDiscount} />;
}
