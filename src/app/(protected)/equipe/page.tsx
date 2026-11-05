import { prisma } from "@/lib/prisma";
import { requireUser, userCanManage, userCanSeeAllBranches } from "@/lib/session";
import { TeamWorkspace } from "@/components/team-workspace";

export default async function TeamPage() {
  const user = await requireUser();
  const allBranches = userCanSeeAllBranches(user)
    ? await prisma.branch.findMany({ where: { companyId: user.companyId, deletedAt: null }, orderBy: { name: "asc" } })
    : user.branches.map(({ branch }) => branch).filter((branch) => !branch.deletedAt);
  const users = await prisma.user.findMany({
    where: { companyId: user.companyId, deletedAt: null, ...(userCanSeeAllBranches(user) ? {} : { branches: { some: { branchId: { in: allBranches.map((branch) => branch.id) } } } }) },
    select: { id: true, name: true, email: true, role: true, status: true, lastLoginAt: true, branches: { include: { branch: { select: { id: true, name: true } } } } },
    orderBy: { name: "asc" },
  });
  const safeBranches = allBranches.map(({ id, name, code, status }) => ({ id, name, code, status }));
  return <TeamWorkspace initialUsers={users} branches={safeBranches} canManage={userCanManage(user)} isSuperAdmin={user.role === "SUPER_ADMIN"} />;
}
