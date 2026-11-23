import "server-only";
import { createHash } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { admin } from "@/lib/admin";

const execFileAsync = promisify(execFile);

export type NormalizedInvoice = {
  vendor_name?: string | null;
  tax_id?: string | null;
  registration_id?: string | null;
  contact_email?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  currency?: string | null;
  subtotal?: number | null;
  tax_total?: number | null;
  total?: number | null;
  bank_name?: string | null;
  account_title?: string | null;
  account_number?: string | null;
  iban?: string | null;
  line_items?: Array<{
    description?: string | null;
    quantity?: number | null;
    unit_price?: number | null;
    line_total?: number | null;
    tax_rate?: number | null;
  }>;
};

function cleanText(text: string) {
  return text.replace(/\u0000/g, "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}



async function extractWithPdfJs(bytes: Buffer): Promise<string> {
  try {
    // pdfjs-dist is intentionally optional at runtime; install it in web/package.json.
    // @ts-ignore - pdfjs-dist's Node typings vary by release.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const text = content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ");
      pages.push(text);
    }
 } catch (error: any) {
  console.warn(
    "[InvoiceGuard] PDF.js extraction failed:",
    error?.message || error
  );
  return "";
}
}

async function ocrSpace(bytes: Buffer, mimeType: string): Promise<{ text: string; confidence: number | null }> {
  const key = process.env.OCR_SPACE_API_KEY;
  if (!key) return { text: "", confidence: null };
  const form = new FormData();
  form.append("apikey", key);
  form.append("language", "eng");
  form.append("isOverlayRequired", "false");
  form.append("OCREngine", "2");
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), "invoice");
  const response = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: form });
  if (!response.ok) throw new Error(`OCR.space returned ${response.status}`);
  const json: any = await response.json();
  const text = cleanText((json.ParsedResults ?? []).map((x: any) => x.ParsedText ?? "").join("\n"));
  const confidence = (json.ParsedResults ?? []).map((x: any) => Number(x.TextOverlay?.Lines?.[0]?.Line?.[0]?.WordConfidences?.[0])).find((n: number) => Number.isFinite(n));
  return { text, confidence: Number.isFinite(confidence) ? confidence : null };
}

async function callGroq(text: string): Promise<{ normalized: NormalizedInvoice; raw: any; summary: string }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { normalized: parseDeterministic(text), raw: { skipped: true, reason: "GROQ_API_KEY not configured" }, summary: "Structured extraction used the deterministic parser because GROQ_API_KEY is not configured." };
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const prompt = `You are InvoiceGuard's invoice normalization engine. Extract only facts present in the invoice text. Return strict JSON with this shape: {vendor_name,tax_id,registration_id,contact_email,invoice_number,invoice_date,due_date,currency,subtotal,tax_total,total,bank_name,account_title,account_number,iban,line_items:[{description,quantity,unit_price,line_total,tax_rate}],summary}. Dates must be YYYY-MM-DD. Money must be numbers. tax_rate is decimal (18% => 0.18). Missing values must be null. Do not invent values.\n\nINVOICE TEXT:\n${text}`;
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
  });
  if (!response.ok) throw new Error(`Groq returned ${response.status}: ${await response.text()}`);
  const raw = await response.json();
  const content = raw.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content);
  const { summary, ...normalized } = parsed;
  return { normalized, raw, summary: summary || "Invoice fields extracted and normalized by Groq." };
}

