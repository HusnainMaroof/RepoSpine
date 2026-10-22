import { describe, expect, it } from "vitest";
import { semanticHash } from "../src/proof/semantic";

describe("conservative syntax normalization", () => {
  it("normalizes printer-safe TypeScript formatting", () => {
    expect(semanticHash("a.ts", "export const x=1;")).toBe(
      semanticHash("a.ts", "export  const x = 1;"),
    );
  });
  it("preserves changed values, strings, comments and automatic semicolon insertion", () => {
    expect(semanticHash("a.ts", "export const x=1;")).not.toBe(
      semanticHash("a.ts", "export const x=2;"),
    );
    expect(semanticHash("a.ts", "function f(){return\nx}")).not.toBe(
      semanticHash("a.ts", "function f(){return x}"),
    );
    expect(semanticHash("a.ts", "// @ts-ignore\nx();")).not.toBe(semanticHash("a.ts", "x();"));
  });
  it("reports unsupported or malformed syntax as unknown", () => {
    expect(semanticHash("a.py", "x=1")).toBeUndefined();
    expect(semanticHash("a.ts", "export const = ;")).toBeUndefined();
  });
});
