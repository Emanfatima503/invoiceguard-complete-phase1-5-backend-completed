"use server";

import { redirect } from "next/navigation";
import { configured, supabase } from "@/lib/supabase";

export async function signIn(_prev: { error?: string } | undefined, form: FormData) {
  if (!configured) return { error: "Supabase isn't connected yet — fill in .env.local (see docs/PHASE-0-SETUP.md)." };
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const { error } = await (await supabase()).auth.signInWithPassword({ email, password });
  if (error) return { error: "Wrong email or password." }; // don't leak which one
  redirect("/dashboard");
}

export async function signOut() {
  if (configured) await (await supabase()).auth.signOut();
  redirect("/login");
}
