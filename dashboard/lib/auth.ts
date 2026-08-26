import "server-only";

import { cookies } from "next/headers";
import {
  createSessionToken,
  parseSessionToken,
  verifyCredentialHash,
} from "./auth-core";
import type { SessionPayload } from "./auth-core";

const COOKIE_NAME = "ghost_inventory_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12;

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function verifyDashboardCredentials(
  email: string,
  password: string,
): boolean {
  return verifyCredentialHash({
    email,
    password,
    expectedEmail: requireEnvironmentVariable("DASHBOARD_OWNER_EMAIL"),
    storedPasswordHash: requireEnvironmentVariable("DASHBOARD_PASSWORD_HASH"),
  });
}

export async function createDashboardSession(email: string): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, createSessionToken({
    email,
    secret: requireEnvironmentVariable("DASHBOARD_SESSION_SECRET"),
    durationSeconds: SESSION_DURATION_SECONDS,
  }), {
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

  return token
    ? parseSessionToken({
      token,
      secret: requireEnvironmentVariable("DASHBOARD_SESSION_SECRET"),
      expectedEmail: requireEnvironmentVariable("DASHBOARD_OWNER_EMAIL"),
    })
    : null;
}
