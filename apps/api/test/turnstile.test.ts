import { describe, expect, it, vi } from "vitest";
import { CloudflareTurnstileVerifier } from "../src/services/turnstile.js";

const config = {
  secretKey: "safe-test-secret",
  expectedHostname: "vote.example.test",
  expectedAction: "vote-submit",
  timeoutMs: 1000
};

describe("CloudflareTurnstileVerifier", () => {
  it("posts Siteverify data and accepts the expected hostname and action", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            success: true,
            hostname: "vote.example.test",
            action: "vote-submit",
            "error-codes": []
          }),
          { status: 200 }
        )
    );
    const verifier = new CloudflareTurnstileVerifier(config, fetchMock as typeof fetch);

    const result = await verifier.verify({
      token: "turnstile-token",
      remoteIp: "203.0.113.20",
      idempotencyKey: "00000000-0000-4000-8000-000000000001"
    });

    expect(result).toEqual({
      success: true,
      hostname: "vote.example.test",
      action: "vote-submit"
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      secret: "safe-test-secret",
      response: "turnstile-token",
      remoteip: "203.0.113.20",
      idempotency_key: "00000000-0000-4000-8000-000000000001"
    });
  });

  it("rejects failed challenges and expected-field mismatches", async () => {
    const failedVerifier = new CloudflareTurnstileVerifier(
      config,
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: false,
            "error-codes": ["timeout-or-duplicate"]
          }),
          { status: 200 }
        )
      ) as typeof fetch
    );
    await expect(
      failedVerifier.verify({
        token: "spent-token",
        idempotencyKey: "00000000-0000-4000-8000-000000000002"
      })
    ).resolves.toEqual({
      success: false,
      kind: "invalid",
      errorCodes: ["timeout-or-duplicate"]
    });

    const mismatchedVerifier = new CloudflareTurnstileVerifier(
      config,
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: true,
            hostname: "attacker.example.test",
            action: "vote-submit"
          }),
          { status: 200 }
        )
      ) as typeof fetch
    );
    await expect(
      mismatchedVerifier.verify({
        token: "valid-elsewhere",
        idempotencyKey: "00000000-0000-4000-8000-000000000003"
      })
    ).resolves.toEqual({
      success: false,
      kind: "invalid",
      errorCodes: ["hostname-mismatch"]
    });
  });

  it("fails closed as unavailable for provider and response errors", async () => {
    const httpErrorVerifier = new CloudflareTurnstileVerifier(
      config,
      vi.fn(async () => new Response("unavailable", { status: 503 })) as typeof fetch
    );
    await expect(
      httpErrorVerifier.verify({
        token: "token",
        idempotencyKey: "00000000-0000-4000-8000-000000000004"
      })
    ).resolves.toEqual({
      success: false,
      kind: "unavailable",
      errorCodes: ["siteverify_http_error"]
    });

    const networkErrorVerifier = new CloudflareTurnstileVerifier(
      config,
      vi.fn(async () => {
        throw new Error("network unavailable");
      }) as typeof fetch
    );
    await expect(
      networkErrorVerifier.verify({
        token: "token",
        idempotencyKey: "00000000-0000-4000-8000-000000000005"
      })
    ).resolves.toEqual({
      success: false,
      kind: "unavailable",
      errorCodes: ["siteverify_unavailable"]
    });
  });
});
