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
  it("needsSetup returns true when no users exist", () => {
    expect(auth.needsSetup()).toBe(true);
    expect(auth.countUsers()).toBe(0);
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

  it("needsSetup returns false after creating a user", () => {
    expect(auth.needsSetup()).toBe(false);
    expect(auth.countUsers()).toBe(1);
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
    const session = auth.createSession(user!.id);
    expect(session.id).toBeTruthy();
    expect(session.userId).toBe(user!.id);

    const retrieved = auth.getSessionUser(session.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(user!.id);
  });

  it("returns null for invalid session id", () => {
    expect(auth.getSessionUser("nonexistent")).toBeNull();
  });

  it("destroySession invalidates the session", async () => {
    const user = await auth.authenticate("admin", "secret123");
    const session = auth.createSession(user!.id);
    auth.destroySession(session.id);
    expect(auth.getSessionUser(session.id)).toBeNull();
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
  it("requireUser returns 401 for unauthenticated request", () => {
    const request = new Request("http://localhost");
    const result = auth.requireUser(request);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("requireUser returns user for authenticated request", async () => {
    const user = await auth.authenticate("admin", "secret123");
    const session = auth.createSession(user!.id);
    const request = new Request("http://localhost", {
      headers: { cookie: `dd_session=${session.id}` },
    });
    const result = auth.requireUser(request);
    expect(result).not.toBeInstanceOf(Response);
    expect((result as { id: string }).id).toBe(user!.id);
  });

  it("requireSuperuser returns 403 for non-admin", async () => {
    const user = await auth.authenticate("coach2", "pass1234");
    const session = auth.createSession(user!.id);
    const request = new Request("http://localhost", {
      headers: { cookie: `dd_session=${session.id}` },
    });
    const result = auth.requireSuperuser(request);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("requireSuperuser returns user for admin", async () => {
    const user = await auth.authenticate("admin", "secret123");
    const session = auth.createSession(user!.id);
    const request = new Request("http://localhost", {
      headers: { cookie: `dd_session=${session.id}` },
    });
    const result = auth.requireSuperuser(request);
    expect(result).not.toBeInstanceOf(Response);
    expect((result as { role: string }).role).toBe("superuser");
  });
});

describe("user management", () => {
  it("getAllUsers returns all users without sensitive fields", () => {
    const users = auth.getAllUsers();
    expect(users.length).toBeGreaterThanOrEqual(2);
    for (const u of users) {
      expect((u as Record<string, unknown>).passwordHash).toBeUndefined();
      expect((u as Record<string, unknown>).salt).toBeUndefined();
    }
  });

  it("getUser returns a user by id", async () => {
    const user = await auth.authenticate("admin", "secret123");
    const found = auth.getUser(user!.id);
    expect(found).not.toBeUndefined();
    expect(found!.username).toBe("admin");
  });

  it("resetPassword changes the password and invalidates sessions", async () => {
    const user = await auth.authenticate("coach2", "pass1234");
    const session = auth.createSession(user!.id);
    const ok = await auth.resetPassword(user!.id, "newpass99");
    expect(ok).toBe(true);
    expect(auth.getSessionUser(session.id)).toBeNull();
    const loginOld = await auth.authenticate("coach2", "pass1234");
    expect(loginOld).toBeNull();
    const loginNew = await auth.authenticate("coach2", "newpass99");
    expect(loginNew).not.toBeNull();
  });

  it("setUserRole changes role", async () => {
    const user = await auth.authenticate("coach2", "newpass99");
    auth.setUserRole(user!.id, "superuser");
    const updated = auth.getUser(user!.id);
    expect(updated!.role).toBe("superuser");
    auth.setUserRole(user!.id, "user");
  });

  it("deleteUser removes user and their sessions", async () => {
    const user = await auth.createUser("todelete", "pass12345678", "Delete Me", "user");
    const session = auth.createSession(user.id);
    auth.deleteUser(user.id);
    expect(auth.getUser(user.id)).toBeUndefined();
    expect(auth.getSessionUser(session.id)).toBeNull();
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
    expect(auth.isLastSuperuser(admin!.id)).toBe(true);
  });

  it("returns false when another superuser exists", async () => {
    const admin = await auth.authenticate("admin", "secret123");
    const other = await auth.createUser("admin2", "password1234", "Admin 2", "superuser");
    expect(auth.isLastSuperuser(admin!.id)).toBe(false);
    auth.deleteUser(other.id);
  });
});

describe("createUserIfNoUsers (atomic setup)", () => {
  it("returns null when users already exist", async () => {
    const result = await auth.createUserIfNoUsers("newadmin", "password1234", "New Admin");
    expect(result).toBeNull();
  });
});

describe("rate limiting", () => {
  it("allows requests within the limit", () => {
    expect(auth.isRateLimited("test-key-unique")).toBe(false);
  });

  it("blocks after exceeding max attempts", () => {
    const key = "brute-force-test";
    for (let i = 0; i < 10; i++) {
      auth.isRateLimited(key);
    }
    expect(auth.isRateLimited(key)).toBe(true);
  });
});
