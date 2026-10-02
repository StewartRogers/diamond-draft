import "server-only";

import crypto from "crypto";
import type { Client } from "@libsql/client";
import { getSharedClient, ensureWalMode } from "./connection";

// ─── Types ───────────────────────────────────────────────────────────────────

export type UserRole = "superuser" | "user";

export type User = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
};

type StoredUser = User & {
  passwordHash: string;
  salt: string;
};

export type AuthSession = {
  id: string;
  userId: string;
  expiresAt: number;
};

export type SafeUser = Omit<User, never>;

// ─── Constants ───────────────────────────────────────────────────────────────

const SESSION_COOKIE = "dd_session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };
const MAX_PASSWORD_LENGTH = 256;

// ─── Rate limiting ──────────────────────────────────────────────────────────
// Counters live in the auth database so limits hold across serverless
// instances and restarts.

const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_FAILURES = 10; // per username (per IP+username when the IP is known)
const MAX_LOGIN_FAILURES_PER_IP = 30; // password spraying from one client
const MAX_LOGIN_FAILURES_PER_USER_ALL_IPS = 100; // distributed guessing
const MAX_SETUP_ATTEMPTS = 10;
const MAX_AI_REQUESTS = 10;

/**
 * Client IP, but only where it cannot be spoofed. Vercel overwrites
 * x-real-ip / x-forwarded-for at its edge; a self-hosted Next server keeps
 * whatever the client sent, so there we return null.
 */
export function getTrustedClientIp(request: Request): string | null {
  if (!process.env.VERCEL) return null;
  const ip =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0];
  return ip?.trim() || null;
}

/** Increments `key` and returns true once it is over `max` in the window. */
async function hitRateLimit(key: string, max: number): Promise<boolean> {
  const db = await ensureSchema();
  const now = Date.now();
  const result = await db.execute({
    sql: `INSERT INTO rate_limits (key, count, resetAt) VALUES (?, 1, ?)
          ON CONFLICT(key) DO UPDATE SET
            count = CASE WHEN rate_limits.resetAt < ? THEN 1 ELSE rate_limits.count + 1 END,
            resetAt = CASE WHEN rate_limits.resetAt < ? THEN excluded.resetAt ELSE rate_limits.resetAt END
          RETURNING count`,
    args: [key, now + RATE_WINDOW_MS, now, now],
  });
  return Number(result.rows[0]?.count ?? 0) > max;
}

async function isOverLimit(key: string, max: number): Promise<boolean> {
  const db = await ensureSchema();
  const result = await db.execute({
    sql: "SELECT count FROM rate_limits WHERE key = ? AND resetAt >= ?",
    args: [key, Date.now()],
  });
  return Number(result.rows[0]?.count ?? 0) >= max;
}

async function clearRateLimit(keys: string[]): Promise<void> {
  const db = await ensureSchema();
  await db.batch(
    keys.map((key) => ({ sql: "DELETE FROM rate_limits WHERE key = ?", args: [key] })),
    "write"
  );
}

async function cleanExpiredRateLimits(): Promise<void> {
  const db = await ensureSchema();
  await db.execute({ sql: "DELETE FROM rate_limits WHERE resetAt < ?", args: [Date.now()] });
}

function loginBuckets(username: string, ip: string | null): { key: string; max: number }[] {
  const user = username.toLowerCase().trim();
  if (!ip) return [{ key: `login:user:${user}`, max: MAX_LOGIN_FAILURES }];
  // With a trusted IP, one client can only lock out its own attempts; locking
  // the account for everyone takes many IPs.
  return [
    { key: `login:ip-user:${ip}:${user}`, max: MAX_LOGIN_FAILURES },
    { key: `login:ip:${ip}`, max: MAX_LOGIN_FAILURES_PER_IP },
    { key: `login:user:${user}`, max: MAX_LOGIN_FAILURES_PER_USER_ALL_IPS },
  ];
}

/** True when this username/IP has too many recent failures. Not counted as an attempt. */
export async function isLoginBlocked(username: string, ip: string | null): Promise<boolean> {
  for (const { key, max } of loginBuckets(username, ip)) {
    if (await isOverLimit(key, max)) return true;
  }
  return false;
}

