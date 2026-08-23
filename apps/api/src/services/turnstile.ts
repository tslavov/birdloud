import { z } from "zod";
import { env } from "../config/env.js";

const siteverifyResponseSchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
  "error-codes": z.array(z.string()).optional()
});

export type TurnstileVerificationInput = {
  token: string;
  remoteIp?: string | undefined;
  idempotencyKey: string;
};

export type TurnstileVerificationResult =
  | {
      success: true;
      hostname: string | undefined;
      action: string | undefined;
    }
  | {
      success: false;
      kind: "invalid" | "unavailable";
      errorCodes: string[];
    };

export type TurnstileVerifier = {
  verify(input: TurnstileVerificationInput): Promise<TurnstileVerificationResult>;
};

export type TurnstileVerifierConfig = {
  secretKey: string;
  expectedHostname?: string | undefined;
  expectedAction?: string | undefined;
  timeoutMs: number;
};

export class CloudflareTurnstileVerifier implements TurnstileVerifier {
  constructor(
    private readonly config: TurnstileVerifierConfig,
    private readonly fetchImplementation: typeof fetch = fetch
  ) {}

  async verify(input: TurnstileVerificationInput): Promise<TurnstileVerificationResult> {
    try {
      const response = await this.fetchImplementation(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            secret: this.config.secretKey,
            response: input.token,
            remoteip: input.remoteIp,
            idempotency_key: input.idempotencyKey
          }),
          signal: AbortSignal.timeout(this.config.timeoutMs)
        }
      );

      if (!response.ok) {
        return unavailable("siteverify_http_error");
      }

      const parsed = siteverifyResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        return unavailable("siteverify_invalid_response");
      }

      const errorCodes = parsed.data["error-codes"] ?? [];
      if (!parsed.data.success) {
        return errorCodes.includes("internal-error")
          ? unavailable("internal-error")
          : {
              success: false,
              kind: "invalid",
              errorCodes
            };
      }

      if (
        this.config.expectedHostname &&
        parsed.data.hostname !== this.config.expectedHostname
      ) {
        return {
          success: false,
          kind: "invalid",
          errorCodes: ["hostname-mismatch"]
        };
      }

      if (this.config.expectedAction && parsed.data.action !== this.config.expectedAction) {
        return {
          success: false,
          kind: "invalid",
          errorCodes: ["action-mismatch"]
        };
      }

      return {
        success: true,
        hostname: parsed.data.hostname,
        action: parsed.data.action
      };
    } catch {
      return unavailable("siteverify_unavailable");
    }
  }
}

export function createTurnstileVerifier(): TurnstileVerifier {
  return new CloudflareTurnstileVerifier({
    secretKey: env.TURNSTILE_SECRET_KEY,
    expectedHostname: env.TURNSTILE_EXPECTED_HOSTNAME,
    expectedAction: env.TURNSTILE_EXPECTED_ACTION,
    timeoutMs: env.TURNSTILE_TIMEOUT_MS
  });
}

function unavailable(errorCode: string): TurnstileVerificationResult {
  return {
    success: false,
    kind: "unavailable",
    errorCodes: [errorCode]
  };
}
