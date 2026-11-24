/**
 * Unit tests for the pure functions in `@/lib/invoice-processing`, plus one
 * extractor test with a minimal in-file PDF fixture.
 *
 * The six pure functions under test (`cleanText`, `money`,
 * `parseDeterministic`, `normalizeDate`, `similarity`, `riskBand`) ARE
 * exported from `@/lib/invoice-processing`, as are the two extractors
 * (`extractWithPdfJs`, `extractWithPdfToText`). The extractors were
 * unexported at base commit 51f69fa and gained `export` in this build.
 *
 * Every expectation below was derived from the actual source, not from
 * assumed behaviour. Parser bugs found while writing these tests
 * (email capture, Total/Subtotal, GST-line tax hijack, money("abc"),
 * Taxable-Value/Tax-Rate tax hijack, unknown-month January fallback)
 * were fixed in `@/lib/invoice-processing` in the same build, and the
 * tests below assert the CORRECT behaviour. One behaviour is still pinned
 * as-is (marked PINNED BEHAVIOUR): normalizeDate passes through shapes it
 * does not convert (ISO and numeric dates), which is intentional.
 *
 * These tests are deterministic and independent of env vars, network and
 * Supabase, except for the extractor test, which needs the installed
 * `pdfjs-dist` package but no network. Importing the module is safe in a
 * node test environment: `@/lib/admin` only reads env vars at import time
 * and throws only when `admin()` is called, `pdfjs-dist` is dynamically
 * imported inside `extractWithPdfJs` (never at module load), and
 * `server-only` is inert outside a React Server Components bundler.
 */
import { describe, expect, it } from "vitest";
import {
  cleanText,
  extractWithPdfJs,
  money,
  normalizeDate,
  parseDeterministic,
  riskBand,
  similarity,
} from "@/lib/invoice-processing";

describe("riskBand", () => {
  // Source cutoffs (invoice-processing.ts): >= 75 hold, >= 50 priority,
  // >= 25 review, otherwise routine. Boundaries are inclusive.
  it("returns routine below 25", () => {
    expect(riskBand(0)).toBe("routine");
    expect(riskBand(24)).toBe("routine");
    expect(riskBand(-5)).toBe("routine");
  });

  it("returns review from 25 up to 49", () => {
    expect(riskBand(25)).toBe("review");
    expect(riskBand(49)).toBe("review");
  });

  it("returns priority from 50 up to 74", () => {
    expect(riskBand(50)).toBe("priority");
    expect(riskBand(74)).toBe("priority");
  });

  it("returns hold at 75 and above", () => {
    expect(riskBand(75)).toBe("hold");
    expect(riskBand(100)).toBe("hold");
  });
});

