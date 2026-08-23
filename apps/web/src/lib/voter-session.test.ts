import { describe, expect, it } from "vitest";
import {
  claimIdempotency,
  getOrCreateDeviceId,
  getStoredProof,
  removeProof,
  storeProof
} from "./voter-session";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
}

describe("voter browser state", () => {
  it("keeps valid proofs, removes expired proofs, and clears consumed proofs", () => {
    const storage = memoryStorage();
    storeProof(storage, "campaign-1", {
      proof: "proof-value",
      expiresAt: "2030-01-01T00:00:00.000Z"
    });

    expect(getStoredProof(storage, "campaign-1", Date.parse("2029-01-01T00:00:00.000Z"))).toEqual({
      proof: "proof-value",
      expiresAt: "2030-01-01T00:00:00.000Z"
    });
    expect(getStoredProof(storage, "campaign-1", Date.parse("2031-01-01T00:00:00.000Z"))).toBeNull();

    storeProof(storage, "campaign-1", {
      proof: "new-proof",
      expiresAt: "2032-01-01T00:00:00.000Z"
    });
    removeProof(storage, "campaign-1");
    expect(getStoredProof(storage, "campaign-1")).toBeNull();
  });

  it("reuses device and idempotency identifiers only for the same logical request", () => {
    const storage = memoryStorage();
    expect(getOrCreateDeviceId(storage, () => "device-1")).toBe("web_device-1");
    expect(getOrCreateDeviceId(storage, () => "device-2")).toBe("web_device-1");

    const first = claimIdempotency(null, "choice-a", () => "request-1");
    const retry = claimIdempotency(first, "choice-a", () => "request-2");
    const changed = claimIdempotency(retry, "choice-b", () => "request-3");

    expect(retry).toBe(first);
    expect(changed).toEqual({ fingerprint: "choice-b", key: "request-3" });
  });
});
