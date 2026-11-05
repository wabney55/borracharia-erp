import "./receipt.css";
import { requireUser, userCanSeeAllBranches } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const branches = userCanSeeAllBranches(user)
    ? await prisma.branch.findMany({ where: { companyId: user.companyId, deletedAt: null, status: "ACTIVE" }, orderBy: [{ isHeadquarters: "desc" }, { name: "asc" }] })
    : user.branches.map(({ branch }) => branch).filter((branch) => branch.status === "ACTIVE" && !branch.deletedAt);
  const shellUser = { name: user.name, email: user.email, role: user.role, defaultBranchId: user.defaultBranchId, mustChangePassword: user.mustChangePassword, company: { tradeName: user.company.tradeName } };
  const shellBranches = branches.map(({ id, name, code, isHeadquarters }) => ({ id, name, code, isHeadquarters }));
  return <AppShell user={shellUser} branches={shellBranches}>{children}</AppShell>;
}
