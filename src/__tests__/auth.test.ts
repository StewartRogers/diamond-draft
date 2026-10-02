import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let tmpDir: string;
let auth: typeof import("@/lib/server/auth");

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diamond-draft-auth-test-"));
  process.env.DIAMOND_DRAFT_DATA_DIR = tmpDir;
  auth = await import("@/lib/server/auth");
});

afterAll(() => {
  delete process.env.DIAMOND_DRAFT_DATA_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("setup detection", () => {
  it("needsSetup returns true when no users exist", async () => {
    expect(await auth.needsSetup()).toBe(true);
    expect(await auth.countUsers()).toBe(0);
  });
});

describe("user creation", () => {
  it("creates a superuser and returns safe user (no hash/salt)", async () => {
    const user = await auth.createUser("admin", "secret123", "Coach Admin", "superuser");
    expect(user.username).toBe("admin");
    expect(user.displayName).toBe("Coach Admin");
    expect(user.role).toBe("superuser");
    expect(user.id).toBeTruthy();
    expect((user as Record<string, unknown>).passwordHash).toBeUndefined();
    expect((user as Record<string, unknown>).salt).toBeUndefined();
  });

  it("needsSetup returns false after creating a user", async () => {
    expect(await auth.needsSetup()).toBe(false);
    expect(await auth.countUsers()).toBe(1);
  });

  it("creates a regular user", async () => {
    const user = await auth.createUser("coach2", "pass1234", "Assistant Coach", "user");
    expect(user.role).toBe("user");
  });

  it("rejects duplicate usernames", async () => {
    await expect(
      auth.createUser("admin", "other123", "Duplicate", "user")
    ).rejects.toThrow();
  });

  it("normalizes username to lowercase", async () => {
    const user = await auth.createUser("CoachUpper", "pass1234", "Upper Case", "user");
    expect(user.username).toBe("coachupper");
  });
});

describe("authentication", () => {
  it("authenticates with correct credentials", async () => {
    const user = await auth.authenticate("admin", "secret123");
    expect(user).not.toBeNull();
    expect(user!.username).toBe("admin");
  });

  it("authenticates case-insensitively on username", async () => {
    const user = await auth.authenticate("ADMIN", "secret123");
    expect(user).not.toBeNull();
  });

  it("rejects wrong password", async () => {
    const user = await auth.authenticate("admin", "wrong");
    expect(user).toBeNull();
  });

  it("rejects unknown username", async () => {
    const user = await auth.authenticate("nobody", "secret123");
    expect(user).toBeNull();
  });
});

describe("session management", () => {
  it("creates a session and retrieves the user", async () => {
    const user = await auth.authenticate("admin", "secret123");
    const session = await auth.createSession(user!.id);
    expect(session.id).toBeTruthy();
    expect(session.userId).toBe(user!.id);

    const retrieved = await auth.getSessionUser(session.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(user!.id);
  });

  it("returns null for invalid session id", async () => {
    expect(await auth.getSessionUser("nonexistent")).toBeNull();
  });

  it("destroySession invalidates the session", async () => {
    const user = await auth.authenticate("admin", "secret123");
    const session = await auth.createSession(user!.id);
    await auth.destroySession(session.id);
    expect(await auth.getSessionUser(session.id)).toBeNull();
  });
});

describe("cookie helpers", () => {
  it("extracts session id from cookie header", () => {
    const request = new Request("http://localhost", {
      headers: { cookie: "dd_session=abc123; other=xyz" },
    });
    expect(auth.getSessionIdFromRequest(request)).toBe("abc123");
  });

  it("returns null when no session cookie present", () => {
    const request = new Request("http://localhost", {
      headers: { cookie: "other=xyz" },
    });
    expect(auth.getSessionIdFromRequest(request)).toBeNull();
  });

  it("returns null when no cookie header at all", () => {
    const request = new Request("http://localhost");
    expect(auth.getSessionIdFromRequest(request)).toBeNull();
  });

  it("makeSessionCookie sets HttpOnly and SameSite", () => {
    const cookie = auth.makeSessionCookie("test-token");
    expect(cookie).toContain("dd_session=test-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  it("makeClearSessionCookie sets Max-Age=0", () => {
    const cookie = auth.makeClearSessionCookie();
    expect(cookie).toContain("Max-Age=0");
  });
});

describe("route guards", () => {
  it("requireUser returns 401 for unauthenticated request", async () => {
    const request = new Request("http://localhost");
    const result = await auth.requireUser(request);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("requireUser returns user for authenticated request", async () => {
    const user = await auth.authenticate("admin", "secret123");
    const session = await auth.createSession(user!.id);
    const request = new Request("http://localhost", {
      headers: { cookie: `dd_session=${session.id}` },
    });
    const result = await auth.requireUser(request);
    expect(result).not.toBeInstanceOf(Response);
    expect((result as { id: string }).id).toBe(user!.id);
  });

  it("requireSuperuser returns 403 for non-admin", async () => {
    const user = await auth.authenticate("coach2", "pass1234");
    const session = await auth.createSession(user!.id);
    const request = new Request("http://localhost", {
      headers: { cookie: `dd_session=${session.id}` },
    });
    const result = await auth.requireSuperuser(request);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("requireSuperuser returns user for admin", async () => {
    const user = await auth.authenticate("admin", "secret123");
    const session = await auth.createSession(user!.id);
    const request = new Request("http://localhost", {
      headers: { cookie: `dd_session=${session.id}` },
    });
    const result = await auth.requireSuperuser(request);
    expect(result).not.toBeInstanceOf(Response);
    expect((result as { role: string }).role).toBe("superuser");
  });
});

describe("user management", () => {
  it("getAllUsers returns all users without sensitive fields", async () => {
    const users = await auth.getAllUsers();
    expect(users.length).toBeGreaterThanOrEqual(2);
    for (const u of users) {
      expect((u as Record<string, unknown>).passwordHash).toBeUndefined();
      expect((u as Record<string, unknown>).salt).toBeUndefined();
    }
  });

  it("getUser returns a user by id", async () => {
    const user = await auth.authenticate("admin", "secret123");
    const found = await auth.getUser(user!.id);
    expect(found).not.toBeUndefined();
    expect(found!.username).toBe("admin");
  });

  it("resetPassword changes the password and invalidates sessions", async () => {
    const user = await auth.authenticate("coach2", "pass1234");
    const session = await auth.createSession(user!.id);
    const ok = await auth.resetPassword(user!.id, "newpass99");
    expect(ok).toBe(true);
    expect(await auth.getSessionUser(session.id)).toBeNull();
    const loginOld = await auth.authenticate("coach2", "pass1234");
    expect(loginOld).toBeNull();
    const loginNew = await auth.authenticate("coach2", "newpass99");
    expect(loginNew).not.toBeNull();
  });

  it("setUserRole changes role", async () => {
    const user = await auth.authenticate("coach2", "newpass99");
    expect(await auth.setUserRole(user!.id, "superuser")).toBe("ok");
    const updated = await auth.getUser(user!.id);
    expect(updated!.role).toBe("superuser");
    expect(await auth.setUserRole(user!.id, "user")).toBe("ok");
  });

  it("deleteUser removes user and their sessions", async () => {
    const user = await auth.createUser("todelete", "pass12345678", "Delete Me", "user");
    const session = await auth.createSession(user.id);
    await auth.deleteUser(user.id);
    expect(await auth.getUser(user.id)).toBeUndefined();
    expect(await auth.getSessionUser(session.id)).toBeNull();
  });
});

describe("validatePassword", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(auth.validatePassword("short")).not.toBeNull();
    expect(auth.validatePassword("1234567")).not.toBeNull();
  });

  it("accepts passwords of 8+ characters", () => {
    expect(auth.validatePassword("12345678")).toBeNull();
    expect(auth.validatePassword("a-long-secure-password")).toBeNull();
  });

  it("rejects passwords exceeding max length", () => {
    expect(auth.validatePassword("x".repeat(257))).not.toBeNull();
  });
});

describe("isLastSuperuser", () => {
  it("returns true when user is the only superuser", async () => {
    const admin = await auth.authenticate("admin", "secret123");
    expect(await auth.isLastSuperuser(admin!.id)).toBe(true);
  });

  it("returns false when another superuser exists", async () => {
    const admin = await auth.authenticate("admin", "secret123");
    const other = await auth.createUser("admin2", "password1234", "Admin 2", "superuser");
    expect(await auth.isLastSuperuser(admin!.id)).toBe(false);
    await auth.deleteUser(other.id);
  });
});

describe("setUserRole atomicity", () => {
  it("prevents demoting the last superuser", async () => {
    const admin = await auth.authenticate("admin", "secret123");
    const result = await auth.setUserRole(admin!.id, "user");
    expect(result).toBe("last_superuser");
    const user = await auth.getUser(admin!.id);
    expect(user!.role).toBe("superuser");
  });

  it("returns not_found for nonexistent user", async () => {
    const result = await auth.setUserRole("nonexistent-id", "user");
    expect(result).toBe("not_found");
  });
});

describe("createUserIfNoUsers (atomic setup)", () => {
  it("returns null when users already exist", async () => {
    const result = await auth.createUserIfNoUsers("newadmin", "password1234", "New Admin");
    expect(result).toBeNull();
  });
});

describe("AI rate limiting", () => {
  it("allows requests within the limit and blocks after 10", async () => {
    const userId = "ai-limit-user";
    for (let i = 0; i < 10; i++) {
      expect(await auth.isAiRateLimited(userId)).toBe(false);
    }
    expect(await auth.isAiRateLimited(userId)).toBe(true);
  });
});

describe("deleteUser last-superuser guard", () => {
  it("refuses to delete the only superuser", async () => {
    const admin = await auth.authenticate("admin", "secret123");
    expect(await auth.deleteUser(admin!.id)).toBe("last_superuser");
    expect(await auth.getUser(admin!.id)).toBeDefined();
  });

  it("allows deleting a superuser when another remains", async () => {
    const other = await auth.createUser("admin3", "password1234", "Admin 3", "superuser");
    expect(await auth.deleteUser(other.id)).toBe("ok");
    expect(await auth.getUser(other.id)).toBeUndefined();
  });

  it("returns not_found for a nonexistent user", async () => {
    expect(await auth.deleteUser("nonexistent-id")).toBe("not_found");
  });
});

describe("login failure limiting", () => {
  it("only counts recorded failures and clears on success", async () => {
    const user = "login-failure-test";
    for (let i = 0; i < 9; i++) await auth.recordLoginFailure(user, null);
    expect(await auth.isLoginBlocked(user, null)).toBe(false);
    await auth.recordLoginFailure(user, null);
    expect(await auth.isLoginBlocked(user, null)).toBe(true);
    await auth.clearLoginFailures(user, null);
    expect(await auth.isLoginBlocked(user, null)).toBe(false);
  });

  it("checking the block status does not count as an attempt", async () => {
    const user = "login-peek-test";
    for (let i = 0; i < 50; i++) await auth.isLoginBlocked(user, null);
    expect(await auth.isLoginBlocked(user, null)).toBe(false);
  });

  it("with a trusted IP, one client cannot lock the account for others", async () => {
    const user = "lockout-target";
    for (let i = 0; i < 10; i++) await auth.recordLoginFailure(user, "203.0.113.1");
    expect(await auth.isLoginBlocked(user, "203.0.113.1")).toBe(true);
    expect(await auth.isLoginBlocked(user, "198.51.100.7")).toBe(false);
  });

  it("blocks one IP spraying many usernames", async () => {
    const ip = "203.0.113.50";
    for (let i = 0; i < 30; i++) await auth.recordLoginFailure(`spray-${i}`, ip);
    expect(await auth.isLoginBlocked("spray-new-user", ip)).toBe(true);
  });
});

describe("trusted client IP", () => {
  it("ignores forwarding headers when not on Vercel", () => {
    const req = new Request("http://localhost/", { headers: { "x-forwarded-for": "1.2.3.4" } });
    expect(auth.getTrustedClientIp(req)).toBeNull();
  });

  it("uses x-real-ip on Vercel", () => {
    process.env.VERCEL = "1";
    try {
      const req = new Request("http://localhost/", { headers: { "x-real-ip": "1.2.3.4" } });
      expect(auth.getTrustedClientIp(req)).toBe("1.2.3.4");
    } finally {
      delete process.env.VERCEL;
    }
  });
});

describe("session token hashing", () => {
  async function rawDb() {
    const { getSharedClient } = await import("@/lib/server/connection");
    return getSharedClient("__dd_auth_db");
  }

  it("stores only a hash of the session token", async () => {
    const admin = await auth.authenticate("admin", "secret123");
    const session = await auth.createSession(admin!.id);
    const db = await rawDb();
    const raw = await db.execute({ sql: "SELECT id FROM sessions WHERE id = ?", args: [session.id] });
    expect(raw.rows).toHaveLength(0);
    expect(await auth.getSessionUser(session.id)).not.toBeNull();
  });

  it("rejects the stored hash when presented as a token", async () => {
    const admin = await auth.authenticate("admin", "secret123");
    const session = await auth.createSession(admin!.id);
    const crypto = await import("crypto");
    const hash = crypto.createHash("sha256").update(session.id).digest("hex");
    expect(await auth.getSessionUser(hash)).toBeNull();
    expect(await auth.getSessionUser(session.id)).not.toBeNull();
  });

  it("upgrades a legacy unhashed session on first use", async () => {
    const admin = await auth.authenticate("admin", "secret123");
    const db = await rawDb();
    const legacyToken = "a".repeat(64);
    await db.execute({
      sql: "INSERT INTO sessions (id, userId, expiresAt) VALUES (?, ?, ?)",
      args: [legacyToken, admin!.id, Date.now() + 60_000],
    });
    expect((await auth.getSessionUser(legacyToken))?.id).toBe(admin!.id);
    const raw = await db.execute({ sql: "SELECT id FROM sessions WHERE id = ?", args: [legacyToken] });
    expect(raw.rows).toHaveLength(0);
    expect((await auth.getSessionUser(legacyToken))?.id).toBe(admin!.id);
    await auth.destroySession(legacyToken);
    expect(await auth.getSessionUser(legacyToken)).toBeNull();
  });
});

describe("setup token", () => {
  it("is not required by default when self-hosted", () => {
    expect(auth.isSetupTokenRequired()).toBe(false);
    expect(auth.checkSetupToken("")).toBe("ok");
  });

  it("is required and checked when SETUP_TOKEN is set", () => {
    process.env.SETUP_TOKEN = "correct-token";
    try {
      expect(auth.checkSetupToken("wrong")).toBe("invalid");
      expect(auth.checkSetupToken("correct-token")).toBe("ok");
    } finally {
      delete process.env.SETUP_TOKEN;
    }
  });

  it("blocks setup on Vercel until SETUP_TOKEN is configured", () => {
    process.env.VERCEL = "1";
    try {
      expect(auth.checkSetupToken("anything")).toBe("not_configured");
    } finally {
      delete process.env.VERCEL;
    }
  });
});
