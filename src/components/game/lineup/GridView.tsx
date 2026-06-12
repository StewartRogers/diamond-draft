"use client";

import type { Player } from "@/lib/types";
import type { CellValue, SortMode, ViewMode } from "./shared";
import { PAL, WORD, ZONE, isField, fmtName } from "./shared";

function Cell({
  v, editing, onClick,
}: { v: CellValue; editing: boolean; onClick?: (e: React.MouseEvent) => void }) {
  let bg: string;
  let body: React.ReactNode;
  if (isField(v)) {
    const z = PAL[ZONE[v]];
    bg = z.bg;
    body = <span className="pcode" style={{ color: z.fg }}>{v}</span>;
  } else {
    const m = WORD[v];
    bg = m.bg;
    body = (
      <span className="pword" style={{ color: m.fg, fontStyle: v === "ABSENT" ? "normal" : "italic" }}>
        {m.t}
      </span>
    );
  }
  const ed = isField(v) || v === "BENCH" || v === "BULLPEN";
  const title = isField(v) ? "Click to bench" : (v === "BENCH" || v === "BULLPEN") ? "Click to assign position" : undefined;
  return (
    <td className="inncol" style={{ background: bg, padding: 0 }}>
      <div
        className={"cell" + (ed ? " edit" : "") + (editing ? " open" : "")}
        onClick={ed ? onClick : undefined}
        title={title}
      >
        {body}
      </div>
    </td>
  );
}

