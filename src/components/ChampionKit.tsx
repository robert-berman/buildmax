import type { AbilityInfo, ChampionKit } from "@/engine/types";

// LoL-intuitive damage colors (AD orange, AP blue, true white). Inline styles so
// we don't depend on the Tailwind default palette beyond the app's theme tokens.
const DMG_COLOR: Record<AbilityInfo["damageType"], string> = {
  physical: "#e8935a",
  magic: "#5aa2f0",
  true: "#f0e6d2",
  mixed: "#c8aa6e",
  none: "#6b7280",
};

const DMG_LABEL: Record<AbilityInfo["damageType"], string> = {
  physical: "physical",
  magic: "magic",
  true: "true",
  mixed: "mixed",
  none: "utility",
};

function AbilityRow({ ability }: { ability: AbilityInfo }) {
  const color = DMG_COLOR[ability.damageType];
  return (
    <li className="flex items-start gap-3 py-1.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line bg-bg text-xs font-bold text-gold">
        {ability.slot}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gold-bright">{ability.name}</span>
          {ability.damageType !== "none" && (
            <span
              className="rounded border px-1.5 py-0.5 text-[10px] font-medium"
              style={{ color, borderColor: `${color}66`, backgroundColor: `${color}1a` }}
            >
              {DMG_LABEL[ability.damageType]}
            </span>
          )}
        </div>
        {ability.blurb && <p className="text-xs leading-snug text-gold-bright/60">{ability.blurb}</p>}
      </div>
    </li>
  );
}

export function ChampionKitPanel({ kit }: { kit: ChampionKit }) {
  if (kit.abilities.length === 0) return null;
  return (
    <section className="mb-4 rounded-xl border border-line bg-bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gold-bright/40">
          {kit.name}&apos;s kit
        </h2>
        <span className="text-[11px] text-gold-bright/40">
          {kit.identity} · {kit.damageType} damage · {kit.curated ? "curated" : "auto-derived"}
        </span>
      </div>
      <ul className="divide-y divide-line/50">
        {kit.abilities.map((a) => (
          <AbilityRow key={a.slot} ability={a} />
        ))}
      </ul>
      <p className="mt-2 text-[11px] italic text-gold-bright/30">
        Abilities and damage types from Riot Data Dragon — the basis for the synergy &quot;why&quot;.
      </p>
    </section>
  );
}