/** Only failed logins count toward the limits. */
export async function recordLoginFailure(username: string, ip: string | null): Promise<void> {
  for (const { key, max } of loginBuckets(username, ip)) await hitRateLimit(key, max);
}

/** On success, clear this client's buckets; the per-IP spray bucket stays. */
export async function clearLoginFailures(username: string, ip: string | null): Promise<void> {
  await clearRateLimit(
    loginBuckets(username, ip).filter((b) => !b.key.startsWith("login:ip:")).map((b) => b.key)
  );
}

export async function isSetupRateLimited(ip: string | null): Promise<boolean> {
  return hitRateLimit(`setup:${ip ?? "unknown"}`, MAX_SETUP_ATTEMPTS);
}

export async function isAiRateLimited(userId: string): Promise<boolean> {
  return hitRateLimit(`ai:${userId}`, MAX_AI_REQUESTS);
}

// ─── First-run setup token ──────────────────────────────────────────────────

/**
 * A setup token is required when SETUP_TOKEN is set, and always on Vercel,
 * where a fresh public deployment could otherwise be claimed by whoever
 * reaches /setup first.
 */
export function isSetupTokenRequired(): boolean {
  return !!process.env.SETUP_TOKEN || process.env.VERCEL === "1";
}

export function checkSetupToken(provided: string): "ok" | "not_configured" | "invalid" {
  if (!isSetupTokenRequired()) return "ok";
  const expected = process.env.SETUP_TOKEN;
  if (!expected) return "not_configured";
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b) ? "ok" : "invalid";
}

// ─── Database ────────────────────────────────────────────────────────────────

const globalAuthDb = globalThis as typeof globalThis & {
  __dd_auth_db_initialized?: boolean;
};

