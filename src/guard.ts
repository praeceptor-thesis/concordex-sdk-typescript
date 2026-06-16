/**
 * `guard()` implementation lives on `DMZAgent` in `client.ts` (so the
 * client and its guard share the same `check()` plumbing). This module
 * re-exports the public types — `GuardHandle` — for consumers who want
 * to import them by their `guard` namespace.
 *
 * Kept as a separate module so the spec's §5.7 surface lines up 1:1
 * with a TypeScript import.
 */

export type { GuardHandle } from "./client.js";
