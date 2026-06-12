"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDiamondDraftStore } from "@/lib/store";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/games", label: "Games" },
  { href: "/roster", label: "Roster" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();
  const teamName = useDiamondDraftStore((s) => s.settings.teamName);

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(href + "/");

  const initial = teamName ? teamName[0].toUpperCase() : "D";

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

      {/* Avatar */}
      <div
        style={{
          marginLeft: "auto",
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
        }}
      >
        {initial}
      </div>
    </nav>
  );
}
