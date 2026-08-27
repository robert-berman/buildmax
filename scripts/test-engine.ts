// Offline engine test (no server, no DB). Runs the seed-provider search end to
// end and asserts the core guarantees. Run with: npm run test:engine
import { search } from "@/engine/search";
import type { Role } from "@/data/stats/types";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log("  ok  -", msg);
  } else {
    console.error("  FAIL-", msg);
    failures++;
  }
}

interface Case {
  q: string;
  champ: string;
  role?: Role;
  require: number[];
}

const cases: Case[] = [
  { q: "Hecarim jungle Heartsteel build", champ: "Hecarim", role: "JUNGLE", require: [3084] },
  { q: "Master Yi crit build with Infinity Edge + Kraken Slayer", champ: "MasterYi", require: [3031, 6672] },
  { q: "Warwick jungle on-hit", champ: "Warwick", role: "JUNGLE", require: [] },
];

async function run() {
  for (const c of cases) {
    const r = await search(c.q);
    console.log(`\nQUERY: ${c.q}`);
    assert(r.parsed.championId === c.champ, `champion parsed as ${c.champ} (got ${r.parsed.championId})`);
    if (c.role) assert(r.meta.roleResolved === c.role, `role resolved to ${c.role} (got ${r.meta.roleResolved})`);
    for (const id of c.require) assert(r.parsed.requiredItemIds.includes(id), `required item ${id} parsed`);

    const observed = r.results.filter((x) => x.provenance === "observed");
    if (c.require.length > 0) {
      assert(observed.length > 0, "has observed results");
      assert(
        observed.every((x) => c.require.every((id) => x.path.some((p) => p.id === id) || x.boots?.id === id)),
        "every observed build contains all required items",
      );
    }
    const scores = observed.map((x) => x.observedScore ?? 0);
    assert(
      scores.every((v, i) => i === 0 || scores[i - 1] >= v),
      "observed builds sorted by Wilson score (desc)",
    );
    assert(
      r.results.some((x) => x.provenance === "recommended"),
      "has at least one synergy recommendation",
    );
    assert(
      r.results.every((x) => x.synergyReasons.length > 0),
      "every result carries a human-readable synergy reason",
    );
    assert(r.results.length >= 5 && r.results.length <= 10, `returns 5-10 results (got ${r.results.length})`);
  }

  console.log(failures === 0 ? "\nAll engine checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

void run();
