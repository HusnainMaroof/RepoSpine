import pkg from "../../package.json";

/** Human-readable project name. */
/** Canonical public product name. Legacy `codeatlas` storage and commands remain supported. */
export const NAME = "repospine";

/** Release-train version, embedded by the build rather than read at runtime. */
export const VERSION = pkg.version;
