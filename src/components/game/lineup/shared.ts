import type { Game, Player, InningAssignment, InningSlot } from "@/lib/types";

// ─── Design types ──────────────────────────────────────────────────────────────

export type FieldPos = "P" | "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF";
export type CellValue = FieldPos | "BENCH" | "BULLPEN" | "LATE" | "OUT" | "ABSENT";
export type Schedule = Record<string, CellValue[]>;
export type SortMode = "bat" | "jersey" | "name";
export type ViewMode = "grid" | "field";
export type PopoverRect = { left: number; right: number; top: number; bottom: number };
export type EditDescriptor =
  | { kind: "cell"; id: string; inn: number; rect: DOMRect | PopoverRect }
  | { kind: "pos"; pos: FieldPos; inn: number; rect: DOMRect | PopoverRect };

// ─── Design constants ──────────────────────────────────────────────────────────

export const FIELD_ORDER: FieldPos[] = ["LF", "CF", "RF", "3B", "SS", "2B", "1B", "P", "C"];

export const ZONE: Record<FieldPos, "bat" | "inf" | "out"> = {
  P: "bat", C: "bat",
  "1B": "inf", "2B": "inf", "3B": "inf", SS: "inf",
  LF: "out", CF: "out", RF: "out",
};

export const PAL = {
  bat: { bg: "#f7eed7", fg: "#9a6712" },
  inf: { bg: "#ecf0e1", fg: "#3f6212" },
  out: { bg: "#e7eef4", fg: "#345d86" },
};

export const WORD: Record<string, { bg: string; fg: string; t: string }> = {
  BENCH:   { bg: "#f1efe8", fg: "#938e80", t: "Bench" },
  BULLPEN: { bg: "#eef1e3", fg: "#5a7a3a", t: "Bullpen" },
  LATE:   { bg: "#f8f0db", fg: "#a16207", t: "Late" },
  OUT:    { bg: "#eae8e1", fg: "#9a958a", t: "Out" },
  ABSENT: { bg: "#f4f2ec", fg: "#bdb8ad", t: "—" },
};

export const FIELD_T = {
  fieldRadius: 20, grass: "#dde6cd", grassDark: "#d2dcbd", grassArcOpacity: 0.6,
  line: "#fbfaf6", fenceDash: "11 9", infield: "#e6d2ab", infieldEdge: "#d0b889",
  base: "#fdfbf5", basePathInner: 0.5,
};

export const FIELD_POS_MAP: Record<FieldPos, { x: number; y: number; name: string }> = {
  LF:  { x: 15, y: 23, name: "Left Field" },
  CF:  { x: 50, y: 12, name: "Center Field" },
  RF:  { x: 85, y: 23, name: "Right Field" },
  "3B":{ x: 20, y: 53, name: "Third Base" },
  SS:  { x: 36, y: 45, name: "Shortstop" },
  "2B":{ x: 64, y: 45, name: "Second Base" },
  "1B":{ x: 80, y: 53, name: "First Base" },
  P:   { x: 50, y: 64, name: "Pitcher" },
  C:   { x: 50, y: 87, name: "Catcher" },
};

export const isField = (v: string): v is FieldPos => FIELD_ORDER.includes(v as FieldPos);

export const fmtName = (p: Player) => `${p.firstName} ${p.lastInitial}.`;

// ─── The design CSS (injected as a <style> tag) ────────────────────────────────

