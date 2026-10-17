import { createHash } from "node:crypto";

/** Length of a SHA-256 hex digest (64 characters). */
export const SHA256_HEX_LENGTH = 64;

/**
 * Compute the SHA-256 hex digest of text or raw bytes. This is synchronous and never
 * fails.
 *
 * @param content - The string content to hash.
 * @returns A 64-character lowercase hex digest.
 */
export function hashContent(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}
