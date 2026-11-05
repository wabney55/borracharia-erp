import { prisma } from "@/lib/prisma";
import { requireUser, userCanSeeAllBranches } from "@/lib/session";
import { TransferWorkspace } from "@/components/transfer-workspace";

export default async function TransfersPage() {
  const user = await requireUser();
  const branches = userCanSeeAllBranches(user)
    ? await prisma.branch.findMany({ where: { companyId: user.companyId, status: "ACTIVE", deletedAt: null }, orderBy: [{ isHeadquarters: "desc" }, { name: "asc" }], select: { id: true, name: true, code: true } })
    : user.branches.map(({ branch }) => branch).filter((branch) => branch.status === "ACTIVE" && !branch.deletedAt).map(({ id, name, code }) => ({ id, name, code }));
  const canManage = ["SUPER_ADMIN", "GENERAL_MANAGER", "BRANCH_MANAGER", "STOCKKEEPER"].includes(user.role);
  return <TransferWorkspace branches={branches} defaultBranchId={user.defaultBranchId} canManage={canManage} />;
}
