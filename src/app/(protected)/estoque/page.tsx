import { prisma } from "@/lib/prisma";
import { requireUser, userCanSeeAllBranches } from "@/lib/session";
import { InventoryWorkspace } from "@/components/inventory-workspace";

export default async function InventoryPage() {
  const user = await requireUser();
  const branches = userCanSeeAllBranches(user)
    ? await prisma.branch.findMany({ where: { companyId: user.companyId, status: "ACTIVE", deletedAt: null }, orderBy: [{ isHeadquarters: "desc" }, { name: "asc" }], select: { id: true, name: true, code: true } })
    : user.branches.map(({ branch }) => branch).filter((branch) => branch.status === "ACTIVE" && !branch.deletedAt).map(({ id, name, code }) => ({ id, name, code }));
  const defaultBranchId = branches.find((branch) => branch.id === user.defaultBranchId)?.id ?? branches[0]?.id ?? "";
  const canMoveStock = ["SUPER_ADMIN", "GENERAL_MANAGER", "BRANCH_MANAGER", "STOCKKEEPER"].includes(user.role);
  return <InventoryWorkspace branches={branches} defaultBranchId={defaultBranchId} canMoveStock={canMoveStock} />;
}
