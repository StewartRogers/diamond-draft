"use client";

import { useState, useEffect, useReducer } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: string;
  username: string;
  displayName: string;
  role: "superuser" | "user";
  createdAt: string;
};

async function fetchUsers(): Promise<{ users: User[]; currentUser: User | null } | "redirect"> {
  const [usersRes, meRes] = await Promise.all([
    fetch("/api/users"),
    fetch("/api/auth/me"),
  ]);
  if (usersRes.status === 403 || usersRes.status === 401) return "redirect";
  const usersData = await usersRes.json();
  const meData = await meRes.json();
  return {
    users: Array.isArray(usersData) ? usersData : [],
    currentUser: meData.user || null,
  };
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [refreshKey, refresh] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    let cancelled = false;
    fetchUsers().then((result) => {
      if (cancelled) return;
      if (result === "redirect") {
        router.replace("/");
        return;
      }
      setUsers(result.users);
      setCurrentUser(result.currentUser);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey, router]);

  if (loading) return null;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>User Management</h1>
        <button onClick={() => setShowAdd(true)} style={addButtonStyle}>
          Add User
        </button>
      </div>

      {showAdd && (
        <AddUserForm
          onDone={() => {
            setShowAdd(false);
            refresh();
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {users.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            isSelf={user.id === currentUser?.id}
            onUpdate={refresh}
          />
        ))}
      </div>
    </div>
  );
}

function AddUserForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"user" | "superuser">("user");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, displayName, role }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to create user");
      setSubmitting(false);
      return;
    }
    onDone();
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: 20,
        background: "#fff",
        borderRadius: 12,
        border: "1.5px solid #d5d1c9",
        marginBottom: 20,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>New User</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Coach Jones"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="off"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "user" | "superuser")}
            style={{ ...inputStyle, height: 42 }}
          >
            <option value="user">User</option>
            <option value="superuser">Admin</option>
          </select>
        </div>
      </div>
      {error && (
        <div style={{ color: "#dc2626", fontSize: 13, padding: "8px 12px", background: "#fef2f2", borderRadius: 8 }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel} style={cancelButtonStyle}>
          Cancel
        </button>
        <button type="submit" disabled={submitting} style={smallButtonStyle}>
          {submitting ? "Creating..." : "Create User"}
        </button>
      </div>
    </form>
  );
}

function UserRow({
  user,
  isSelf,
  onUpdate,
}: {
  user: User;
  isSelf: boolean;
  onUpdate: () => void;
}) {
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");

  const handleDelete = async () => {
    if (!confirm(`Delete user "${user.displayName}"?`)) return;
    const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    if (res.ok) onUpdate();
  };

  const handleToggleRole = async () => {
    const newRole = user.role === "superuser" ? "user" : "superuser";
    await fetch(`/api/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    onUpdate();
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    if (res.ok) {
      setShowReset(false);
      setNewPassword("");
    }
  };

  const roleBadge = user.role === "superuser"
    ? { label: "Admin", bg: "#fef3c7", color: "#92400e", border: "#f59e0b" }
    : { label: "User", bg: "#dbeafe", color: "#1e40af", border: "#3b82f6" };

  return (
    <div
      style={{
        padding: "14px 18px",
        background: "#fff",
        borderRadius: 10,
        border: "1.5px solid #e7e4dc",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            background: "#2b2a26",
            color: "#f3f1ec",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          {user.displayName[0]?.toUpperCase() || "?"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {user.displayName}
            {isSelf && <span style={{ color: "#6f6a60", fontWeight: 400, fontSize: 12, marginLeft: 6 }}>(you)</span>}
          </div>
          <div style={{ fontSize: 13, color: "#6f6a60" }}>@{user.username}</div>
        </div>
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            background: roleBadge.bg,
            color: roleBadge.color,
            border: `1px solid ${roleBadge.border}`,
          }}
        >
          {roleBadge.label}
        </span>
        {!isSelf && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={handleToggleRole}
              title={user.role === "superuser" ? "Demote to user" : "Promote to admin"}
              style={iconButtonStyle}
            >
              {user.role === "superuser" ? "Demote" : "Promote"}
            </button>
            <button onClick={() => setShowReset(!showReset)} style={iconButtonStyle}>
              Reset PW
            </button>
            <button onClick={handleDelete} style={{ ...iconButtonStyle, color: "#dc2626" }}>
              Delete
            </button>
          </div>
        )}
      </div>

      {showReset && (
        <form onSubmit={handleResetPassword} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ ...labelStyle, marginBottom: 4 }}>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              style={{ ...inputStyle, padding: "8px 12px", fontSize: 14 }}
            />
          </div>
          {error && <span style={{ color: "#dc2626", fontSize: 12 }}>{error}</span>}
          <button type="submit" style={smallButtonStyle}>
            Reset
          </button>
        </form>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#3d3b36",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1.5px solid #d5d1c9",
  fontSize: 15,
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};

const addButtonStyle: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: 9,
  border: "none",
  background: "#3f6212",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

const smallButtonStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "#3f6212",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const cancelButtonStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "1.5px solid #d5d1c9",
  background: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  color: "#3d3b36",
};

const iconButtonStyle: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 6,
  border: "1.5px solid #d5d1c9",
  background: "#fff",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  color: "#3d3b36",
  whiteSpace: "nowrap",
};