describe("similarity", () => {
  // NOTE: this is NOT a sliding-window trigram Jaccard. The implementation
  // lowercases the input, strips every non-alphanumeric character, splits
  // what is left into NON-OVERLAPPING 3-character chunks
  // (`.match(/.{1,3}/g)`), and returns the Jaccard index of the two chunk
  // sets. Consequences pinned below: chunk order does not matter, and
  // strings that share a prefix but fall on different chunk boundaries
  // can still score 0.

  it("scores identical strings as 1", () => {
    expect(similarity("abcdef", "abcdef")).toBe(1);
    expect(similarity("hello world", "hello world")).toBe(1);
    expect(similarity("INV-2026-001", "INV-2026-001")).toBe(1);
  });

  it("scores empty inputs as 0, including two empty strings", () => {
    expect(similarity("", "")).toBe(0);
    expect(similarity("abc", "")).toBe(0);
    expect(similarity("", "abc")).toBe(0);
  });

  it("scores unrelated strings as 0", () => {
    expect(similarity("abcdef", "ghijkl")).toBe(0);
    expect(similarity("a", "b")).toBe(0);
  });

  it("scores partially overlapping chunks as a fraction", () => {
    // {abc, def} vs {abc, xyz}: intersection 1, union 3.
    expect(similarity("abcdef", "abcxyz")).toBeCloseTo(1 / 3);
    // {abc, def, ghi} vs {abc, def, xyz}: intersection 2, union 4.
    expect(similarity("abcdefghi", "abcdefxyz")).toBe(0.5);
  });

  it("is case-insensitive and ignores punctuation and spaces", () => {
    expect(similarity("ABC", "abc")).toBe(1);
    expect(similarity("a-b c!", "abc")).toBe(1);
    expect(similarity("Acme Traders", "acme-traders")).toBe(1);
  });

  it("is symmetric", () => {
    expect(similarity("abcdef", "abcxyz")).toBe(
      similarity("abcxyz", "abcdef"),
    );
  });

  it("always returns a value between 0 and 1", () => {
    for (const [a, b] of [
      ["abcdef", "abcxyz"],
      ["hello world", "goodbye world"],
      ["", "abc"],
    ] as Array<[string, string]>) {
      const score = similarity(a, b);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it("is insensitive to chunk order (set of chunks, not sequence)", () => {
    expect(similarity("abcdef", "defabc")).toBe(1);
  });

  it("scores 0 for strings sharing a prefix on different chunk boundaries", () => {
    // "ab" chunks as ["ab"], "abc" chunks as ["abc"]: no chunk in common.
    expect(similarity("ab", "abc")).toBe(0);
  });

  it("handles short strings as single chunks", () => {
    expect(similarity("ab", "ab")).toBe(1);
    expect(similarity("a", "a")).toBe(1);
  });
});

describe("money", () => {
  it("parses plain numbers", () => {
    expect(money("1234")).toBe(1234);
    expect(money("1234.56")).toBe(1234.56);
    expect(money("0")).toBe(0);
    expect(money("-500")).toBe(-500);
  });

  it("strips thousands separators", () => {
    expect(money("1,234.56")).toBe(1234.56);
    expect(money("1,000,000")).toBe(1000000);
  });

  it("strips currency labels and surrounding whitespace", () => {
    expect(money("PKR 1,234")).toBe(1234);
    expect(money("  250.50 ")).toBe(250.5);
  });

  it("returns null for null, undefined and empty input", () => {
    expect(money(null)).toBeNull();
    expect(money(undefined)).toBeNull();
    expect(money("")).toBeNull();
  });

  it("returns null for values that are not numbers after stripping", () => {
    expect(money("---")).toBeNull();
    expect(money("12.34.56")).toBeNull();
  });

  it("returns null for a letters-only value (fixed: stripping left '' and Number('') is 0)", () => {
    expect(money("abc")).toBeNull();
  });
});

describe("normalizeDate", () => {
  it("converts day + month-name + year to YYYY-MM-DD", () => {
    expect(normalizeDate("15 Jan 2026")).toBe("2026-01-15");
    expect(normalizeDate("5 February 2026")).toBe("2026-02-05");
    expect(normalizeDate("1 May 2026")).toBe("2026-05-01");
  });

  it("accepts dash and slash separators around the month name", () => {
    expect(normalizeDate("15-Sep-2026")).toBe("2026-09-15");
    expect(normalizeDate("15/Sept/2026")).toBe("2026-09-15");
  });

  it("matches month names case-insensitively", () => {
    expect(normalizeDate("15 JANUARY 2026")).toBe("2026-01-15");
  });

  it("returns null for null and empty input", () => {
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate("")).toBeNull();
  });

  it("passes an unknown month name through instead of inventing January (fixed: the lookup no longer falls back to 01)", () => {
    // "Foo" is not a month: normalizeDate returns the input unchanged, and
    // toIsoDate then rejects it as not-a-date. Inventing January would
    // silently date an invoice a month it never had.
    expect(normalizeDate("15 Foo 2026")).toBe("15 Foo 2026");
  });

  it("PINNED BEHAVIOUR: anything else passes through unchanged", () => {
    // Only the day/month-name/year shape is converted. ISO dates and
    // numeric dates are returned exactly as given.
    expect(normalizeDate("2026-01-15")).toBe("2026-01-15");
    expect(normalizeDate("15/09/2026")).toBe("15/09/2026");
    expect(normalizeDate("15-09-2026")).toBe("15-09-2026");
    expect(normalizeDate("Jan 15, 2026")).toBe("Jan 15, 2026");
  });
});

describe("cleanText", () => {
  it("trims, removes carriage returns and collapses 3+ newlines to 2", () => {
    expect(cleanText("  hello  \n\n\n\nworld\r\n")).toBe("hello\n\nworld");
  });

  it("removes null bytes", () => {
    expect(cleanText("a\0b")).toBe("ab");
  });

  it("strips trailing spaces and tabs before a newline", () => {
    expect(cleanText("line one  \nline two\t\nline three")).toBe(
      "line one\nline two\nline three",
    );
  });

  it("keeps single and double newlines intact", () => {
    expect(cleanText("a\nb\n\nc")).toBe("a\nb\n\nc");
  });

  it("returns an empty string for empty input", () => {
    expect(cleanText("")).toBe("");
  });
});

describe("parseDeterministic", () => {
  // Sample A: a full invoice WITHOUT a "GST:" registration line, so the
  // tax line is the first GST/Tax match. (A "GST:" registration line
  // changes tax_total; see the Sample B test below.)
  const SAMPLE_A = [
    "Invoice",
    "Acme Traders Pvt Ltd",
    "NTN: 1234567-8",
    "billing@acme.example",
    "Invoice Number",
    "INV-2026-001",
    "Invoice Date",
    "15 Jan 2026",
    "Due Date",
    "30 Jan 2026",
    "Currency",
    "PKR",
    "Subtotal",
    "10,000.00",
    "GST (18%)",
    "1,800.00",
    "Total",
    "11,800.00",
    "Bank: Habib Bank Account Title: Acme Traders Account No.: 1234567890",
    "IBAN: PK36HABB0000001234567890",
  ].join("\n");

  it("extracts vendor, tax id, invoice number and dates from a full invoice", () => {
    const parsed = parseDeterministic(SAMPLE_A);
    // The bare "Invoice" line is excluded; the next vendor-like line wins.
    expect(parsed.vendor_name).toBe("Acme Traders Pvt Ltd");
    expect(parsed.tax_id).toBe("1234567-8");
    expect(parsed.invoice_number).toBe("INV-2026-001");
    expect(parsed.invoice_date).toBe("2026-01-15");
    expect(parsed.due_date).toBe("2026-01-30");
    expect(parsed.currency).toBe("PKR");
  });

  it("extracts subtotal and tax from a full invoice", () => {
    const parsed = parseDeterministic(SAMPLE_A);
    expect(parsed.subtotal).toBe(10000);
    expect(parsed.tax_total).toBe(1800);
  });

  it("reads the Total line, not the Subtotal line (fixed: the regex now requires a word boundary)", () => {
    // The old /Total.../ regex matched inside "Subtotal" first and
    // returned the subtotal amount as the total.
    expect(parseDeterministic(SAMPLE_A).total).toBe(11800);
  });

  it("extracts bank details and IBAN from a full invoice", () => {
    const parsed = parseDeterministic(SAMPLE_A);
    expect(parsed.bank_name).toBe("Habib Bank");
    expect(parsed.account_title).toBe("Acme Traders");
    expect(parsed.account_number).toBe("1234567890");
    expect(parsed.iban).toBe("PK36HABB0000001234567890");
  });

  it("extracts the contact email (fixed: the regex now has a capture group)", () => {
    expect(parseDeterministic(SAMPLE_A).contact_email).toBe("billing@acme.example");
  });

  it("returns null registration_id when there is no GST: line", () => {
    // "GST (18%)" does not match /GST:/, so no registration id is found.
    expect(parseDeterministic(SAMPLE_A).registration_id).toBeNull();
  });

  it("always returns an empty line_items array", () => {
    expect(parseDeterministic(SAMPLE_A).line_items).toEqual([]);
  });

  it("does not let a GST: registration line hijack tax_total (fixed: lookahead skips dashed registration numbers)", () => {
    const parsed = parseDeterministic(
      [
        "Beta Supplies Ltd",
        "GST: 01-2345678-001-90",
        "Subtotal",
        "2,000.00",
        "GST (18%)",
        "360.00",
        "Total",
        "2,360.00",
      ].join("\n"),
    );
    expect(parsed.vendor_name).toBe("Beta Supplies Ltd");
    expect(parsed.registration_id).toBe("01-2345678-001-90");
    expect(parsed.subtotal).toBe(2000);
    // The old tax regex matched the registration line first and captured
    // the trailing "0" of the registration number as the tax amount.
    expect(parsed.tax_total).toBe(360);
    expect(parsed.total).toBe(2360);
  });

  it("does not let a Taxable Value line hijack tax_total (fixed: word boundary after the label)", () => {
    const parsed = parseDeterministic(
      [
        "Delta Supplies Ltd",
        "Taxable Value",
        "10,000.00",
        "GST (18%)",
        "1,800.00",
        "Total",
        "11,800.00",
      ].join("\n"),
    );
    // The old tax regex matched "Tax" inside "Taxable Value" and captured
    // the taxable value as the tax amount.
    expect(parsed.tax_total).toBe(1800);
    expect(parsed.total).toBe(11800);
  });

  it("does not let a Tax Rate line hijack tax_total (fixed: Rate lookahead)", () => {
    const parsed = parseDeterministic(
      ["Epsilon Traders", "Tax Rate", "18%", "Total", "1,000.00"].join("\n"),
    );
    // "Tax Rate" is a rate label, not an amount: no tax line matches.
    expect(parsed.tax_total).toBeNull();
    expect(parsed.total).toBe(1000);
  });

  it("reads the Total line correctly when there is no Subtotal line", () => {
    const parsed = parseDeterministic(
      ["Gamma LLC", "Total", "5,500.00"].join("\n"),
    );
    expect(parsed.vendor_name).toBe("Gamma LLC");
    expect(parsed.subtotal).toBeNull();
    expect(parsed.total).toBe(5500);
  });

  it("returns nulls (and PKR currency) for empty text", () => {
    expect(parseDeterministic("")).toEqual({
      vendor_name: null,
      tax_id: null,
      registration_id: null,
      contact_email: null,
      invoice_number: null,
      invoice_date: null,
      due_date: null,
      currency: "PKR",
      subtotal: null,
      tax_total: null,
      total: null,
      bank_name: null,
      account_title: null,
      account_number: null,
      iban: null,
      line_items: [],
    });
  });

  it("returns nulls (and PKR currency) when fields are missing", () => {
    const parsed = parseDeterministic("Zeta Traders\nSome other line");
    expect(parsed.vendor_name).toBe("Zeta Traders");
    expect(parsed.invoice_number).toBeNull();
    expect(parsed.invoice_date).toBeNull();
    expect(parsed.total).toBeNull();
    expect(parsed.iban).toBeNull();
    expect(parsed.currency).toBe("PKR");
    expect(parsed.line_items).toEqual([]);
  });

  it("returns null vendor when no line looks like a vendor name", () => {
    const parsed = parseDeterministic(
      ["Invoice", "Some random text", "Total", "100.00"].join("\n"),
    );
    expect(parsed.vendor_name).toBeNull();
    expect(parsed.total).toBe(100);
  });

  it("returns null amounts for malformed numbers", () => {
    const parsed = parseDeterministic(
      ["Delta Traders", "Subtotal", "abc", "Total", "n/a"].join("\n"),
    );
    expect(parsed.subtotal).toBeNull();
    expect(parsed.total).toBeNull();
  });

  it("uppercases a lowercase currency code", () => {
    const parsed = parseDeterministic(
      ["Epsilon Inc", "Currency", "usd"].join("\n"),
    );
    expect(parsed.currency).toBe("USD");
  });

  it("passes a numeric invoice date through unchanged", () => {
    const parsed = parseDeterministic(
      ["Theta Ltd", "Invoice Date", "15/09/2026"].join("\n"),
    );
    expect(parsed.invoice_date).toBe("15/09/2026");
  });

  it("accepts slashes in the invoice number", () => {
    const parsed = parseDeterministic(
      ["Iota Traders", "Invoice Number", "INV/2026/042"].join("\n"),
    );
    expect(parsed.invoice_number).toBe("INV/2026/042");
  });

  it("strips spaces and dashes from the account number", () => {
    const parsed = parseDeterministic(
      "Bank: Meezan Bank Account Title: Zeta Traders Account No.: 1234-5678 90",
    );
    expect(parsed.bank_name).toBe("Meezan Bank");
    expect(parsed.account_title).toBe("Zeta Traders");
    expect(parsed.account_number).toBe("1234567890");
  });

  it("preserves the original case of the IBAN", () => {
    const parsed = parseDeterministic("IBAN: pk36habb0000001234567890");
    expect(parsed.iban).toBe("pk36habb0000001234567890");
  });
});

describe("extractWithPdfJs", () => {
  // Minimal one-page PDF holding a single text line, built as ASCII text
  // (no binary fixture: the push tooling only accepts UTF-8 text files).
  // The xref offsets are computed at build time so the fixture stays valid
  // if the text changes. What this proves: the extractor returns the page
  // text of a well-formed single-page PDF — exactly the regression where
  // the success path collected pages but never returned them. It does NOT
  // prove pdftotext behaviour (a system binary, untested here), scanned
  // images, multi-page documents, or exotic PDF encodings.
  function buildMinimalPdf(text: string): Buffer {
    const stream = `BT /F1 24 Tf 100 700 Td (${text}) Tj ET`;
    const objects: string[] = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    let pdf = "%PDF-1.1\n";
    const offsets: number[] = [0];
    objects.forEach((body, i) => {
      offsets.push(Buffer.byteLength(pdf, "ascii"));
      pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefPos = Buffer.byteLength(pdf, "ascii");
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
    return Buffer.from(pdf, "ascii");
  }

  it("extracts text from a minimal one-page PDF", async () => {
    const text = await extractWithPdfJs(buildMinimalPdf("Hello Invoice"));
    expect(text).toContain("Hello Invoice");
  });

  it("returns an empty string for bytes that are not a PDF", async () => {
    // The extractor catches parse failures and returns "".
    const text = await extractWithPdfJs(Buffer.from("this is not a pdf", "ascii"));
    expect(text).toBe("");
  });
});
