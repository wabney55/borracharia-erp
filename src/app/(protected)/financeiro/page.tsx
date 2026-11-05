import { prisma } from "@/lib/prisma";
import { requireUser, userCanSeeAllBranches } from "@/lib/session";
import { FinanceWorkspace } from "@/components/finance-workspace";
import { redirect } from "next/navigation";

export default async function FinancePage() {
  const user = await requireUser();
  if (!["SUPER_ADMIN", "GENERAL_MANAGER", "BRANCH_MANAGER", "FINANCE"].includes(user.role)) redirect("/dashboard");
  const branches = userCanSeeAllBranches(user)
    ? await prisma.branch.findMany({ where: { companyId: user.companyId, status: "ACTIVE", deletedAt: null }, orderBy: [{ isHeadquarters: "desc" }, { name: "asc" }], select: { id: true, name: true, code: true } })
    : user.branches.map(({ branch }) => branch).filter((branch) => branch.status === "ACTIVE" && !branch.deletedAt).map(({ id, name, code }) => ({ id, name, code }));
  const suppliers = await prisma.supplier.findMany({ where: { companyId: user.companyId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 250 });
  return <FinanceWorkspace branches={branches} suppliers={suppliers} defaultBranchId={user.defaultBranchId} />;
}
