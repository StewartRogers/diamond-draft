"use client";

import type { Player } from "@/lib/types";
import type { FieldPos, Schedule } from "./shared";
import { FIELD_ORDER, FIELD_POS_MAP, FIELD_T, PAL, ZONE, isField, fmtName } from "./shared";

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
      <path d={dpath([[500,690],[640,560],[500,430],[360,560]])} fill={t.grass} opacity={t.basePathInner} />
      <path d={dpath([[500,690],[640,560],[500,430],[360,560]])} fill="none" stroke={t.line} strokeWidth="3" />
      {([first, second, third] as [number, number][]).map((b, i) => (
        <rect key={i} x={b[0]-13} y={b[1]-13} width="26" height="26" fill={t.base} stroke={t.infieldEdge} strokeWidth="2" transform={`rotate(45 ${b[0]} ${b[1]})`} />
      ))}
      <path d={`M${home[0]-14},${home[1]-12} L${home[0]+14},${home[1]-12} L${home[0]+14},${home[1]+4} L${home[0]},${home[1]+18} L${home[0]-14},${home[1]+4} Z`} fill={t.base} stroke={t.infieldEdge} strokeWidth="2" />
      <circle cx={mound[0]} cy={mound[1]} r="34" fill={t.infield} stroke={t.infieldEdge} strokeWidth="3" />
      <rect x={mound[0]-12} y={mound[1]-4} width="24" height="8" rx="2" fill={t.base} />
    </svg>
  );
}

function PosChip({ pos, playerId, player, onBench, onEmpty }: {
  pos: FieldPos; playerId: string | null; player: Player | null;
  onBench: () => void;
  onEmpty: (e: React.MouseEvent) => void;
}) {
  const z = PAL[ZONE[pos]];
  if (!playerId || !player) {
    return (
      <button className="ddchip empty" onClick={onEmpty}>
        <span className="cc" style={{ color: "#8a936a" }}>{pos}</span>
        <span className="cn">+ open</span>
      </button>
    );
  }
  return (
    <button className="ddchip" onClick={onBench} title="Click to bench this player" style={{ background: z.bg, border: `1px solid ${z.fg}2e` }}>
      <span className="cc" style={{ color: z.fg }}>{pos} · #{player.jerseyNumber}</span>
      <span className="cn">{fmtName(player)}</span>
    </button>
  );
}

function RosterSection({
  title, ids, players, onPick,
}: {
  title: string; ids: string[]; players: Player[];
  onPick?: ((e: React.MouseEvent, id: string) => void) | null;
}) {
  if (!ids.length) return null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0 2px 8px" }}>
        <span style={{ fontFamily: "var(--font-ibm-mono),'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 600, letterSpacing: ".07em", textTransform: "uppercase", color: "#8d877a" }}>{title}</span>
        <span style={{ fontSize: 11, color: "#bdb8ad" }}>{ids.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {ids.map((id) => {
          const p = players.find((pl) => pl.id === id);
          if (!p) return null;
          return (
            <button key={id} className={"ddros" + (onPick ? "" : " static")} onClick={onPick ? (e) => onPick(e, id) : undefined}>
              <span className="jersey">{p.jerseyNumber}</span>
              <span className="rn">{fmtName(p)}</span>
              <span className="re">{p.eligiblePositions.filter(isField).join(" · ")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FieldView({
  schedule, batting, players, inning, onCellEdit, onPosEdit, onDirectBench,
}: {
  schedule: Schedule; batting: string[]; players: Player[];
  inning: number;
  onCellEdit: (e: React.MouseEvent, id: string, inn: number) => void;
  onPosEdit: (e: React.MouseEvent, pos: FieldPos, inn: number) => void;
  onDirectBench: (id: string, inn: number) => void;
}) {
  const byPos: Partial<Record<FieldPos, string>> = {};
  const bench: string[] = [], late: string[] = [], out: string[] = [];
  for (const id of batting) {
    const v = schedule[id]?.[inning];
    if (!v) continue;
    if (isField(v)) byPos[v] = id;
    else if (v === "BENCH") bench.push(id);
    else if (v === "LATE") late.push(id);
    else if (v === "OUT") out.push(id);
  }
  const onF = FIELD_ORDER.filter((p) => byPos[p]).length;

  return (
    <div className="ddfield">
      <div style={{ flex: "0 0 568px" }}>
        <div style={{ position: "relative", width: 568, aspectRatio: "1000 / 880" }}>
          <FieldSVG />
          {FIELD_ORDER.map((pos) => {
            const meta = FIELD_POS_MAP[pos];
            const pid = byPos[pos] ?? null;
            const player = pid ? players.find((p) => p.id === pid) ?? null : null;
            return (
              <div key={pos} style={{ position: "absolute", left: meta.x + "%", top: meta.y + "%", transform: "translate(-50%,-50%)", width: "max-content" }}>
                <PosChip
                  pos={pos} playerId={pid} player={player}
                  onBench={() => onDirectBench(pid!, inning)}
                  onEmpty={(e) => onPosEdit(e, pos, inning)}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 18, paddingTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #ece9e1", paddingBottom: 14 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.01em" }}>Inning {inning + 1}</div>
            <div style={{ fontSize: 12.5, color: "#a09a8e", marginTop: 2 }}>Tap a filled position to bench · tap bench player to assign</div>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "var(--font-ibm-mono),'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 600, color: onF === 9 ? "#3f6212" : "#9a3412", background: onF === 9 ? "#eef1e3" : "#f6e7df", border: `1px solid ${onF === 9 ? "#dbe3c6" : "#eccfc0"}`, borderRadius: 999, padding: "6px 13px" }}>
            {onF}<span style={{ opacity: 0.5 }}>/9</span> on the field
          </span>
        </div>
        <RosterSection title="On the bench" ids={bench} players={players}
          onPick={bench.length ? (e, id) => onCellEdit(e, id, inning) : null} />
        {bench.length === 0 && late.length === 0 && out.length === 0 && (
          <div style={{ fontSize: 13, color: "#a09a8e" }}>Everyone available is on the field this inning.</div>
        )}
        <RosterSection title="Arriving late" ids={late} players={players} />
        <RosterSection title="Out / left game" ids={out} players={players} />
      </div>
    </div>
  );
}
