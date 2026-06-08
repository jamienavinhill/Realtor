export type DashboardTab = "listings" | "harvester" | "alerts" | "cma" | "docs" | "wizard";

export const DASHBOARD_TABS: { id: DashboardTab; label: string }[] = [
  { id: "listings", label: "Leads" },
  { id: "alerts", label: "Alerts" },
  { id: "wizard", label: "Setup" },
  { id: "harvester", label: "Ingest" },
  { id: "cma", label: "CMA" },
  { id: "docs", label: "Docs" },
];
