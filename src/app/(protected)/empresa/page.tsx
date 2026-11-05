import { prisma } from "@/lib/prisma";
import { requireUser, userCanManage } from "@/lib/session";
import { CompanyProfile } from "@/components/company-profile";

export default async function CompanyPage() {
  const user = await requireUser();
  return <CompanyProfile initialCompany={user.company ?? await prisma.company.findUniqueOrThrow({ where: { id: user.companyId } })} canManage={userCanManage(user)} />;
}
