import { describe, expect, it } from "vitest";
import { rankCoupling } from "../src/coupling";

describe("coupling ranking", () => {
  it("ranks deterministic signals, rejects undersampled history and never treats a score as truth", () => {
    const rows = rankCoupling(
      ["auth.ts"],
      [
        { from: "auth.ts", to: "socket.ts", kind: "static", value: 1, samples: 1 },
        { from: "socket.ts", to: "auth.ts", kind: "co-change", value: 0.8, samples: 5 },
        { from: "auth.ts", to: "random.ts", kind: "co-change", value: 1, samples: 1 },
        { from: "auth.ts", to: "broken.ts", kind: "proof-failure", value: Number.NaN, samples: 5 },
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].artifact).toBe("socket.ts");
    expect(rows[0].score).toBe(1.8);
    expect(rows[0].reasons).toHaveLength(2);
  });
});
