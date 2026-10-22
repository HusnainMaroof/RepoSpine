import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type WorkPacket, indexProject } from "@prof-bilal/atlas-sdk";
import { describe, expect, it } from "vitest";
import { createMcpServer } from "../src/server";
import { silentLogger } from "./fixture";

describe("work packet MCP protocol", () => {
  it("advertises read-only annotations and serves structured bounded packets without sessions or task writes", async () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-mcp-packet-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/math.ts"), "export function double(n: number) { return n * 2; }");
    expect((await indexProject({ repositoryPath: root, mode: "build" })).ok).toBe(true);
    const server = createMcpServer({ root, logger: silentLogger(), autoRefresh: false });
    const client = new Client({ name: "packet-client", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b);
      await client.connect(a);
      const listed = await client.listTools();
      expect(
        listed.tools.find((tool) => tool.name === "build_work_packet")?.annotations,
      ).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
      const result = await client.callTool({
        name: "build_work_packet",
        arguments: { task: "Explain double", scopePaths: ["src"], maxTokens: 4000 },
      });
      expect(result.isError).not.toBe(true);
      const packet = (result.structuredContent as Record<string, unknown>)["packet"] as WorkPacket;
      expect(packet.id).toMatch(/^[a-f0-9]{32}$/);
      expect(packet.evidence.some((ref) => ref.path === "src/math.ts")).toBe(true);
      expect(packet.budget.estimatedTokens).toBeLessThanOrEqual(4000);
      expect(existsSync(join(root, ".codeatlas/tasks"))).toBe(false);
      for (const args of [
        { task: "" },
        { task: "Explain double", scopePaths: ["../outside"] },
        { task: "Explain double", maxTokens: -1 },
        { task: `sk-${"x".repeat(30)}` },
      ]) {
        const invalid = await client.callTool({ name: "build_work_packet", arguments: args });
        expect(invalid.isError).toBe(true);
      }
    } finally {
      await client.close();
      await server.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
