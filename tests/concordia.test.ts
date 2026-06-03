/**
 * Tests for `@concordex/sdk/concordia` — the MCP 1.0 governance client.
 *
 * Mocks the wire by injecting a `fetch` stub that handles JSON-RPC
 * dispatch in-process. Server-side end-to-end is covered by
 * prothinker-server tests (#212/#213/#217); this file covers the
 * client-side contract.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  ConcordiaClient,
  ConcordiaError,
  ConcordiaProtocolError,
  ConcordiaAuthError,
  ConcordiaQuotaExceededError,
  ConcordiaCanonNotInstalledError,
  ConcordiaSubjectNotFoundError,
  ConcordiaPermissionDeniedError,
} from "../src/concordia.js";

// ---------------------------------------------------------------------------
// Fake server — minimal JSON-RPC dispatch that mirrors prothinker-server.
// Each test installs handlers for the methods/tools it cares about.
// ---------------------------------------------------------------------------

interface JrpcReq {
  jsonrpc: string;
  id: number;
  method: string;
  params: Record<string, unknown>;
}

interface AppError {
  code: number;
  errorId: string;
  message?: string;
}

class FakeServer {
  calls: JrpcReq[] = [];
  failWith: AppError | null = null;
  methodHandlers: Record<string, (params: Record<string, unknown>) => unknown> = {};

  handle(method: string, fn: (params: Record<string, unknown>) => unknown): void {
    this.methodHandlers[method] = fn;
  }

  fail(err: AppError): void {
    this.failWith = err;
  }

  toFetch(): (url: unknown, init?: unknown) => Promise<Response> {
    return async (url: unknown, init?: unknown) => {
      const u = String(url);
      if (!u.endsWith("/mcp/v1")) {
        return new Response("not found", { status: 404 });
      }
      const opts = (init ?? {}) as { body?: string; headers?: Record<string, string> };
      const auth = opts.headers?.["Authorization"] ?? opts.headers?.["authorization"] ?? "";
      if (!auth.startsWith("Bearer ck_")) {
        return new Response(JSON.stringify({
          jsonrpc: "2.0", id: null,
          error: { code: -32001, message: "auth_expired", data: { error_id: "auth_expired" } },
        }), { status: 200 });
      }
      const body = JSON.parse(opts.body ?? "{}") as JrpcReq;
      this.calls.push(body);
      if (this.failWith) {
        return new Response(JSON.stringify({
          jsonrpc: "2.0", id: body.id,
          error: {
            code: this.failWith.code,
            message: this.failWith.message ?? this.failWith.errorId,
            data: { error_id: this.failWith.errorId },
          },
        }), { status: 200 });
      }
      const handler = this.methodHandlers[body.method];
      if (!handler) {
        return new Response(JSON.stringify({
          jsonrpc: "2.0", id: body.id,
          error: { code: -32601, message: `unknown method: ${body.method}` },
        }), { status: 200 });
      }
      try {
        const result = handler(body.params);
        return new Response(JSON.stringify({
          jsonrpc: "2.0", id: body.id, result,
        }), { status: 200 });
      } catch (e) {
        const ae = e as AppError;
        return new Response(JSON.stringify({
          jsonrpc: "2.0", id: body.id,
          error: { code: ae.code, message: ae.message ?? ae.errorId, data: { error_id: ae.errorId } },
        }), { status: 200 });
      }
    };
  }
}

function wrapToolResult(d: Record<string, unknown>): Record<string, unknown> {
  return {
    content:  [{ type: "text", text: JSON.stringify(d) }],
    _data:    d,
    isError:  false,
  };
}

function wrapResourceRead(payload: Record<string, unknown>, uri: string): Record<string, unknown> {
  return {
    contents: [
      { uri, mimeType: "application/json", text: JSON.stringify(payload) },
    ],
  };
}

let fake: FakeServer;
let client: ConcordiaClient;

beforeEach(() => {
  fake = new FakeServer();
  client = new ConcordiaClient({
    apiKey: "ck_test_xyz",
    fetch:  fake.toFetch(),
  });
});

// ---------------------------------------------------------------------------
// Construction / auth
// ---------------------------------------------------------------------------

describe("ConcordiaClient construction", () => {
  it("requires an api key", () => {
    delete process.env["CONCORDEX_API_KEY"];
    expect(() => new ConcordiaClient({ fetch: fake.toFetch() }))
      .toThrowError(/apiKey required/);
  });

  it("rejects keys without ck_ prefix", () => {
    expect(() => new ConcordiaClient({
      apiKey: "sk_oops_wrong",
      fetch:  fake.toFetch(),
    })).toThrowError(/must start with 'ck_'/);
  });

  it("reads CONCORDEX_API_KEY from env", () => {
    process.env["CONCORDEX_API_KEY"] = "ck_from_env";
    const c = new ConcordiaClient({ fetch: fake.toFetch() });
    expect(c).toBeInstanceOf(ConcordiaClient);
    delete process.env["CONCORDEX_API_KEY"];
  });

  it("sends bearer auth on every request", async () => {
    fake.handle("ping", () => ({ ok: true }));
    expect(await client.ping()).toBe(true);
    // If auth header were missing, FakeServer would return -32001
    // and ping() would throw.
  });

  it("raises ConcordiaAuthError on -32001 envelope", async () => {
    const badClient = new ConcordiaClient({
      apiKey: "ck_evil",
      fetch:  async () => new Response(JSON.stringify({
        jsonrpc: "2.0", id: 1,
        error: { code: -32001, message: "expired", data: { error_id: "auth_expired" } },
      }), { status: 200 }),
    });
    await expect(badClient.ping()).rejects.toBeInstanceOf(ConcordiaAuthError);
  });
});

// ---------------------------------------------------------------------------
// Tool: enforce_covenant
// ---------------------------------------------------------------------------

describe("enforceCovenant", () => {
  it("returns a typed result on happy path", async () => {
    const captured: Record<string, unknown> = {};
    fake.handle("tools/call", (params) => {
      Object.assign(captured, params);
      return wrapToolResult({
        verdict:          "review",
        policy_ids:       ["pol_a", "pol_b"],
        rationale:        "policies refund-cap + churn-risk fired",
        cb_state_change:  { state: "half_open", warning: true, soul_version: 42 },
        ledger_entry_id:  "lid_abc",
      });
    });

    const r = await client.enforceCovenant({
      subjectId:     "user:alice",
      actionKind:    "refund.issue",
      actionPayload: { amount: 9900 },
      context:       { sessionId: "s_42" },
    });

    expect(r.verdict).toBe("review");
    expect(r.policyIds).toEqual(["pol_a", "pol_b"]);
    expect(r.rationale).toMatch(/refund-cap/);
    expect(r.cbStateChange.state).toBe("half_open");
    expect(r.cbStateChange.warning).toBe(true);
    expect(r.cbStateChange.soulVersion).toBe(42);
    expect(r.ledgerEntryId).toBe("lid_abc");
    expect(r.allow).toBe(false);
    expect(r.blocked).toBe(false);

    // Wire shape: snake_case fields are constructed correctly
    expect(captured["name"]).toBe("enforce_covenant");
    const args = captured["arguments"] as Record<string, unknown>;
    expect(args["subject_id"]).toBe("user:alice");
    expect(args["action_kind"]).toBe("refund.issue");
    expect(args["action_payload"]).toEqual({ amount: 9900 });
  });

  it("translates allow + block via convenience flags", async () => {
    fake.handle("tools/call", () => wrapToolResult({
      verdict: "block",
      policy_ids: ["pol_x"],
      rationale: "blocked",
      cb_state_change: { state: "open", warning: false },
      ledger_entry_id: "lid_2",
    }));
    const r = await client.enforceCovenant({ subjectId: "user:b", actionKind: "x" });
    expect(r.blocked).toBe(true);
    expect(r.allow).toBe(false);
  });

  it("maps -32002 to ConcordiaQuotaExceededError", async () => {
    fake.handle("tools/call", () => {
      throw { code: -32002, errorId: "tenant_quota_exceeded", message: "cap hit" };
    });
    await expect(
      client.enforceCovenant({ subjectId: "u", actionKind: "k" })
    ).rejects.toBeInstanceOf(ConcordiaQuotaExceededError);
  });
});

// ---------------------------------------------------------------------------
// Tool: record_decision
// ---------------------------------------------------------------------------

describe("recordDecision", () => {
  it("returns ledger entry id + chain head hash", async () => {
    const captured: Record<string, unknown> = {};
    fake.handle("tools/call", (params) => {
      Object.assign(captured, params);
      return wrapToolResult({
        ledger_entry_id: "lid_001",
        chain_head_hash: "0xdeadbeef",
        index: 1234,
      });
    });
    const r = await client.recordDecision({
      subjectId: "user:alice",
      decisionKind: "content_generated",
      payload: { text: "ok" },
      outcome: "completed",
    });
    expect(r.ledgerEntryId).toBe("lid_001");
    expect(r.chainHeadHash).toBe("0xdeadbeef");
    expect(r.index).toBe(1234);
    const args = captured["arguments"] as Record<string, unknown>;
    expect(args["actor"]).toBe("agent");  // default
    expect(args["outcome"]).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// Tool: query_corpus
// ---------------------------------------------------------------------------

describe("queryCorpus", () => {
  it("returns matches with camelCase fields", async () => {
    fake.handle("tools/call", () => wrapToolResult({
      matches: [
        { canon_id: "cn_a", canon_version: "1.0.0",
          section: "policies/refund-cap", excerpt: "Block refunds over $500.",
          relevance: 1.15 },
        { canon_id: "cn_b", canon_version: "2.0.0",
          section: "vocabulary/risk:churn", excerpt: "Customer churn signals.",
          relevance: 0.8 },
      ],
      scope: "installed",
      canon_count: 2,
    }));
    const r = await client.queryCorpus({ query: "refund", canonFilter: ["cn_a", "cn_b"] });
    expect(r.canonCount).toBe(2);
    expect(r.matches.length).toBe(2);
    expect(r.matches[0]?.canonId).toBe("cn_a");
    expect(r.matches[0]?.relevance).toBeCloseTo(1.15);
  });

  it("maps -32004 to ConcordiaCanonNotInstalledError", async () => {
    fake.handle("tools/call", () => {
      throw { code: -32004, errorId: "canon_not_installed", message: "missing cn_bogus" };
    });
    await expect(
      client.queryCorpus({ query: "x", canonFilter: ["cn_bogus"] })
    ).rejects.toBeInstanceOf(ConcordiaCanonNotInstalledError);
  });
});

// ---------------------------------------------------------------------------
// Tool: get_subject_soul
// ---------------------------------------------------------------------------

describe("getSubjectSoul", () => {
  it("returns soul with tags + traces", async () => {
    fake.handle("tools/call", () => wrapToolResult({
      subject_id: "user:alice",
      snapshot_at: "2026-05-30T00:00:00Z",
      soul_version: 42,
      tags: [{
        tag_id: "risk:moderate", score: 0.6, raw_strength: 0.55,
        evidence_count: 12,
        first_observed_at: "2026-01-01T00:00:00Z",
        last_reinforced_at: "2026-05-30T00:00:00Z",
      }],
      retired_count: 3,
      recent_traces: [{
        trace_id: "tr_1", frame_id: "fr_1", verdict: "review",
        outcome: "applied", started_at: "2026-05-30T00:00:00Z",
        finished_at: "2026-05-30T00:00:01Z",
      }],
    }));
    const s = await client.getSubjectSoul({ subjectId: "user:alice" });
    expect(s.soulVersion).toBe(42);
    expect(s.retiredCount).toBe(3);
    expect(s.tags.length).toBe(1);
    expect(s.tags[0]?.tagId).toBe("risk:moderate");
    expect(s.tags[0]?.score).toBeCloseTo(0.6);
    expect(s.recentTraces[0]?.verdict).toBe("review");
  });

  it("maps -32005 to ConcordiaSubjectNotFoundError", async () => {
    fake.handle("tools/call", () => {
      throw { code: -32005, errorId: "subject_not_found", message: "no such subject" };
    });
    await expect(
      client.getSubjectSoul({ subjectId: "user:ghost" })
    ).rejects.toBeInstanceOf(ConcordiaSubjectNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

describe("workspace resources", () => {
  it("workspacePolicies decodes JSON content block", async () => {
    fake.handle("resources/read", (params) => wrapResourceRead({
      workspace_id: "ws_test",
      count: 2,
      policies: [
        { cb_policy_id: "pol_a", name: "refund-cap", description: "x",
          scope: "subject", action: "block", enabled: true,
          rules: [], updated_at: "2026-05-01T00:00:00Z" },
        { cb_policy_id: "pol_b", name: "pii-leak", description: "y",
          scope: "interaction", action: "review", enabled: false,
          rules: [], updated_at: "2026-05-02T00:00:00Z" },
      ],
    }, params["uri"] as string));
    const pols = await client.workspacePolicies();
    expect(pols.length).toBe(2);
    expect(pols[0]?.name).toBe("refund-cap");
    expect(pols[0]?.enabled).toBe(true);
    expect(pols[1]?.enabled).toBe(false);
  });

  it("workspaceCanons decodes JSON content block", async () => {
    fake.handle("resources/read", (params) => wrapResourceRead({
      workspace_id: "ws_test", count: 1,
      canons: [{
        canon_id: "cn_compliance", name: "Compliance Canon",
        category: "compliance", author_name: "Concordex",
        latest_version: "1.2.0", short_description: "SOC 2 + EU AI Act",
        icon_url: null, enabled: true, installed_at: "2026-04-01T00:00:00Z",
      }],
    }, params["uri"] as string));
    const cs = await client.workspaceCanons();
    expect(cs.length).toBe(1);
    expect(cs[0]?.canonId).toBe("cn_compliance");
    expect(cs[0]?.latestVersion).toBe("1.2.0");
  });

  it("recentLedger paginates and returns nextSince", async () => {
    fake.handle("resources/read", (params) => {
      const uri = params["uri"] as string;
      const m = /since=(\d+)/.exec(uri);
      const since = Number(m?.[1] ?? 0);
      return wrapResourceRead({
        workspace_id: "ws", since, limit: 3, count: 3,
        next_since: since === 0 ? 3 : null,
        entries: Array.from({ length: 3 }, (_, i) => {
          const idx = since + i;
          return {
            event_id: `e${idx}`, index: idx,
            prev_hash: `h${idx - 1}`, payload_hash: "p",
            hash: `h${idx}`, payload: { i: idx }, recorded_at: "t",
          };
        }),
      }, uri);
    });

    const page1 = await client.recentLedger({ since: 0, limit: 3 });
    expect(page1.count).toBe(3);
    expect(page1.nextSince).toBe(3);
    expect(page1.entries[0]?.index).toBe(0);
  });

  it("iterLedger walks until nextSince is null", async () => {
    const pages: Record<number, { next: number | null }> = {
      0: { next: 3 },
      3: { next: null },
    };
    fake.handle("resources/read", (params) => {
      const uri = params["uri"] as string;
      const m = /since=(\d+)/.exec(uri);
      const since = Number(m?.[1] ?? 0);
      const meta = pages[since];
      if (!meta) throw new Error(`unexpected since=${since}`);
      return wrapResourceRead({
        workspace_id: "ws", since, limit: 3, count: 3,
        next_since: meta.next,
        entries: Array.from({ length: 3 }, (_, i) => ({
          event_id: `e${since + i}`, index: since + i,
          prev_hash: "p", payload_hash: "p",
          hash: `h${since + i}`, payload: {}, recorded_at: "t",
        })),
      }, uri);
    });
    const out: number[] = [];
    for await (const entry of client.iterLedger({ since: 0, limit: 3 })) {
      out.push(entry.index);
    }
    expect(out).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

// ---------------------------------------------------------------------------
// Error mapping + transport
// ---------------------------------------------------------------------------

describe("error mapping and transport", () => {
  it("permission_denied maps to ConcordiaPermissionDeniedError", async () => {
    fake.handle("tools/call", () => {
      throw { code: -32007, errorId: "permission_denied", message: "viewer cannot write" };
    });
    await expect(
      client.enforceCovenant({ subjectId: "x", actionKind: "y" })
    ).rejects.toBeInstanceOf(ConcordiaPermissionDeniedError);
  });

  it("unknown app code falls back to base ConcordiaError", async () => {
    fake.handle("tools/call", () => {
      throw { code: -32099, errorId: "unknown_xyz", message: "weird" };
    });
    try {
      await client.enforceCovenant({ subjectId: "x", actionKind: "y" });
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ConcordiaError);
      // Not one of the seven typed subclasses
      expect(e).not.toBeInstanceOf(ConcordiaAuthError);
      expect((e as ConcordiaError).code).toBe(-32099);
    }
  });

  it("transport errors wrap as ConcordiaProtocolError", async () => {
    const bad = new ConcordiaClient({
      apiKey: "ck_t",
      fetch:  async () => { throw new TypeError("network down"); },
    });
    await expect(bad.ping()).rejects.toBeInstanceOf(ConcordiaProtocolError);
  });

  it("non-200 HTTP wraps as ConcordiaProtocolError", async () => {
    const bad = new ConcordiaClient({
      apiKey: "ck_t",
      fetch:  async () => new Response("nope", { status: 502 }),
    });
    await expect(bad.ping()).rejects.toThrowError(/HTTP 502/);
  });

  it("initialize returns server metadata", async () => {
    fake.handle("initialize", () => ({
      protocolVersion: "1.0",
      serverInfo: { name: "concordia", version: "1.0.0" },
      capabilities: { tools: { listChanged: false } },
      principalHint: { workspace_id: "ws_t", role: "analyst" },
    }));
    const r = await client.initialize();
    expect(r["protocolVersion"]).toBe("1.0");
    const hint = r["principalHint"] as Record<string, unknown>;
    expect(hint["workspace_id"]).toBe("ws_t");
  });
});
