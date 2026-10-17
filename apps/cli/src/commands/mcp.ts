import { resolve } from "node:path";
import { startStdioServer } from "@prof-bilal/atlas-mcp";
import type { Command } from "commander";
import { openMetrics } from "./metrics";
import { resolveProjectRoot } from "./search";
import { openUsage } from "./usage";

/**
 * Start the CodeAtlas MCP server over stdio for the current project. This is
 * what AI coding tools (Claude Desktop, Cursor, VS Code, …) connect to.
 */
export function registerMcp(program: Command): void {
  program
    .command("mcp")
    .description("Start the CodeAtlas MCP server over stdio (for AI coding tools)")
    .option("--root <path>", "project root to index (defaults to ATLAS_ROOT or cwd)")
    .option("--profile <profile>", "context (default) or proof tool profile", "context")
    .action(async (options: { root?: string; profile: string }) => {
      if (options.profile !== "context" && options.profile !== "proof")
        throw new Error("MCP profile must be context or proof.");
      const root = options.root === undefined ? resolveProjectRoot() : resolve(options.root);
      const metrics = openMetrics(root);
      const usage = openUsage(root);
      try {
        await startStdioServer({ root, metrics, usage, toolProfile: options.profile });
      } finally {
        metrics.flush();
        metrics.close();
        usage.close();
      }
    });
}