export const CSS = `
.ddg{font-family:var(--font-hanken),'Hanken Grotesk',sans-serif;color:#211f1b;-webkit-font-smoothing:antialiased}
.ddg table{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed}
.ddg th,.ddg td{border-bottom:1px solid #e8e5dd;border-right:1px solid #eeece5;text-align:center;vertical-align:middle}
.ddg th:first-child,.ddg td:first-child{border-left:none}
.ddg .colbat{width:66px}
.ddg .colplayer{width:228px}
.ddg .inncol{border-right:1px solid #e5e2d9}
.ddg .colbench{width:42px;border-left:2px solid #e3e0d8}
.ddg thead th{background:#faf8f3;font-family:var(--font-ibm-mono),'IBM Plex Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.04em;color:#6f6a60;text-transform:uppercase;padding:10px 0;border-bottom:1.5px solid #d9d5cb}
.ddg thead th.sorted{color:#3f6212;background:#f3f4ea}
.ddg tbody td{height:48px}
.ddg tbody tr{transition:transform .2s cubic-bezier(.2,.7,.3,1)}
.ddg tbody tr:hover td{background:rgba(63,98,18,.045)}
.ddg tbody tr.dragging{transition:none;position:relative;z-index:6}
.ddg tbody tr.dragging td{background:#fcfbf6;border-bottom-color:#d9d5cb}
.ddg tbody tr.dragging td:first-child{box-shadow:-10px 0 22px -10px rgba(40,35,25,.22)}
.ddg tbody tr.dragging td:last-child{box-shadow:10px 0 22px -10px rgba(40,35,25,.22)}
.ddg .cell{position:relative;height:100%;display:flex;align-items:center;justify-content:center;transition:box-shadow .1s}
.ddg .cell.edit{cursor:pointer}
.ddg .cell.edit:hover{box-shadow:inset 0 0 0 2px rgba(63,98,18,.35)}
.ddg .cell.open{box-shadow:inset 0 0 0 2px #3f6212}
.ddg .pcode{font-family:var(--font-ibm-mono),'IBM Plex Mono',monospace;font-size:15px;font-weight:600;letter-spacing:.02em}
.ddg .pword{font-size:12px;font-style:italic;font-weight:500}
.ddg .batnum{font-family:var(--font-ibm-mono),'IBM Plex Mono',monospace;font-size:17px;font-weight:600}
.ddg .grip{display:inline-flex;flex-direction:column;gap:2px;opacity:.4;cursor:grab;padding:5px 3px;border-radius:5px;transition:opacity .12s,background .12s}
.ddg .grip:hover{opacity:.85;background:rgba(40,35,25,.07)}
.ddg .grip:active{cursor:grabbing}
.ddg .grip i{width:3px;height:3px;border-radius:9px;background:#8d877a;display:block}
.ddg tfoot td{height:38px;background:#faf8f3;font-family:var(--font-ibm-mono),'IBM Plex Mono',monospace;font-size:12px;color:#6f6a60;border-top:1.5px solid #d9d5cb}
.ddg .jersey{font-family:var(--font-ibm-mono),'IBM Plex Mono',monospace;font-size:12px;font-weight:600;min-width:26px;height:24px;padding:0 5px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;background:#eef0e6;color:#3f6212}
.ddg .ptip{position:relative;cursor:default;border-bottom:1px dotted #c7c1b4}
.ddg .ptip .tip{position:absolute;left:0;bottom:calc(100% + 7px);z-index:5;white-space:nowrap;background:#211f1b;color:#f3f1ec;font-family:var(--font-ibm-mono),'IBM Plex Mono',monospace;font-size:11px;font-weight:500;letter-spacing:.02em;padding:6px 9px;border-radius:7px;opacity:0;transform:translateY(3px);pointer-events:none;transition:opacity .12s,transform .12s;box-shadow:0 6px 18px rgba(20,18,12,.22)}
.ddg .ptip .tip:after{content:'';position:absolute;left:14px;top:100%;border:5px solid transparent;border-top-color:#211f1b}
.ddg .ptip .tip b{color:#bcd39a;font-weight:600}
.ddg .ptip:hover .tip{opacity:1;transform:translateY(0)}
.ddpop{position:fixed;z-index:9999;background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(30,26,18,.22),0 0 0 1px rgba(40,35,25,.08);padding:12px;width:248px;font-family:var(--font-hanken),'Hanken Grotesk',sans-serif;color:#211f1b}
.ddpop .head{display:flex;align-items:baseline;justify-content:space-between;margin:0 2px 9px}
.ddpop .head .who{font-size:13.5px;font-weight:700}
.ddpop .head .inn{font-family:var(--font-ibm-mono),'IBM Plex Mono',monospace;font-size:11px;font-weight:600;color:#8d877a;letter-spacing:.03em}
.ddpop .lbl{font-family:var(--font-ibm-mono),'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;letter-spacing:.07em;color:#a09a8e;text-transform:uppercase;margin:2px 2px 6px}
.ddpop .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.ddpop .opt{position:relative;height:38px;border:1px solid #e6e3da;border-radius:8px;background:#fbfaf6;cursor:pointer;font-family:var(--font-ibm-mono),'IBM Plex Mono',monospace;font-size:13px;font-weight:600;color:#3f6212;display:flex;align-items:center;justify-content:center;transition:all .1s}
.ddpop .opt:hover{border-color:#3f6212;background:#f1f4e9}
.ddpop .opt.on{background:#3f6212;border-color:#3f6212;color:#fff}
.ddpop .opt .taken{position:absolute;top:-6px;right:-5px;font-family:var(--font-ibm-mono),'IBM Plex Mono',monospace;font-size:8.5px;font-weight:600;color:#9a3412;background:#f6e7df;border:1px solid #eccfc0;border-radius:5px;padding:0 3px;line-height:13px}
.ddpop .bench{margin-top:7px;width:100%;height:34px;border:1px solid #e6e3da;border-radius:8px;background:#f4f2ec;cursor:pointer;font-size:12.5px;font-weight:600;color:#7c776c;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .1s}
.ddpop .bench:hover{border-color:#b9b4a8;background:#eeece5}
.ddpop .bench.on{background:#e7e3d8;border-color:#b9b4a8;color:#4a463e}
.ddpop .list{display:flex;flex-direction:column;gap:2px;max-height:238px;overflow:auto;margin:0 -2px}
.ddpop .prow{display:flex;align-items:center;gap:9px;width:100%;padding:7px 8px;border:1px solid transparent;border-radius:8px;background:transparent;cursor:pointer;text-align:left;font-family:inherit;transition:background .1s,border-color .1s}
.ddpop .prow:hover{background:#f1f4e9}
.ddpop .prow.on{background:#eef1e3;border-color:#dbe3c6}
.ddpop .prow .pj{font-family:var(--font-ibm-mono),'IBM Plex Mono',monospace;font-size:11px;font-weight:600;min-width:24px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;background:#eef0e6;color:#3f6212}
.ddpop .prow .pn{font-size:13px;font-weight:600;color:#211f1b}
.ddpop .prow .ps{margin-left:auto;font-family:var(--font-ibm-mono),'IBM Plex Mono',monospace;font-size:10px;font-weight:500;color:#a8a293;letter-spacing:.03em;white-space:nowrap}
.ddfield{display:flex;gap:30px;padding:26px 30px 30px}
.ddchip{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:30px;padding:6px 11px;border-radius:11px;cursor:pointer;font-family:inherit;box-shadow:0 2px 7px rgba(40,35,25,.13);transition:transform .1s,box-shadow .1s;border:none}
.ddchip:hover{transform:translateY(-1px);box-shadow:0 6px 15px rgba(40,35,25,.2)}
.ddchip .cc{font-family:var(--font-ibm-mono),'IBM Plex Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.03em}
.ddchip .cn{font-size:12.5px;font-weight:700;color:#211f1b;white-space:nowrap}
.ddchip.empty{background:rgba(255,255,255,.45);border:1.5px dashed #b9c19f;box-shadow:none}
.ddchip.empty:hover{background:rgba(255,255,255,.72);transform:none}
.ddchip.empty .cn{color:#8a936a;font-weight:600}
.ddros{display:flex;align-items:center;gap:9px;width:100%;padding:8px 11px;border:1px solid #ece9e1;border-radius:9px;background:#fbfaf6;cursor:pointer;font-family:inherit;text-align:left;transition:border-color .1s,background .1s}
.ddros:hover{border-color:#cdd6b4;background:#f3f5ec}
.ddros.static{cursor:default}
.ddros.static:hover{border-color:#ece9e1;background:#fbfaf6}
.ddros .rn{font-size:13.5px;font-weight:700;color:#211f1b}
.ddros .re{margin-left:auto;font-family:var(--font-ibm-mono),'IBM Plex Mono',monospace;font-size:10px;color:#a8a293;letter-spacing:.02em}
.innstep{display:inline-flex;align-items:center;background:#f1efe8;border:1px solid #e3e0d8;border-radius:9px;padding:3px;gap:2px}
.innstep .ib{min-width:26px;height:28px;padding:0 2px;border:none;background:transparent;border-radius:7px;cursor:pointer;font-size:13px;font-weight:600;color:#7c776c;display:flex;align-items:center;justify-content:center;font-family:var(--font-ibm-mono),'IBM Plex Mono',monospace;transition:background .1s,color .1s}
.innstep .ib:hover{background:#fff;color:#3f6212}
.innstep .ib.on{background:#3f6212;color:#fff}
.innstep .ib.arrow{color:#a8a293;font-size:16px}
.vtog{display:inline-flex;background:#eef0e6;border:1px solid #dbe1cd;border-radius:9px;padding:3px}
.vtog button{display:inline-flex;align-items:center;gap:6px;border:none;background:transparent;border-radius:7px;padding:5px 12px;font-size:12.5px;font-weight:600;color:#6f7a52;cursor:pointer;font-family:inherit;transition:background .1s,color .1s}
.vtog button.on{background:#3f6212;color:#fff;box-shadow:0 1px 2px rgba(40,35,25,.12)}
`;

