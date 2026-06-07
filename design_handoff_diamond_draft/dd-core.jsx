// dd-core.jsx — shared data, helpers, and the field diagram for Diamond Draft mockups.
// Exports to window: DD (data), FIELD_POS, fmtName, Diamond, FieldSVG.

/* ---------------------------------------------------------------- DATA */
const PLAYERS = [
  { id: 'p1',  first: 'Noah',   li: 'B', num: '5',  elig: ['P','SS','3B'],      status: 'active' },
  { id: 'p2',  first: 'Ethan',  li: 'K', num: '21', elig: ['C','1B'],           status: 'active' },
  { id: 'p3',  first: 'Liam',   li: 'C', num: '3',  elig: ['1B','3B'],          status: 'active' },
  { id: 'p4',  first: 'Mateo',  li: 'R', num: '7',  elig: ['SS','2B','P'],      status: 'active' },
  { id: 'p5',  first: 'Owen',   li: 'S', num: '2',  elig: ['3B','SS'],          status: 'active' },
  { id: 'p6',  first: 'Caleb',  li: 'T', num: '15', elig: ['LF','CF'],          status: 'active' },
  { id: 'p7',  first: 'Lucas',  li: 'P', num: '8',  elig: ['RF','LF','1B'],     status: 'active' },
  { id: 'p8',  first: 'Mason',  li: 'G', num: '14', elig: ['P','CF'],           status: 'active' },
  { id: 'p9',  first: 'Carter', li: 'D', num: '6',  elig: ['SS','2B'],          status: 'earlyLeave' },
  { id: 'p10', first: 'Diego',  li: 'M', num: '9',  elig: ['2B','RF','LF'],     status: 'active' },
  { id: 'p11', first: 'Aiden',  li: 'H', num: '11', elig: ['C','2B'],           status: 'active' },
  { id: 'p12', first: 'Jayden', li: 'W', num: '12', elig: ['CF','RF','P'],      status: 'late' },
  { id: 'p13', first: 'Ryan',   li: 'F', num: '18', elig: ['1B','LF'],          status: 'absent' },
  { id: 'g1',  first: 'Sam',    li: 'V', num: '44', elig: ['2B','RF'], guest: true, status: 'active' },
];
const byId = Object.fromEntries(PLAYERS.map(p => [p.id, p]));

// ---- Full 7-inning plan (single source of truth for BOTH views) ----
// Values per inning: position code | 'BENCH' | 'LATE' | 'OUT' | 'ABSENT'
const SCHEDULE = {
  p1:  ['P','P','BENCH','SS','SS','SS','SS'],
  p2:  ['C','C','BENCH','C','BENCH','C','BENCH'],
  p3:  ['1B','1B','1B','3B','1B','3B','1B'],
  p4:  ['2B','BENCH','2B','BENCH','P','BENCH','2B'],
  p5:  ['3B','3B','3B','BENCH','3B','BENCH','3B'],
  p6:  ['LF','CF','LF','LF','LF','LF','LF'],
  p7:  ['RF','RF','BENCH','1B','BENCH','1B','BENCH'],
  p8:  ['CF','BENCH','P','P','BENCH','CF','CF'],
  p9:  ['SS','SS','SS','BENCH','2B','OUT','OUT'],
  p10: ['BENCH','LF','BENCH','2B','RF','RF','BENCH'],
  p11: ['BENCH','BENCH','C','BENCH','C','BENCH','C'],
  p12: ['LATE','LATE','CF','CF','CF','P','P'],
  p13: ['ABSENT','ABSENT','ABSENT','ABSENT','ABSENT','ABSENT','ABSENT'],
  g1:  ['BENCH','2B','RF','RF','BENCH','2B','RF'],
};
// Batting order for THIS game (continuous; absent players scratched).
const BATTING = ['p4','p9','p1','p3','p5','p6','p7','p8','p2','p10','p11','g1','p12'];
const SCRATCHED = ['p13'];

const ZONE = { P: 'bat', C: 'bat', '1B': 'inf', '2B': 'inf', '3B': 'inf', SS: 'inf', LF: 'out', CF: 'out', RF: 'out' };
const isField = (v) => !!ZONE[v];

const cellFor = (id, inning) => SCHEDULE[id][inning - 1];
const playCount = (id) => SCHEDULE[id].filter(isField).length;
const battingSlot = (id) => { const i = BATTING.indexOf(id); return i < 0 ? 0 : i + 1; };

// Derive an inning's full picture from the schedule.
function getInning(inning) {
  const idx = inning - 1;
  const out = { field: {}, bench: [], late: [], out: [], absent: [], pitcher: null };
  for (const p of PLAYERS) {
    const v = SCHEDULE[p.id][idx];
    if (isField(v)) { out.field[v] = p; if (v === 'P') out.pitcher = p; }
    else if (v === 'BENCH') out.bench.push(p);
    else if (v === 'LATE') out.late.push(p);
    else if (v === 'OUT') out.out.push(p);
    else if (v === 'ABSENT') out.absent.push(p);
  }
  return out;
}
// Next inning's pitcher, if they're benched this inning (i.e. warming up).
function warmingFor(inning) {
  if (inning >= 7) return [];
  const cur = getInning(inning), nxt = getInning(inning + 1);
  const np = nxt.pitcher; if (!np) return [];
  if (cur.pitcher && np.id === cur.pitcher.id) return [];
  return cellFor(np.id, inning) === 'BENCH' ? [{ player: np, role: 'P' }] : [];
}

