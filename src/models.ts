/**
 * Wire-shaped result types returned by the SDK's public methods.
 *
 * All fields are `readonly` — result objects are immutable. The full
 * server JSON is always retained on `.raw` for forward-compat (any
 * field the spec adds in a PATCH/MINOR bump is available there before
 * we surface it as a typed property).
 *
 * Naming follows spec §8.4: camelCase TypeScript fields back the
 * canonical snake_case wire keys.
 */

// ---------- shared shapes ----------

export type Outcome =
  | "scored"
  | "tagged"
  | "no_tags_fired"
  | "rejected"
  | "error";

export type CBState = "closed" | "half_open" | "hold" | "open";

export type TriageDecision = "deep" | "shallow";

export interface FiredPolicy {
  readonly cb_policy_id: string;
  readonly name: string;
  readonly action: string;
}

export interface AnchorRef {
  readonly ledger_index: number;
  readonly hash: string;
}

/**
 * Subject / participant shape — same on the wire as on the SDK surface.
 *
 * `role` is free-form (`agent`, `customer`, `observer`, …).
 * `kind` describes the substrate (`agent`, `human`, `sensor`, …).
 * Both default to `"other"` when the SDK normalizes them.
 */
export interface Subject {
  readonly subject_id: string;
  readonly role?: string;
  readonly kind?: string;
  readonly metadata?: Record<string, unknown>;
}

// ---------- EmitResult ----------

/**
 * Returned by every event-emit method (`subjectSays`, `toolCall`, …).
 *
 * In accepted-only mode the server returns `interactionId`, `subjects`,
 * `frameId`, `accepted`, `nWorkspaces`, and `followMyData`; consumers
 * fetch per-workspace reasoning outcomes out-of-band. Older sync
 * envelopes can still populate the rich fields below. Consumers MUST
 * treat `undefined` as "unknown", not as "empty".
 */
export interface EmitResult {
  readonly interactionId: string;
  readonly subjects: ReadonlyArray<string>;
  readonly queued: boolean;
  readonly accepted?: boolean;
  readonly nWorkspaces?: number;

  // Accepted-only and sync envelopes.
  readonly frameId?: string;
  readonly subjectId?: string;
  readonly outcome?: Outcome | string; // tolerate unknown enum values
  readonly triageDecision?: TriageDecision | string;
  readonly tagsFired?: ReadonlyArray<string>;
  readonly scoredByCanons?: ReadonlyArray<string>;
  readonly soulVersion?: number;
  readonly ledgerIndex?: number;
  readonly followMyData?: string | null;
  readonly error?: unknown;

  /** Full server JSON response (verbatim). */
  readonly raw: Readonly<Record<string, unknown>>;
}

export function emitResultFromResponse(
  data: Record<string, unknown>,
): EmitResult {
  const interactionId =
    typeof data["interaction_id"] === "string"
      ? (data["interaction_id"] as string)
      : "";
  const subjectsField = data["subjects"];
  const subjects: ReadonlyArray<string> = Array.isArray(subjectsField)
    ? (subjectsField.filter((s) => typeof s === "string") as string[])
    : [];
  const accepted =
    typeof data["accepted"] === "boolean" ? (data["accepted"] as boolean) : undefined;
  // Default queued=true matches the Python SDK's behavior when the
  // server omits the field. Accepted-only responses omit `queued`, so
  // use `accepted` when present to avoid treating rejected ingest as
  // successfully queued.
  const queued =
    typeof data["queued"] === "boolean" ? (data["queued"] as boolean) : accepted ?? true;

  const result: EmitResult = {
    interactionId,
    subjects,
    queued,
    ...(typeof accepted === "boolean" ? { accepted } : {}),
    ...(typeof data["n_workspaces"] === "number"
      ? { nWorkspaces: data["n_workspaces"] as number }
      : {}),
    ...(typeof data["frame_id"] === "string"
      ? { frameId: data["frame_id"] as string }
      : {}),
    ...(typeof data["subject_id"] === "string"
      ? { subjectId: data["subject_id"] as string }
      : {}),
    ...(typeof data["outcome"] === "string"
      ? { outcome: data["outcome"] as string }
      : {}),
    ...(typeof data["triage_decision"] === "string"
      ? { triageDecision: data["triage_decision"] as string }
      : {}),
    ...(Array.isArray(data["tags_fired"])
      ? {
          tagsFired: (data["tags_fired"] as unknown[]).filter(
            (t) => typeof t === "string",
          ) as string[],
        }
      : {}),
    ...(Array.isArray(data["scored_by_canons"])
      ? {
          scoredByCanons: (data["scored_by_canons"] as unknown[]).filter(
            (c) => typeof c === "string",
          ) as string[],
        }
      : {}),
    ...(typeof data["soul_version"] === "number"
      ? { soulVersion: data["soul_version"] as number }
      : {}),
    ...(typeof data["ledger_index"] === "number"
      ? { ledgerIndex: data["ledger_index"] as number }
      : {}),
    ...(
      typeof data["follow_my_data"] === "string" || data["follow_my_data"] === null
        ? { followMyData: data["follow_my_data"] as string | null }
        : {}
    ),
    ...(data["error"] !== undefined
      ? { error: data["error"] }
      : {}),
    raw: Object.freeze({ ...data }),
  };
  return Object.freeze(result);
}

