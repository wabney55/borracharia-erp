import { prisma } from "@/lib/prisma";
import { requireUser, userCanSeeAllBranches } from "@/lib/session";
import { WorkOrderWorkspace } from "@/components/work-order-workspace";

export default async function WorkOrdersPage() {
  const user = await requireUser();
  const branches = userCanSeeAllBranches(user)
    ? await prisma.branch.findMany({ where: { companyId: user.companyId, status: "ACTIVE", deletedAt: null }, orderBy: [{ isHeadquarters: "desc" }, { name: "asc" }], select: { id: true, name: true, code: true } })
    : user.branches.map(({ branch }) => branch).filter((branch) => branch.status === "ACTIVE" && !branch.deletedAt).map(({ id, name, code }) => ({ id, name, code }));
  const [products, services, customers] = await Promise.all([
    prisma.product.findMany({ where: { companyId: user.companyId, status: "ACTIVE", deletedAt: null }, select: { id: true, code: true, name: true, salePrice: true, unit: true }, orderBy: { name: "asc" }, take: 500 }),
    prisma.service.findMany({ where: { companyId: user.companyId, status: "ACTIVE" }, select: { id: true, code: true, name: true, price: true }, orderBy: { name: "asc" }, take: 500 }),
    prisma.customer.findMany({ where: { companyId: user.companyId, deletedAt: null, isGeneric: false }, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" }, take: 250 }),
  ]);
  return <WorkOrderWorkspace branches={branches} defaultBranchId={user.defaultBranchId} products={products.map((item) => ({ ...item, salePrice: Number(item.salePrice) }))} services={services.map((item) => ({ ...item, price: Number(item.price) }))} customers={customers} canDiscount={user.canApplyDiscount} />;
}
