import {
  BarChart3, Building2, CheckCircle2, Copy, FileText, LayoutDashboard, Plug, ScrollText, Settings, ShieldAlert, UploadCloud,
  type LucideIcon,
} from "lucide-react";

// Every route from blueprint 4.2, with the phase that builds it.
export type NavItem = { href: string; label: string; icon: LucideIcon; phase: number; blurb: string };

export const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Overview", items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, phase: 0, blurb: "Invoices processed, pending reviews, high-risk flags and trend." },
  ]},
  { section: "Intake", items: [
    { href: "/invoices", label: "Invoices", icon: FileText, phase: 1, blurb: "Invoice inbox with vendor, number, amount, date and status." },
    { href: "/invoices/upload", label: "Upload", icon: UploadCloud, phase: 1, blurb: "Drag-and-drop upload and Gmail ingestion status." },
    { href: "/vendors", label: "Vendors", icon: Building2, phase: 2, blurb: "Vendor registry, verified identifiers and bank-detail history." },
  ]},
  { section: "Detection", items: [
    { href: "/risk-review", label: "Risk review", icon: ShieldAlert, phase: 2, blurb: "Prioritised suspicious invoices with reason codes." },
    { href: "/duplicates", label: "Duplicates", icon: Copy, phase: 2, blurb: "Potential duplicate pairs, compared side by side." },
  ]},
  { section: "Decisions", items: [
    { href: "/approvals", label: "Approvals", icon: CheckCircle2, phase: 4, blurb: "Finance review queue: approve, reject or request info." },
    { href: "/audit-log", label: "Audit log", icon: ScrollText, phase: 4, blurb: "Immutable history of extraction, changes, reviews and overrides." },
    { href: "/reports", label: "Reports", icon: BarChart3, phase: 5, blurb: "Monthly fraud indicators, vendor anomalies and review outcomes." },
  ]},
  { section: "System", items: [
    { href: "/integrations", label: "Integrations", icon: Plug, phase: 1, blurb: "Gmail inbox, OCR.space, Groq and email alerts." },
    { href: "/settings", label: "Settings", icon: Settings, phase: 2, blurb: "Risk thresholds, retention and approval policy." },
  ]},
];

export const ALL_NAV = NAV.flatMap((s) => s.items);
