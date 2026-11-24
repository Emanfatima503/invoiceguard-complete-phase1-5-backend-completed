"use client";
import { useRef, useState } from "react";
import { UploadCloud, Loader2, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const MAX_BYTES = 10 * 1024 * 1024;

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clearing React state alone leaves the hidden input holding the file, so
  // picking the SAME file again would not fire onChange (the value never
  // changed). Reset the input whenever the selection is cleared.
  function resetFileInput() {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function pickFile(next: File | null | undefined) {
    if (!next) return;
    if (!ACCEPTED_TYPES.includes(next.type)) {
      setFile(null);
      resetFileInput();
      setOk(false);
      setMsg("Unsupported file type. Send a PDF, PNG or JPEG.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setFile(null);
      resetFileInput();
      setOk(false);
      setMsg("File exceeds 10 MB.");
      return;
    }
    setFile(next);
    setMsg("");
    setOk(false);
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setMsg("");
    setOk(false);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("source", "upload");
    try {
      const r = await fetch("/api/intake", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Upload failed");
      setOk(true);
      setMsg(j.duplicate ? "This exact file was already ingested." : `Invoice received. ID: ${j.invoice_id}`);
      setFile(null);
      resetFileInput();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Upload</h1>
        <p className="mt-1 text-sm text-slate-400">Send a PDF or image through the same intake backend used by automated ingestion.</p>
      </div>
      <div className="glass rounded-2xl p-8">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pickFile(e.dataTransfer.files?.[0]);
          }}
          className={`flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed text-center ${
            dragging ? "border-brand bg-brand/10" : "border-white/15 bg-white/[.02] hover:bg-white/[.04]"
          }`}
        >
          <UploadCloud className="size-10 text-brand" />
          <span className="mt-4 text-sm font-medium text-white">{file ? file.name : dragging ? "Drop the file to upload it" : "Choose invoice file or drag it here"}</span>
          <span className="mt-1 text-xs text-slate-500">PDF, PNG or JPEG · up to 10 MB</span>
          <input ref={fileInputRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        </label>
        <button
          disabled={!file || busy}
          onClick={submit}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-teal py-2.5 font-medium text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
          {busy ? "Processing…" : "Send to intake"}
        </button>
        {msg && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${ok ? "border-teal/30 bg-teal/10 text-teal" : "border-danger/30 bg-danger/10 text-danger"}`}
          >
            {ok && <CheckCircle2 className="mr-2 inline size-4" />}
            {msg}
          </motion.div>
        )}
      </div>
    </div>
  );
}
