import type { ProviderPort } from "@prof-bilal/atlas-core";
import { ok } from "@prof-bilal/atlas-shared";
import { describe, expect, it } from "vitest";
import { proposeObligations } from "../src/compiler";

function provider(proposals: unknown): ProviderPort {
  return {
    complete: async () =>
      ok({
        provider: "fixture",
        model: "fixture",
        content: JSON.stringify({ proposals }),
        usage: undefined,
        toolCalls: undefined,
      }),
  };
}
describe("untrusted proof compiler output", () => {
  it("returns explicit proposals with model provenance, not verdicts", async () => {
    const result = await proposeObligations(
      provider([
        {
          key: "reconnect",
          kind: "ProofObligation",
          statement: "Reconnect works",
          minimumLevel: 3,
        },
      ]),
      "bounded evidence",
    );
    expect(result[0].provenance).toBe("model-proposed");
    expect(result[0].action).toBeUndefined();
  });
  it("rejects status injection, executable actions, excessive output and invalid levels", async () => {
    for (const extra of [
      { status: "proven" },
      { action: { kind: "command", target: "rm" } },
      { minimumLevel: "3" },
    ])
      await expect(
        proposeObligations(
          provider([{ key: "x", kind: "Claim", statement: "x", ...extra }]),
          "evidence",
        ),
      ).rejects.toThrow("Unsafe");
    await expect(proposeObligations(provider([]), "evidence")).rejects.toThrow("count");
    await expect(proposeObligations(provider([]), "x".repeat(64001))).rejects.toThrow("budget");
  });
});
