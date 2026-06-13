"use client";

import { useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import type { Player } from "@/lib/types";
import type { CellValue, EditDescriptor, FieldPos, Schedule } from "./shared";
import { FIELD_POS_MAP, isField, fmtName } from "./shared";

/** Close on outside pointer-down or Escape. */
function useDismiss(ref: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const off = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", off, true);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off, true); document.removeEventListener("keydown", esc); };
  }, [ref, onClose]);
}

/** Keep a W×H popover inside the viewport, flipping above the anchor if needed. */
function popoverPosition(rect: EditDescriptor["rect"], W: number, H: number) {
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - W - 12));
  let top = rect.bottom + 6;
  if (top + H > window.innerHeight - 12) top = Math.max(12, rect.top - H - 6);
  return { left, top };
}

export function CellPopover({
  target, schedule, batting, players, onAssign, onClose,
}: {
  target: Extract<EditDescriptor, { kind: "cell" }>;
  schedule: Schedule; batting: string[];
  players: Player[];
  onAssign: (id: string, inn: number, pos: CellValue) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { id, inn, rect } = target;
  const player = players.find((p) => p.id === id)!;
  const cur = schedule[id]?.[inn];
  const eligField = player.eligiblePositions.filter((p) => isField(p)) as FieldPos[];

  useDismiss(ref, onClose);
  const { left, top } = popoverPosition(rect, 248, 260);

  const occupantFor = (pos: FieldPos) => {
    const occ = batting.find((x) => x !== id && schedule[x]?.[inn] === pos);
    return occ ? players.find((p) => p.id === occ)?.jerseyNumber ?? null : null;
  };

  return ReactDOM.createPortal(
    <div className="ddpop" ref={ref} style={{ left, top }}>
      <div className="head">
        <span className="who">{fmtName(player)} · #{player.jerseyNumber}</span>
        <span className="inn">INN {inn + 1}</span>
      </div>
      <div className="lbl">Eligible positions</div>
      <div className="grid">
        {eligField.map((pos) => {
          const tk = occupantFor(pos);
          return (
            <button key={pos} className={"opt" + (cur === pos ? " on" : "")} onClick={() => onAssign(id, inn, pos)}>
              {pos}
              {tk && cur !== pos && <span className="taken">#{tk}</span>}
            </button>
          );
        })}
      </div>
      <button className={"bench" + (cur === "BENCH" ? " on" : "")} onClick={() => onAssign(id, inn, "BENCH")}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M2 5h10M2 5v4M12 5v4M4 9v2M10 9v2" strokeLinecap="round"/>
        </svg>
        Bench this inning
      </button>
      <button className={"bench" + (cur === "BULLPEN" ? " on" : "")} onClick={() => onAssign(id, inn, "BULLPEN")}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="7" cy="5" r="2.5"/><path d="M4 13c0-1.657 1.343-3 3-3s3 1.343 3 3" strokeLinecap="round"/>
        </svg>
        Bullpen this inning
      </button>
    </div>,
    document.body
  );
}

export function PositionPopover({
  target, schedule, batting, players, onAssign, onClose,
}: {
  target: Extract<EditDescriptor, { kind: "pos" }>;
  schedule: Schedule; batting: string[];
  players: Player[];
  onAssign: (id: string, inn: number, pos: CellValue) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { pos, inn, rect } = target;
  const meta = FIELD_POS_MAP[pos];

  useDismiss(ref, onClose);
  const W = 250;
  const { left, top } = popoverPosition(rect, W, 300);

  const cands = batting.filter((id) => {
    const p = players.find((pl) => pl.id === id);
    return p?.eligiblePositions.some((ep) => ep === pos);
  });

  const label = (id: string) => {
    const v = schedule[id]?.[inn];
    if (v === pos) return "on field";
    if (isField(v)) return "now " + v;
    if (v === "BENCH") return "on bench";
    return v ? v.charAt(0) + v.slice(1).toLowerCase() : "";
  };

  return ReactDOM.createPortal(
    <div className="ddpop" ref={ref} style={{ left, top, width: W }}>
      <div className="head"><span className="who">{meta.name}</span><span className="inn">INN {inn + 1}</span></div>
      <div className="lbl">Eligible players</div>
      <div className="list">
        {cands.map((id) => {
          const p = players.find((pl) => pl.id === id)!;
          const here = schedule[id]?.[inn] === pos;
          return (
            <button key={id} className={"prow" + (here ? " on" : "")} onClick={() => onAssign(id, inn, pos)}>
              <span className="pj">{p.jerseyNumber}</span>
              <span className="pn">{fmtName(p)}</span>
              <span className="ps">{label(id)}</span>
            </button>
          );
        })}
        {cands.length === 0 && (
          <div style={{ padding: "10px 8px", fontSize: 12.5, color: "#a09a8e" }}>
            No eligible players in the lineup.
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