// ─── Adapter: game data model → builder schedule ───────────────────────────────

export function gameToSchedule(game: Game, players: Player[]): Schedule {
  const numInnings = game.innings.length;
  const schedule: Schedule = {};
  for (const player of players) {
    const override = game.playerOverrides.find((o) => o.playerId === player.id);
    const values: CellValue[] = [];
    for (let i = 0; i < numInnings; i++) {
      const innNum = i + 1;
      if (override?.status === "absent") { values.push("ABSENT"); continue; }
      if (override?.status === "late" && override.inning != null && innNum < override.inning) {
        values.push("LATE"); continue;
      }
      if (override?.status === "earlyLeave" && override.inning != null && innNum > override.inning) {
        values.push("OUT"); continue;
      }
      const innAsgn = game.innings[i];
      let assigned: CellValue = "BENCH";
      if (innAsgn) {
        for (const slot of innAsgn.slots) {
          if (slot.playerId !== player.id) continue;
          if (isField(slot.position)) {
            assigned = slot.position as FieldPos;
            break;
          }
          if (slot.position === "Bullpen - P" || slot.position === "Bullpen - C") {
            assigned = "BULLPEN";
            break;
          }
        }
      }
      values.push(assigned);
    }
    schedule[player.id] = values;
  }
  return schedule;
}

