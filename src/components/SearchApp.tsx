"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchResponse } from "@/engine/types";
import { BuildCard } from "./BuildCard";

const EXAMPLES = [
  "Hecarim jungle Heartsteel build",
  "Master Yi crit build with Infinity Edge + Kraken Slayer",
  "Warwick jungle on-hit",
  "Darius top Heartsteel",
  "Jarvan IV jungle",
];

const ARCHETYPE_LABELS: Record<string, string> = {
  crit: "crit",
  onhit: "on-hit",
  lethality: "lethality",
  attackspeed: "attack speed",
  ap_burst: "AP burst",
  tank: "tank",
  bruiser: "bruiser",
};

function Pill({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "gold" | "muted" }) {
  const toneClass =
    tone === "gold"
      ? "border-gold/40 bg-gold/10 text-gold"
      : tone === "muted"
        ? "border-line bg-bg text-gold-bright/50"
        : "border-line bg-bg-soft text-gold-bright/80";
  return (
    <span className={"inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs " + toneClass}>
      <span className="text-gold-bright/40">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

export function SearchApp({ patch }: { patch: string }) {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: ac.signal });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      setData((await res.json()) as SearchResponse);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Populate with a representative query on first load.
  useEffect(() => {
    setQuery(EXAMPLES[0]);
    void runSearch(EXAMPLES[0]);
  }, [runSearch]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runSearch(query);
  };

  const observed = data?.results.filter((r) => r.provenance === "observed") ?? [];
  const recommended = data?.results.filter((r) => r.provenance === "recommended") ?? [];
  const parsed = data?.parsed;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-gold-bright">
          Build<span className="text-gold">Max</span>
        </h1>
        <p className="mt-1 text-sm text-gold-bright/60">
          Ask for a champion, role and item in plain English. Get the strongest builds by win rate and by
          synergy. <span className="text-gold-bright/40">Patch {patch}</span>
        </p>
      </header>

      <form onSubmit={onSubmit} className="mb-3">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Hecarim jungle Heartsteel build"
            className="w-full rounded-lg border border-line bg-bg-soft px-4 py-3 text-gold-bright placeholder:text-gold-bright/30 outline-none focus:border-gold/50"
            aria-label="Build search query"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg border border-gold/40 bg-gold/15 px-5 py-3 font-medium text-gold hover:bg-gold/25 disabled:opacity-50"
          >
            {loading ? "…" : "Search"}
          </button>
        </div>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => {
              setQuery(ex);
              void runSearch(ex);
            }}
            className="rounded-full border border-line bg-bg-soft px-3 py-1 text-xs text-gold-bright/70 hover:border-gold/40 hover:text-gold"
          >
            {ex}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-win-low/40 bg-win-low/10 p-3 text-sm text-win-low">
          {error}
        </div>
      )}

      {/* Interpretation */}
      {parsed && (
        <section className="mb-4 rounded-xl border border-line bg-bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gold-bright/40">
              How I read your query
            </h2>
            {data && (
              <span
                className={
                  "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                  (data.meta.live
                    ? "border border-win-high/40 bg-win-high/10 text-win-high"
                    : "border border-gold/40 bg-gold/10 text-gold")
                }
                title={data.meta.sampleNote}
              >
                {data.meta.live ? "live data" : "sample data"} · {data.meta.provider}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill label="champion" value={parsed.championName ?? "not found"} tone={parsed.championName ? "gold" : "muted"} />
            <Pill
              label="role"
              value={
                data?.meta.roleResolved
                  ? data.meta.roleResolved.toLowerCase() + (data.meta.roleInferred ? " (inferred)" : "")
                  : "any"
              }
            />
            {parsed.requiredItemNames.map((n) => (
              <Pill key={n} label="item" value={n} tone="gold" />
            ))}
            {parsed.archetype && <Pill label="style" value={ARCHETYPE_LABELS[parsed.archetype] ?? parsed.archetype} />}
            <Pill label="confidence" value={`${Math.round(parsed.confidence * 100)}%`} tone="muted" />
            {parsed.unmatchedTokens.length > 0 && (
              <Pill label="ignored" value={parsed.unmatchedTokens.join(", ")} tone="muted" />
            )}
          </div>
        </section>
      )}

      {/* Notes */}
      {data?.notes.map((note, i) => (
        <div key={i} className="mb-3 rounded-lg border border-gold/20 bg-gold/5 p-3 text-sm text-gold-bright/70">
          {note}
        </div>
      ))}

      {/* Observed results */}
      {observed.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-gold-bright">
            Strongest in games
            <span className="text-xs font-normal text-gold-bright/40">
              ranked by win rate &amp; sample size (Wilson score)
            </span>
          </h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {observed.map((r, i) => (
              <BuildCard key={r.id} result={r} rank={i + 1} />
            ))}
          </div>
        </section>
      )}

      {/* Recommended results */}
      {recommended.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-gold">
            Recommended by synergy
            <span className="text-xs font-normal text-gold-bright/40">
              item/champion fit — independent of win rate
            </span>
          </h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {recommended.map((r, i) => (
              <BuildCard key={r.id} result={r} rank={i + 1} />
            ))}
          </div>
        </section>
      )}

      {data && data.results.length === 0 && !loading && (
        <div className="rounded-lg border border-line bg-bg-card p-6 text-center text-gold-bright/50">
          No builds to show. Try a different champion, role, or item.
        </div>
      )}

      <footer className="mt-10 border-t border-line pt-4 text-center text-xs text-gold-bright/30">
        Static champion/item data from Riot Data Dragon (patch {patch}). Build statistics are representative
        sample data pending the live Riot ingestion pipeline. BuildMax is unofficial and not endorsed by Riot
        Games.
      </footer>
    </main>
  );
}
