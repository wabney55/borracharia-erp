import { prisma } from "@/lib/prisma";
import { requireUser, userCanManage, userCanSeeAllBranches } from "@/lib/session";
import { CatalogWorkspace } from "@/components/catalog-workspace";

export default async function CatalogPage() {
  const user = await requireUser();
  const branchIds = userCanSeeAllBranches(user)
    ? (await prisma.branch.findMany({ where: { companyId: user.companyId, status: "ACTIVE", deletedAt: null }, select: { id: true } })).map(({ id }) => id)
    : user.branches.map(({ branch }) => branch).filter((branch) => branch.status === "ACTIVE" && !branch.deletedAt).map(({ id }) => id);
  const [products, services] = await Promise.all([
    prisma.product.findMany({ where: { companyId: user.companyId, deletedAt: null }, include: { category: { select: { name: true } }, supplier: { select: { name: true } }, inventory: { where: { branchId: { in: branchIds } }, select: { quantity: true } } }, orderBy: { name: "asc" }, take: 500 }),
    prisma.service.findMany({ where: { companyId: user.companyId }, include: { category: { select: { name: true } } }, orderBy: { name: "asc" }, take: 500 }),
  ]);
  const canSeeCost = userCanManage(user) || user.role === "FINANCE" || user.role === "STOCKKEEPER";
  return <CatalogWorkspace
    initialProducts={products.map((item) => ({ id: item.id, code: item.code, barcode: item.barcode, name: item.name, description: item.description, unit: item.unit, cost: canSeeCost ? Number(item.cost) : null, salePrice: Number(item.salePrice), minimumStock: Number(item.minimumStock), quantity: item.inventory.reduce((sum, stock) => sum + Number(stock.quantity), 0), status: item.status, category: item.category?.name ?? null, supplier: item.supplier?.name ?? null }))}
    initialServices={services.map((item) => ({ id: item.id, code: item.code, name: item.name, description: item.description, price: Number(item.price), status: item.status, category: item.category?.name ?? null }))}
    canManage={userCanManage(user)}
  />;
}