export function scheduleToInnings(schedule: Schedule, baseInnings: InningAssignment[]): InningAssignment[] {
  return baseInnings.map((inn, i) => {
    // Players assigned BULLPEN for this inning
    const bullpenIds = new Set(
      Object.keys(schedule).filter((id) => schedule[id][i] === "BULLPEN")
    );

    // Pass 1: update field slots + clear bullpen slots whose occupant moved away
    const pass1: InningSlot[] = inn.slots.map((slot) => {
      if (isField(slot.position)) {
        const pid = Object.keys(schedule).find((id) => schedule[id][i] === slot.position) ?? null;
        return { ...slot, playerId: pid };
      }
      if (slot.position === "Bullpen - P" || slot.position === "Bullpen - C") {
        if (slot.playerId && !bullpenIds.has(slot.playerId)) {
          // Occupant was manually moved away — clear and unlock so pitch plan can re-use
          return { ...slot, playerId: null, locked: false };
        }
        return slot;
      }
      return slot;
    });

    // Pass 2: place any newly BULLPEN-assigned players into empty bullpen slots
    const occupiedBullpen = new Set(
      pass1
        .filter((s) => s.position === "Bullpen - P" || s.position === "Bullpen - C")
        .map((s) => s.playerId)
        .filter((id): id is string => id !== null)
    );
    const unplaced = [...bullpenIds].filter((id) => !occupiedBullpen.has(id));
    if (unplaced.length === 0) return { ...inn, slots: pass1 };

    let ui = 0;
    const finalSlots = pass1.map((slot) => {
      if (ui >= unplaced.length) return slot;
      if ((slot.position === "Bullpen - P" || slot.position === "Bullpen - C") && !slot.playerId) {
        return { ...slot, playerId: unplaced[ui++] };
      }
      return slot;
    });
    return { ...inn, slots: finalSlots };
  });
}
