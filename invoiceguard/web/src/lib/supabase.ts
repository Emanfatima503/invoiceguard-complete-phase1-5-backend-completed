import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
/** False until .env.local is filled in — the UI then shows labelled preview data. */
export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export async function supabase() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: proxy.ts already refreshed the cookie.
        }
      },
    },
  });
}

/** Logged-in user's email, or null. */
export async function currentUserEmail() {
  if (!configured) return null;
  const { data } = await (await supabase()).auth.getUser();
  return data.user?.email ?? null;
}