function money(value?: string | null) {
  if (!value) return null;
  const n = Number(value.replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseDeterministic(text: string): NormalizedInvoice {
  const lines = text.split("\n").map(x => x.trim()).filter(Boolean);
  const find = (re: RegExp) => text.match(re)?.[1]?.trim() ?? null;
  const vendor = lines.find(x => /\b(Pvt\.?|Ltd\.?|LLC|Inc\.?|Limited|Traders|Supplies)\b/i.test(x) && !/^Invoice$/i.test(x)) ?? null;
  return {
    vendor_name: vendor,
    tax_id: find(/NTN:\s*([^\s]+)/i),
    registration_id: find(/GST:\s*([^\s]+)/i),
    contact_email: find(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i),
    invoice_number: find(/Invoice Number\s*\n?\s*([A-Z0-9./_-]+)/i),
    invoice_date: normalizeDate(find(/Invoice Date\s*\n?\s*([^\n]+)/i)),
    due_date: normalizeDate(find(/Due Date\s*\n?\s*([^\n]+)/i)),
    currency: find(/Currency\s*\n?\s*([A-Z]{3})/i)?.toUpperCase() || "PKR",
    subtotal: money(find(/Subtotal\s*\n?\s*([\d,]+(?:\.\d{2})?)/i)),
    tax_total: money(find(/(?:GST|Tax)[^\n]*\n?\s*([\d,]+(?:\.\d{2})?)/i)),
    total: money(find(/Total\s*\n?\s*([\d,]+(?:\.\d{2})?)/i)),
    bank_name: find(/Bank:\s*([^\n]+?)(?:\s+Account Title:|$)/i),
    account_title: find(/Account Title:\s*([^\n]+?)(?:\s+Account No\.:|$)/i),
    account_number: find(/Account No\.:\s*([0-9A-Z -]+)/i)?.replace(/[ -]/g, "") || null,
    iban: find(/IBAN:\s*([A-Z0-9]+)/i),
    line_items: [],
  };
}

function normalizeDate(value: string | null) {
  if (!value) return null;
  const m = value.match(/(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{4})/);
  if (m) {
    const months: Record<string, string> = { jan:"01", january:"01", feb:"02", february:"02", mar:"03", march:"03", apr:"04", april:"04", may:"05", jun:"06", june:"06", jul:"07", july:"07", aug:"08", august:"08", sep:"09", sept:"09", september:"09", oct:"10", october:"10", nov:"11", november:"11", dec:"12", december:"12" };
    return `${m[3]}-${months[m[2].toLowerCase()] ?? "01"}-${m[1].padStart(2,"0")}`;
  }
  return value;
}

function similarity(a: string, b: string) {
  const aa = new Set(a.toLowerCase().replace(/[^a-z0-9]+/g, "").match(/.{1,3}/g) ?? []);
  const bb = new Set(b.toLowerCase().replace(/[^a-z0-9]+/g, "").match(/.{1,3}/g) ?? []);
  const union = new Set([...aa, ...bb]).size;
  const inter = [...aa].filter(x => bb.has(x)).length;
  return union ? inter / union : 0;
}

function riskBand(score: number) {
  if (score >= 75) return "hold";
  if (score >= 50) return "priority";
  if (score >= 25) return "review";
  return "routine";
}

export async function processInvoice(invoiceId: string) {
  const sb = admin();
  await sb.from("invoices").update({ status: "extracting" }).eq("id", invoiceId);
  const { data: invoice, error } = await sb.from("invoices").select("*").eq("id", invoiceId).single();
  if (error || !invoice) throw new Error(error?.message || "Invoice not found");
  const { data: file, error: downloadError } = await sb.storage.from("invoices").download(invoice.file_key);
  if (downloadError || !file) throw new Error(downloadError?.message || "Could not download invoice file");
  const bytes = Buffer.from(await file.arrayBuffer());

  let text = "";
  async function extractWithPdfToText(bytes: Buffer): Promise<string> {
  return "";
}
  if (invoice.mime_type === "application/pdf") {

    text = await extractWithPdfToText(bytes);
    if (!text) text = await extractWithPdfJs(bytes);
  }
  let ocrConfidence: number | null = null;
  if (text.length < 80 || invoice.mime_type !== "application/pdf") {
    const ocr = await ocrSpace(bytes, invoice.mime_type);
    if (ocr.text.length > text.length) text = ocr.text;
    ocrConfidence = ocr.confidence;
  }
  if (!text) throw new Error("No readable invoice text found. Configure OCR_SPACE_API_KEY for scanned PDFs/images.");

  const textSha = createHash("sha256").update(text).digest("hex");
  const sourceRun = { provider: ocrConfidence !== null ? "ocr.space" : "pdf-text", model_version: ocrConfidence !== null ? "OCR.space Engine 2" : "text-extractor", raw_output: { text }, normalized_output: null, confidence: ocrConfidence === null ? {} : { document: ocrConfidence } };
  await sb.from("extraction_runs").insert({ invoice_id: invoiceId, ...sourceRun });

  let ai: { normalized: NormalizedInvoice; raw: any; summary: string };
  try {
    ai = await callGroq(text);
  } catch (groqError: any) {
    ai = { normalized: parseDeterministic(text), raw: { error: groqError.message || "Groq extraction failed" }, summary: `Groq extraction failed; deterministic extraction was used instead. ${groqError.message || ""}`.trim() };
  }
  const normalized = ai.normalized;
  const confidence = ocrConfidence === null ? {} : { document: ocrConfidence };
  await sb.from("extraction_runs").insert({ invoice_id: invoiceId, provider: "groq", model_version: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", raw_output: ai.raw, normalized_output: normalized, confidence });

  const vendorName = normalized.vendor_name?.trim() || null;
  let vendorId: string | null = null;
  if (vendorName) {
    const normalizedName = vendorName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const { data: existingVendors } = await sb.from("vendors").select("*").eq("normalized_name", normalizedName).limit(1);
    if (existingVendors?.[0]) vendorId = existingVendors[0].id;
    else {
      const created = await sb.from("vendors").insert({ legal_name: vendorName, tax_id: normalized.tax_id || null, registration_id: normalized.registration_id || null, contact_email: normalized.contact_email || null }).select("id").single();
      if (created.error) throw new Error(created.error.message);
      vendorId = created.data.id;
    }
  }

  const bankFingerprintSource = normalized.iban || normalized.account_number;
  let bankAccountId: string | null = null;
  let newBankAccount = false;
  if (vendorId && bankFingerprintSource) {
    const fingerprint = createHash("sha256").update(bankFingerprintSource.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()).digest("hex");
    const last4 = bankFingerprintSource.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
    const existing = await sb.from("vendor_bank_accounts").select("id").eq("vendor_id", vendorId).eq("account_fingerprint", fingerprint).maybeSingle();
    if (existing.data) bankAccountId = existing.data.id;
    else {
      const created = await sb.from("vendor_bank_accounts").insert({ vendor_id: vendorId, account_fingerprint: fingerprint, account_last4: last4, bank_name: normalized.bank_name || null, currency: normalized.currency || invoice.currency || "PKR", status: "unverified", created_by: null }).select("id").single();
      if (created.error) throw new Error(created.error.message);
      bankAccountId = created.data.id;
      newBankAccount = true;
    }
  }

  const updates: any = {
    vendor_id: vendorId,
    bank_account_id: bankAccountId,
    invoice_number: normalized.invoice_number || null,
    invoice_date: normalized.invoice_date || null,
    due_date: normalized.due_date || null,
    currency: (normalized.currency || invoice.currency || "PKR").toUpperCase(),
    subtotal: normalized.subtotal ?? null,
    tax_total: normalized.tax_total ?? null,
    total: normalized.total ?? null,
    text_sha256: textSha,
    ai_summary: ai.summary,
  };
  const updated = await sb.from("invoices").update(updates).eq("id", invoiceId);
  if (updated.error) throw new Error(updated.error.message);

  if (Array.isArray(normalized.line_items) && normalized.line_items.length) {
    await sb.from("invoice_line_items").delete().eq("invoice_id", invoiceId);
    const rows = normalized.line_items.map((x, i) => ({ invoice_id: invoiceId, position: i + 1, description: x.description || null, quantity: x.quantity ?? null, unit_price: x.unit_price ?? null, line_total: x.line_total ?? null, tax_rate: x.tax_rate ?? null }));
    const inserted = await sb.from("invoice_line_items").insert(rows);
    if (inserted.error) throw new Error(inserted.error.message);
  }

  const findings: Array<{ reason_code: string; severity: string; evidence: any; score_contribution: number }> = [];
  if (!vendorId) findings.push({ reason_code: "UNKNOWN_VENDOR", severity: "medium", evidence: { message: "No vendor could be resolved from the extracted invoice." }, score_contribution: 20 });
  if (ocrConfidence !== null && ocrConfidence < 80) findings.push({ reason_code: "LOW_OCR_CONFIDENCE", severity: "low", evidence: { message: `OCR confidence was ${ocrConfidence}.` }, score_contribution: 10 });
  if (newBankAccount) findings.push({ reason_code: "NEW_BANK_ACCOUNT", severity: "medium", evidence: { message: "A bank account not previously seen for this vendor was detected.", account_last4: normalized.account_number?.slice(-4) || normalized.iban?.slice(-4) || null }, score_contribution: 20 });
  if (normalized.subtotal != null && normalized.tax_total != null && normalized.total != null && Math.abs(Number(normalized.subtotal) + Number(normalized.tax_total) - Number(normalized.total)) > 0.01) findings.push({ reason_code: "ARITHMETIC_MISMATCH", severity: "high", evidence: { message: "Subtotal plus tax does not equal the invoice total.", subtotal: normalized.subtotal, tax_total: normalized.tax_total, total: normalized.total }, score_contribution: 35 });

  if (normalized.invoice_number) {
    const { data: sameNumber } = await sb.from("invoices").select("id,invoice_number,vendor_id,total,file_name").eq("normalized_invoice_number", String(normalized.invoice_number).toUpperCase().replace(/[^A-Z0-9]/g, "")).neq("id", invoiceId).limit(10);
    if (sameNumber?.length) {
      findings.push({ reason_code: "DUPLICATE_NUMBER", severity: "high", evidence: { message: "Another invoice uses the same normalized invoice number.", matches: sameNumber }, score_contribution: 50 });
      for (const match of sameNumber) {
        const a = invoiceId < match.id ? invoiceId : match.id;
        const b = invoiceId < match.id ? match.id : invoiceId;
        await sb.from("duplicate_candidates").upsert({ invoice_a: a, invoice_b: b, match_score: 100, match_reasons: [{ reason: "normalized invoice number", score: 100 }] }, { onConflict: "invoice_a,invoice_b" });
      }
    }
  }
  if (textSha) {
    const { data: sameText } = await sb.from("invoices").select("id,file_name,invoice_number").eq("text_sha256", textSha).neq("id", invoiceId).limit(10);
    if (sameText?.length) {
      findings.push({ reason_code: "DUPLICATE_CONTENT", severity: "high", evidence: { message: "Another invoice has the same normalized document text.", matches: sameText }, score_contribution: 45 });
      for (const match of sameText) {
        const a = invoiceId < match.id ? invoiceId : match.id;
        const b = invoiceId < match.id ? match.id : invoiceId;
        await sb.from("duplicate_candidates").upsert({ invoice_a: a, invoice_b: b, match_score: 100, match_reasons: [{ reason: "normalized text hash", score: 100 }] }, { onConflict: "invoice_a,invoice_b" });
      }
    }
  }

  if (vendorId && normalized.total != null) {
    const { data: prior } = await sb.from("invoices").select("total").eq("vendor_id", vendorId).neq("id", invoiceId).not("total", "is", null).limit(100);
    const values = (prior ?? []).map(x => Number(x.total)).filter(Number.isFinite).sort((a,b)=>a-b);
    if (values.length >= 3) {
      const median = values[Math.floor(values.length / 2)];
      if (Number(normalized.total) > median * 2) findings.push({ reason_code: "AMOUNT_ABOVE_BASELINE", severity: "medium", evidence: { message: "Invoice total is more than 2× the vendor's historical median.", median, total: normalized.total }, score_contribution: 15 });
      await sb.from("vendors").update({ risk_baseline: { median_total: median, invoice_count: values.length } }).eq("id", vendorId);
    }
  }

  if (vendorName && normalized.invoice_number && normalized.total != null) {
    const { data: candidates } = await sb.from("invoices").select("id,invoice_number,total,vendor_id,vendors(legal_name)").neq("id", invoiceId).limit(200);
    const candidate = (candidates ?? []).map(c => ({ ...c, score: similarity(`${vendorName}|${normalized.invoice_number}|${normalized.total}`, `${(c as any).vendors?.legal_name || c.vendor_id}|${c.invoice_number}|${c.total}`) * 100 })).sort((a,b)=>b.score-a.score)[0];
    if (candidate && candidate.score >= 70 && !findings.some(f => f.reason_code === "DUPLICATE_NUMBER")) {
      const a = invoiceId < candidate.id ? invoiceId : candidate.id;
      const b = invoiceId < candidate.id ? candidate.id : invoiceId;
      await sb.from("duplicate_candidates").upsert({ invoice_a: a, invoice_b: b, match_score: Math.round(candidate.score * 100) / 100, match_reasons: [{ reason: "vendor/invoice/amount similarity", score: candidate.score }] }, { onConflict: "invoice_a,invoice_b" });
      findings.push({ reason_code: "FUZZY_DUPLICATE", severity: "medium", evidence: { message: "Invoice resembles an existing invoice on vendor, number and amount signals.", match_score: candidate.score, matched_invoice_id: candidate.id }, score_contribution: 35 });
    }
  }

  await sb.from("risk_findings").delete().eq("invoice_id", invoiceId);
  if (findings.length) {
    const inserted = await sb.from("risk_findings").insert(findings.map(f => ({ invoice_id: invoiceId, ...f })));
    if (inserted.error) throw new Error(inserted.error.message);
  }
  const score = Math.min(100, findings.reduce((sum, f) => sum + f.score_contribution, 0));
  const band = riskBand(score);
  const status = score >= 25 ? "needs_review" : "in_review";
  const final = await sb.from("invoices").update({ risk_score: score, risk_band: band, status }).eq("id", invoiceId);
  if (final.error) throw new Error(final.error.message);
  return { invoiceId, status, risk_score: score, risk_band: band, findings: findings.length, text_length: text.length };
}
