import "server-only";

export interface VercelEnv {
  isVercel: boolean;
  environment: "production" | "preview" | "development" | null;
  url: string | null;
  region: string | null;
  gitCommitSha: string | null;
  gitCommitRef: string | null;
}

export function getVercelEnv(): VercelEnv {
  const isVercel = process.env.VERCEL === "1";
  return {
    isVercel,
    environment: (process.env.VERCEL_ENV as VercelEnv["environment"]) ?? null,
    url: process.env.VERCEL_URL ?? null,
    region: process.env.VERCEL_REGION ?? null,
    gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
  };
}

export interface EnvValidation {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

export function validateEnv(): EnvValidation {
  const missing: string[] = [];
  const warnings: string[] = [];
  const { isVercel } = getVercelEnv();

  if (isVercel) {
    if (!process.env.TURSO_DATABASE_URL) {
      missing.push("TURSO_DATABASE_URL");
    }
    if (!process.env.TURSO_AUTH_TOKEN) {
      missing.push("TURSO_AUTH_TOKEN");
    }
  }

  if (!process.env.GEMINI_API_KEY) {
    warnings.push("GEMINI_API_KEY is not set — AI pitch-plan feature will be disabled");
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}
