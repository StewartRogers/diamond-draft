"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDiamondDraftStore } from "@/lib/store";
import { useState, useRef, useEffect } from "react";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/games", label: "Games" },
  { href: "/roster", label: "Roster" },
  { href: "/settings", label: "Settings" },
];

type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: "superuser" | "user";
};

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const teamName = useDiamondDraftStore((s) => s.settings.teamName);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) setAuthUser(data.user);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  if (pathname === "/login" || pathname === "/setup") return null;

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(href + "/");

  const initial = authUser?.displayName?.[0]?.toUpperCase() ?? teamName?.[0]?.toUpperCase() ?? "D";

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: 26,
        height: 64,
        padding: "0 30px",
        background: "rgba(255,255,255,.86)",
        backdropFilter: "saturate(1.4) blur(10px)",
        WebkitBackdropFilter: "saturate(1.4) blur(10px)",
        borderBottom: "1px solid #e7e4dc",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Brand */}
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          fontWeight: 800,
          fontSize: 17,
          letterSpacing: "-.01em",
          whiteSpace: "nowrap",
          textDecoration: "none",
          color: "#211f1b",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 24, height: 24,
            background: "#3f6212",
            borderRadius: 5,
            transform: "rotate(45deg)",
            flexShrink: 0,
            display: "inline-block",
          }}
        />
        Diamond Draft
      </Link>

      {/* Nav links */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {links.map(({ href, label }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                padding: "7px 14px",
                borderRadius: 9,
                fontSize: 14,
                fontWeight: 600,
                color: active ? "#3f6212" : "#6f6a60",
                background: active ? "#eef1e3" : "transparent",
                textDecoration: "none",
                transition: "background .12s, color .12s",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.color = "#211f1b";
                  (e.currentTarget as HTMLElement).style.background = "#f1efe8";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.color = "#6f6a60";
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* User menu */}
      <div ref={menuRef} style={{ marginLeft: "auto", position: "relative" }}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            width: 34, height: 34,
            borderRadius: 999,
            background: "#2b2a26",
            color: "#f3f1ec",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 14,
            flexShrink: 0,
            border: "none",
            cursor: "pointer",
          }}
        >
          {initial}
        </button>

        {menuOpen && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 42,
              background: "#fff",
              borderRadius: 10,
              border: "1.5px solid #e7e4dc",
              boxShadow: "0 8px 24px rgba(0,0,0,.12)",
              minWidth: 200,
              padding: "8px 0",
              zIndex: 30,
            }}
          >
            {authUser && (
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #e7e4dc" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{authUser.displayName}</div>
                <div style={{ fontSize: 12, color: "#6f6a60" }}>@{authUser.username}</div>
                <div style={{ fontSize: 11, color: "#9c9688", marginTop: 2 }}>
                  {authUser.role === "superuser" ? "Admin" : "User"}
                </div>
              </div>
            )}

            {authUser?.role === "superuser" && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/users");
                }}
                style={menuItemStyle}
              >
                Manage Users
              </button>
            )}

            <button
              onClick={() => {
                setMenuOpen(false);
                handleLogout();
              }}
              style={{ ...menuItemStyle, color: "#dc2626" }}
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 16px",
  border: "none",
  background: "none",
  textAlign: "left",
  fontSize: 14,
  fontWeight: 600,
  color: "#3d3b36",
  cursor: "pointer",
};
