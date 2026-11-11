import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "alfrebot_admin";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 días

export function adminSecretConfigured(): boolean {
  return Boolean(process.env.ADMIN_SECRET?.trim());
}

function sessionToken(): string | null {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) return null;
  return createHmac("sha256", secret).update("alfrebot-admin-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const expected = sessionToken();
  if (!expected) return false;
  const jar = await cookies();
  const value = jar.get(ADMIN_COOKIE)?.value;
  if (!value) return false;
  return safeEqual(value, expected);
}

export async function setAdminSession(): Promise<void> {
  const token = sessionToken();
  if (!token) throw new Error("ADMIN_SECRET no configurada");
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}

export function verifyAdminPassword(password: string): boolean {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret || !password) return false;
  return safeEqual(password, secret);
}
