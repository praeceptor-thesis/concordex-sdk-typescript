/**
 * Exception hierarchy for the Concordex TypeScript SDK.
 *
 * The hierarchy is deliberately shallow — most consumers only need to
 * catch `ConcordexError` to bail out gracefully, or `CBOpenError`
 * specifically when they want to handle a blocked subject differently
 * from other failures.
 *
 *   ConcordexError                base
 *     |- AuthError                API key invalid / expired / revoked
 *     |- PermissionError          key valid but lacks the needed scope
 *     |- ValidationError          server rejected the payload as malformed
 *     |- ServerError              5xx from Concordex; safe to retry
 *     \- CBOpenError              cb.check() returned open — action blocked
 *
 * `CBOpenError` is intentionally an `Error` (not just a flag) so that
 * production code paths that wrap CB checks can use `try/catch` as a
 * natural control-flow seam, mirroring the Python / C# / Java SDKs.
 *
 * Every exception exposes:
 *   - `message`     human-readable string (inherited from Error)
 *   - `statusCode`  numeric HTTP status, or null when not from the wire
 *   - `body`        parsed response body (object / string / null)
 *
 * The original network or parse error is preserved via the standard
 * ES2022 `Error.cause` mechanism — `new ConcordexError("...", { cause: e })`.
 */

import type { FiredPolicy, AnchorRef } from "./models.js";

/**
 * Spec §3 says every exception exposes `body: object | string | null`.
 * We widen the type slightly to `Record<string, unknown> | string | null`
 * so consumers can index without first narrowing — the runtime contract
 * matches the spec exactly.
 */
export type ErrorBody = Record<string, unknown> | string | null;

export interface ConcordexErrorInit {
  statusCode?: number | null;
  body?: ErrorBody | unknown;
  cause?: unknown;
}

export class ConcordexError extends Error {
  public readonly statusCode: number | null;
  public readonly body: ErrorBody;

  constructor(message: string, init: ConcordexErrorInit = {}) {
    // ES2022 Error supports { cause } on the options bag.
    super(message, init.cause !== undefined ? { cause: init.cause } : undefined);
    this.name = "ConcordexError";
    this.statusCode = init.statusCode ?? null;
    this.body = normalizeBody(init.body);
    // Preserve prototype chain for instanceof checks under transpilation.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function normalizeBody(value: unknown): ErrorBody {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") return value as Record<string, unknown>;
  // Coerce primitives (number/boolean) to a string for the spec contract.
  return String(value);
}

export class AuthError extends ConcordexError {
  constructor(message: string, init: ConcordexErrorInit = {}) {
    super(message, init);
    this.name = "AuthError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PermissionError extends ConcordexError {
  constructor(message: string, init: ConcordexErrorInit = {}) {
    super(message, init);
    this.name = "PermissionError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends ConcordexError {
  constructor(message: string, init: ConcordexErrorInit = {}) {
    super(message, init);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ServerError extends ConcordexError {
  constructor(message: string, init: ConcordexErrorInit = {}) {
    super(message, init);
    this.name = "ServerError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface CBOpenErrorInit extends ConcordexErrorInit {
  reason?: string;
  firedPolicies?: ReadonlyArray<FiredPolicy>;
  anchor?: AnchorRef | null;
  scopeRef?: string;
}

export class CBOpenError extends ConcordexError {
  public readonly reason: string;
  public readonly firedPolicies: ReadonlyArray<FiredPolicy>;
  public readonly anchor: AnchorRef | null;
  public readonly scopeRef: string;

  constructor(message: string, init: CBOpenErrorInit = {}) {
    super(message, init);
    this.name = "CBOpenError";
    this.reason = init.reason ?? "";
    this.firedPolicies = init.firedPolicies ?? [];
    this.anchor = init.anchor ?? null;
    this.scopeRef = init.scopeRef ?? "";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
