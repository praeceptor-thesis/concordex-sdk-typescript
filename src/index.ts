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
 *     agentSubjectId: "user:ws:bot",
 *     subjectId:      "user:ws:cust",
 *     text:           "I want a refund.",
 *   });
 *
 *   const g = await cx.check({ subjectId: "user:ws:bot" });
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

/** Pinned spec version this SDK implements (spec §11.1). */
export const SPEC_VERSION = "0.5.0";
