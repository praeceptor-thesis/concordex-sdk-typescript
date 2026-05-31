/**
 * Webhook signature verification.
 *
 * Concordex outbound webhooks are signed with HMAC-SHA256 using the
 * subscription's secret. The signature is carried in a header of the
 * form:
 *
 *   t=<unix_seconds>,v1=<hex(hmac_sha256(secret, f"{t}.{payload}"))>
 *
 * The verifier MUST:
 *   1. Parse `t` and `v1` from the header. Reject when either is missing.
 *   2. Reject if `t` is non-numeric or older than `toleranceSeconds`.
 *   3. Compute the expected HMAC and compare with `timingSafeEqual`.
 *   4. Return `true` only on a clean match.
 *
 * This module returns `false` (never throws) for malformed or expired
 * signatures — that's the contract the TypeScript SDK picks among the
 * two permitted by spec §10. Document in the README so consumers don't
 * wrap calls in a try/catch they don't need.
 *
 * The optional `now` parameter exists for tests and clock-injection;
 * production callers should omit it.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_SECONDS = 300;

export function verifyWebhookSignature(
  payload: string | Uint8Array,
  signatureHeader: string,
  secret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
  now?: number,
): boolean {
  if (
    typeof signatureHeader !== "string" ||
    signatureHeader.length === 0 ||
    typeof secret !== "string" ||
    secret.length === 0
  ) {
    return false;
  }

  // Parse `key=value` pairs separated by commas. Tolerate whitespace.
  const parts = signatureHeader.split(",").map((p) => p.trim());
  let t: string | null = null;
  let v1: string | null = null;
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") t = value;
    else if (key === "v1") v1 = value;
  }

  if (t === null || v1 === null) return false;

  // `t` must be an integer-shaped unix timestamp.
  const tNum = Number(t);
  if (!Number.isFinite(tNum) || !/^-?\d+$/.test(t)) return false;

  const nowSec = now ?? Math.floor(Date.now() / 1000);
  const age = nowSec - tNum;
  if (age > toleranceSeconds || age < -toleranceSeconds) return false;

  // Compute expected HMAC over `<t>.<payload>`. Payload may be empty.
  const payloadBytes =
    typeof payload === "string"
      ? Buffer.from(payload, "utf8")
      : Buffer.from(payload);

  const hmac = createHmac("sha256", secret);
  hmac.update(`${t}.`);
  hmac.update(payloadBytes);
  const expectedHex = hmac.digest("hex");

  // Length differences would make timingSafeEqual throw — bail first.
  if (v1.length !== expectedHex.length) return false;

  try {
    return timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expectedHex, "hex"));
  } catch {
    return false;
  }
}
