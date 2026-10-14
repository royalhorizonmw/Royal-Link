import type { Role } from "./auth";

export type NavItem = { href: string; label: string; icon: string; roles: Role[] };

/** Sidebar entries and who can open them. MANAGER can open everything. */
export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "grid", roles: ["MANAGER", "OPERATIONS", "FINANCE"] },
  { href: "/ledger", label: "Daily targets", icon: "ledger", roles: ["MANAGER", "OPERATIONS", "FINANCE"] },
  { href: "/jobs", label: "Haulage jobs", icon: "truck", roles: ["MANAGER", "OPERATIONS", "FINANCE"] },
  { href: "/expenses", label: "Expenses", icon: "receipt", roles: ["MANAGER", "OPERATIONS", "FINANCE"] },
  { href: "/vehicles", label: "Fleet", icon: "bus", roles: ["MANAGER", "OPERATIONS", "FINANCE"] },
  { href: "/drivers", label: "Drivers", icon: "users", roles: ["MANAGER", "OPERATIONS", "FINANCE"] },
  { href: "/maintenance", label: "Maintenance", icon: "wrench", roles: ["MANAGER", "OPERATIONS"] },
  { href: "/compliance", label: "Compliance", icon: "shield", roles: ["MANAGER", "OPERATIONS"] },
  { href: "/complaints", label: "Complaints", icon: "chat", roles: ["MANAGER", "OPERATIONS"] },
  { href: "/payroll", label: "Payroll & HR", icon: "wallet", roles: ["MANAGER", "FINANCE"] },
  { href: "/budgets", label: "Budgets & targets", icon: "target", roles: ["MANAGER", "FINANCE"] },
  { href: "/reports", label: "Reports", icon: "chart", roles: ["MANAGER", "FINANCE"] },
  { href: "/settings", label: "Settings & users", icon: "cog", roles: ["MANAGER"] },
];

export function canSee(role: Role, href: string) {
  const item = NAV.find((n) => n.href === href);
  return role === "MANAGER" || (item?.roles.includes(role) ?? false);
}
