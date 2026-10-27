"use client";

import type { ComponentProps, ReactNode } from "react";
import { explorerUrl } from "@/lib/markets";

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border bg-card p-4 sm:p-5 ${className}`}>
      {title && <h2 className="mb-3 text-lg font-bold">{title}</h2>}
      {children}
    </section>
  );
}

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: "primary" | "ghost" }) {
  const styles =
    variant === "primary"
      ? "bg-tomato text-white hover:brightness-110"
      : "border border-border bg-transparent hover:bg-border/40";
  return (
    <button
      {...props}
      className={`min-h-11 rounded-xl px-4 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  const color = tone === "warn" ? "border-cheese bg-cheese/10" : "border-border bg-border/30";
  return <div className={`rounded-xl border p-3 text-sm ${color}`}>{children}</div>;
}

type TxState = { hash?: string; chainId?: number; error?: string; busy: boolean; signing: boolean; confirmed: boolean };

export function TxStatus({ tx }: { tx: TxState }) {
  if (tx.error) return <p className="mt-2 text-sm text-tomato">{tx.error}</p>;
  if (tx.signing) return <p className="mt-2 text-sm text-muted">Confirm in your wallet…</p>;
  if (tx.busy) return <p className="mt-2 text-sm text-muted">Confirming on-chain…</p>;
  if (tx.confirmed && tx.hash)
    return (
      <p className="mt-2 text-sm text-basil">
        Done!{" "}
        <a className="underline" href={`${tx.chainId ? explorerUrl(tx.chainId) : ""}/tx/${tx.hash}`} target="_blank" rel="noreferrer">
          View transaction
        </a>
      </p>
    );
  return null;
}
