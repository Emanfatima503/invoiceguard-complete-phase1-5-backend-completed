import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { processInvoice } from "@/lib/invoice-processing";
import { configured } from "@/lib/supabase";

export const runtime = "nodejs";

/** Constant-time Bearer comparison (timingSafeEqual throws on length mismatch, hence the length check first). */
function bearerMatches(auth: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  if (!auth || auth.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
}

export async function POST(req: Request) {
  try {
    if (!configured) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
    const auth = req.headers.get("authorization");
    const secret = process.env.PROCESSING_SECRET;
    // The secret is mandatory: previously an unset secret skipped the check
    // entirely, leaving this endpoint unauthenticated.
    if (!secret) return NextResponse.json({ error: "Processing is not configured" }, { status: 503 });
    if (!bearerMatches(auth, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    if (!body.invoice_id) return NextResponse.json({ error: "invoice_id is required" }, { status: 400 });
    const result = await processInvoice(String(body.invoice_id));
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Invoice processing failed" }, { status: 500 });
  }
}
