import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { admin, adminConfigured } from "@/lib/admin";
import { supabase, configured } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // Both keys are required: the publishable key gates the login check and
    // the service key runs the queries. With only the service key set, the
    // login gate below would be skipped and intake unauthenticated.
    if (!configured || !adminConfigured) {
      return NextResponse.json({ error: "Intake is not configured" }, { status: 503 });
    }
    const { data: { user } } = await (await supabase()).auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const form = await req.formData();
    const file = form.get("file");
    const source = String(form.get("source") || "upload");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file supplied" }, { status: 400 });
    if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File exceeds 10 MB" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const sha = createHash("sha256").update(bytes).digest("hex");
    const sb = admin();
    const existing = await sb.from("invoices").select("id,invoice_number,status").eq("file_sha256", sha).maybeSingle();
    if (existing.data) return NextResponse.json({ duplicate: true, invoice_id: existing.data.id, status: existing.data.status });
    const key = `${new Date().toISOString().slice(0, 10)}/${sha}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const upload = await sb.storage.from("invoices").upload(key, bytes, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const ins = await sb.from("invoices").insert({ file_key: key, file_name: file.name, mime_type: file.type, file_sha256: sha, source: source === "email" ? "email" : "upload", status: "received", currency: "PKR" }).select("id").single();
    if (ins.error) {
      await sb.storage.from("invoices").remove([key]);
      throw ins.error;
    }
    try {
      await (await import("@/lib/invoice-processing")).processInvoice(ins.data.id);
    } catch (processingError: any) {
      await sb.from("invoices").update({ status: "failed", ai_summary: `Processing failed: ${processingError.message || "unknown error"}` }).eq("id", ins.data.id);
      return NextResponse.json({ invoice_id: ins.data.id, file_sha256: sha, status: "failed", processing_error: processingError.message }, { status: 202 });
    }
    return NextResponse.json({ invoice_id: ins.data.id, file_sha256: sha, status: "processed" }, { status: 201 });
  } catch (e: any) {
    const message = e?.message || "Intake failed";
    // Never surface admin configuration details (e.g. the
    // "SUPABASE_SERVICE_ROLE_KEY is not configured" error thrown by admin())
    // to clients: log the real message server-side and return a generic error.
    if (/SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(message)) {
      console.error("Intake failed (admin configuration):", message);
      return NextResponse.json({ error: "Intake failed" }, { status: 500 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
