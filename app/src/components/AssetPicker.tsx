"use client";

import { useMemo, useState } from "react";
import { popularRank, type AssetSummary } from "@/lib/assets";
import { fmtPct, fmtUsd6 } from "@/lib/format";

/**
 * Searchable asset list: the user's holdings (supplied or in a wallet) first, then the popular
 * assets, then everything else A-Z. Collapsed to the current choice until opened.
 */
export function AssetPicker({
  summaries,
  value,
  onChange,
  loading,
}: {
  summaries: readonly AssetSummary[];
  value: string | undefined;
  onChange: (assetId: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = summaries.find((s) => s.asset.id === value);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = summaries.filter((s) => (loading ? true : s.listed) && (q === "" || s.asset.label.toLowerCase().includes(q)));
    const holds = (s: AssetSummary) => s.suppliedUsd + s.walletUsd;
    const mine = shown.filter((s) => holds(s) > 0n).sort((a, b) => (holds(a) < holds(b) ? 1 : -1));
    const rest = shown.filter((s) => holds(s) === 0n);
    const popular = rest.filter((s) => popularRank(s.asset.label) < 99).sort((a, b) => popularRank(a.asset.label) - popularRank(b.asset.label));
    const others = rest.filter((s) => !popular.includes(s)).sort((a, b) => a.asset.label.localeCompare(b.asset.label));
    return [
      { title: "Your assets", items: mine },
      { title: "Popular", items: popular },
      { title: "All assets", items: others },
    ].filter((g) => g.items.length > 0);
  }, [summaries, query, loading]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 text-left"
      >
        <span className="min-w-0 truncate text-lg font-bold">{current?.asset.label ?? value ?? "Pick an asset"}</span>
        <span className="shrink-0 text-sm text-muted">
          {current?.bestApy !== undefined && <>up to {fmtPct(current.bestApy)} · </>}
          {open ? "Close ▴" : "Change ▾"}
        </span>
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-border">
          <input
            type="search"
            autoFocus
            placeholder="Search assets (USDC, ETH, WBTC...)"
            aria-label="Search assets"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-t-xl border-b border-border bg-background px-3 py-2 text-base"
          />
          <div className="max-h-72 overflow-y-auto overscroll-contain">
            {groups.length === 0 && <p className="px-3 py-3 text-sm text-muted">{loading ? "Loading assets…" : "No asset matches."}</p>}
            {groups.map((g) => (
              <div key={g.title}>
                <div className="sticky top-0 bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</div>
                <ul className="divide-y divide-border">
                  {g.items.map((s) => (
                    <li key={s.asset.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(s.asset.id);
                          setOpen(false);
                          setQuery("");
                        }}
                        aria-pressed={s.asset.id === value}
                        className={`flex min-h-11 w-full items-center justify-between gap-2 px-3 py-1.5 text-left ${s.asset.id === value ? "bg-tomato/10 font-semibold" : ""}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{s.asset.label}</span>
                          {(s.suppliedUsd > 0n || s.walletUsd > 0n) && (
                            <span className="block truncate text-xs font-normal text-muted">
                              {s.suppliedUsd > 0n && `supplied ${fmtUsd6(s.suppliedUsd)}`}
                              {s.suppliedUsd > 0n && s.walletUsd > 0n && " · "}
                              {s.walletUsd > 0n && `wallet ${fmtUsd6(s.walletUsd)}`}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-muted">{s.bestApy === undefined ? "withdraw only" : fmtPct(s.bestApy)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
