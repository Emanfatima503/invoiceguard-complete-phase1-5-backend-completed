import "server-only";
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const adminConfigured = Boolean(url && secret);
export function admin() { if (!adminConfigured) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured"); return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } }); }
