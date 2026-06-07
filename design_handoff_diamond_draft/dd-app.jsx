// dd-app.jsx — Diamond Draft app shell + screens (Home, Roster, Games, New Game, Settings).
// Warm cream + olive design language, shared with the lineup builder. window.DiamondDraftApp
(function () {
  const { useState, useEffect, useRef } = React;
  const { DD, fmtName } = window;
  const { ZONE, isField, byId } = DD;

  // ---- shared tokens ----
  const C = {
    bg: '#efece6', card: '#fff', sub: '#fcfbf8', sub2: '#faf8f3',
    ink: '#211f1b', muted: '#6f6a60', faint: '#a09a8e', faint2: '#bdb8ad',
    line: '#e7e4dc', line2: '#eeece5', rule: '#d9d5cb',
    green: '#3f6212', greenBg: '#eef1e3', greenBd: '#dbe3c6',
    red: '#9a3412', redBg: '#f6e7df', redBd: '#eccfc0',
    amber: '#a16207', amberBg: '#f8f0db', amberBd: '#ecdcb6',
  };
  const ZBG = { bat: { bg: '#f7eed7', fg: '#9a6712' }, inf: { bg: '#ecf0e1', fg: '#3f6212' }, out: { bg: '#e7eef4', fg: '#345d86' } };
  const STATUS = {
    active: { t: 'Active', fg: C.green, bg: C.greenBg, bd: C.greenBd },
    late: { t: 'Arriving late', fg: C.amber, bg: C.amberBg, bd: C.amberBd },
    earlyLeave: { t: 'Leaves early', fg: C.amber, bg: C.amberBg, bd: C.amberBd },
    absent: { t: 'Out today', fg: C.faint, bg: '#f1efe8', bd: '#e3e0d8' },
  };

  const css = `
  .dda{font-family:'Hanken Grotesk',sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;min-height:100vh;background:${C.bg}}
  .dda *{box-sizing:border-box}
  .dda .nav{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:26px;height:64px;padding:0 30px;background:rgba(255,255,255,.86);backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid ${C.line}}
  .dda .brand{display:flex;align-items:center;gap:11px;font-weight:800;font-size:17px;letter-spacing:-.01em;white-space:nowrap}
  .dda .logo{width:24px;height:24px;background:${C.green};border-radius:5px;transform:rotate(45deg);flex:0 0 auto}
  .dda .navlinks{display:flex;align-items:center;gap:4px}
  .dda .navlink{padding:7px 14px;border-radius:9px;font-size:14px;font-weight:600;color:${C.muted};cursor:pointer;border:none;background:transparent;font-family:inherit;transition:background .12s,color .12s}
  .dda .navlink:hover{color:${C.ink};background:#f1efe8}
  .dda .navlink.on{color:${C.green};background:${C.greenBg}}
  .dda .avatar{margin-left:auto;width:34px;height:34px;border-radius:999px;background:#2b2a26;color:#f3f1ec;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px}
  .dda .wrap{max-width:1180px;margin:0 auto;padding:34px 30px 70px}
  .dda .wrap.wide{max-width:1380px}
  .dda h1.page{font-size:30px;font-weight:800;letter-spacing:-.02em;margin:0}
  .dda .sub{font-size:14.5px;color:${C.muted};margin:5px 0 0}
  .dda .eyebrow{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${C.faint}}
  .dda .card{background:${C.card};border:1px solid ${C.line};border-radius:16px;box-shadow:0 1px 3px rgba(40,35,25,.05),0 14px 40px rgba(40,35,25,.05)}
  .dda .btn{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 19px;border-radius:11px;border:none;font-family:inherit;font-weight:700;font-size:14px;cursor:pointer;transition:filter .12s,background .12s,box-shadow .12s;white-space:nowrap}
  .dda .btn.pri{background:${C.green};color:#fff;box-shadow:0 1px 2px rgba(40,35,25,.18)}
  .dda .btn.pri:hover{filter:brightness(1.08)}
  .dda .btn.sec{background:#fff;color:${C.ink};border:1px solid ${C.rule}}
  .dda .btn.sec:hover{background:#faf8f3}
  .dda .btn.ghost{background:transparent;color:${C.muted};padding:0 12px}
  .dda .btn.ghost:hover{background:#f1efe8;color:${C.ink}}
  .dda .btn.sm{height:34px;padding:0 13px;font-size:13px;border-radius:9px}
  .dda .pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 11px;font-size:12px;font-weight:600;border:1px solid}
  .dda .jersey{font-family:'IBM Plex Mono',monospace;font-weight:600;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:#eef0e6;color:${C.green}}
  .dda .zchip{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:600;padding:3px 7px;border-radius:6px}
  .dda .statnum{font-size:46px;font-weight:800;letter-spacing:-.03em;line-height:1}
  .dda .row{display:flex;align-items:center}
  .dda table{border-collapse:separate;border-spacing:0;width:100%}
  .dda thead th{font-family:'IBM Plex Mono',monospace;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${C.faint};text-align:left;padding:0 16px 11px;border-bottom:1.5px solid ${C.rule}}
  .dda tbody td{padding:13px 16px;border-bottom:1px solid ${C.line2};vertical-align:middle}
  .dda tbody tr:last-child td{border-bottom:none}
  .dda tbody tr:hover td{background:rgba(63,98,18,.035)}
  .dda .listrow{display:flex;align-items:center;gap:16px;padding:16px 18px;border-radius:13px;border:1px solid ${C.line};background:#fff;cursor:pointer;transition:border-color .12s,box-shadow .12s,transform .08s}
  .dda .listrow:hover{border-color:${C.greenBd};box-shadow:0 6px 18px rgba(40,35,25,.07);transform:translateY(-1px)}
  .dda .toggle{width:42px;height:25px;border-radius:999px;background:#d8d3c8;position:relative;cursor:pointer;transition:background .15s;flex:0 0 auto;border:none}
  .dda .toggle.on{background:${C.green}}
  .dda .toggle i{position:absolute;top:3px;left:3px;width:19px;height:19px;border-radius:999px;background:#fff;transition:left .15s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
  .dda .toggle.on i{left:20px}
  .dda .field{display:flex;flex-direction:column;gap:7px}
  .dda .field label{font-size:12.5px;font-weight:600;color:${C.muted}}
  .dda .input{height:44px;padding:0 13px;border-radius:10px;border:1px solid ${C.rule};background:#fff;font-family:inherit;font-size:14.5px;color:${C.ink};transition:border-color .12s,box-shadow .12s}
  .dda .input:focus{outline:none;border-color:${C.green};box-shadow:0 0 0 3px rgba(63,98,18,.13)}
  .dda .seg{display:inline-flex;background:#f1efe8;border:1px solid #e3e0d8;border-radius:10px;padding:3px;gap:2px}
  .dda .seg button{border:none;background:transparent;border-radius:7px;padding:8px 15px;font-family:inherit;font-size:13.5px;font-weight:600;color:${C.muted};cursor:pointer;transition:background .12s,color .12s}
  .dda .seg button.on{background:#fff;color:${C.green};box-shadow:0 1px 2px rgba(40,35,25,.08)}
  .dda .scrim{position:fixed;inset:0;z-index:40;background:rgba(33,30,22,.34);backdrop-filter:blur(2px);display:flex;align-items:flex-start;justify-content:center;padding:64px 20px;overflow:auto}
  .dda .modal{width:560px;max-width:100%;background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(30,26,18,.34)}
  .dda .crumb{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:${C.muted};font-weight:600;cursor:pointer}
  .dda .crumb:hover{color:${C.green}}
  `;

  // small primitives
  const Pill = ({ s, children }) => (
    <span className="pill" style={{ color: s.fg, background: s.bg, borderColor: s.bd }}>{children}</span>
  );
  const Jersey = ({ n, size = 28 }) => (
    <span className="jersey" style={{ minWidth: size, height: size, fontSize: size * 0.43, padding: '0 5px' }}>{n}</span>
  );
  const ZChips = ({ elig }) => (
    <span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>
      {elig.map((p) => { const z = ZBG[ZONE[p]]; return <span key={p} className="zchip" style={{ background: z.bg, color: z.fg }}>{p}</span>; })}
    </span>
  );

  // ───────────────────────── HOME ─────────────────────────
  function Home({ go, games }) {
    const players = DD.PLAYERS.length;
    const finalized = games.filter((g) => g.status === 'final').length;
    const stats = [
      { n: players, l: 'Players on roster', sub: `${DD.PLAYERS.filter((p) => p.status === 'active').length} active today` },
      { n: games.length, l: 'Games planned', sub: `${games.filter((g) => g.status === 'draft').length} in draft` },
      { n: finalized, l: 'Lineups finalized', sub: finalized === 0 ? 'None locked yet' : 'Ready to print' },
    ];
    return (
      <div className="wrap">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="eyebrow">{DD.GAME.team} · {DD.GAME.coach}</div>
            <h1 className="page" style={{ marginTop: 8 }}>Dugout</h1>
            <p className="sub">Plan fair, rule-clean lineups for every game on the schedule.</p>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn sec" onClick={() => go('roster')}>Manage roster</button>
            <button className="btn pri" onClick={() => go('newgame')}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
              New game
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18, marginTop: 26 }}>
          {stats.map((s, i) => (
            <div key={i} className="card" style={{ padding: '22px 24px' }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className="statnum" style={{ color: C.green }}>{s.n}</span>
                <span style={{ width: 30, height: 30, transform: 'rotate(45deg)', background: C.greenBg, border: `1px solid ${C.greenBd}`, borderRadius: 7 }} />
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 16 }}>{s.l}</div>
              <div style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="row" style={{ justifyContent: 'space-between', margin: '34px 0 14px' }}>
          <span className="eyebrow">Upcoming &amp; recent games</span>
          <span className="crumb" onClick={() => go('games')}>View all →</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {games.map((g) => <GameRow key={g.id} g={g} go={go} />)}
        </div>
      </div>
    );
  }

  function GameRow({ g, go }) {
    const st = g.status === 'final'
      ? { t: 'Finalized', fg: C.green, bg: C.greenBg, bd: C.greenBd }
      : g.status === 'draft'
        ? { t: 'Draft', fg: C.amber, bg: C.amberBg, bd: C.amberBd }
        : { t: 'Not started', fg: C.faint, bg: '#f1efe8', bd: '#e3e0d8' };
    return (
      <div className="listrow" onClick={() => go('lineup', g)}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: g.home ? C.greenBg : '#eef2f6', border: `1px solid ${g.home ? C.greenBd : '#dbe4ec'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, fontWeight: 700, color: g.home ? C.green : '#345d86', lineHeight: 1 }}>{g.day}</span>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9.5, fontWeight: 600, color: C.faint, letterSpacing: '.05em', marginTop: 1 }}>{g.mon}</span>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 9 }}>
            <span style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.home ? 'vs' : '@'} {g.opp}</span>
            <span className="zchip" style={{ flex: '0 0 auto', background: g.home ? C.greenBg : '#eef2f6', color: g.home ? C.green : '#345d86' }}>{g.home ? 'HOME' : 'AWAY'}</span>
          </div>
          <div style={{ fontSize: 13, color: C.faint, marginTop: 3, whiteSpace: 'nowrap' }}>{g.time} · {g.innings} innings · {g.players} players</div>
        </div>
        <div className="row" style={{ marginLeft: 'auto', gap: 16 }}>
          <Pill s={st}>{st.t}</Pill>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={C.faint2} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 4l5 5-5 5"/></svg>
        </div>
      </div>
    );
  }

  // ───────────────────────── ROSTER ─────────────────────────
  function Roster({ go }) {
    const [q, setQ] = useState('');
    const list = DD.PLAYERS.filter((p) => (p.first + ' ' + p.li).toLowerCase().includes(q.toLowerCase()) || p.num.includes(q));
    return (
      <div className="wrap">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="eyebrow">{DD.GAME.team}</div>
            <h1 className="page" style={{ marginTop: 8 }}>Roster</h1>
            <p className="sub">{DD.PLAYERS.length} players · {DD.PLAYERS.filter((p) => p.guest).length} guest · tap a player to edit eligibility &amp; status.</p>
          </div>
          <button className="btn pri">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
            Add player
          </button>
        </div>

        <div className="row" style={{ gap: 12, margin: '22px 0 16px' }}>
          <div style={{ position: 'relative', flex: '0 0 320px' }}>
            <svg style={{ position: 'absolute', left: 13, top: 13, pointerEvents: 'none' }} width="17" height="17" viewBox="0 0 18 18" fill="none" stroke={C.faint} strokeWidth="1.6"><circle cx="8" cy="8" r="5.5"/><path d="M12.5 12.5l3 3" strokeLinecap="round"/></svg>
            <input className="input" style={{ width: '100%', paddingLeft: 38 }} placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        <div className="card" style={{ padding: '18px 8px 8px', overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 70 }}>#</th>
                <th>Player</th>
                <th>Eligible positions</th>
                <th style={{ width: 130 }}>Plays</th>
                <th style={{ width: 150 }}>Status</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const s = STATUS[p.status];
                const isPitcher = p.elig.includes('P');
                return (
                  <tr key={p.id} style={{ cursor: 'pointer' }}>
                    <td><Jersey n={p.num} /></td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 700 }}>{fmtName(p)}</span>
                        {p.guest && <span className="zchip" style={{ background: C.amberBg, color: C.amber }}>GUEST</span>}
                      </div>
                    </td>
                    <td><ZChips elig={p.elig} /></td>
                    <td><span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: isPitcher ? C.green : C.muted, fontWeight: 600 }}>{isPitcher ? 'Pitcher' : 'Position'}</span></td>
                    <td><Pill s={s}>{s.t}</Pill></td>
                    <td>
                      <button className="btn ghost sm" style={{ padding: '0 8px' }}>
                        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke={C.faint} strokeWidth="1.5"><path d="M11.5 3.5l3 3L6 15l-3.5.5L3 12z" strokeLinejoin="round"/></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ───────────────────────── GAMES ─────────────────────────
  function Games({ go, games }) {
    const [filt, setFilt] = useState('all');
    const shown = games.filter((g) => filt === 'all' || g.status === filt);
    return (
      <div className="wrap">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="eyebrow">Season schedule</div>
            <h1 className="page" style={{ marginTop: 8 }}>Games</h1>
            <p className="sub">{games.length} games · {games.filter((g) => g.status === 'draft').length} need a lineup before game day.</p>
          </div>
          <button className="btn pri" onClick={() => go('newgame')}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
            New game
          </button>
        </div>
        <div className="seg" style={{ margin: '22px 0 16px' }}>
          {[['all', 'All'], ['draft', 'Draft'], ['final', 'Finalized']].map(([k, l]) => (
            <button key={k} className={filt === k ? 'on' : ''} onClick={() => setFilt(k)}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {shown.map((g) => <GameRow key={g.id} g={g} go={go} />)}
          {shown.length === 0 && <div className="card" style={{ padding: 40, textAlign: 'center', color: C.faint }}>No games in this filter.</div>}
        </div>
      </div>
    );
  }

  // ───────────────────────── NEW GAME (modal) ─────────────────────────
  function NewGame({ close, go }) {
    const [home, setHome] = useState(true);
    const [innings, setInnings] = useState(7);
    return (
      <div className="scrim" onClick={close}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div style={{ padding: '22px 26px', borderBottom: `1px solid ${C.line}` }} className="row">
            <div>
              <div className="eyebrow">New game</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>Set up the matchup</div>
            </div>
            <button className="btn ghost sm" style={{ marginLeft: 'auto', padding: '0 8px' }} onClick={close}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={C.muted} strokeWidth="1.7" strokeLinecap="round"><path d="M4 4l10 10M14 4L4 14"/></svg>
            </button>
          </div>
          <div style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="field"><label>Opponent</label><input className="input" placeholder="e.g. Riverside Rockets" defaultValue="" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="field"><label>Date</label><input className="input" type="text" placeholder="Sat · Jun 13, 2026" /></div>
              <div className="field"><label>First pitch</label><input className="input" type="text" placeholder="10:00 AM" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="field">
                <label>Home / Away</label>
                <div className="seg" style={{ alignSelf: 'flex-start' }}>
                  <button className={home ? 'on' : ''} onClick={() => setHome(true)}>Home</button>
                  <button className={!home ? 'on' : ''} onClick={() => setHome(false)}>Away</button>
                </div>
              </div>
              <div className="field">
                <label>Innings</label>
                <div className="seg" style={{ alignSelf: 'flex-start' }}>
                  {[6, 7, 9].map((n) => <button key={n} className={innings === n ? 'on' : ''} onClick={() => setInnings(n)}>{n}</button>)}
                </div>
              </div>
            </div>
            <div style={{ background: C.sub2, border: `1px solid ${C.line}`, borderRadius: 12, padding: '13px 15px', fontSize: 13, color: C.muted }}>
              The full active roster (<strong style={{ color: C.ink }}>{DD.PLAYERS.filter((p) => p.status !== 'absent').length} players</strong>) will be carried in. You'll set the batting order and positions on the next screen.
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 10, padding: '18px 26px', borderTop: `1px solid ${C.line}`, background: C.sub }}>
            <button className="btn sec" onClick={close}>Cancel</button>
            <button className="btn pri" onClick={() => { close(); go('lineup', null); }}>Create &amp; build lineup</button>
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────── SETTINGS ─────────────────────────
  function Settings() {
    const [rules, setRules] = useState({ minInnings: true, noBackToBack: true, pitchCap: true, rotateBattery: false, equalAtBats: true });
    const T = ({ k, title, body }) => (
      <div className="row" style={{ justifyContent: 'space-between', gap: 20, padding: '16px 0', borderBottom: `1px solid ${C.line2}` }}>
        <div style={{ maxWidth: 540 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 13, color: C.faint, marginTop: 3 }}>{body}</div>
        </div>
        <button className={'toggle' + (rules[k] ? ' on' : '')} onClick={() => setRules((r) => ({ ...r, [k]: !r[k] }))}><i></i></button>
      </div>
    );
    return (
      <div className="wrap" style={{ maxWidth: 820 }}>
        <div className="eyebrow">Configuration</div>
        <h1 className="page" style={{ marginTop: 8 }}>Settings</h1>
        <p className="sub">Team identity and the fair-play rules the lineup builder checks against.</p>

        <div className="card" style={{ padding: '8px 24px 20px', marginTop: 24 }}>
          <div style={{ padding: '18px 0 6px' }}><span className="eyebrow">Team</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, paddingBottom: 8 }}>
            <div className="field"><label>Team name</label><input className="input" defaultValue={DD.GAME.team} /></div>
            <div className="field"><label>Head coach</label><input className="input" defaultValue={DD.GAME.coach} /></div>
            <div className="field"><label>League / division</label><input className="input" defaultValue="Spring Minors · 9U" /></div>
            <div className="field"><label>Default innings</label><input className="input" defaultValue="7" /></div>
          </div>
        </div>

        <div className="card" style={{ padding: '8px 24px 14px', marginTop: 18 }}>
          <div style={{ padding: '18px 0 6px' }}><span className="eyebrow">Fair-play rules</span></div>
          <T k="minInnings" title="Minimum 2 innings on the field" body="Flag any player who fields fewer than two innings across the game." />
          <T k="noBackToBack" title="No back-to-back bench" body="Flag a player benched in two consecutive innings." />
          <T k="pitchCap" title="Pitch / inning caps" body="Warn when a pitcher approaches their per-game or season inning limit." />
          <T k="rotateBattery" title="Rotate battery each game" body="Suggest different pitchers and catchers from the previous game." />
          <div className="row" style={{ justifyContent: 'space-between', gap: 20, padding: '16px 0' }}>
            <div style={{ maxWidth: 540 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>Equal at-bats</div>
              <div style={{ fontSize: 13, color: C.faint, marginTop: 3 }}>Keep batting-order rotation even across the season.</div>
            </div>
            <button className={'toggle' + (rules.equalAtBats ? ' on' : '')} onClick={() => setRules((r) => ({ ...r, equalAtBats: !r.equalAtBats }))}><i></i></button>
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button className="btn sec">Discard</button>
          <button className="btn pri">Save settings</button>
        </div>
      </div>
    );
  }

  // ───────────────────────── LINEUP (wraps the builder) ─────────────────────────
  // Scales the fixed 1320px builder card down to fit the available width (never up).
  function FitCard({ width = 1320, children }) {
    const box = useRef(null);
    const inner = useRef(null);
    const [scale, setScale] = useState(1);
    const [h, setH] = useState(null);
    useEffect(() => {
      const fit = () => {
        if (!box.current || !inner.current) return;
        const s = Math.min(1, box.current.clientWidth / width);
        setScale(s);
        setH(inner.current.offsetHeight * s);
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(box.current);
      ro.observe(inner.current);
      window.addEventListener('resize', fit);
      return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
    }, [width]);
    return (
      <div ref={box} style={{ width: '100%', height: h == null ? 'auto' : h, overflow: 'hidden' }}>
        <div ref={inner} style={{ width, transformOrigin: 'top center', transform: `scale(${scale})`, margin: '0 auto' }}>{children}</div>
      </div>
    );
  }

  function Lineup({ go, game }) {
    return (
      <div className="wrap wide" style={{ paddingTop: 22 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <span className="crumb" onClick={() => go('games')}>
            <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 4l-5 5 5 5"/></svg>
            Games
          </span>
          <span className="pill" style={{ color: C.amber, background: C.amberBg, borderColor: C.amberBd }}>Draft · not finalized</span>
        </div>
        <FitCard width={1320}><window.BuilderGrid /></FitCard>
      </div>
    );
  }

  // ───────────────────────── SHELL ─────────────────────────
  const GAMES = [
    { id: 'g_a', day: '06', mon: 'JUN', opp: 'Riverside Rockets', home: true, time: '10:00 AM', innings: 7, players: 13, status: 'draft' },
    { id: 'g_b', day: '13', mon: 'JUN', opp: 'Northgate Knights', home: false, time: '1:30 PM', innings: 6, players: 12, status: 'draft' },
    { id: 'g_c', day: '20', mon: 'JUN', opp: 'Harbor Hawks', home: true, time: '11:00 AM', innings: 7, players: 13, status: 'none' },
    { id: 'g_d', day: '30', mon: 'MAY', opp: 'Lakeside Lions', home: false, time: '9:00 AM', innings: 7, players: 12, status: 'final' },
  ];

  window.DiamondDraftApp = function DiamondDraftApp() {
    const [screen, setScreen] = useState('home');
    const [modal, setModal] = useState(null);
    const [game, setGame] = useState(null);
    const go = (s, g) => {
      if (s === 'newgame') { setModal('newgame'); return; }
      if (g !== undefined) setGame(g);
      setScreen(s);
      window.scrollTo({ top: 0 });
    };
    const NAV = [['home', 'Home'], ['roster', 'Roster'], ['games', 'Games'], ['settings', 'Settings']];
    const navActive = screen === 'lineup' ? 'games' : screen;
    return (
      <div className="dda">
        <style>{css}</style>
        <div className="nav">
          <div className="brand"><span className="logo"></span>Diamond Draft</div>
          <div className="navlinks">
            {NAV.map(([k, l]) => <button key={k} className={'navlink' + (navActive === k ? ' on' : '')} onClick={() => go(k)}>{l}</button>)}
          </div>
          <div className="avatar">J</div>
        </div>
        {screen === 'home' && <Home go={go} games={GAMES} />}
        {screen === 'roster' && <Roster go={go} />}
        {screen === 'games' && <Games go={go} games={GAMES} />}
        {screen === 'settings' && <Settings />}
        {screen === 'lineup' && <Lineup go={go} game={game} />}
        {modal === 'newgame' && <NewGame close={() => setModal(null)} go={go} />}
      </div>
    );
  };
})();
