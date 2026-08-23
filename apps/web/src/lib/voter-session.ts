export type StoredProof = {
  proof: string;
  expiresAt: string;
};

export type IdempotencyClaim = {
  fingerprint: string;
  key: string;
};

export function getStoredProof(
  storage: Pick<Storage, "getItem" | "removeItem">,
  campaignId: string,
  now = Date.now()
): StoredProof | null {
  try {
    const raw = storage.getItem(proofKey(campaignId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredProof>;
    if (
      typeof value.proof !== "string" ||
      typeof value.expiresAt !== "string" ||
      new Date(value.expiresAt).getTime() <= now
    ) {
      storage.removeItem(proofKey(campaignId));
      return null;
    }
    return { proof: value.proof, expiresAt: value.expiresAt };
  } catch {
    return null;
  }
}

export function storeProof(
  storage: Pick<Storage, "setItem">,
  campaignId: string,
  proof: StoredProof
) {
  storage.setItem(proofKey(campaignId), JSON.stringify(proof));
}

export function removeProof(storage: Pick<Storage, "removeItem">, campaignId: string) {
  storage.removeItem(proofKey(campaignId));
}

export function getOrCreateDeviceId(
  storage: Pick<Storage, "getItem" | "setItem">,
  createUuid: () => string = () => crypto.randomUUID()
): string {
  const key = "birdloud:device-id";
  const existing = storage.getItem(key);
  if (existing) return existing;
  const created = `web_${createUuid()}`;
  storage.setItem(key, created);
  return created;
}

export function claimIdempotency(
  current: IdempotencyClaim | null,
  fingerprint: string,
  createUuid: () => string = () => crypto.randomUUID()
): IdempotencyClaim {
  if (current?.fingerprint === fingerprint) return current;
  return { fingerprint, key: createUuid() };
}

function proofKey(campaignId: string) {
  return `birdloud:voter-proof:${campaignId}`;
}
