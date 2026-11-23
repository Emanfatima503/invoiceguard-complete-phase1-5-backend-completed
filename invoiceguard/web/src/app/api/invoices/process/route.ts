import { NextResponse } from "next/server";
import { processInvoice } from "@/lib/invoice-processing";
import { configured } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!configured) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
    const auth = req.headers.get("authorization");
    const secret = process.env.PROCESSING_SECRET;
    if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    if (!body.invoice_id) return NextResponse.json({ error: "invoice_id is required" }, { status: 400 });
    const result = await processInvoice(String(body.invoice_id));
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Invoice processing failed" }, { status: 500 });
  }
}
