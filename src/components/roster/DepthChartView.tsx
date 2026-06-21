"use client";

import { useState } from "react";
import type { Player } from "@/lib/types";
import { useDiamondDraftStore } from "@/lib/store";
import {
  FIELD_ORDER,
  FIELD_POS_MAP,
  PAL,
  ZONE,
  FIELD_T,
  fmtName,
  type FieldPos,
} from "@/components/game/lineup/shared";

// Depth chart covers every field position except pitcher.
const DEPTH_POSITIONS: FieldPos[] = FIELD_ORDER.filter((p) => p !== "P");

// ─── Grass diamond (mirrors the lineup FieldView) ───────────────────────────────

function FieldSVG() {
  const t = FIELD_T;
  const home: [number, number] = [500, 740];
  const first: [number, number] = [690, 560];
  const second: [number, number] = [500, 380];
  const third: [number, number] = [310, 560];
  const mound: [number, number] = [500, 560];
  const polY = 230, polL = 70, polR = 930;
  const dpath = (pts: [number, number][]) => "M" + pts.map((p) => p.join(",")).join("L") + "Z";
  return (
    <svg
      viewBox="0 0 1000 880"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x="0" y="0" width="1000" height="880" rx={t.fieldRadius} fill={t.grass} />
      <path d={`M${polL},${polY} Q500,-150 ${polR},${polY} L${second[0]},${second[1]} Z`} fill={t.grassDark} opacity={t.grassArcOpacity} />
      <line x1={home[0]} y1={home[1]} x2={polL} y2={polY} stroke={t.line} strokeWidth="4" />
      <line x1={home[0]} y1={home[1]} x2={polR} y2={polY} stroke={t.line} strokeWidth="4" />
      <path d={`M${polL},${polY} Q500,-130 ${polR},${polY}`} fill="none" stroke={t.line} strokeWidth="4" strokeDasharray={t.fenceDash} opacity="0.8" />
      <path d={dpath([home, first, second, third])} fill={t.infield} stroke={t.infieldEdge} strokeWidth="3" />
      <path d={dpath([[500, 690], [640, 560], [500, 430], [360, 560]])} fill={t.grass} opacity={t.basePathInner} />
      <path d={dpath([[500, 690], [640, 560], [500, 430], [360, 560]])} fill="none" stroke={t.line} strokeWidth="3" />
      {([first, second, third] as [number, number][]).map((b, i) => (
        <rect key={i} x={b[0] - 13} y={b[1] - 13} width="26" height="26" fill={t.base} stroke={t.infieldEdge} strokeWidth="2" transform={`rotate(45 ${b[0]} ${b[1]})`} />
      ))}
      <path d={`M${home[0] - 14},${home[1] - 12} L${home[0] + 14},${home[1] - 12} L${home[0] + 14},${home[1] + 4} L${home[0]},${home[1] + 18} L${home[0] - 14},${home[1] + 4} Z`} fill={t.base} stroke={t.infieldEdge} strokeWidth="2" />
      <circle cx={mound[0]} cy={mound[1]} r="34" fill={t.infield} stroke={t.infieldEdge} strokeWidth="3" />
      <rect x={mound[0] - 12} y={mound[1] - 4} width="24" height="8" rx="2" fill={t.base} />
    </svg>
  );
}

// ─── A single position box ──────────────────────────────────────────────────────

