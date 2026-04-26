function requireEnv(name: string): string {
  if (typeof window !== "undefined") return process.env[name] || "";
  const value = process.env[name]?.trim();

  if (!value) {
    // If it's a Vercel build, we return an empty string to allow THE BUILD to complete.
    // The ENV will actually be present at RUNTIME on Vercel.
    if (process.env.VERCEL || process.env.CI) {
      return "";
    }
    throw new Error(`Missing required environment variable: ${name}. Check your .env file or Vercel settings.`);
  }

  return value;
}

function firstDefinedEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function parseBooleanEnv(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value);
}

export const env = {
  get supabaseUrl() { return requireEnv("NEXT_PUBLIC_SUPABASE_URL"); },
  get supabaseServiceRoleKey() { return requireEnv("SUPABASE_SERVICE_ROLE_KEY"); },
  rollout: {
    get skipAutomationShadowEnabled() { return parseBooleanEnv("SKIP_AUTOMATION_SHADOW_ENABLED"); },
    get skipAutomationWriteEnabled() { return parseBooleanEnv("SKIP_AUTOMATION_WRITE_ENABLED"); },
  },
};

export function isBasicAuthConfigured(): boolean {
  return Boolean(
    firstDefinedEnv(["BASIC_AUTH_USER", "ADMIN_USER"]) &&
      firstDefinedEnv(["BASIC_AUTH_PASSWORD", "ADMIN_PASS"])
  );
}

export function getBasicAuthCredentials() {
  return {
    username: firstDefinedEnv(["BASIC_AUTH_USER", "ADMIN_USER"]) ?? "",
    password: firstDefinedEnv(["BASIC_AUTH_PASSWORD", "ADMIN_PASS"]) ?? "",
  };
}