async function ensureSchema(): Promise<Client> {
  const db = getSharedClient("__dd_auth_db");
  if (globalAuthDb.__dd_auth_db_initialized) return db;

  await ensureWalMode(db);
  await db.batch([
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      data TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      expiresAt INTEGER NOT NULL,
      hashed INTEGER NOT NULL DEFAULT 0
    )`,
    "CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId)",
    `CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      resetAt INTEGER NOT NULL
    )`,
  ], "write");

  // Databases created before session tokens were hashed lack this column;
  // their existing rows get hashed = 0 and are re-keyed on first use.
  const columns = await db.execute("PRAGMA table_info(sessions)");
  if (!columns.rows.some((c) => c.name === "hashed")) {
    await db.execute("ALTER TABLE sessions ADD COLUMN hashed INTEGER NOT NULL DEFAULT 0");
  }

  globalAuthDb.__dd_auth_db_initialized = true;
  return db;
}

// ─── Password hashing ───────────────────────────────────────────────────────

function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString("hex"));
    });
  });
}

async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const candidate = await hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
}

// ─── User CRUD ───────────────────────────────────────────────────────────────

export async function countUsers(): Promise<number> {
  const db = await ensureSchema();
  const result = await db.execute("SELECT COUNT(*) as count FROM users");
  return Number(result.rows[0]?.count ?? 0);
}

let setupComplete = false;

export async function needsSetup(): Promise<boolean> {
  if (setupComplete) return false;
  const result = (await countUsers()) === 0;
  if (!result) setupComplete = true;
  return result;
}

export function validatePassword(password: string): string | null {
  if (!password || password.length < 8) return "Password must be at least 8 characters";
  if (password.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  return null;
}

export async function isLastSuperuser(userId: string): Promise<boolean> {
  const db = await ensureSchema();
  const result = await db.execute({
    sql: "SELECT COUNT(*) as count FROM users WHERE id != ? AND data LIKE '%\"role\":\"superuser\"%'",
    args: [userId],
  });
  return Number(result.rows[0]?.count ?? 0) === 0;
}

export async function createUserIfNoUsers(
  username: string,
  password: string,
  displayName: string
): Promise<User | null> {
  const db = await ensureSchema();

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(password, salt);
  const id = crypto.randomUUID();
  const stored: StoredUser = {
    id,
    username: username.toLowerCase().trim(),
    displayName: displayName.trim(),
    role: "superuser",
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
  };

  // Atomic check-and-insert: only inserts if no users exist yet
  const result = await db.execute({
    sql: `INSERT INTO users (id, username, data)
          SELECT ?, ?, ?
          WHERE (SELECT COUNT(*) FROM users) = 0`,
    args: [stored.id, stored.username, JSON.stringify(stored)],
  });

  if (!result.rowsAffected) return null;
  return toSafeUser(stored);
}

export async function createUser(
  username: string,
  password: string,
  displayName: string,
  role: UserRole
): Promise<User> {
  const db = await ensureSchema();
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(password, salt);
  const id = crypto.randomUUID();
  const user: StoredUser = {
    id,
    username: username.toLowerCase().trim(),
    displayName: displayName.trim(),
    role,
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
  };

  await db.execute({
    sql: "INSERT INTO users (id, username, data) VALUES (?, ?, ?)",
    args: [user.id, user.username, JSON.stringify(user)],
  });

  return toSafeUser(user);
}

export async function getAllUsers(): Promise<SafeUser[]> {
  const db = await ensureSchema();
  const result = await db.execute("SELECT data FROM users");
  return result.rows.map((row) => toSafeUser(JSON.parse(row.data as string) as StoredUser));
}

export async function getUser(id: string): Promise<SafeUser | undefined> {
  const db = await ensureSchema();
  const result = await db.execute({ sql: "SELECT data FROM users WHERE id = ?", args: [id] });
  const row = result.rows[0];
  if (!row) return undefined;
  return toSafeUser(JSON.parse(row.data as string) as StoredUser);
}

export async function deleteUser(id: string): Promise<"ok" | "last_superuser" | "not_found"> {
  const db = await ensureSchema();
  // The last-superuser check is part of the DELETE so two concurrent requests
  // cannot each remove the other superuser and leave none.
  const results = await db.batch([
    {
      sql: `DELETE FROM users WHERE id = ? AND (
              json_extract(data, '$.role') != 'superuser'
              OR (SELECT COUNT(*) FROM users WHERE id != ? AND json_extract(data, '$.role') = 'superuser') >= 1
            )`,
      args: [id, id],
    },
    { sql: "DELETE FROM sessions WHERE userId = ? AND NOT EXISTS (SELECT 1 FROM users WHERE id = ?)", args: [id, id] },
  ], "write");
  if ((results[0]?.rowsAffected ?? 0) > 0) return "ok";
  return (await getUser(id)) ? "last_superuser" : "not_found";
}

export async function resetPassword(userId: string, newPassword: string): Promise<boolean> {
  const db = await ensureSchema();
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(newPassword, salt);
  const results = await db.batch([
    {
      sql: `UPDATE users SET data = json_set(json_set(data, '$.passwordHash', ?), '$.salt', ?)
            WHERE id = ?`,
      args: [passwordHash, salt, userId],
    },
    { sql: "DELETE FROM sessions WHERE userId = ?", args: [userId] },
  ], "write");
  return (results[0]?.rowsAffected ?? 0) > 0;
}

export async function setUserRole(
  userId: string,
  role: UserRole
): Promise<"ok" | "not_found" | "last_superuser"> {
  const db = await ensureSchema();

  if (role === "user") {
    // Atomic: only demote if not the last superuser
    const result = await db.execute({
      sql: `UPDATE users SET data = json_set(data, '$.role', ?)
            WHERE id = ? AND (
              SELECT COUNT(*) FROM users
              WHERE json_extract(data, '$.role') = 'superuser'
            ) > 1`,
      args: [role, userId],
    });
    if ((result.rowsAffected ?? 0) > 0) return "ok";
    const exists = await db.execute({ sql: "SELECT 1 FROM users WHERE id = ?", args: [userId] });
    return exists.rows.length > 0 ? "last_superuser" : "not_found";
  }

  const result = await db.execute({
    sql: "UPDATE users SET data = json_set(data, '$.role', ?) WHERE id = ?",
    args: [role, userId],
  });
  return (result.rowsAffected ?? 0) > 0 ? "ok" : "not_found";
}

// ─── Authentication ──────────────────────────────────────────────────────────

const DUMMY_SALT = crypto.randomBytes(16).toString("hex");
const DUMMY_HASH = crypto.randomBytes(SCRYPT_KEYLEN).toString("hex");

export async function authenticate(username: string, password: string): Promise<User | null> {
  const db = await ensureSchema();
  const result = await db.execute({
    sql: "SELECT data FROM users WHERE username = ?",
    args: [username.toLowerCase().trim()],
  });
  const row = result.rows[0];
  if (!row) {
    await verifyPassword(password, DUMMY_SALT, DUMMY_HASH);
    return null;
  }
  const user = JSON.parse(row.data as string) as StoredUser;
  const valid = await verifyPassword(password, user.salt, user.passwordHash);
  if (!valid) return null;
  return toSafeUser(user);
}

// ─── Session management ──────────────────────────────────────────────────────

/**
 * Session tokens are stored only as SHA-256 hashes, so a leaked database (or
 * Turso dump) does not yield usable session cookies.
 */
function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Returns the raw token for the cookie; only its hash is stored. */
export async function createSession(userId: string): Promise<AuthSession> {
  await cleanExpiredSessions();
  const db = getSharedClient("__dd_auth_db");
  const id = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  await db.execute({
    sql: "INSERT INTO sessions (id, userId, expiresAt, hashed) VALUES (?, ?, ?, 1)",
    args: [hashSessionToken(id), userId, expiresAt],
  });
  return { id, userId, expiresAt };
}

export async function getSessionUser(sessionId: string): Promise<SafeUser | null> {
  const db = await ensureSchema();
  const hashed = hashSessionToken(sessionId);
  let result = await db.execute({ sql: "SELECT * FROM sessions WHERE id = ?", args: [hashed] });
  if (!result.rows[0]) {
    // Sessions created before tokens were hashed are stored raw. Re-key such a
    // row to its hash on first use so existing logins keep working. The
    // `hashed = 0` guard stops a leaked hash from being replayed as a token.
    const upgraded = await db.execute({
      sql: "UPDATE sessions SET id = ?, hashed = 1 WHERE id = ? AND hashed = 0",
      args: [hashed, sessionId],
    });
    if (upgraded.rowsAffected === 0) return null;
    result = await db.execute({ sql: "SELECT * FROM sessions WHERE id = ?", args: [hashed] });
  }
  const row = result.rows[0];
  if (!row) return null;
  if (Number(row.expiresAt) < Date.now()) {
    await db.execute({ sql: "DELETE FROM sessions WHERE id = ?", args: [hashed] });
    return null;
  }
  const user = await getUser(row.userId as string);
  return user ?? null;
}

export async function destroySession(sessionId: string): Promise<void> {
  const db = await ensureSchema();
  await db.execute({
    sql: "DELETE FROM sessions WHERE id = ? OR (id = ? AND hashed = 0)",
    args: [hashSessionToken(sessionId), sessionId],
  });
}

async function cleanExpiredSessions(): Promise<void> {
  const db = await ensureSchema();
  await db.execute({ sql: "DELETE FROM sessions WHERE expiresAt < ?", args: [Date.now()] });
  await cleanExpiredRateLimits();
}

// ─── Cookie helpers ──────────────────────────────────────────────────────────

const SESSION_COOKIE_RE = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`);

export function getSessionIdFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(SESSION_COOKIE_RE);
  return match ? match[1] : null;
}

export function makeSessionCookie(sessionId: string): string {
  const maxAge = Math.floor(SESSION_MAX_AGE_MS / 1000);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

export function makeClearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

// ─── Route guards ────────────────────────────────────────────────────────────

export async function requireUser(request: Request): Promise<SafeUser | Response> {
  if (await needsSetup()) {
    return Response.json({ error: "Setup required" }, { status: 403 });
  }
  const sessionId = getSessionIdFromRequest(request);
  if (!sessionId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getSessionUser(sessionId);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

export async function requireSuperuser(request: Request): Promise<SafeUser | Response> {
  const result = await requireUser(request);
  if (result instanceof Response) return result;
  if (result.role !== "superuser") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toSafeUser(stored: StoredUser): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, salt, ...safe } = stored;
  return safe;
}

export { SESSION_COOKIE };
