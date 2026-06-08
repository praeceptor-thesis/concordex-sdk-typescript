/**
 * Concordex — TypeScript SDK.
 *
 * Concordex is the codex of trust between minds: a reference work that
 * indexes how agents reveal themselves (Anima), how they move under
 * conditions (Augur), and how trust between them is sustained
 * (Concordia). This SDK is the customer-facing surface for streaming
 * agent events and gating actions through circuit breakers.
 *
 * Quick start:
 *
 *   import { Concordex } from "@concordex/sdk";
 *
 *   const cx = new Concordex({ apiKey: "ck_..." });
 *
 *   await cx.subjectSays({
 *     agentSubjectId: "subject:dv:bot",
 *     subjectId:      "subject:dv:cust",
 *     text:           "I want a refund.",
 *   });
 *
 *   const g = await cx.check({ subjectId: "subject:dv:bot" });
 *   if (!g.allow) return refuse(g.reason);
 *
 * See README.md for the full conceptual model and additional examples.
 */

export {
  Concordex,
  EVENT_KINDS,
  type ConcordexOptions,
  type ConversationOptions,
  type EmitEventOptions,
  type SubjectSaysOptions,
  type ToolCallOptions,
  type ToolResultOptions,
  type ObservationOptions,
  type CheckOptions,
  type EventKind,
  type FetchLike,
  type GuardHandle,
} from "./client.js";

export { Conversation } from "./conversation.js";

export {
  slugifySubject,
  subjectIdForDivision,
  subjectForDivision,
  isCanonicalSubjectId,
  type SubjectIdOptions,
  type SubjectForDivisionOptions,
} from "./subjects.js";

export {
  type EmitResult,
  type CheckResult,
  type Subject,
  type FiredPolicy,
  type AnchorRef,
  type Outcome,
  type CBState,
  type TriageDecision,
} from "./models.js";

export {
  ConcordexError,
  AuthError,
  PermissionError,
  ValidationError,
  ServerError,
  CBOpenError,
  type ConcordexErrorInit,
  type CBOpenErrorInit,
  type ErrorBody,
} from "./errors.js";

export { verifyWebhookSignature } from "./webhook.js";

/**
 * Concordia MCP client — the governance side of Concordex. Same shape
 * as the Python `concordex.concordia` submodule. Prefer the subpath
 * import for tree-shaking:
 *
 *   import { ConcordiaClient } from "@concordex/sdk/concordia";
 *
 * The namespace re-export below is provided for symmetry; bundlers
 * that don't support package subpaths can still reach the client via
 * `concordia.ConcordiaClient`.
 */
export * as concordia from "./concordia.js";

/** Pinned spec version the agent-stream surface implements (spec §11.1). */
export const SPEC_VERSION = "0.5.0";
