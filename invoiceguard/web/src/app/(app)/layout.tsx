import { LogOut, Search } from "lucide-react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { configured, currentUserEmail } from "@/lib/supabase";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const email = await currentUserEmail();
  if (configured && !email) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-white/5 bg-ink-950/60 px-6 backdrop-blur-xl">
          <label className="glass flex w-full max-w-md items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-500">
            <Search className="size-4" />
            <input disabled placeholder="Search invoices, vendors, numbers… (Phase 1)"
              className="w-full bg-transparent outline-none placeholder:text-slate-500" />
          </label>
          <div className="ml-auto flex items-center gap-3">
            {!configured && (
              <span className="rounded-full border border-warn/30 bg-warn/10 px-3 py-1 text-xs text-warn">Preview mode — Supabase not connected</span>
            )}
            {email && (
              <>
                <span className="hidden text-sm text-slate-400 sm:block">{email}</span>
                <form action={signOut}>
                  <button aria-label="Sign out" className="grid size-9 place-items-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-white">
                    <LogOut className="size-4" />
                  </button>
                </form>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
