"use client";

import { AlertOctagon, RotateCw } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="glass max-w-md rounded-3xl p-8 text-center">
        <AlertOctagon className="mx-auto size-10 text-danger" />
        <h1 className="mt-4 font-display text-xl font-semibold text-white">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-400">{error.message}</p>
        {error.digest && <p className="mt-2 font-mono text-xs text-slate-600">ref {error.digest}</p>}
        <button onClick={reset} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10">
          <RotateCw className="size-4" /> Try again
        </button>
      </div>
    </div>
  );
}