function PositionBox({
  pos,
  ordered,
  available,
  onReorder,
  onAdd,
  onRemove,
}: {
  pos: FieldPos;
  ordered: Player[];
  available: Player[];
  onReorder: (ids: string[]) => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const z = PAL[ZONE[pos]];
  const [adding, setAdding] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const ids = ordered.map((p) => p.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(targetIndex, 0, moved);
    onReorder(ids);
    setDragIndex(null);
  }

  // Touch-friendly reorder (HTML5 drag-and-drop doesn't fire on iOS touch).
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= ordered.length) return;
    const ids = ordered.map((p) => p.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    onReorder(ids);
  }

  return (
    <div
      style={{
        width: 156,
        background: "#fbf7ec",
        border: `1.5px solid ${z.fg}`,
        borderRadius: 12,
        boxShadow: "0 3px 10px rgba(40,35,25,.16)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "6px 10px",
          background: z.bg,
          borderBottom: `1px solid ${z.fg}33`,
          textAlign: "center",
          fontSize: 13,
          fontWeight: 800,
          color: z.fg,
          letterSpacing: "-.01em",
        }}
      >
        {FIELD_POS_MAP[pos].name}
      </div>

      <div style={{ padding: "6px 6px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
        {ordered.length === 0 && !adding && (
          <div style={{ padding: "6px 4px", fontSize: 11.5, color: "#a8a293", textAlign: "center" }}>
            No players yet
          </div>
        )}

        {ordered.map((p, i) => (
          <div
            key={p.id}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(i)}
            title="Drag to reorder"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 6px",
              borderRadius: 7,
              background: i === 0 ? z.bg : "#fff",
              border: `1px solid ${i === 0 ? z.fg + "55" : "#ece9e1"}`,
              cursor: "grab",
              opacity: dragIndex === i ? 0.4 : 1,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-ibm-mono),'IBM Plex Mono',monospace",
                fontSize: 10,
                fontWeight: 700,
                color: i === 0 ? z.fg : "#a8a293",
                minWidth: 12,
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: i === 0 ? 700 : 600, color: "#211f1b", flex: 1, lineHeight: 1.15 }}>
              {fmtName(p)}
            </span>
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 0 }}>
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                title="Move up"
                aria-label="Move up"
                style={{ border: "none", background: "none", cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "#dcd8cd" : "#8a857a", fontSize: 9, lineHeight: 1, padding: "1px 3px" }}
              >
                ▲
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === ordered.length - 1}
                title="Move down"
                aria-label="Move down"
                style={{ border: "none", background: "none", cursor: i === ordered.length - 1 ? "default" : "pointer", color: i === ordered.length - 1 ? "#dcd8cd" : "#8a857a", fontSize: 9, lineHeight: 1, padding: "1px 3px" }}
              >
                ▼
              </button>
            </span>
            <button
              onClick={() => onRemove(p.id)}
              title="Remove from this position"
              aria-label="Remove from this position"
              style={{ border: "none", background: "none", cursor: "pointer", color: "#bdb8ad", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
            >
              ×
            </button>
          </div>
        ))}

        {adding ? (
          <div style={{ marginTop: 2, display: "flex", flexDirection: "column", gap: 2, maxHeight: 168, overflow: "auto" }}>
            {available.length === 0 ? (
              <div style={{ padding: "4px", fontSize: 11, color: "#a8a293", textAlign: "center" }}>
                Everyone is already listed.
              </div>
            ) : (
              available.map((p) => {
                const eligible = p.eligiblePositions.includes(pos);
                return (
                  <button
                    key={p.id}
                    onClick={() => { onAdd(p.id); setAdding(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, width: "100%",
                      padding: "4px 6px", borderRadius: 7, border: "1px solid #ece9e1",
                      background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-ibm-mono),'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 700, color: "#3f6212" }}>
                      #{p.jerseyNumber}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#211f1b", flex: 1 }}>{fmtName(p)}</span>
                    {!eligible && (
                      <span title="Not flagged eligible here" style={{ fontSize: 9, color: "#bdb8ad" }}>✕elig</span>
                    )}
                  </button>
                );
              })
            )}
            <button
              onClick={() => setAdding(false)}
              style={{ marginTop: 2, border: "none", background: "none", cursor: "pointer", fontSize: 11, color: "#a8a293", fontFamily: "inherit" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            style={{
              marginTop: 2, width: "100%", padding: "4px", borderRadius: 7,
              border: `1px dashed ${z.fg}66`, background: "transparent", cursor: "pointer",
              fontSize: 11.5, fontWeight: 600, color: z.fg, fontFamily: "inherit",
            }}
          >
            + Add player
          </button>
        )}
      </div>
    </div>
  );
}

// ─── The depth-chart field view ─────────────────────────────────────────────────

export default function DepthChartView({ seasonId, players }: { seasonId: string; players: Player[] }) {
  const seasons = useDiamondDraftStore((s) => s.seasons);
  const setDepthChartPosition = useDiamondDraftStore((s) => s.setDepthChartPosition);
  const season = seasons.find((s) => s.id === seasonId);

  if (!season) return null;

  const byId = new Map(players.map((p) => [p.id, p]));
  const rosterIds = new Set(players.map((p) => p.id));

  // Resolve each position's ordered list, skipping anyone no longer on the roster.
  const orderedByPos = (pos: FieldPos): Player[] =>
    (season.depthChart?.[pos] ?? [])
      .filter((id) => rosterIds.has(id))
      .map((id) => byId.get(id)!)
      .filter(Boolean);

  return (
    <div className="dd-card" style={{ padding: "20px 16px", overflowX: "auto" }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 860,
          minWidth: 640,
          margin: "0 auto",
          aspectRatio: "1000 / 880",
        }}
      >
        <FieldSVG />
        {DEPTH_POSITIONS.map((pos) => {
          const meta = FIELD_POS_MAP[pos];
          const ordered = orderedByPos(pos);
          const listed = new Set(ordered.map((p) => p.id));
          const available = players
            .filter((p) => !listed.has(p.id))
            .sort((a, b) => Number(a.jerseyNumber) - Number(b.jerseyNumber));
          return (
            <div
              key={pos}
              style={{
                position: "absolute",
                left: meta.x + "%",
                top: meta.y + "%",
                transform: "translate(-50%,-50%)",
              }}
            >
              <PositionBox
                pos={pos}
                ordered={ordered}
                available={available}
                onReorder={(ids) => setDepthChartPosition(seasonId, pos, ids)}
                onAdd={(id) => setDepthChartPosition(seasonId, pos, [...ordered.map((p) => p.id), id])}
                onRemove={(id) => setDepthChartPosition(seasonId, pos, ordered.map((p) => p.id).filter((x) => x !== id))}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
