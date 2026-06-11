"use client";

import { useState } from "react";
import ReactDOM from "react-dom";

// Portal — FitCard's transform breaks position:fixed inside the card.
export function AutoFillLogModal({
  autoLog, autoWarnings, gameDate, onClose,
}: {
  autoLog: string[];
  autoWarnings: string[];
  gameDate: string;
  onClose: () => void;
}) {
  const [logCopied, setLogCopied] = useState(false);

  const autoLogText = () =>
    [...autoWarnings.map((w) => `⚠ ${w}`), ...autoLog].join("\n");

  const downloadAutoLog = () => {
    const blob = new Blob([autoLogText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auto-fill-log-${gameDate.slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return ReactDOM.createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(40,35,25,.45)", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", border: "1px solid #e7e4dc", borderRadius: 14, width: "100%", maxWidth: 680, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 18px 50px rgba(40,35,25,.3)", fontFamily: "var(--font-hanken),'Hanken Grotesk',sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid #e7e4dc", flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#211f1b" }}>Auto-fill Log</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                navigator.clipboard.writeText(autoLogText()).then(() => {
                  setLogCopied(true);
                  setTimeout(() => setLogCopied(false), 2000);
                });
              }}
              style={{ padding: "4px 12px", fontSize: 12, fontWeight: 600, borderRadius: 7, border: "1px solid #d6d2c8", background: "#faf8f3", color: "#57534a", cursor: "pointer", fontFamily: "inherit" }}
            >
              {logCopied ? "✓ Copied!" : "Copy all"}
            </button>
            <button
              onClick={downloadAutoLog}
              style={{ padding: "4px 12px", fontSize: 12, fontWeight: 600, borderRadius: 7, border: "1px solid #d6d2c8", background: "#faf8f3", color: "#57534a", cursor: "pointer", fontFamily: "inherit" }}
            >
              ⬇ Download .txt
            </button>
            <button
              onClick={onClose}
              style={{ padding: "4px 12px", fontSize: 12, fontWeight: 600, borderRadius: 7, border: "1px solid #d6d2c8", background: "#faf8f3", color: "#57534a", cursor: "pointer", fontFamily: "inherit" }}
            >
              ✕ Close
            </button>
          </div>
        </div>
        <div style={{ overflowY: "auto", padding: "14px 18px", fontFamily: "var(--font-ibm-mono),'IBM Plex Mono',monospace", fontSize: 12, lineHeight: 1.6 }}>
          {autoWarnings.map((w, i) => (
            <div key={`w${i}`} style={{ color: "#b45309" }}>⚠ {w}</div>
          ))}
          {autoWarnings.length > 0 && (
            <div style={{ color: "#e7e4dc", margin: "8px 0" }}>{"─".repeat(40)}</div>
          )}
          {autoLog.map((line, i) => {
            const isInnHeader = line.startsWith("──");
            const isTopHeader = line.startsWith("Auto-fill:");
            const isWarningLine = line.includes("⚠") || line.startsWith("  Force-bench:");
            const isDeepIndent = line.startsWith("      ");
            const isIndent = line.startsWith("    ") && !isDeepIndent;
            return (
              <div
                key={i}
                style={{
                  whiteSpace: "pre-wrap",
                  ...(isTopHeader
                    ? { color: "#6f6a60", marginBottom: 8 }
                    : isInnHeader
                    ? { color: "#211f1b", fontWeight: 700, marginTop: 12, marginBottom: 2 }
                    : isWarningLine
                    ? { color: "#b45309" }
                    : isDeepIndent
                    ? { color: "#a09a8e" }
                    : isIndent
                    ? { color: "#6f6a60" }
                    : { color: "#44403a" }),
                }}
              >
                {line}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
