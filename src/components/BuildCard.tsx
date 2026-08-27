import type { ResultItem, SearchResult } from "@/engine/types";

function pct(x: number | null): string {
  return x == null ? "—" : `${(x * 100).toFixed(1)}%`;
}

function winRateClass(wr: number | null): string {
  if (wr == null) return "text-gold-bright";
  if (wr >= 0.52) return "text-win-high";
  if (wr >= 0.505) return "text-win-high";
  if (wr >= 0.5) return "text-win-mid";
  return "text-win-low";
}

function ItemPip({ item }: { item: ResultItem }) {
  return (
    <div className="relative">
      <img
        src={item.iconUrl}
        alt={item.name}
        title={item.name}
        width={44}
        height={44}
        className={
          "h-11 w-11 rounded-md border object-cover " +
          (item.requested ? "border-gold ring-2 ring-gold" : "border-line")
        }
      />
      {item.requested && (
        <span className="absolute -right-1 -top-1 rounded-full bg-gold px-1 text-[9px] font-bold leading-4 text-bg">
          ★
        </span>
      )}
    </div>
  );
}

export function BuildCard({ result, rank }: { result: SearchResult; rank: number }) {
  const observed = result.provenance === "observed";
  const synergyPct = Math.round(result.synergyScore * 100);
  const requestedIds = new Set(result.path.filter((p) => p.requested).map((p) => p.id));
  const requestedWhy = result.explanation.perItem.filter((w) => requestedIds.has(w.itemId) && w.reasons.length > 0);

  return (
    <div className="rounded-xl border border-line bg-bg-card p-4 transition-colors hover:bg-bg-hover">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gold-bright/60">#{rank}</span>
          {observed ? (
            <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              Observed
            </span>
          ) : (
            <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold">
              Recommended · synergy
            </span>
          )}
          {result.gameStage && (
            <span className="text-xs text-gold-bright/50">{result.gameStage.toLowerCase()} game</span>
          )}
        </div>
        <div className="text-right text-xs text-gold-bright/50">
          {result.role.toLowerCase()} · patch {result.patch}
          {observed ? ` · ${result.rank.replace("_", " ").toLowerCase()}` : ""}
        </div>
      </div>

      {/* Item path */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {result.path.map((item, i) => (
          <div key={`${item.id}-${i}`} className="flex items-center gap-2">
            <ItemPip item={item} />
            {i < result.path.length - 1 && <span className="text-gold-bright/25">›</span>}
          </div>
        ))}
        {result.boots && (
          <>
            <span className="mx-1 h-8 w-px bg-line" />
            <ItemPip item={result.boots} />
          </>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 border-t border-line pt-3 text-center">
        <div>
          <div className={"text-lg font-bold " + winRateClass(result.winRate)}>{pct(result.winRate)}</div>
          <div className="text-[10px] uppercase tracking-wide text-gold-bright/40">win rate</div>
        </div>
        <div>
          <div className="text-lg font-bold text-gold-bright">
            {result.games != null ? result.games.toLocaleString() : "—"}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-gold-bright/40">games</div>
        </div>
        <div>
          <div className="text-lg font-bold text-gold-bright">{pct(result.pickRate)}</div>
          <div className="text-[10px] uppercase tracking-wide text-gold-bright/40">pick rate</div>
        </div>
        <div>
          <div className="text-lg font-bold text-gold-bright">{pct(result.observedScore)}</div>
          <div className="text-[10px] uppercase tracking-wide text-gold-bright/40" title="Wilson 95% lower bound of win rate — rewards sample size">
            confidence
          </div>
        </div>
      </div>

      {/* Synergy — the "why" */}
      <div className="mt-3 border-t border-line pt-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-medium text-gold">Synergy — why this works</span>
          <span className="text-gold-bright/60">{synergyPct}/100</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
          <div className="h-full rounded-full bg-gold" style={{ width: `${synergyPct}%` }} />
        </div>

        <p className="mt-2 text-xs leading-snug text-gold-bright/80">{result.explanation.summary}</p>

        {result.explanation.topReasons.length > 0 && (
          <ul className="mt-2 space-y-1">
            {result.explanation.topReasons.map((reason, i) => (
              <li key={i} className="text-xs leading-snug text-gold-bright/70">
                • {reason}
              </li>
            ))}
          </ul>
        )}

        {requestedWhy.map((w) => (
          <div key={w.itemId} className="mt-2 rounded-md border border-gold/20 bg-gold/5 p-2">
            <span className="text-xs font-medium text-gold">Why {w.name}: </span>
            <span className="text-xs leading-snug text-gold-bright/75">{w.reasons.join(" ")}</span>
          </div>
        ))}

        {!observed && (
          <p className="mt-2 text-[11px] italic text-gold-bright/40">
            Suggested by item/champion fit — not tied to a win-rate sample.
          </p>
        )}
      </div>
    </div>
  );
}
