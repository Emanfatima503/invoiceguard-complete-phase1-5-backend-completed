"use client";

import { useActionState } from "react";
import { motion } from "motion/react";
import { Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="glass relative w-full max-w-sm overflow-hidden rounded-3xl p-8">
        <div className="absolute -right-16 -top-16 size-40 rounded-full bg-teal/30 blur-3xl" />
        <motion.div initial={{ rotate: -20, scale: 0.6, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 14 }}
          className="relative mb-6 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-brand to-teal shadow-lg shadow-brand/40">
          <ShieldCheck className="size-6 text-white" />
        </motion.div>
        <h1 className="relative font-display text-2xl font-semibold text-white">Welcome back</h1>
        <p className="relative mt-1 text-sm text-slate-400">Sign in to InvoiceGuard</p>

        <form action={action} className="relative mt-8 space-y-4">
          <Field icon={<Mail className="size-4" />} name="email" type="email" placeholder="you@company.com" label="Email" />
          <Field icon={<Lock className="size-4" />} name="password" type="password" placeholder="••••••••" label="Password" />
          {state?.error && (
            <motion.p initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} role="alert"
              className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</motion.p>
          )}
          <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-teal py-2.5 font-medium text-white shadow-lg shadow-brand/30 disabled:opacity-60">
            {pending && <Loader2 className="size-4 animate-spin" />} Sign in
          </motion.button>
        </form>
      </motion.div>
    </main>
  );
}

function Field({ icon, label, ...input }: { icon: React.ReactNode; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>
      <span className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-900/60 px-3 py-2.5 text-slate-500 transition focus-within:border-brand/60 focus-within:shadow-[0_0_0_4px] focus-within:shadow-brand/15">
        {icon}
        <input required {...input} className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
      </span>
    </label>
  );
}
