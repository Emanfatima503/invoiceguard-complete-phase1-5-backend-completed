import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Hammer } from "lucide-react";
import { ALL_NAV } from "@/lib/nav";

// Placeholder for routes not built yet. Each phase replaces these with real pages.
export default async function ComingSoon({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = "/" + slug.join("/");
  const item = ALL_NAV.filter((i) => path === i.href || path.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!item) notFound();
  const Icon = item.icon;

  return (
    <div className="grid min-h-[70vh] place-items-center">
      <div className="glass relative max-w-lg overflow-hidden rounded-3xl p-10 text-center">
        <div className="absolute -top-24 left-1/2 size-48 -translate-x-1/2 rounded-full bg-brand/30 blur-3xl" />
        <div className="relative mx-auto mb-6 grid size-16 place-items-center rounded-2xl border border-white/10 bg-white/5">
          <Icon className="size-7 text-brand" />
        </div>
        <p className="relative mb-2 inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-3 py-1 text-xs font-medium text-teal">
          <Hammer className="size-3.5" /> Arrives in Phase {item.phase}
        </p>
        <h1 className="relative font-display text-3xl font-semibold text-white">{item.label}</h1>
        <p className="relative mt-3 text-slate-400">{item.blurb}</p>
        <Link href="/dashboard" className="relative mt-8 inline-flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10">
          <ArrowLeft className="size-4" /> Back to dashboard
        </Link>
      </div>
    </div>
  );
}