const WARNINGS = [
  { level: 'error', title: 'Back-to-back bench',
    body: 'Aiden H. #11 is benched Inning 1 and again Inning 2. League rule: no consecutive innings on the bench.' },
  { level: 'warn',  title: 'Pitch count approaching cap',
    body: 'Noah B. #5 has thrown 14 of 18 season innings, plus 2 today. One more inning hits his season limit.' },
  { level: 'ok',    title: 'Fair playing time on track',
    body: 'All 12 available players clear the 2-inning minimum across the 7-inning plan.' },
];

const GAME = {
  team: 'Eastside Owls', opp: 'Riverside Rockets', homeAway: 'Home',
  date: 'Sat · Jun 6, 2026', time: '10:00 AM', coach: 'Coach Jamie', innings: 7,
};

window.DD = { PLAYERS, byId, SCHEDULE, BATTING, SCRATCHED, ZONE, isField, cellFor, playCount, battingSlot, getInning, warmingFor, WARNINGS, GAME };
window.fmtName = (p) => `${p.first} ${p.li}.`;

/* --------------------------------------------------- FIELD GEOMETRY */
// Chip anchor points as % of the field box.
const FIELD_POS = {
  LF: { x: 15, y: 23, name: 'Left Field' },
  CF: { x: 50, y: 12, name: 'Center Field' },
  RF: { x: 85, y: 23, name: 'Right Field' },
  '3B':{ x: 20, y: 53, name: 'Third Base' },
  SS: { x: 36, y: 45, name: 'Shortstop' },
  '2B':{ x: 64, y: 45, name: 'Second Base' },
  '1B':{ x: 80, y: 53, name: 'First Base' },
  P:  { x: 50, y: 64, name: 'Pitcher' },
  C:  { x: 50, y: 87, name: 'Catcher' },
};
const FIELD_ORDER = ['LF','CF','RF','3B','SS','2B','1B','P','C'];
window.FIELD_POS = FIELD_POS;
window.FIELD_ORDER = FIELD_ORDER;

/* ------------------------------------------------- FIELD SVG BACKDROP */
// Simple shapes only: grass rect, foul lines, outfield arc, infield diamond,
// base squares, mound + home. Colors come from the theme.
function FieldSVG({ t }) {
  // viewBox 1000 x 880. Home plate near bottom center.
  const home = [500, 740], first = [690, 560], second = [500, 380], third = [310, 560];
  const mound = [500, 560];
  const polY = 230, polL = 70, polR = 930;
  const dpath = (pts) => 'M' + pts.map(p => p.join(',')).join('L') + 'Z';
  return (
    <svg viewBox="0 0 1000 880" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
      {/* grass */}
      <rect x="0" y="0" width="1000" height="880" rx={t.fieldRadius} fill={t.grass} />
      {/* outfield arc fill (slightly darker) */}
      <path d={`M${polL},${polY} Q500,-150 ${polR},${polY} L${second[0]},${second[1]} Z`} fill={t.grassDark} opacity={t.grassArcOpacity} />
      {/* foul lines */}
      <line x1={home[0]} y1={home[1]} x2={polL} y2={polY} stroke={t.line} strokeWidth="4" />
      <line x1={home[0]} y1={home[1]} x2={polR} y2={polY} stroke={t.line} strokeWidth="4" />
      {/* outfield fence arc */}
      <path d={`M${polL},${polY} Q500,-130 ${polR},${polY}`} fill="none" stroke={t.line} strokeWidth="4" strokeDasharray={t.fenceDash || 'none'} opacity="0.8" />
      {/* infield skin */}
      <path d={dpath([home, first, second, third])} fill={t.infield} stroke={t.infieldEdge} strokeWidth="3" />
      {/* base path (grass cutout look) */}
      <path d={dpath([[500,690],[640,560],[500,430],[360,560]])} fill={t.grass} opacity={t.basePathInner} />
      <path d={dpath([[500,690],[640,560],[500,430],[360,560]])} fill="none" stroke={t.line} strokeWidth="3" />
      {/* bases */}
      {[first, second, third].map((b, i) => (
        <rect key={i} x={b[0]-13} y={b[1]-13} width="26" height="26" fill={t.base} stroke={t.infieldEdge} strokeWidth="2" transform={`rotate(45 ${b[0]} ${b[1]})`} />
      ))}
      {/* home plate */}
      <path d={`M${home[0]-14},${home[1]-12} L${home[0]+14},${home[1]-12} L${home[0]+14},${home[1]+4} L${home[0]},${home[1]+18} L${home[0]-14},${home[1]+4} Z`} fill={t.base} stroke={t.infieldEdge} strokeWidth="2" />
      {/* pitcher's mound */}
      <circle cx={mound[0]} cy={mound[1]} r="34" fill={t.infield} stroke={t.infieldEdge} strokeWidth="3" />
      <rect x={mound[0]-12} y={mound[1]-4} width="24" height="8" rx="2" fill={t.base} />
    </svg>
  );
}

/* ------------------------------------------------------- DIAMOND WRAP */
// theme `t`, `renderSlot(pos, player, meta)` supplies the variation chip.
function Diamond({ t, renderSlot, inning = 1, style }) {
  const field = window.DD.getInning(inning).field;
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '1000 / 880', ...style }}>
      <FieldSVG t={t} />
      {FIELD_ORDER.map(pos => {
        const meta = FIELD_POS[pos];
        const player = field[pos] || null;
        return (
          <div key={pos} style={{ position: 'absolute', left: meta.x + '%', top: meta.y + '%', transform: 'translate(-50%,-50%)', width: 'max-content' }}>
            {renderSlot(pos, player, meta)}
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { FieldSVG, Diamond });
