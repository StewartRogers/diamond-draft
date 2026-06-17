import "server-only";

import crypto from "crypto";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

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

// ─── Database ────────────────────────────────────────────────────────────────

function getDataDir(): string {
  return process.env.DIAMOND_DRAFT_DATA_DIR ?? path.join(process.cwd(), "data");
}

let db: InstanceType<typeof Database> | null = null;

function getDb() {
  if (db) return db;
  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(path.join(dataDir, "diamond-draft.sqlite3"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      expiresAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
  `);
  return db;
}

// ─── Password hashing ───────────────────────────────────────────────────────

function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => {
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

export function countUsers(): number {
  const row = getDb().prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  return row.count;
}

export function needsSetup(): boolean {
  return countUsers() === 0;
}

export async function createUser(
  username: string,
  password: string,
  displayName: string,
  role: UserRole
): Promise<User> {
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
  getDb()
    .prepare("INSERT INTO users (id, username, data) VALUES (?, ?, ?)")
    .run(user.id, user.username, JSON.stringify(user));
  return toSafeUser(user);
}

export function getAllUsers(): SafeUser[] {
  return getDb()
    .prepare("SELECT data FROM users")
    .all()
    .map((row: unknown) => toSafeUser(JSON.parse((row as { data: string }).data) as StoredUser));
}

export function getUser(id: string): SafeUser | undefined {
  const row = getDb().prepare("SELECT data FROM users WHERE id = ?").get(id) as { data: string } | undefined;
  if (!row) return undefined;
  return toSafeUser(JSON.parse(row.data) as StoredUser);
}

export function deleteUser(id: string): void {
  getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
  getDb().prepare("DELETE FROM sessions WHERE userId = ?").run(id);
}

export async function resetPassword(userId: string, newPassword: string): Promise<boolean> {
  const row = getDb().prepare("SELECT data FROM users WHERE id = ?").get(userId) as { data: string } | undefined;
  if (!row) return false;
  const user = JSON.parse(row.data) as StoredUser;
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(newPassword, salt);
  const updated: StoredUser = { ...user, salt, passwordHash };
  getDb()
    .prepare("UPDATE users SET data = ? WHERE id = ?")
    .run(JSON.stringify(updated), userId);
  getDb().prepare("DELETE FROM sessions WHERE userId = ?").run(userId);
  return true;
}

export function setUserRole(userId: string, role: UserRole): boolean {
  const row = getDb().prepare("SELECT data FROM users WHERE id = ?").get(userId) as { data: string } | undefined;
  if (!row) return false;
  const user = JSON.parse(row.data) as StoredUser;
  const updated: StoredUser = { ...user, role };
  getDb()
    .prepare("UPDATE users SET data = ? WHERE id = ?")
    .run(JSON.stringify(updated), userId);
  return true;
}

// ─── Authentication ──────────────────────────────────────────────────────────

export async function authenticate(username: string, password: string): Promise<User | null> {
  const row = getDb()
    .prepare("SELECT data FROM users WHERE username = ?")
    .get(username.toLowerCase().trim()) as { data: string } | undefined;
  if (!row) return null;
  const user = JSON.parse(row.data) as StoredUser;
  const valid = await verifyPassword(password, user.salt, user.passwordHash);
  if (!valid) return null;
  return toSafeUser(user);
}

// ─── Session management ──────────────────────────────────────────────────────

export function createSession(userId: string): AuthSession {
  cleanExpiredSessions();
  const id = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  getDb()
    .prepare("INSERT INTO sessions (id, userId, expiresAt) VALUES (?, ?, ?)")
    .run(id, userId, expiresAt);
  return { id, userId, expiresAt };
}

export function getSessionUser(sessionId: string): SafeUser | null {
  const session = getDb()
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(sessionId) as AuthSession | undefined;
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return null;
  }
  const user = getUser(session.userId);
  return user ?? null;
}

export function destroySession(sessionId: string): void {
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

function cleanExpiredSessions(): void {
  getDb().prepare("DELETE FROM sessions WHERE expiresAt < ?").run(Date.now());
}

// ─── Cookie helpers ──────────────────────────────────────────────────────────

export function getSessionIdFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
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

export function requireUser(request: Request): SafeUser | Response {
  if (needsSetup()) {
    return Response.json({ error: "Setup required" }, { status: 403 });
  }
  const sessionId = getSessionIdFromRequest(request);
  if (!sessionId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = getSessionUser(sessionId);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

export function requireSuperuser(request: Request): SafeUser | Response {
  const result = requireUser(request);
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
