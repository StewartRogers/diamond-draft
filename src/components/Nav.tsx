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
  const [mobileOpen, setMobileOpen] = useState(false);
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

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
    <>
      <nav className="dd-nav">
        {/* Brand */}
        <Link href="/" className="dd-nav-brand">
          <span className="dd-nav-diamond" />
          <span className="dd-nav-brand-text">Diamond Draft</span>
        </Link>

        {/* Desktop nav links */}
        <div className="dd-nav-links">
          {links.map(({ href, label }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`dd-nav-link ${active ? "active" : ""}`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Desktop user menu */}
        <div ref={menuRef} className="dd-nav-user">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="dd-nav-avatar"
          >
            {initial}
          </button>

          {menuOpen && (
            <div className="dd-nav-dropdown">
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

        {/* Mobile hamburger */}
        <button
          className="dd-nav-hamburger"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#211f1b" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l12 12M17 5L5 17"/>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#211f1b" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 6h16M3 11h16M3 16h16"/>
            </svg>
          )}
        </button>
      </nav>

      {/* Mobile slide-down menu */}
      {mobileOpen && (
        <div className="dd-mobile-overlay" onClick={() => setMobileOpen(false)}>
          <div className="dd-mobile-menu" onClick={(e) => e.stopPropagation()}>
            {/* Nav links */}
            {links.map(({ href, label }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`dd-mobile-link ${active ? "active" : ""}`}
                  onClick={() => setMobileOpen(false)}
                >
                  {label}
                </Link>
              );
            })}

            {/* Divider */}
            <div style={{ height: 1, background: "#e7e4dc", margin: "4px 0" }} />

            {/* User info */}
            {authUser && (
              <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
                <span className="dd-nav-avatar" style={{ width: 32, height: 32, fontSize: 13 }}>
                  {initial}
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{authUser.displayName}</div>
                  <div style={{ fontSize: 12, color: "#6f6a60" }}>@{authUser.username}</div>
                </div>
              </div>
            )}

            {authUser?.role === "superuser" && (
              <Link
                href="/users"
                className="dd-mobile-link"
                onClick={() => setMobileOpen(false)}
              >
                Manage Users
              </Link>
            )}

            <button
              className="dd-mobile-link"
              onClick={() => { setMobileOpen(false); handleLogout(); }}
              style={{ color: "#dc2626", border: "none", background: "none", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </>
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