// ---------- CheckResult ----------

/**
 * Returned by `Concordex.check()`.
 *
 * `allow` is the binary the caller normally branches on. `warning` is
 * set when state is `half_open` — the breaker is in review mode but
 * not yet blocking.
 */
export interface CheckResult {
  readonly state: CBState | string; // tolerate unknown enum values
  readonly allow: boolean;
  readonly warning: boolean;
  readonly reason: string;
  readonly firedPolicies: ReadonlyArray<FiredPolicy>;
  readonly anchor: AnchorRef | null;
  readonly checkedAt: string;
  readonly latencyMs: number;
  readonly routeLatencyMs: number;
  /** Full server JSON response (verbatim). */
  readonly raw: Readonly<Record<string, unknown>>;
}

export function checkResultFromResponse(
  data: Record<string, unknown>,
): CheckResult {
  const firedRaw = data["fired_policies"];
  const firedPolicies: ReadonlyArray<FiredPolicy> = Array.isArray(firedRaw)
    ? (firedRaw as Record<string, unknown>[])
        .filter(
          (p) =>
            p != null &&
            typeof p === "object" &&
            typeof p["cb_policy_id"] === "string" &&
            typeof p["name"] === "string" &&
            typeof p["action"] === "string",
        )
        .map((p) =>
          Object.freeze({
            cb_policy_id: p["cb_policy_id"] as string,
            name: p["name"] as string,
            action: p["action"] as string,
          }),
        )
    : [];

  let anchor: AnchorRef | null = null;
  const anchorRaw = data["anchor"];
  if (
    anchorRaw &&
    typeof anchorRaw === "object" &&
    typeof (anchorRaw as Record<string, unknown>)["ledger_index"] === "number" &&
    typeof (anchorRaw as Record<string, unknown>)["hash"] === "string"
  ) {
    const a = anchorRaw as Record<string, unknown>;
    anchor = Object.freeze({
      ledger_index: a["ledger_index"] as number,
      hash: a["hash"] as string,
    });
  }

  const state = typeof data["state"] === "string" ? (data["state"] as string) : "closed";
  // Default-allow when the server omits `allow`; mirrors the Python SDK.
  const allow = typeof data["allow"] === "boolean" ? (data["allow"] as boolean) : true;
  const warning =
    typeof data["warning"] === "boolean" ? (data["warning"] as boolean) : false;

  const result: CheckResult = {
    state,
    allow,
    warning,
    reason: typeof data["reason"] === "string" ? (data["reason"] as string) : "",
    firedPolicies,
    anchor,
    checkedAt:
      typeof data["checked_at"] === "string" ? (data["checked_at"] as string) : "",
    latencyMs:
      typeof data["latency_ms"] === "number" ? (data["latency_ms"] as number) : 0,
    routeLatencyMs:
      typeof data["route_latency_ms"] === "number"
        ? (data["route_latency_ms"] as number)
        : 0,
    raw: Object.freeze({ ...data }),
  };
  return Object.freeze(result);
}
