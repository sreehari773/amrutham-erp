function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
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

export const env = {
  supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
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
