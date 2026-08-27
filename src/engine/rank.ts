// Observed statistical strength. This axis is purely about what actually wins in
// games, with sample size accounted for. We use the Wilson score interval lower
// bound so a 58% build over 40 games does not outrank a 53% build over 30,000.

/**
 * Wilson score interval lower bound for a binomial proportion.
 * @param wins successes
 * @param games trials
 * @param z z-score (1.96 = 95% confidence)
 * @returns lower-bound win probability in [0,1]
 */
export function wilsonLowerBound(wins: number, games: number, z = 1.96): number {
  if (games <= 0) return 0;
  const phat = wins / games;
  const z2 = z * z;
  const denom = 1 + z2 / games;
  const centre = phat + z2 / (2 * games);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * games)) / games);
  return Math.max(0, (centre - margin) / denom);
}

export function winRate(wins: number, games: number): number {
  return games > 0 ? wins / games : 0;
}
