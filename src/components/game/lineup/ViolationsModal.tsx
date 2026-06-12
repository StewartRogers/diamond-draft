"use client";

import ReactDOM from "react-dom";
import type { RuleViolation } from "@/lib/types";

export function ViolationsModal({
  violations, onClose,
}: {
  violations: RuleViolation[];
  onClose: () => void;
}) {
  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");
  const clean = violations.length === 0;

  return ReactDOM.createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(40,35,25,.45)", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", border: "1px solid #e7e4dc", borderRadius: 14, width: "100%", maxWidth: 580, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 18px 50px rgba(40,35,25,.3)", fontFamily: "var(--font-hanken),'Hanken Grotesk',sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid #e7e4dc", flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#211f1b" }}>Lineup Check</span>
          <button
            onClick={onClose}
            style={{ padding: "4px 12px", fontSize: 12, fontWeight: 600, borderRadius: 7, border: "1px solid #d6d2c8", background: "#faf8f3", color: "#57534a", cursor: "pointer", fontFamily: "inherit" }}
          >
            ✕ Close
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          {clean && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "#eef1e3", border: "1px solid #dbe3c6", borderRadius: 10 }}>
              <span style={{ width: 20, height: 20, borderRadius: 999, background: "#3f6212", color: "#fff", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✓</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#3f6212" }}>Lineup is clean</div>
                <div style={{ fontSize: 12.5, color: "#5b7a2e", marginTop: 2 }}>No errors or warnings found.</div>
              </div>
            </div>
          )}
          {errors.length > 0 && (
            <div>
              <div style={{ fontFamily: "var(--font-ibm-mono),'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "#9a3412", marginBottom: 8 }}>
                {errors.length} Error{errors.length > 1 ? "s" : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {errors.map((v, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "9px 12px", background: "#f6e7df", border: "1px solid #eccfc0", borderRadius: 9 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 999, background: "#9a3412", color: "#fff", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>!</span>
                    <span style={{ fontSize: 13, color: "#7c2d12", lineHeight: 1.45 }}>{v.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {warnings.length > 0 && (
            <div>
              <div style={{ fontFamily: "var(--font-ibm-mono),'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "#a16207", marginBottom: 8 }}>
                {warnings.length} Warning{warnings.length > 1 ? "s" : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {warnings.map((v, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "9px 12px", background: "#fef9e7", border: "1px solid #fde68a", borderRadius: 9 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 999, background: "#a16207", color: "#fff", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>⚠</span>
                    <span style={{ fontSize: 13, color: "#78350f", lineHeight: 1.45 }}>{v.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
