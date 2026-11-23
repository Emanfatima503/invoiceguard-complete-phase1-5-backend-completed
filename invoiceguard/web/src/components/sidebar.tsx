"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen, ShieldCheck } from "lucide-react";
import { ALL_NAV, NAV } from "@/lib/nav";

export function Sidebar() {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // Longest matching href wins, so /invoices/upload doesn't also light up /invoices.
  const active = ALL_NAV.filter((i) => path === i.href || path.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 248 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="glass sticky top-0 z-20 hidden h-screen shrink-0 flex-col rounded-none border-y-0 border-l-0 md:flex"
    >
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand to-teal shadow-lg shadow-brand/30">
          <ShieldCheck className="size-5 text-white" />
        </div>
        {!collapsed && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-display text-lg font-semibold tracking-tight text-white">
            Invoice<span className="text-teal">Guard</span>
          </motion.span>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV.map((group) => (
          <div key={group.section}>
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{group.section}</p>
            )}
            {group.items.map(({ href, label, icon: Icon, phase }) => {
              const on = active === href;
              return (
                <Link key={href} href={href} title={collapsed ? label : undefined}
                  className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${on ? "text-white" : "text-slate-400 hover:text-slate-100"}`}>
                  {on && (
                    <motion.span layoutId="nav-pill" transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      className="absolute inset-0 rounded-xl border border-brand/30 bg-brand/15 shadow-[0_0_24px_-6px] shadow-brand/60" />
                  )}
                  <Icon className={`relative size-[18px] shrink-0 ${on ? "text-brand" : ""}`} />
                  {!collapsed && <span className="relative flex-1 truncate">{label}</span>}
                  {!collapsed && phase > 0 && (
                    <span className="relative rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500">P{phase}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="m-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-white/5 hover:text-slate-200">
        {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <><PanelLeftClose className="size-[18px]" /> Collapse</>}
      </button>
    </motion.aside>
  );
}
