/**
 * Shared helpers for the contract-test runner.
 *
 * - Resolves the spec corpus path (env override + sibling-repo default).
 * - Provides a stubbed fetch transport for envelope-capture and
 *   error-mapping tests.
 * - JSON normalization that mirrors the spec's "sort keys, no
 *   whitespace, no trailing newline" rule.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export function specPath(): string {
  const override = process.env["DMZAGENT_SPEC_PATH"];
  if (override) return resolve(override);
  // tests/ is one level below the SDK repo root; the spec sits as a
  // sibling repo by default.
  return resolve(HERE, "..", "..", "dmzagent-sdk-spec");
}

export function loadFixture<T = unknown>(relative: string): T {
  const path = resolve(specPath(), relative);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/**
 * Sort keys at every level. Arrays preserve order; objects rebuild with
 * sorted keys. Used by the body-roundtrip assertions.
 */
export function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = normalizeJson(obj[key]);
    }
    return out;
  }
  return value;
}

export function normalizedJsonString(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

// ---------- stub transport ----------

export interface CapturedRequest {
  method: string;
  url: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface StubResponseConfig {
  status: number;
  body: unknown; // object → JSON; string → text
  headers?: Record<string, string>;
}

export interface StubTransport {
  fetch: (input: unknown, init?: unknown) => Promise<Response>;
  captured: CapturedRequest[];
  setResponse(config: StubResponseConfig): void;
}

export function makeStubTransport(initial?: StubResponseConfig): StubTransport {
  let response: StubResponseConfig =
    initial ?? { status: 200, body: {}, headers: {} };
  const captured: CapturedRequest[] = [];

  const stub: StubTransport = {
    captured,
    setResponse(config) {
      response = config;
    },
    fetch: async (input: unknown, init: unknown): Promise<Response> => {
      const url = typeof input === "string" ? input : String(input);
      const initObj = (init ?? {}) as {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      };
      const u = new URL(url);
      const parsedBody =
        typeof initObj.body === "string" && initObj.body.length > 0
          ? safeParse(initObj.body)
          : null;
      captured.push({
        method: (initObj.method ?? "GET").toUpperCase(),
        url,
        path: u.pathname,
        headers: { ...(initObj.headers ?? {}) },
        body: parsedBody,
      });

      const bodyOut =
        typeof response.body === "string"
          ? response.body
          : JSON.stringify(response.body ?? {});

      // Minimal Response-like impl. We rely only on .status and .text().
      const fake = {
        status: response.status,
        statusText: "",
        ok: response.status >= 200 && response.status < 300,
        headers: new Headers(response.headers ?? {}),
        text: async () => bodyOut,
      } as unknown as Response;
      return fake;
    },
  };
  return stub;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
