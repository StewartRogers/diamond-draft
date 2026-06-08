"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDiamondDraftStore } from "@/lib/store";
import type { Game } from "@/lib/types";

// ─── Color tokens ──────────────────────────────────────────────────────────────

export const C = {
  bg: "#efece6", card: "#fff", sub: "#fcfbf8", sub2: "#faf8f3",
  ink: "#211f1b", muted: "#6f6a60", faint: "#a09a8e", faint2: "#bdb8ad",
  line: "#e7e4dc", line2: "#eeece5", rule: "#d9d5cb",
  green: "#3f6212", greenBg: "#eef1e3", greenBd: "#dbe3c6",
  red: "#9a3412", redBg: "#f6e7df", redBd: "#eccfc0",
  amber: "#a16207", amberBg: "#f8f0db", amberBd: "#ecdcb6",
  blue: "#345d86", blueBg: "#eef2f6", blueBd: "#dbe4ec",
};

export const ZONE_PAL = {
  bat: { bg: "#f7eed7", fg: "#9a6712" },
  inf: { bg: "#ecf0e1", fg: "#3f6212" },
  out: { bg: "#e7eef4", fg: "#345d86" },
};

const ZONE: Record<string, "bat" | "inf" | "out"> = {
  P: "bat", C: "bat",
  "1B": "inf", "2B": "inf", "3B": "inf", SS: "inf",
  LF: "out", CF: "out", RF: "out",
};

// ─── Primitives ────────────────────────────────────────────────────────────────

export function Pill({
  fg, bg, bd, children,
}: { fg: string; bg: string; bd: string; children: React.ReactNode }) {
  return (
    <span className="dd-pill" style={{ color: fg, background: bg, borderColor: bd }}>
      {children}
    </span>
  );
}

export function Jersey({ num, size = 28 }: { num: string; size?: number }) {
  return (
    <span
      className="dd-jersey"
      style={{
        minWidth: size, height: size,
        fontSize: size * 0.43, padding: "0 5px",
      }}
    >
      {num}
    </span>
  );
}

export function ZChips({ positions }: { positions: string[] }) {
  const fieldOnly = positions.filter((p) => ZONE[p]);
  return (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
      {fieldOnly.map((p) => {
        const z = ZONE_PAL[ZONE[p]];
        return (
          <span key={p} className="dd-zchip" style={{ background: z.bg, color: z.fg }}>
            {p}
          </span>
        );
      })}
    </span>
  );
}

// ─── Page header ───────────────────────────────────────────────────────────────

export function PageHeader({
  eyebrow, title, subtitle, action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        flexWrap: "wrap", gap: 16, marginBottom: 26,
      }}
    >
      <div>
        {eyebrow && <div className="dd-eyebrow" style={{ marginBottom: 8 }}>{eyebrow}</div>}
        <h1
          style={{
            fontSize: 30, fontWeight: 800, letterSpacing: "-.02em",
            margin: 0, color: C.ink,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 14.5, color: C.muted, margin: "5px 0 0" }}>{subtitle}</p>
        )}
      </div>
      {action && <div style={{ display: "flex", gap: 10 }}>{action}</div>}
    </div>
  );
}

// ─── Game Row ─────────────────────────────────────────────────────────────────

function parseDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDate().toString().padStart(2, "0");
  const mon = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  return { day, mon };
}

