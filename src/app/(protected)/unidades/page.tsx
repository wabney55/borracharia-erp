import { prisma } from "@/lib/prisma";
import { requireUser, userCanManage, userCanSeeAllBranches } from "@/lib/session";
import { BranchWorkspace } from "@/components/branch-workspace";

export default async function BranchesPage() {
  const user = await requireUser();
  const branches = await prisma.branch.findMany({
    where: userCanSeeAllBranches(user) ? { companyId: user.companyId, deletedAt: null } : { companyId: user.companyId, id: { in: user.branches.map(({ branch }) => branch.id) }, deletedAt: null },
    orderBy: [{ isHeadquarters: "desc" }, { name: "asc" }],
  });
  return <BranchWorkspace initialBranches={branches} canManage={userCanManage(user)} />;
}
