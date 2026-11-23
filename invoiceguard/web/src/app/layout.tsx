import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InvoiceGuard — Invoice fraud & anomaly detection",
  description: "Fraud-risk triage and invoice verification assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div aria-hidden className="aurora pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <span className="left-[-10%] top-[-20%] h-[45vw] w-[45vw] bg-brand" />
          <span className="right-[-15%] top-[10%] h-[35vw] w-[35vw] bg-teal [animation-delay:-8s]" />
          <span className="bottom-[-25%] left-[30%] h-[40vw] w-[40vw] bg-indigo-600 [animation-delay:-14s]" />
        </div>
        <div aria-hidden className="grid-bg pointer-events-none fixed inset-0 -z-10" />
        {children}
      </body>
    </html>
  );
}
