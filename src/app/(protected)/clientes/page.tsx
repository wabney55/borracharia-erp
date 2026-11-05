import { prisma } from "@/lib/prisma";
import { requireUser, userCanManage } from "@/lib/session";
import { CustomerWorkspace } from "@/components/customer-workspace";

export default async function CustomersPage() {
  const user = await requireUser();
  const customers = await prisma.customer.findMany({ where: { companyId: user.companyId, deletedAt: null }, orderBy: [{ isGeneric: "desc" }, { name: "asc" }], take: 250 });
  return <CustomerWorkspace initialCustomers={customers} canManage={userCanManage(user)} />;
}
