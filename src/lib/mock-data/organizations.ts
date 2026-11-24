import type { Organization } from "@/types";

export const ORGANIZATION_ID = "ORG-ALTA";

export const organizationSeed: Organization = {
  id: ORGANIZATION_ID,
  name: "Altametrics Pvt Ltd.",
  shortName: "Altametrics",
  appName: "Organization 360",
  tagline: "Process. Performance. Accountability.",
  industry: "Enterprise SaaS – Restaurant Technology Solutions",
  description:
    "Altametrics Pvt Ltd. is a product-based enterprise SaaS company providing back-office technology and operational solutions to US-based restaurant chains, working across functional departments, product modules and customer implementations.",
  website: "https://www.altametrics.com",
  email: "operations@altametrics.example",
  phone: "+91 120 000 0000",
  address: "India Delivery Center",
  logoUrl: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/brand/altametrics-icon.svg`,
  foundedYear: 2001,
};
