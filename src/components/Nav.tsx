"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/roster", label: "Roster" },
  { href: "/games", label: "Games" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav
      style={{
        background: "#fff",
        borderBottom: "1px solid #e7e4dc",
        padding: "0 22px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 52,
        fontFamily: "'Hanken Grotesk', var(--font-hanken), sans-serif",
      }}
    >
      {/* Logo */}
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          textDecoration: "none",
          marginRight: 16,
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            transform: "rotate(45deg)",
            background: "#3f6212",
            borderRadius: 4,
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: "#211f1b",
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
          }}
        >
          Diamond Draft
        </span>
      </Link>

      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color:
              pathname === href || (href !== "/" && pathname.startsWith(href))
                ? "#3f6212"
                : "#7c776c",
            textDecoration: "none",
            padding: "5px 10px",
            borderRadius: 7,
            background:
              pathname === href || (href !== "/" && pathname.startsWith(href))
                ? "#eef1e3"
                : "transparent",
            transition: "background 0.1s, color 0.1s",
          }}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
