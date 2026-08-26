import {
  createHmac,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export type SessionPayload = {
  email: string;
  expiresAt: number;
};

const PASSWORD_HASH_HEX_LENGTH = 128;

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function verifyCredentialHash({
  email,
  password,
  expectedEmail,
  storedPasswordHash,
}: {
  email: string;
  password: string;
  expectedEmail: string;
  storedPasswordHash: string;
}): boolean {
  const [salt, expectedHashHex] = storedPasswordHash.split(":");

  if (
    !salt
    || !expectedHashHex
    || !new RegExp(`^[a-f0-9]{${PASSWORD_HASH_HEX_LENGTH}}$`, "i").test(
      expectedHashHex,
    )
  ) {
    throw new Error("DASHBOARD_PASSWORD_HASH is not configured correctly");
  }

  const expectedHash = Buffer.from(expectedHashHex, "hex");
  const actualHash = scryptSync(password, salt, expectedHash.length);

  return (
    normalizeEmail(email) === normalizeEmail(expectedEmail)
    && timingSafeEqual(expectedHash, actualHash)
  );
}

export function createSessionToken({
  email,
  secret,
  durationSeconds,
  nowSeconds = Math.floor(Date.now() / 1000),
}: {
  email: string;
  secret: string;
  durationSeconds: number;
  nowSeconds?: number;
}): string {
  const payload: SessionPayload = {
    email: normalizeEmail(email),
    expiresAt: nowSeconds + durationSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${encoded}.${sign(encoded, secret)}`;
}

export function parseSessionToken({
  token,
  secret,
  expectedEmail,
  nowSeconds = Math.floor(Date.now() / 1000),
}: {
  token: string;
  secret: string;
  expectedEmail: string;
  nowSeconds?: number;
}): SessionPayload | null {
  const tokenParts = token.split(".");

  if (tokenParts.length !== 2) {
    return null;
  }

  const [encoded, signature] = tokenParts;

  if (!encoded || !signature) {
    return null;
  }

  const expectedSignature = Buffer.from(sign(encoded, secret));
  const actualSignature = Buffer.from(signature);

  if (
    expectedSignature.length !== actualSignature.length
    || !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;

    if (
      typeof payload.email !== "string"
      || typeof payload.expiresAt !== "number"
      || payload.expiresAt <= nowSeconds
      || normalizeEmail(payload.email) !== normalizeEmail(expectedEmail)
    ) {
      return null;
    }

    return payload as SessionPayload;
  } catch {
    return null;
  }
}
