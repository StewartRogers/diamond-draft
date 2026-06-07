// dd-grid.jsx — Interactive tabular lineup builder.  rows = players, cols = innings.  window.BuilderGrid
(function () {
  const { useState, useMemo, useRef, useEffect } = React;
  const { DD, fmtName } = window;
  const { ZONE, isField, byId } = DD;

  const INN = [0, 1, 2, 3, 4, 5, 6];
  // Warm-green diamond theme for the shared FieldSVG backdrop.
  const FIELD_T = { fieldRadius: 20, grass: '#dde6cd', grassDark: '#d2dcbd', grassArcOpacity: 0.6, line: '#fbfaf6', fenceDash: '11 9', infield: '#e6d2ab', infieldEdge: '#d0b889', base: '#fdfbf5', basePathInner: 0.5 };

  const PAL = {
    bat: { bg: '#f7eed7', fg: '#9a6712' },
    inf: { bg: '#ecf0e1', fg: '#3f6212' },
    out: { bg: '#e7eef4', fg: '#345d86' },
  };
  const WORD = {
    BENCH: { bg: '#f1efe8', fg: '#938e80', t: 'Bench' },
    LATE: { bg: '#f8f0db', fg: '#a16207', t: 'Late' },
    OUT: { bg: '#eae8e1', fg: '#9a958a', t: 'Out' },
    ABSENT: { bg: '#f4f2ec', fg: '#bdb8ad', t: '—' },
  };
  const editable = (v) => isField(v) || v === 'BENCH';

  const css = `
  .ddg{font-family:'Hanken Grotesk',sans-serif;color:#211f1b;-webkit-font-smoothing:antialiased}
  .ddg table{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed}
  .ddg th,.ddg td{border-bottom:1px solid #e8e5dd;border-right:1px solid #eeece5;text-align:center;vertical-align:middle}
  .ddg th:first-child,.ddg td:first-child{border-left:none}
  .ddg .colbat{width:66px}
  .ddg .colplayer{width:228px}
  .ddg .inncol{border-right:1px solid #e5e2d9}
  .ddg .inncol:last-child{border-right:none}
  .ddg thead th{background:#faf8f3;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.04em;color:#6f6a60;text-transform:uppercase;padding:10px 0;border-bottom:1.5px solid #d9d5cb}
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
  .ddg .pcode{font-family:'IBM Plex Mono',monospace;font-size:15px;font-weight:600;letter-spacing:.02em}
  .ddg .pword{font-size:12px;font-style:italic;font-weight:500}
  .ddg .batnum{font-family:'IBM Plex Mono',monospace;font-size:17px;font-weight:600}
  .ddg .grip{display:inline-flex;flex-direction:column;gap:2px;opacity:.4;cursor:grab;padding:5px 3px;border-radius:5px;transition:opacity .12s,background .12s}
  .ddg .grip:hover{opacity:.85;background:rgba(40,35,25,.07)}
  .ddg .grip:active{cursor:grabbing}
  .ddg .grip i{width:3px;height:3px;border-radius:9px;background:#8d877a;display:block}
  .ddg tfoot td{height:38px;background:#faf8f3;font-family:'IBM Plex Mono',monospace;font-size:12px;color:#6f6a60;border-top:1.5px solid #d9d5cb}
  .ddg .jersey{font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:600;min-width:26px;height:24px;padding:0 5px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;background:#eef0e6;color:#3f6212}
  .ddg .ptip{position:relative;cursor:default;border-bottom:1px dotted #c7c1b4}
  .ddg .ptip .tip{position:absolute;left:0;bottom:calc(100% + 7px);z-index:5;white-space:nowrap;background:#211f1b;color:#f3f1ec;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:500;letter-spacing:.02em;padding:6px 9px;border-radius:7px;opacity:0;transform:translateY(3px);pointer-events:none;transition:opacity .12s,transform .12s;box-shadow:0 6px 18px rgba(20,18,12,.22)}
  .ddg .ptip .tip:after{content:'';position:absolute;left:14px;top:100%;border:5px solid transparent;border-top-color:#211f1b}
  .ddg .ptip .tip b{color:#bcd39a;font-weight:600}
  .ddg .ptip:hover .tip{opacity:1;transform:translateY(0)}
  .ddpop{position:fixed;z-index:50;background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(30,26,18,.22),0 0 0 1px rgba(40,35,25,.08);padding:12px;width:248px;font-family:'Hanken Grotesk',sans-serif;color:#211f1b}
  .ddpop .head{display:flex;align-items:baseline;justify-content:space-between;margin:0 2px 9px}
  .ddpop .head .who{font-size:13.5px;font-weight:700}
  .ddpop .head .inn{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;color:#8d877a;letter-spacing:.03em}
  .ddpop .lbl{font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;letter-spacing:.07em;color:#a09a8e;text-transform:uppercase;margin:2px 2px 6px}
  .ddpop .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  .ddpop .opt{position:relative;height:38px;border:1px solid #e6e3da;border-radius:8px;background:#fbfaf6;cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:600;color:#3f6212;display:flex;align-items:center;justify-content:center;transition:all .1s}
  .ddpop .opt:hover{border-color:#3f6212;background:#f1f4e9}
  .ddpop .opt.on{background:#3f6212;border-color:#3f6212;color:#fff}
  .ddpop .opt .taken{position:absolute;top:-6px;right:-5px;font-family:'IBM Plex Mono',monospace;font-size:8.5px;font-weight:600;color:#9a3412;background:#f6e7df;border:1px solid #eccfc0;border-radius:5px;padding:0 3px;line-height:13px}
  .ddpop .bench{margin-top:7px;width:100%;height:34px;border:1px solid #e6e3da;border-radius:8px;background:#f4f2ec;cursor:pointer;font-size:12.5px;font-weight:600;color:#7c776c;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .1s}
  .ddpop .bench:hover{border-color:#b9b4a8;background:#eeece5}
  .ddpop .bench.on{background:#e7e3d8;border-color:#b9b4a8;color:#4a463e}
  .ddpop .list{display:flex;flex-direction:column;gap:2px;max-height:238px;overflow:auto;margin:0 -2px}
  .ddpop .prow{display:flex;align-items:center;gap:9px;width:100%;padding:7px 8px;border:1px solid transparent;border-radius:8px;background:transparent;cursor:pointer;text-align:left;font-family:inherit;transition:background .1s,border-color .1s}
  .ddpop .prow:hover{background:#f1f4e9}
  .ddpop .prow.on{background:#eef1e3;border-color:#dbe3c6}
  .ddpop .prow .pj{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;min-width:24px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;background:#eef0e6;color:#3f6212}
  .ddpop .prow .pn{font-size:13px;font-weight:600;color:#211f1b}
  .ddpop .prow .ps{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:500;color:#a8a293;letter-spacing:.03em;white-space:nowrap}
  .ddfield{display:flex;gap:30px;padding:26px 30px 30px}
  .ddchip{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:30px;padding:6px 11px;border-radius:11px;cursor:pointer;font-family:inherit;box-shadow:0 2px 7px rgba(40,35,25,.13);transition:transform .1s,box-shadow .1s}
  .ddchip:hover{transform:translateY(-1px);box-shadow:0 6px 15px rgba(40,35,25,.2)}
  .ddchip .cc{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;letter-spacing:.03em}
  .ddchip .cn{font-size:12.5px;font-weight:700;color:#211f1b;white-space:nowrap}
  .ddchip.empty{background:rgba(255,255,255,.45);border:1.5px dashed #b9c19f;box-shadow:none}
  .ddchip.empty:hover{background:rgba(255,255,255,.72);transform:none}
  .ddchip.empty .cn{color:#8a936a;font-weight:600}
  .ddros{display:flex;align-items:center;gap:9px;width:100%;padding:8px 11px;border:1px solid #ece9e1;border-radius:9px;background:#fbfaf6;cursor:pointer;font-family:inherit;text-align:left;transition:border-color .1s,background .1s}
  .ddros:hover{border-color:#cdd6b4;background:#f3f5ec}
  .ddros.static{cursor:default}
  .ddros.static:hover{border-color:#ece9e1;background:#fbfaf6}
  .ddros .rn{font-size:13.5px;font-weight:700;color:#211f1b}
  .ddros .re{margin-left:auto;font-family:'IBM Plex Mono',monospace;font-size:10px;color:#a8a293;letter-spacing:.02em}
  .innstep{display:inline-flex;align-items:center;background:#f1efe8;border:1px solid #e3e0d8;border-radius:9px;padding:3px;gap:2px}
  .innstep .ib{min-width:26px;height:28px;padding:0 2px;border:none;background:transparent;border-radius:7px;cursor:pointer;font-size:13px;font-weight:600;color:#7c776c;display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;transition:background .1s,color .1s}
  .innstep .ib:hover{background:#fff;color:#3f6212}
  .innstep .ib.on{background:#3f6212;color:#fff}
  .innstep .ib.arrow{color:#a8a293;font-size:16px}
  .vtog{display:inline-flex;background:#eef0e6;border:1px solid #dbe1cd;border-radius:9px;padding:3px}
  .vtog button{display:inline-flex;align-items:center;gap:6px;border:none;background:transparent;border-radius:7px;padding:5px 12px;font-size:12.5px;font-weight:600;color:#6f7a52;cursor:pointer;font-family:inherit;transition:background .1s,color .1s}
  .vtog button.on{background:#3f6212;color:#fff;box-shadow:0 1px 2px rgba(40,35,25,.12)}
  `;

  function Cell({ v, editing, onClick }) {
    let bg, body;
    if (isField(v)) {
      const z = PAL[ZONE[v]];
      bg = z.bg;
      body = <span className="pcode" style={{ color: z.fg }}>{v}</span>;
    } else {
      const m = WORD[v];
      bg = m.bg;
      body = <span className="pword" style={{ color: m.fg, fontStyle: v === 'ABSENT' ? 'normal' : 'italic' }}>{m.t}</span>;
    }
    const ed = editable(v);
    return (
      <td className="inncol" style={{ background: bg, padding: 0 }}>
        <div className={'cell' + (ed ? ' edit' : '') + (editing ? ' open' : '')} onClick={ed ? onClick : undefined}>{body}</div>
      </td>
    );
  }

  function Row({ id, slot, sched, scratched, showGrip, onGrip, editKey, onCell }) {
    const p = byId[id];
    return (
      <tr data-rid={id} style={{ opacity: scratched ? 0.55 : 1 }}>
        <td className="colbat" style={{ background: scratched ? '#f4f2ec' : '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            {showGrip && !scratched && (
              <span className="grip" onPointerDown={(e) => onGrip(e, id)} title="Drag to reorder batting"><i></i><i></i><i></i></span>
            )}
            <span className="batnum" style={{ color: scratched ? '#bdb8ad' : '#211f1b' }}>{scratched ? '—' : slot}</span>
          </div>
        </td>
        <td className="colplayer" style={{ textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px' }}>
            <span className="jersey" style={scratched ? { background: '#efedE6', color: '#a8a39a' } : null}>{p.num}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="ptip" style={{ fontSize: 14, fontWeight: 700, textDecoration: scratched ? 'line-through' : 'none' }}>
                {fmtName(p)}
                <span className="tip">Can play: <b>{p.elig.join(' · ')}</b></span>
              </span>
              {p.guest && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, fontWeight: 600, color: '#a16207', background: '#f8f0db', border: '1px solid #ecdcb6', borderRadius: 4, padding: '1px 4px' }}>+1</span>}
              {scratched && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9.5, fontWeight: 600, color: '#9a3412', background: '#f6e7df', borderRadius: 4, padding: '1px 5px', letterSpacing: '.04em' }}>SCRATCHED</span>}
            </div>
          </div>
        </td>
        {sched.map((v, i) => (
          <Cell key={i} v={v} editing={editKey === id + ':' + i} onClick={(e) => onCell(e, id, i)} />
        ))}
      </tr>
    );
  }

  function SortSeg({ sort, setSort }) {
    const opts = [['bat', 'Batting order'], ['jersey', 'Jersey #'], ['name', 'First name']];
    return (
      <div style={{ display: 'inline-flex', background: '#f1efe8', border: '1px solid #e3e0d8', borderRadius: 9, padding: 3 }}>
        {opts.map(([k, label]) => {
          const on = sort === k;
          return <span key={k} onClick={() => setSort(k)} style={{ fontSize: 12.5, fontWeight: 600, padding: '5px 11px', borderRadius: 7, cursor: 'pointer',
            background: on ? '#fff' : 'transparent', color: on ? '#3f6212' : '#7c776c', boxShadow: on ? '0 1px 2px rgba(40,35,25,.08)' : 'none' }}>{label}</span>;
        })}
      </div>
    );
  }

  // Assignment popover — portaled to body so position:fixed beats the scaled card.
  function CellPopover({ target, schedule, batting, onAssign, onClose }) {
    const ref = useRef(null);
    const { id, inn, rect } = target;
    const p = byId[id];
    const cur = schedule[id][inn];

    useEffect(() => {
      const off = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
      const esc = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('pointerdown', off, true);
      document.addEventListener('keydown', esc);
      return () => { document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', esc); };
    }, [onClose]);

    const W = 248, H = 230;
    let left = Math.max(12, Math.min(rect.left, window.innerWidth - W - 12));
    let top = rect.bottom + 6;
    if (top + H > window.innerHeight - 12) top = Math.max(12, rect.top - H - 6);

    const occupantFor = (pos) => {
      const o = batting.find((x) => x !== id && schedule[x][inn] === pos);
      return o ? byId[o].num : null;
    };

    return ReactDOM.createPortal(
      <div className="ddpop" ref={ref} style={{ left, top }}>
        <div className="head">
          <span className="who">{fmtName(p)} · #{p.num}</span>
          <span className="inn">INN {inn + 1}</span>
        </div>
        <div className="lbl">Eligible positions</div>
        <div className="grid">
          {p.elig.map((pos) => {
            const tk = occupantFor(pos);
            return (
              <button key={pos} className={'opt' + (cur === pos ? ' on' : '')} onClick={() => onAssign(id, inn, pos)}>
                {pos}
                {tk && cur !== pos && <span className="taken">#{tk}</span>}
              </button>
            );
          })}
        </div>
        <button className={'bench' + (cur === 'BENCH' ? ' on' : '')} onClick={() => onAssign(id, inn, 'BENCH')}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2 5h10M2 5v4M12 5v4M4 9v2M10 9v2" strokeLinecap="round"/></svg>
          Bench this inning
        </button>
      </div>,
      document.body
    );
  }

  // ── Field view: diamond chip, position picker, view toggle, stepper ──
  function PosChip({ pos, id, onClick }) {
    const z = PAL[ZONE[pos]];
    if (!id) {
      return (
        <button className="ddchip empty" onClick={onClick}>
          <span className="cc" style={{ color: '#8a936a' }}>{pos}</span>
          <span className="cn">+ open</span>
        </button>
      );
    }
    const p = byId[id];
    return (
      <button className="ddchip" onClick={onClick} style={{ background: z.bg, border: `1px solid ${z.fg}2e` }}>
        <span className="cc" style={{ color: z.fg }}>{pos} · #{p.num}</span>
        <span className="cn">{fmtName(p)}</span>
      </button>
    );
  }

  function PositionPopover({ target, schedule, batting, onAssign, onClose }) {
    const ref = useRef(null);
    const { pos, inn, rect } = target;
    const meta = window.FIELD_POS[pos];
    useEffect(() => {
      const off = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
      const esc = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('pointerdown', off, true);
      document.addEventListener('keydown', esc);
      return () => { document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', esc); };
    }, [onClose]);

    const W = 250, H = 300;
    let left = Math.max(12, Math.min(rect.left, window.innerWidth - W - 12));
    let top = rect.bottom + 6;
    if (top + H > window.innerHeight - 12) top = Math.max(12, rect.top - H - 6);

    const cands = batting.filter((id) => byId[id].elig.includes(pos));
    const label = (id) => {
      const v = schedule[id][inn];
      if (v === pos) return 'on field';
      if (isField(v)) return 'now ' + v;
      if (v === 'BENCH') return 'on bench';
      return v.charAt(0) + v.slice(1).toLowerCase();
    };
    return ReactDOM.createPortal(
      <div className="ddpop" ref={ref} style={{ left, top, width: W }}>
        <div className="head"><span className="who">{meta.name}</span><span className="inn">INN {inn + 1}</span></div>
        <div className="lbl">Eligible players</div>
        <div className="list">
          {cands.map((id) => {
            const here = schedule[id][inn] === pos;
            return (
              <button key={id} className={'prow' + (here ? ' on' : '')} onClick={() => onAssign(id, inn, pos)}>
                <span className="pj">{byId[id].num}</span>
                <span className="pn">{fmtName(byId[id])}</span>
                <span className="ps">{label(id)}</span>
              </button>
            );
          })}
          {cands.length === 0 && <div style={{ padding: '10px 8px', fontSize: 12.5, color: '#a09a8e' }}>No eligible players in the lineup.</div>}
        </div>
      </div>,
      document.body
    );
  }

  function ViewToggle({ view, setView }) {
    return (
      <div className="vtog">
        <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="1.5" y="1.5" width="11" height="11" rx="1.5"/><path d="M1.5 5.2h11M1.5 8.8h11M5.2 1.5v11M8.8 1.5v11"/></svg>
          Grid
        </button>
        <button className={view === 'field' ? 'on' : ''} onClick={() => setView('field')}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><path d="M7 1.6l5.4 5.4L7 12.4 1.6 7z"/></svg>
          Field
        </button>
      </div>
    );
  }

  function InningStepper({ inning, setInning }) {
    return (
      <div className="innstep">
        <button className="ib arrow" onClick={() => setInning(Math.max(0, inning - 1))} title="Previous inning">‹</button>
        {INN.map((i) => <button key={i} className={'ib' + (i === inning ? ' on' : '')} onClick={() => setInning(i)}>{i + 1}</button>)}
        <button className="ib arrow" onClick={() => setInning(Math.min(6, inning + 1))} title="Next inning">›</button>
      </div>
    );
  }

  function RosterSection({ title, ids, onPick, hint }) {
    if (!ids.length) return null;
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 2px 8px' }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8d877a' }}>{title}</span>
          <span style={{ fontSize: 11, color: '#bdb8ad' }}>{ids.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ids.map((id) => {
            const p = byId[id];
            return (
              <button key={id} className={'ddros' + (onPick ? '' : ' static')} onClick={onPick ? (e) => onPick(e, id) : undefined}>
                <span className="jersey">{p.num}</span>
                <span className="rn">{fmtName(p)}</span>
                <span className="re">{p.elig.join(' · ')}</span>
              </button>
            );
          })}
        </div>
        {hint && <div style={{ fontSize: 11.5, color: '#a8a293', margin: '8px 2px 0' }}>{hint}</div>}
      </div>
    );
  }

  function FieldView({ schedule, batting, inning, onCellEdit, onPosEdit }) {
    const idx = inning;
    const byPos = {}, bench = [], late = [], out = [];
    for (const id of batting) {
      const v = schedule[id][idx];
      if (isField(v)) byPos[v] = id;
      else if (v === 'BENCH') bench.push(id);
      else if (v === 'LATE') late.push(id);
      else if (v === 'OUT') out.push(id);
    }
    const onF = window.FIELD_ORDER.filter((p) => byPos[p]).length;
    return (
      <div className="ddfield">
        <div style={{ flex: '0 0 568px' }}>
          <div style={{ position: 'relative', width: 568, aspectRatio: '1000 / 880' }}>
            <window.FieldSVG t={FIELD_T} />
            {window.FIELD_ORDER.map((pos) => {
              const meta = window.FIELD_POS[pos];
              const id = byPos[pos];
              return (
                <div key={pos} style={{ position: 'absolute', left: meta.x + '%', top: meta.y + '%', transform: 'translate(-50%,-50%)', width: 'max-content' }}>
                  <PosChip pos={pos} id={id} onClick={(e) => id ? onCellEdit(e, id, idx) : onPosEdit(e, pos, idx)} />
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #ece9e1', paddingBottom: 14 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.01em' }}>Inning {idx + 1}</div>
              <div style={{ fontSize: 12.5, color: '#a09a8e', marginTop: 2 }}>Tap a position to swap who plays it</div>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 600, color: onF === 9 ? '#3f6212' : '#9a3412', background: onF === 9 ? '#eef1e3' : '#f6e7df', border: `1px solid ${onF === 9 ? '#dbe3c6' : '#eccfc0'}`, borderRadius: 999, padding: '6px 13px' }}>
              {onF}<span style={{ opacity: .5 }}>/9</span> on the field
            </span>
          </div>
          <RosterSection title="On the bench" ids={bench} onPick={onCellEdit ? (e, id) => onCellEdit(e, id, idx) : null}
            hint={bench.length ? 'Tap a benched player to put them on the field.' : null} />
          {bench.length === 0 && late.length === 0 && out.length === 0 &&
            <div style={{ fontSize: 13, color: '#a09a8e' }}>Everyone available is on the field this inning.</div>}
          <RosterSection title="Arriving late" ids={late} />
          <RosterSection title="Out / left game" ids={out} />
        </div>
      </div>
    );
  }

  window.BuilderGrid = function BuilderGrid() {
    const g = DD.GAME;
    const [sort, setSort] = useState('bat');
    const [batting, setBatting] = useState(() => [...DD.BATTING]);
    const [schedule, setSchedule] = useState(() => {
      const o = {};
      for (const k in DD.SCHEDULE) o[k] = [...DD.SCHEDULE[k]];
      return o;
    });
    const [edit, setEdit] = useState(null); // { kind:'cell'|'pos', ... }
    const [view, setView] = useState('grid');
    const [inning, setInning] = useState(0);

    const battingSlot = (id) => { const i = batting.indexOf(id); return i < 0 ? 0 : i + 1; };

    // ---- assignment (with swap so each position stays unique per inning) ----
    const assign = (id, inn, pos) => {
      setSchedule((prev) => {
        const next = { ...prev, [id]: [...prev[id]] };
        const curV = prev[id][inn];
        if (isField(pos)) {
          const occ = batting.find((x) => x !== id && prev[x][inn] === pos);
          if (occ) { next[occ] = [...prev[occ]]; next[occ][inn] = (isField(curV) || curV === 'BENCH') ? curV : 'BENCH'; }
        }
        next[id][inn] = pos;
        return next;
      });
      setEdit(null);
    };

    // ---- live derivations ----
    const onFieldPerInning = useMemo(
      () => INN.map((i) => batting.filter((id) => isField(schedule[id][i])).length),
      [batting, schedule]
    );
    const fieldIssues = onFieldPerInning.map((n, i) => ({ inn: i + 1, n })).filter((x) => x.n !== 9);
    const benchIssues = useMemo(() => batting.filter((id) => {
      const s = schedule[id];
      for (let i = 0; i < 6; i++) if (s[i] === 'BENCH' && s[i + 1] === 'BENCH') return true;
      return false;
    }), [batting, schedule]);
    const shortPlay = useMemo(
      () => batting.filter((id) => schedule[id].filter(isField).length < 2),
      [batting, schedule]
    );
    const violations = fieldIssues.length + benchIssues.length + shortPlay.length;

    // Single most-important banner message.
    let banner;
    if (fieldIssues.length) {
      const f = fieldIssues[0];
      banner = { tone: 'err', main: `Inning ${f.inn} has ${f.n} on the field`, hint: f.n < 9 ? `Assign ${9 - f.n} more player${9 - f.n > 1 ? 's' : ''} a position.` : `Bench ${f.n - 9} — only 9 may field.` };
    } else if (benchIssues.length) {
      const p = byId[benchIssues[0]];
      banner = { tone: 'err', main: `${fmtName(p)} #${p.num} sits back-to-back`, hint: 'League rule: no two bench innings in a row. Put them on the field.' };
    } else if (shortPlay.length) {
      const p = byId[shortPlay[0]];
      banner = { tone: 'err', main: `${fmtName(p)} #${p.num} plays under 2 innings`, hint: 'Fair-play minimum is 2 innings on the field.' };
    } else {
      banner = { tone: 'ok', main: 'Lineup is clean', hint: 'All fielding 9-deep, no back-to-back bench, everyone clears the 2-inning minimum.' };
    }

    // ---- row sort ----
    const present = DD.PLAYERS.map((p) => p.id).filter((id) => batting.includes(id));
    let rows;
    if (sort === 'bat') rows = [...batting];
    else if (sort === 'jersey') rows = [...present].sort((a, b) => (+byId[a].num) - (+byId[b].num));
    else rows = [...present].sort((a, b) => byId[a].first.localeCompare(byId[b].first));
    rows = rows.concat(DD.SCRATCHED);

    // ---- cell edit open ----
    const onCell = (e, id, inn) => {
      const r = e.currentTarget.getBoundingClientRect();
      setEdit({ kind: 'cell', id, inn, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } });
    };
    const onPos = (e, pos, inn) => {
      const r = e.currentTarget.getBoundingClientRect();
      setEdit({ kind: 'pos', pos, inn, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } });
    };

    // ---- drag to reorder batting order (vertical) ----
    const onGrip = (e, id) => {
      if (sort !== 'bat') return;
      e.preventDefault();
      setEdit(null);
      const rowEls = batting.map((pid) => document.querySelector(`.ddg tr[data-rid="${pid}"]`)).filter(Boolean);
      if (!rowEls.length) return;
      const scale = rowEls[0].getBoundingClientRect().height / rowEls[0].offsetHeight || 1;
      const homes = rowEls.map((el) => ({ el, id: el.dataset.rid, y: el.getBoundingClientRect().top }));
      const slotYs = homes.map((h) => h.y);
      const meIdx = batting.indexOf(id);
      const me = homes[meIdx].el;
      const startY = e.clientY;
      let live = batting.slice();
      me.classList.add('dragging');

      const layout = () => {
        for (const h of homes) {
          if (h.id === id) continue;
          const slot = live.indexOf(h.id);
          h.el.style.transform = `translateY(${(slotYs[slot] - h.y) / scale}px)`;
        }
      };
      const move = (ev) => {
        const dy = ev.clientY - startY;
        me.style.transform = `translateY(${dy / scale}px)`;
        const cur = homes[meIdx].y + dy;
        let nearest = 0, best = Infinity;
        for (let i = 0; i < slotYs.length; i++) { const d = Math.abs(slotYs[i] - cur); if (d < best) { best = d; nearest = i; } }
        if (live.indexOf(id) !== nearest) { live = batting.filter((k) => k !== id); live.splice(nearest, 0, id); layout(); }
      };
      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        const finalSlot = live.indexOf(id);
        me.style.transform = `translateY(${(slotYs[finalSlot] - homes[meIdx].y) / scale}px)`;
        setTimeout(() => {
          for (const h of homes) { h.el.style.transition = 'none'; h.el.style.transform = ''; h.el.classList.remove('dragging'); }
          if (live.join('|') !== batting.join('|')) setBatting(live);
          requestAnimationFrame(() => requestAnimationFrame(() => { for (const h of homes) h.el.style.transition = ''; }));
        }, 190);
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    };

    const editKey = edit && edit.kind === 'cell' ? edit.id + ':' + edit.inn : null;

    return (
      <div className="ddg" style={{ width: 1320, background: '#fff', border: '1px solid #e7e4dc', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(40,35,25,.06), 0 18px 50px rgba(40,35,25,.07)' }}>
        <style>{css}</style>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '1px solid #e7e4dc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 24, height: 24, transform: 'rotate(45deg)', background: '#3f6212', borderRadius: 5, display: 'inline-block' }} />
            <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>Diamond Draft</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 14, whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 700 }}>{g.team}</span>
            <span style={{ color: '#a09a8e' }}>vs</span>
            <span style={{ fontWeight: 600 }}>{g.opp}</span>
            <span style={{ color: '#6f6a60', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5, marginLeft: 4 }}>· {g.homeAway} · {g.date} · {g.time}</span>
          </div>
          <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 16px', borderRadius: 9, border: 'none', background: '#3f6212', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 6V2.5h8V6M4 12h8v2.5H4zM3 6h10a1 1 0 011 1v4H2V7a1 1 0 011-1z" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round"/></svg>
            Print · 1 page
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 22px', borderBottom: '1px solid #e7e4dc', background: '#fcfbf8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <ViewToggle view={view} setView={setView} />
            <span style={{ width: 1, height: 20, background: '#e3e0d8' }} />
            {view === 'grid' ? (
              <React.Fragment>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#6f6a60' }}>Order by</span>
                <SortSeg sort={sort} setSort={setSort} />
                {sort === 'bat' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#a09a8e' }}>
                    <span className="grip" style={{ opacity: .5 }}><i></i><i></i><i></i></span>
                    drag a row · click any cell to assign
                  </span>
                )}
              </React.Fragment>
            ) : (
              <React.Fragment>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#6f6a60' }}>Inning</span>
                <InningStepper inning={inning} setInning={setInning} />
                <span style={{ fontSize: 12, color: '#a09a8e' }}>· step through all 7 innings</span>
              </React.Fragment>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            {violations > 0 ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#9a3412', background: '#f6e7df', border: '1px solid #eccfc0', borderRadius: 999, padding: '5px 11px' }}>
                <span style={{ width: 6, height: 6, borderRadius: 9, background: '#9a3412' }} />{violations} rule violation{violations > 1 ? 's' : ''}
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#3f6212', background: '#eef1e3', border: '1px solid #dbe3c6', borderRadius: 999, padding: '5px 11px' }}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.3l2.2 2.2 4.8-5" stroke="#3f6212" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Fair play on track
              </span>
            )}
          </div>
        </div>

        {view === 'grid' ? (
        <table>
          <colgroup>
            <col className="colbat" /><col className="colplayer" />
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <col key={n} />)}
          </colgroup>
          <thead>
            <tr>
              <th className={'colbat' + (sort === 'bat' ? ' sorted' : '')}>BAT</th>
              <th className="colplayer" style={{ textAlign: 'left', paddingLeft: 14 }}>PLAYER</th>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <th key={n} className="inncol">Inn {n}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((id) => (
              <Row key={id} id={id} slot={battingSlot(id)} sched={schedule[id]} scratched={DD.SCRATCHED.includes(id)}
                showGrip={sort === 'bat'} onGrip={onGrip} editKey={editKey} onCell={onCell} />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="colbat"></td>
              <td className="colplayer" style={{ textAlign: 'right', paddingRight: 14, letterSpacing: '.04em' }}>ON FIELD →</td>
              {onFieldPerInning.map((n, i) => (
                <td key={i} className="inncol" style={{ color: n === 9 ? '#3f6212' : '#9a3412', fontWeight: 600 }}>{n}<span style={{ color: '#b3aea3' }}>/9</span></td>
              ))}
            </tr>
          </tfoot>
        </table>
        ) : (
          <FieldView schedule={schedule} batting={batting} inning={inning} onCellEdit={onCell} onPosEdit={onPos} />
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 22px', background: '#fcfbf8', borderTop: '1px solid #e7e4dc', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {[['inf', 'Infield'], ['out', 'Outfield'], ['bat', 'Battery (P/C)']].map(([k, label]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#6f6a60' }}>
                <span style={{ width: 22, height: 16, borderRadius: 4, background: PAL[k].bg, border: `1px solid ${PAL[k].fg}22`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'IBM Plex Mono',monospace", fontSize: 8.5, fontWeight: 600, color: PAL[k].fg }}>{k === 'inf' ? 'SS' : k === 'out' ? 'CF' : 'P'}</span>
                {label}
              </span>
            ))}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#6f6a60' }}><span style={{ width: 22, height: 16, borderRadius: 4, background: '#f1efe8', border: '1px solid #e3e0d8' }} />Bench</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#6f6a60' }}><span style={{ width: 22, height: 16, borderRadius: 4, background: '#f8f0db', border: '1px solid #ecdcb6' }} />Late / Out</span>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: banner.tone === 'ok' ? '#3f6212' : '#9a3412', background: banner.tone === 'ok' ? '#eef1e3' : '#f8ece6', border: `1px solid ${banner.tone === 'ok' ? '#dbe3c6' : '#eccfc0'}`, borderRadius: 8, padding: '7px 12px', maxWidth: 560 }}>
            <span style={{ flex: '0 0 auto', width: 16, height: 16, borderRadius: 999, background: banner.tone === 'ok' ? '#3f6212' : '#9a3412', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{banner.tone === 'ok' ? '✓' : '!'}</span>
            <span><strong style={{ fontWeight: 700 }}>{banner.main}</strong> — <span style={{ color: banner.tone === 'ok' ? '#5b7a2e' : '#b06a4a' }}>{banner.hint}</span></span>
          </div>
        </div>

        {edit && edit.kind === 'cell' && <CellPopover target={edit} schedule={schedule} batting={batting} onAssign={assign} onClose={() => setEdit(null)} />}
        {edit && edit.kind === 'pos' && <PositionPopover target={edit} schedule={schedule} batting={batting} onAssign={assign} onClose={() => setEdit(null)} />}
      </div>
    );
  };
})();
