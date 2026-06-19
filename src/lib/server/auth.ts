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

const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 10;
const MAX_RATE_LIMIT_ENTRIES = 10_000;
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
let lastRateLimitCleanup = Date.now();

function pruneExpiredEntries(): void {
  const now = Date.now();
  if (now - lastRateLimitCleanup < RATE_LIMIT_CLEANUP_INTERVAL_MS && loginAttempts.size < MAX_RATE_LIMIT_ENTRIES) return;
  lastRateLimitCleanup = now;
  for (const [key, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(key);
  }
}

function checkRateLimit(key: string): boolean {
  pruneExpiredEntries();
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_LOGIN_ATTEMPTS;
}

export function isRateLimited(key: string): boolean {
  return !checkRateLimit(key);
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
      expiresAt INTEGER NOT NULL
    )`,
    "CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId)",
  ], "write");

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

export async function needsSetup(): Promise<boolean> {
  return (await countUsers()) === 0;
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

export async function deleteUser(id: string): Promise<void> {
  const db = await ensureSchema();
  await db.batch([
    { sql: "DELETE FROM users WHERE id = ?", args: [id] },
    { sql: "DELETE FROM sessions WHERE userId = ?", args: [id] },
  ], "write");
}

export async function resetPassword(userId: string, newPassword: string): Promise<boolean> {
  const db = await ensureSchema();
  const result = await db.execute({ sql: "SELECT data FROM users WHERE id = ?", args: [userId] });
  const row = result.rows[0];
  if (!row) return false;
  const user = JSON.parse(row.data as string) as StoredUser;
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(newPassword, salt);
  const updated: StoredUser = { ...user, salt, passwordHash };
  await db.batch([
    { sql: "UPDATE users SET data = ? WHERE id = ?", args: [JSON.stringify(updated), userId] },
    { sql: "DELETE FROM sessions WHERE userId = ?", args: [userId] },
  ], "write");
  return true;
}

export async function setUserRole(userId: string, role: UserRole): Promise<boolean> {
  const db = await ensureSchema();
  const result = await db.execute({ sql: "SELECT data FROM users WHERE id = ?", args: [userId] });
  const row = result.rows[0];
  if (!row) return false;
  const user = JSON.parse(row.data as string) as StoredUser;
  const updated: StoredUser = { ...user, role };
  await db.execute({
    sql: "UPDATE users SET data = ? WHERE id = ?",
    args: [JSON.stringify(updated), userId],
  });
  return true;
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

export async function createSession(userId: string): Promise<AuthSession> {
  await cleanExpiredSessions();
  const db = await ensureSchema();
  const id = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  await db.execute({
    sql: "INSERT INTO sessions (id, userId, expiresAt) VALUES (?, ?, ?)",
    args: [id, userId, expiresAt],
  });
  return { id, userId, expiresAt };
}

export async function getSessionUser(sessionId: string): Promise<SafeUser | null> {
  const db = await ensureSchema();
  const result = await db.execute({ sql: "SELECT * FROM sessions WHERE id = ?", args: [sessionId] });
  const row = result.rows[0];
  if (!row) return null;
  if (Number(row.expiresAt) < Date.now()) {
    await db.execute({ sql: "DELETE FROM sessions WHERE id = ?", args: [sessionId] });
    return null;
  }
  const user = await getUser(row.userId as string);
  return user ?? null;
}

export async function destroySession(sessionId: string): Promise<void> {
  const db = await ensureSchema();
  await db.execute({ sql: "DELETE FROM sessions WHERE id = ?", args: [sessionId] });
}

async function cleanExpiredSessions(): Promise<void> {
  const db = await ensureSchema();
  await db.execute({ sql: "DELETE FROM sessions WHERE expiresAt < ?", args: [Date.now()] });
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
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
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
