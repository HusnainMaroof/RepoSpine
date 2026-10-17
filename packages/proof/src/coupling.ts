import type { CouplingSignal } from "@prof-bilal/atlas-core";

/** Equal signal weights are a transparent bootstrap ranking, not calibrated risk. */
export function rankCoupling(
  seeds: readonly string[],
  signals: readonly CouplingSignal[],
  minimumSamples = 3,
): { artifact: string; score: number; reasons: string[] }[] {
  const ranked = new Map<string, { artifact: string; score: number; reasons: string[] }>();
  for (const signal of signals) {
    if (!Number.isFinite(signal.value) || signal.value <= 0 || signal.value > 1) continue;
    if (
      ["co-change", "proof-failure", "agent-miss"].includes(signal.kind) &&
      signal.samples < minimumSamples
    )
      continue;
    const artifact = seeds.includes(signal.from)
      ? signal.to
      : seeds.includes(signal.to)
        ? signal.from
        : undefined;
    if (!artifact || seeds.includes(artifact)) continue;
    const row = ranked.get(artifact) ?? { artifact, score: 0, reasons: [] };
    const reason = `${signal.kind}: ${signal.value.toFixed(3)} (${signal.samples} samples)`;
    // Do not reward duplicate graph paths or duplicate history rows.
    if (!row.reasons.includes(reason)) {
      row.score += signal.value;
      row.reasons.push(reason);
    }
    ranked.set(artifact, row);
  }
  return [...ranked.values()].sort(
    (a, b) => b.score - a.score || a.artifact.localeCompare(b.artifact),
  );
}
