import "server-only";

import {
  createHmac,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "ghost_inventory_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12;

type SessionPayload = {
  email: string;
  expiresAt: number;
};

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
function sign(value: string): string {
  return createHmac(
    "sha256",
    requireEnvironmentVariable("DASHBOARD_SESSION_SECRET"),
  )
    .update(value)
    .digest("base64url");
}

function createSessionToken(email: string): string {
  const payload: SessionPayload = {
    email,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${encoded}.${sign(encoded)}`;
}

function parseSessionToken(token: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");

  if (!encoded || !signature) {
    return null;
  }

  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(signature);

  if (
    expected.length !== actual.length
    || !timingSafeEqual(expected, actual)
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
      || payload.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export function verifyDashboardCredentials(
  email: string,
  password: string,
): boolean {
  const expectedEmail = requireEnvironmentVariable(
    "DASHBOARD_OWNER_EMAIL",
  ).toLowerCase();
  const [salt, expectedHashHex] = requireEnvironmentVariable(
    "DASHBOARD_PASSWORD_HASH",
  ).split(":");

  if (!salt || !expectedHashHex || !/^[a-f0-9]+$/i.test(expectedHashHex)) {
    throw new Error("DASHBOARD_PASSWORD_HASH is not configured correctly");
  }

  const expectedHash = Buffer.from(expectedHashHex, "hex");
  const actualHash = scryptSync(password, salt, expectedHash.length);

  return (
    email.trim().toLowerCase() === expectedEmail
    && expectedHash.length === actualHash.length
    && timingSafeEqual(expectedHash, actualHash)
  );
}

export async function createDashboardSession(email: string): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, createSessionToken(email), {
    httpOnly: true,
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
    sameSite: "strict",
    secure: process.env.DASHBOARD_SECURE_COOKIE === "true",
  });
}

export async function clearDashboardSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getDashboardSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;

  return token ? parseSessionToken(token) : null;
}