export function DeleteGameModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const deleteGame = useDiamondDraftStore((s) => s.deleteGame);
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const label = game.opponent ? `vs ${game.opponent}` : game.date;
  const confirm = "DELETE";

  async function handleDelete() {
    if (code !== confirm) return;
    setLoading(true);
    try {
      await deleteGame(game.id);
      onClose();
      router.push("/games");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dd-scrim" onClick={onClose}>
      <div className="dd-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "22px 26px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center" }}>
          <div>
            <div className="dd-eyebrow" style={{ color: C.red }}>Delete game</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{label}</div>
          </div>
          <button className="dd-btn ghost sm" style={{ marginLeft: "auto", padding: "0 8px" }} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={C.muted} strokeWidth="1.7" strokeLinecap="round">
              <path d="M4 4l10 10M14 4L4 14"/>
            </svg>
          </button>
        </div>
        <div style={{ padding: "24px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: C.redBg, border: `1px solid ${C.redBd}`, borderRadius: 10, padding: "12px 14px", fontSize: 13.5, color: C.red }}>
            This will permanently delete the lineup and all assignments. This cannot be undone.
          </div>
          <div className="dd-field">
            <label>Type <strong>DELETE</strong> to confirm</label>
            <input
              className="dd-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="DELETE"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && code === confirm) handleDelete(); }}
            />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "18px 26px", borderTop: `1px solid ${C.line}`, background: C.sub }}>
          <button className="dd-btn sec" onClick={onClose}>Cancel</button>
          <button
            className="dd-btn pri"
            style={code === confirm ? { background: C.red, borderColor: C.red } : {}}
            onClick={handleDelete}
            disabled={code !== confirm || loading}
          >
            {loading ? "Deleting…" : "Delete game"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function GameRow({ game }: { game: Game }) {
  const { day, mon } = parseDate(game.date);
  const [showDelete, setShowDelete] = useState(false);
  const statusPill =
    game.status === "finalized"
      ? { t: "Finalized", fg: C.green, bg: C.greenBg, bd: C.greenBd }
      : { t: "Draft", fg: C.amber, bg: C.amberBg, bd: C.amberBd };

  return (
    <>
      <div style={{ position: "relative" }}>
        <Link href={`/games/${game.id}`} className="dd-listrow" style={{ paddingRight: 52 }}>
          {/* Date chip */}
          <div
            style={{
              width: 52, height: 52, borderRadius: 12,
              background: C.greenBg, border: `1px solid ${C.greenBd}`,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: C.green, lineHeight: 1 }}>
              {day}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600, color: C.faint, letterSpacing: ".05em", marginTop: 1 }}>
              {mon}
            </span>
          </div>

          {/* Info */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {game.opponent ? `vs ${game.opponent}` : game.date}
              </span>
            </div>
            <div style={{ fontSize: 13, color: C.faint, marginTop: 3, whiteSpace: "nowrap" }}>
              {game.innings.length} innings · {game.rosterSnapshot.length} players
            </div>
          </div>

          {/* Status + chevron */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Pill fg={statusPill.fg} bg={statusPill.bg} bd={statusPill.bd}>
              {statusPill.t}
            </Pill>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={C.faint2} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 4l5 5-5 5"/>
            </svg>
          </div>
        </Link>

        {/* Delete button — overlaid so it doesn't inherit the link */}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDelete(true); }}
          title="Delete game"
          style={{
            position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
            width: 32, height: 32, borderRadius: 8,
            background: "transparent", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: C.faint,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = C.redBg)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 5h12M8 5V3h2v2M6 5l.5 10h5L12 5"/>
          </svg>
        </button>
      </div>

      {showDelete && <DeleteGameModal game={game} onClose={() => setShowDelete(false)} />}
    </>
  );
}

// ─── FitCard (ResizeObserver scale-to-fit) ────────────────────────────────────

export function FitCard({ width = 1320, children }: { width?: number; children: React.ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const fit = () => {
      if (!boxRef.current || !innerRef.current) return;
      const s = Math.min(1, boxRef.current.clientWidth / width);
      setScale(s);
      setHeight(innerRef.current.offsetHeight * s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (boxRef.current) ro.observe(boxRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div
      ref={boxRef}
      style={{ width: "100%", height: height == null ? "auto" : height, overflow: "visible" }}
    >
      <div
        ref={innerRef}
        style={{
          width,
          transformOrigin: "top center",
          transform: `scale(${scale})`,
          margin: "0 auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── New Game Modal ────────────────────────────────────────────────────────────

export function NewGameModal({ onClose }: { onClose: () => void }) {
  const createGame = useDiamondDraftStore((s) => s.createGame);
  const setPlayerOverride = useDiamondDraftStore((s) => s.setPlayerOverride);
  const defaultTeamName = useDiamondDraftStore((s) => s.settings.teamName);
  const defaultInnings = useDiamondDraftStore((s) => s.settings.leagueRules.defaultInnings);
  const players = useDiamondDraftStore((s) => s.players);

  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("10:00 AM");
  const [innings, setInnings] = useState(defaultInnings ?? 7);
  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function toggleAbsent(id: string) {
    setAbsentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    setLoading(true);
    try {
      const game = await createGame(
        { date, opponent, teamName: defaultTeamName, notes: time },
        innings
      );
      for (const playerId of absentIds) {
        await setPlayerOverride(game.id, { playerId, status: "absent" });
      }
      onClose();
      router.push(`/games/${game.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dd-scrim" onClick={onClose}>
      <div className="dd-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          style={{
            padding: "22px 26px", borderBottom: `1px solid ${C.line}`,
            display: "flex", alignItems: "center",
          }}
        >
          <div>
            <div className="dd-eyebrow">New game</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>Set up the matchup</div>
          </div>
          <button
            className="dd-btn ghost sm"
            style={{ marginLeft: "auto", padding: "0 8px" }}
            onClick={onClose}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={C.muted} strokeWidth="1.7" strokeLinecap="round">
              <path d="M4 4l10 10M14 4L4 14"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "24px 26px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="dd-field">
            <label>Opponent</label>
            <input
              className="dd-input"
              placeholder="e.g. Riverside Rockets"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="dd-field">
              <label>Date</label>
              <input
                className="dd-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="dd-field">
              <label>First pitch</label>
              <input
                className="dd-input"
                type="text"
                placeholder="10:00 AM"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <div className="dd-field">
            <label>Innings</label>
            <div className="dd-seg" style={{ alignSelf: "flex-start" }}>
              {[6, 7, 9].map((n) => (
                <button
                  key={n}
                  className={innings === n ? "on" : ""}
                  onClick={() => setInnings(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {/* Absent players */}
          <div className="dd-field">
            <label>Who&rsquo;s absent today? <span style={{ fontWeight: 400, color: C.faint }}>(optional)</span></label>
            <div
              style={{
                border: `1px solid ${C.line}`, borderRadius: 10,
                maxHeight: 180, overflowY: "auto",
              }}
            >
              {players.map((p, i) => (
                <label
                  key={p.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 13px",
                    borderTop: i > 0 ? `1px solid ${C.line2}` : undefined,
                    cursor: "pointer",
                    background: absentIds.has(p.id) ? C.amberBg : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={absentIds.has(p.id)}
                    onChange={() => toggleAbsent(p.id)}
                    style={{ accentColor: C.amber, width: 15, height: 15, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 13.5, color: absentIds.has(p.id) ? C.amber : C.ink }}>
                    #{p.jerseyNumber} {p.firstName} {p.lastInitial}.
                  </span>
                </label>
              ))}
            </div>
            {absentIds.size > 0 && (
              <div style={{ fontSize: 12.5, color: C.amber, marginTop: 5 }}>
                {absentIds.size} player{absentIds.size !== 1 ? "s" : ""} marked absent
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex", justifyContent: "flex-end", gap: 10,
            padding: "18px 26px", borderTop: `1px solid ${C.line}`,
            background: C.sub,
          }}
        >
          <button className="dd-btn sec" onClick={onClose}>Cancel</button>
          <button className="dd-btn pri" onClick={handleCreate} disabled={loading}>
            {loading ? "Creating…" : "Create & build lineup"}
          </button>
        </div>
      </div>
    </div>
  );
}
