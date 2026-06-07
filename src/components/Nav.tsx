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
    <nav className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-6">
      <span className="text-white font-bold tracking-tight text-lg mr-4">
        ⚾ Diamond Draft
      </span>
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`text-sm font-medium transition-colors ${
            pathname === href
              ? "text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