function PlayerRow({
  id, player, slot, sched, scratched, showGrip, onGrip, editKey, onCell,
}: {
  id: string; player: Player; slot: number; sched: CellValue[];
  scratched: boolean; showGrip: boolean;
  onGrip: (e: React.PointerEvent, id: string) => void;
  editKey: string | null;
  onCell: (e: React.MouseEvent, id: string, inn: number) => void;
}) {
  const benchCount = sched.filter((v) => v === "BENCH" || v === "BULLPEN").length;
  const benchColor = benchCount === 0 ? "#c8c4bb" : benchCount >= 3 ? "#c2410c" : benchCount >= 2 ? "#ca8a04" : "#211f1b";

  return (
    <tr data-rid={id} style={{ opacity: scratched ? 0.55 : 1 }}>
      <td className="colbat" style={{ background: scratched ? "#f4f2ec" : "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
          {showGrip && !scratched && (
            <span className="grip" onPointerDown={(e) => onGrip(e, id)} title="Drag to reorder batting">
              <i /><i /><i />
            </span>
          )}
          <span className="batnum" style={{ color: scratched ? "#bdb8ad" : "#211f1b" }}>
            {scratched ? "—" : slot}
          </span>
        </div>
      </td>
      <td className="colplayer" style={{ textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px" }}>
          <span className="jersey" style={scratched ? { background: "#efede6", color: "#a8a39a" } : undefined}>
            {player.jerseyNumber}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="ptip" style={{ fontSize: 14, fontWeight: 700, textDecoration: scratched ? "line-through" : "none" }}>
              {fmtName(player)}
              <span className="tip">
                Can play:{" "}
                <b>{player.eligiblePositions.filter((p) => isField(p)).join(" · ")}</b>
              </span>
            </span>
            {player.isGuest && (
              <span style={{ fontFamily: "var(--font-ibm-mono),'IBM Plex Mono',monospace", fontSize: 9, fontWeight: 600, color: "#a16207", background: "#f8f0db", border: "1px solid #ecdcb6", borderRadius: 4, padding: "1px 4px" }}>
                +1
              </span>
            )}
            {scratched && (
              <span style={{ fontFamily: "var(--font-ibm-mono),'IBM Plex Mono',monospace", fontSize: 9.5, fontWeight: 600, color: "#9a3412", background: "#f6e7df", borderRadius: 4, padding: "1px 5px", letterSpacing: ".04em" }}>
                SCRATCHED
              </span>
            )}
          </div>
        </div>
      </td>
      {sched.map((v, i) => (
        <Cell
          key={i} v={v}
          editing={editKey === id + ":" + i}
          onClick={(e) => onCell(e, id, i)}
        />
      ))}
      {/* Bench count */}
      <td className="colbench" title={`${benchCount} bench inning${benchCount !== 1 ? "s" : ""}`}>
        <span style={{ fontFamily: "var(--font-ibm-mono),'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 700, color: benchColor }}>
          {benchCount}
        </span>
      </td>
    </tr>
  );
}

export function SortSeg({ sort, setSort }: { sort: SortMode; setSort: (s: SortMode) => void }) {
  const opts: [SortMode, string][] = [["bat", "Batting order"], ["jersey", "Jersey #"], ["name", "First name"]];
  return (
    <div style={{ display: "inline-flex", background: "#f1efe8", border: "1px solid #e3e0d8", borderRadius: 9, padding: 3 }}>
      {opts.map(([k, label]) => {
        const on = sort === k;
        return (
          <span key={k} onClick={() => setSort(k)} style={{
            fontSize: 12.5, fontWeight: 600, padding: "5px 11px", borderRadius: 7, cursor: "pointer",
            background: on ? "#fff" : "transparent", color: on ? "#3f6212" : "#7c776c",
            boxShadow: on ? "0 1px 2px rgba(40,35,25,.08)" : "none",
          }}>
            {label}
          </span>
        );
      })}
    </div>
  );
}

export function ViewToggle({ view, setView }: { view: ViewMode; setView: (v: ViewMode) => void }) {
  return (
    <div className="vtog">
      <button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="1.5" y="1.5" width="11" height="11" rx="1.5"/>
          <path d="M1.5 5.2h11M1.5 8.8h11M5.2 1.5v11M8.8 1.5v11"/>
        </svg>
        Grid
      </button>
      <button className={view === "field" ? "on" : ""} onClick={() => setView("field")}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
          <path d="M7 1.6l5.4 5.4L7 12.4 1.6 7z"/>
        </svg>
        Field
      </button>
    </div>
  );
}

export function InningStepper({ inning, numInnings, setInning }: { inning: number; numInnings: number; setInning: (i: number) => void }) {
  const innings = Array.from({ length: numInnings }, (_, i) => i);
  return (
    <div className="innstep">
      <button className="ib arrow" onClick={() => setInning(Math.max(0, inning - 1))} title="Previous inning">‹</button>
      {innings.map((i) => (
        <button key={i} className={"ib" + (i === inning ? " on" : "")} onClick={() => setInning(i)}>{i + 1}</button>
      ))}
      <button className="ib arrow" onClick={() => setInning(Math.min(numInnings - 1, inning + 1))} title="Next inning">›</button>
    </div>
  );
}

export function GridView({
  rows, byId, battingSlot, schedule, numInnings, scratchedIds, sort,
  onGrip, editKey, onCell, onFieldPerInning,
}: {
  rows: string[];
  byId: Record<string, Player>;
  battingSlot: (id: string) => number;
  schedule: Record<string, CellValue[]>;
  numInnings: number;
  scratchedIds: string[];
  sort: SortMode;
  onGrip: (e: React.PointerEvent, id: string) => void;
  editKey: string | null;
  onCell: (e: React.MouseEvent, id: string, inn: number) => void;
  onFieldPerInning: number[];
}) {
  const INN = Array.from({ length: numInnings }, (_, i) => i);
  return (
    <table>
      <colgroup>
        <col className="colbat" /><col className="colplayer" />
        {INN.map((n) => <col key={n} />)}
        <col className="colbench" />
      </colgroup>
      <thead>
        <tr>
          <th className={"colbat" + (sort === "bat" ? " sorted" : "")}>BAT</th>
          <th className="colplayer" style={{ textAlign: "left", paddingLeft: 14 }}>PLAYER</th>
          {INN.map((i) => <th key={i} className="inncol">Inn {i + 1}</th>)}
          <th className="colbench" title="Total bench innings">🪑</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((id) => {
          const player = byId[id];
          if (!player) return null;
          return (
            <PlayerRow
              key={id} id={id} player={player}
              slot={battingSlot(id)}
              sched={schedule[id] ?? Array(numInnings).fill("BENCH")}
              scratched={scratchedIds.includes(id)}
              showGrip={sort === "bat"}
              onGrip={onGrip}
              editKey={editKey}
              onCell={onCell}
            />
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td className="colbat" />
          <td className="colplayer" style={{ textAlign: "right", paddingRight: 14, letterSpacing: ".04em" }}>ON FIELD →</td>
          {onFieldPerInning.map((n, i) => (
            <td key={i} className="inncol" style={{ color: n === 9 ? "#3f6212" : "#9a3412", fontWeight: 600 }}>
              {n}<span style={{ color: "#b3aea3" }}>/9</span>
            </td>
          ))}
          <td className="colbench" />
        </tr>
      </tfoot>
    </table>
  );
}
