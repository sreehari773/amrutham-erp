import { getBasicAuthCredentials } from "@/lib/env";

function decodeBase64(value: string): string {
  if (typeof atob === "function") {
    return atob(value);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("utf8");
  }

  throw new Error("No base64 decoder is available in this runtime.");
}

function safeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length === right.length ? 0 : 1;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

function parseBasicAuthHeader(authHeader: string | null): { username: string; password: string } | null {
  if (!authHeader) {
    return null;
  }

  const [scheme, encoded] = authHeader.split(" ");

  if (scheme !== "Basic" || !encoded) {
    return null;
  }

  try {
    const decoded = decodeBase64(encoded);
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function isBasicAuthAuthorized(authHeader: string | null): boolean {
  const { username: expectedUsername, password: expectedPassword } = getBasicAuthCredentials();

  if (!expectedUsername || !expectedPassword) {
    return false;
  }

  const parsed = parseBasicAuthHeader(authHeader);

  if (!parsed) {
    return false;
  }

  return safeEqual(parsed.username, expectedUsername) && safeEqual(parsed.password, expectedPassword);
}
