#!/usr/bin/env node
import { createCli } from "./cli";

// Surface otherwise-silent async failures (memory/DB-lock/spawn errors) so a
// failing command prints a stack trace instead of exiting with no output.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  process.exitCode = 1;
});

await createCli().parseAsync(process.argv);
