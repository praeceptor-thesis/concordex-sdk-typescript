/**
 * Worker-friendly agent-stream surface.
 *
 * This subpath intentionally excludes webhook verification and Concordia MCP
 * exports so edge runtimes can import the chat/circuit-breaker client without
 * pulling Node-only crypto modules into the bundle.
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

export const SPEC_VERSION = "0.5.0";
