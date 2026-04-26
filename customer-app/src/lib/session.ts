import { createHmac, timingSafeEqual } from "crypto";
import { env } from "./env";

const ALGORITHM = "sha256";

export function sign(value: string): string {
  const secret = env.authSecret;
  if (!secret) {
    // In production we should have AUTH_SECRET.
    // If not, we might want to fail or use a fallback for dev.
    // The env.ts will throw if it's missing and not in Vercel/CI.
    throw new Error("AUTH_SECRET is not defined");
  }
  const hmac = createHmac(ALGORITHM, secret);
  hmac.update(value);
  const signature = hmac.digest("hex");
  return `${value}.${signature}`;
}

export function verify(signedValue: string): string | null {
  const secret = env.authSecret;
  if (!secret) {
    throw new Error("AUTH_SECRET is not defined");
  }

  const parts = signedValue.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [value, signature] = parts;

  const hmac = createHmac(ALGORITHM, secret);
  hmac.update(value);
  const expectedSignature = hmac.digest("hex");

  try {
    const signatureBuffer = Buffer.from(signature, "hex");
    const expectedSignatureBuffer = Buffer.from(expectedSignature, "hex");

    if (
      signatureBuffer.length === expectedSignatureBuffer.length &&
      timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
    ) {
      return value;
    }
  } catch {
    return null;
  }

  return null;
}
