import { atlasConfig } from "../../tsup.config.base";

// Match MCP/CLI packaging: ts-morph's CJS dynamic fs imports must remain
// external when building the SDK's ESM entry point.
export default atlasConfig({ external: ["commander", "ts-morph"] });
