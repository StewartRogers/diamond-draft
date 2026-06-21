"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useDiamondDraftStore,
  selectActiveTeam,
  selectActiveSeason,
} from "@/lib/store";
import { C, PageHeader } from "@/components/AppShell";

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button className={"dd-toggle" + (on ? " on" : "")} onClick={onToggle}>
      <i />
    </button>
  );
}

function RuleRow({
  title, body, on, onToggle,
}: { title: string; body: string; on: boolean; onToggle: () => void }) {
  return (
    <div
      style={{
        display: "flex", justifyContent: "space-between", gap: 20,
        padding: "16px 0", borderBottom: `1px solid ${C.line2}`,
      }}
    >
      <div style={{ maxWidth: 540 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 13, color: C.faint, marginTop: 3 }}>{body}</div>
      </div>
      <Toggle on={on} onToggle={onToggle} />
    </div>
  );
}

export default function SettingsPage() {
  const rules = useDiamondDraftStore((s) => s.settings.leagueRules);
  const activeTeam = useDiamondDraftStore(selectActiveTeam);
  const activeSeason = useDiamondDraftStore(selectActiveSeason);
  const teams = useDiamondDraftStore((s) => s.teams);
  const seasons = useDiamondDraftStore((s) => s.seasons);
  const createTeam = useDiamondDraftStore((s) => s.createTeam);
  const updateTeam = useDiamondDraftStore((s) => s.updateTeam);
  const deleteTeam = useDiamondDraftStore((s) => s.deleteTeam);
  const setActiveTeam = useDiamondDraftStore((s) => s.setActiveTeam);
  const createSeason = useDiamondDraftStore((s) => s.createSeason);
  const updateSeason = useDiamondDraftStore((s) => s.updateSeason);
  const deleteSeason = useDiamondDraftStore((s) => s.deleteSeason);
  const setActiveSeason = useDiamondDraftStore((s) => s.setActiveSeason);
  const updateLeagueRules = useDiamondDraftStore((s) => s.updateLeagueRules);
  const exportBackup = useDiamondDraftStore((s) => s.exportBackup);
  const importBackup = useDiamondDraftStore((s) => s.importBackup);
  const clearAllData = useDiamondDraftStore((s) => s.clearAllData);

  const teamName = activeTeam?.name ?? "";
  const headCoach = activeTeam?.headCoach ?? "";
  const leagueDivision = activeTeam?.leagueDivision ?? "";

  const [localTeamName, setLocalTeamName] = useState(teamName);
  const [localHeadCoach, setLocalHeadCoach] = useState(headCoach);
  const [localLeagueDivision, setLocalLeagueDivision] = useState(leagueDivision);
  const [defaultInnings, setDefaultInnings] = useState(String(rules.defaultInnings));
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameYear, setRenameYear] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [seasonDraftTeam, setSeasonDraftTeam] = useState<string | null>(null);
  const [seasonDraftName, setSeasonDraftName] = useState("");
  const [seasonDraftYear, setSeasonDraftYear] = useState(String(new Date().getFullYear()));

  // Re-sync the Team card's edit fields when the active team changes (switched
  // or newly created). Without this, the local state keeps the previous team's
  // values and saving would overwrite the new team's name/coach. This is React's
  // documented "adjust state during render when a prop changes" pattern.
  const [syncedTeamId, setSyncedTeamId] = useState(activeTeam?.id ?? null);
  if ((activeTeam?.id ?? null) !== syncedTeamId) {
    setSyncedTeamId(activeTeam?.id ?? null);
    setLocalTeamName(activeTeam?.name ?? "");
    setLocalHeadCoach(activeTeam?.headCoach ?? "");
    setLocalLeagueDivision(activeTeam?.leagueDivision ?? "");
  }

  async function handleCreateTeam() {
    const name = newTeamName.trim();
    if (!name) return;
    const team = await createTeam({ name });
    await setActiveTeam(team.id);
    setNewTeamName("");
  }

  function openSeasonDraft(teamId: string) {
    setSeasonDraftTeam(teamId);
    setSeasonDraftName("");
    setSeasonDraftYear(String(new Date().getFullYear()));
  }

  async function handleCreateSeason(team: { id: string; name: string }) {
    const name = seasonDraftName.trim();
    if (!name) return;
    const season = await createSeason({
      name,
      teamId: team.id,
      teamName: team.name,
      year: Number(seasonDraftYear) || new Date().getFullYear(),
    });
    await setActiveSeason(season.id);
    setSeasonDraftTeam(null);
  }

  function startRename(id: string, name: string, year: number) {
    setRenamingId(id);
    setRenameName(name);
    setRenameYear(String(year));
    setConfirmDeleteId(null);
  }

  async function saveRename(id: string) {
    const name = renameName.trim();
    if (!name) return;
    await updateSeason(id, { name, year: Number(renameYear) || new Date().getFullYear() });
    setRenamingId(null);
  }

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  async function handleSaveTeam() {
    if (activeTeam) {
      await updateTeam(activeTeam.id, {
        name: localTeamName.trim() || activeTeam.name,
        headCoach: localHeadCoach.trim(),
        leagueDivision: localLeagueDivision.trim(),
      });
    }
    await updateLeagueRules({ defaultInnings: Number(defaultInnings) || 7 });
    flash();
  }

  async function handleExport() {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diamond-draft-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await importBackup(JSON.parse(text));
  }

  return (
    <div className="dd-wrap" style={{ maxWidth: 820 }}>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        subtitle="Team identity and the fair-play rules the lineup builder checks against."
      />

      {/* Team card */}
      <div className="dd-card" style={{ padding: "8px 24px 20px" }}>
        <div style={{ padding: "18px 0 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="dd-eyebrow">{activeTeam ? `Team · ${activeTeam.name}` : "Team"}</span>
          {saved && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>Saved ✓</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, paddingBottom: 8 }}>
          <div className="dd-field">
            <label>Team name</label>
            <input
              className="dd-input"
              value={localTeamName}
              onChange={(e) => setLocalTeamName(e.target.value)}
              placeholder="e.g. Eastside Owls"
            />
          </div>
          <div className="dd-field">
            <label>Head coach</label>
            <input
              className="dd-input"
              value={localHeadCoach}
              onChange={(e) => setLocalHeadCoach(e.target.value)}
              placeholder="e.g. Coach Jamie"
            />
          </div>
          <div className="dd-field">
            <label>League / division</label>
            <input
              className="dd-input"
              value={localLeagueDivision}
              onChange={(e) => setLocalLeagueDivision(e.target.value)}
              placeholder="e.g. Spring Minors · 9U"
            />
          </div>
          <div className="dd-field">
            <label>Default innings</label>
            <input
              className="dd-input"
              type="number"
              min={1} max={12}
              value={defaultInnings}
              onChange={(e) => setDefaultInnings(e.target.value)}
            />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
          <button className="dd-btn sec" onClick={() => { setLocalTeamName(teamName); setLocalHeadCoach(headCoach); setLocalLeagueDivision(leagueDivision); setDefaultInnings(String(rules.defaultInnings)); }}>
            Discard
          </button>
          <button className="dd-btn pri" onClick={handleSaveTeam}>Save team info</button>
        </div>
      </div>

      {/* Teams & seasons management */}
      <div className="dd-card" style={{ padding: "8px 24px 20px", marginTop: 18 }}>
        <div style={{ padding: "18px 0 6px" }}>
          <span className="dd-eyebrow">Teams &amp; seasons</span>
        </div>
        <p style={{ fontSize: 13, color: C.faint, marginBottom: 14 }}>
          Create, rename, and delete teams and seasons here. Use the picker in the top bar to switch between them.
        </p>

        {/* Create team */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <input
            className="dd-input"
            style={{ maxWidth: 280 }}
            placeholder="New team name"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateTeam(); }}
          />
          <button className="dd-btn pri" onClick={handleCreateTeam} disabled={!newTeamName.trim()}>
            Create team
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {teams.map((team) => {
            const teamSeasons = seasons.filter((s) => s.teamId === team.id);
            return (
              <div key={team.id} style={{ border: `1px solid ${C.line2}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>
                    {team.name}
                    {team.id === activeTeam?.id && (
                      <span className="dd-zchip" style={{ background: C.greenBg, color: C.green, marginLeft: 8 }}>ACTIVE</span>
                    )}
                  </div>
                  {confirmDeleteId === `team:${team.id}` ? (
                    <span style={{ display: "flex", gap: 8, fontSize: 12.5, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ color: C.red }}>Delete team and its {teamSeasons.length} season(s)?</span>
                      <button className="dd-btn pri sm" style={{ background: C.red }} onClick={async () => { await deleteTeam(team.id); setConfirmDeleteId(null); }}>Delete</button>
                      <button className="dd-btn ghost sm" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                    </span>
                  ) : (
                    <button className="dd-btn ghost sm" style={{ color: C.red }} onClick={() => setConfirmDeleteId(`team:${team.id}`)}>Delete team</button>
                  )}
                </div>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {teamSeasons.length === 0 && (
                    <div style={{ fontSize: 12.5, color: C.faint }}>No seasons yet.</div>
                  )}
                  {teamSeasons.map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                      {renamingId === s.id ? (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", width: "100%" }}>
                          <input
                            value={renameYear}
                            onChange={(e) => setRenameYear(e.target.value)}
                            style={{ width: 64, padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.line2}`, fontSize: 13 }}
                            aria-label="Season year"
                          />
                          <input
                            value={renameName}
                            onChange={(e) => setRenameName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveRename(s.id); }}
                            autoFocus
                            style={{ flex: 1, minWidth: 140, padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.line2}`, fontSize: 13 }}
                            aria-label="Season name"
                          />
                          <button className="dd-btn pri sm" onClick={() => saveRename(s.id)}>Save</button>
                          <button className="dd-btn ghost sm" onClick={() => setRenamingId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <span>
                            {s.name} <span style={{ color: C.faint }}>· {s.year} · {s.roster.length} player{s.roster.length === 1 ? "" : "s"} · {s.gameIds.length} game{s.gameIds.length === 1 ? "" : "s"}</span>
                            {s.id === activeSeason?.id && (
                              <span className="dd-zchip" style={{ background: C.greenBg, color: C.green, marginLeft: 8 }}>ACTIVE</span>
                            )}
                          </span>
                          {confirmDeleteId === `season:${s.id}` ? (
                            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ color: C.red, fontSize: 12.5 }}>Delete season?</span>
                              <button className="dd-btn pri sm" style={{ background: C.red }} onClick={async () => { await deleteSeason(s.id); setConfirmDeleteId(null); }}>Delete</button>
                              <button className="dd-btn ghost sm" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                            </span>
                          ) : (
                            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <button className="dd-btn ghost sm" style={{ padding: "0 8px" }} onClick={() => startRename(s.id, s.name, s.year)}>Rename</button>
                              <button className="dd-btn ghost sm" style={{ color: C.red, padding: "0 8px" }} onClick={() => setConfirmDeleteId(`season:${s.id}`)}>Delete</button>
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  ))}

                  {/* Create season for this team */}
                  {seasonDraftTeam === team.id ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                      <input
                        value={seasonDraftYear}
                        onChange={(e) => setSeasonDraftYear(e.target.value)}
                        style={{ width: 64, padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.line2}`, fontSize: 13 }}
                        aria-label="Season year"
                      />
                      <input
                        value={seasonDraftName}
                        onChange={(e) => setSeasonDraftName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCreateSeason(team); }}
                        autoFocus
                        placeholder="Season name (e.g. Spring)"
                        style={{ flex: 1, minWidth: 160, padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.line2}`, fontSize: 13 }}
                        aria-label="Season name"
                      />
                      <button className="dd-btn pri sm" onClick={() => handleCreateSeason(team)} disabled={!seasonDraftName.trim()}>Add season</button>
                      <button className="dd-btn ghost sm" onClick={() => setSeasonDraftTeam(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button
                      className="dd-btn ghost sm"
                      style={{ alignSelf: "flex-start", marginTop: 2, color: C.green, padding: "0 8px" }}
                      onClick={() => openSeasonDraft(team.id)}
                    >
                      + New season
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fair-play rules card */}
      <div className="dd-card" style={{ padding: "8px 24px 14px", marginTop: 18 }}>
        <div style={{ padding: "18px 0 6px" }}>
          <span className="dd-eyebrow">Fair-play rules</span>
        </div>
        <div
          style={{
            display: "flex", justifyContent: "space-between", gap: 20,
            padding: "16px 0", borderBottom: `1px solid ${C.line2}`,
          }}
        >
          <div style={{ maxWidth: 540 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>Minimum innings on the field</div>
            <div style={{ fontSize: 13, color: C.faint, marginTop: 3 }}>
              Flag any player who fields fewer than the required number of innings across the game.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="number"
              min={1}
              max={9}
              disabled={!rules.enforceFairPlayTime}
              value={rules.minFieldInningsPerPlayer}
              onChange={(e) => {
                const v = Math.max(1, Math.min(9, Number(e.target.value)));
                if (!isNaN(v)) updateLeagueRules({ minFieldInningsPerPlayer: v });
              }}
              style={{ width: 52, padding: "4px 8px", borderRadius: 7, border: `1px solid ${C.line2}`, fontSize: 14, fontWeight: 700, textAlign: "center", opacity: rules.enforceFairPlayTime ? 1 : 0.4 }}
            />
            <Toggle on={rules.enforceFairPlayTime} onToggle={() => updateLeagueRules({ enforceFairPlayTime: !rules.enforceFairPlayTime })} />
          </div>
        </div>
        <RuleRow
          title="No back-to-back bench"
          body="Flag a player benched in two consecutive innings."
          on={rules.maxConsecutiveBench <= 1}
          onToggle={() => updateLeagueRules({ maxConsecutiveBench: rules.maxConsecutiveBench <= 1 ? 0 : 1 })}
        />
        <RuleRow
          title="Pitch / inning caps"
          body="Warn when a pitcher approaches their per-game or season inning limit."
          on={rules.globalPitchingLimitGame > 0}
          onToggle={() => updateLeagueRules({ globalPitchingLimitGame: rules.globalPitchingLimitGame > 0 ? 0 : 3 })}
        />
        <RuleRow
          title="No pitching after catching"
          body="A player who caught in a game may not pitch in the same game."
          on={rules.enforceNoPitchingAfterCatching}
          onToggle={() => updateLeagueRules({ enforceNoPitchingAfterCatching: !rules.enforceNoPitchingAfterCatching })}
        />
        <RuleRow
          title="Enforce position eligibility"
          body="Only assign players to positions they're eligible for during auto-fill."
          on={rules.enforcePositionEligibility}
          onToggle={() => updateLeagueRules({ enforcePositionEligibility: !rules.enforcePositionEligibility })}
        />
      </div>

      {/* Data management */}
      <div className="dd-card" style={{ padding: "8px 24px 20px", marginTop: 18 }}>
        <div style={{ padding: "18px 0 6px" }}>
          <span className="dd-eyebrow">Data management</span>
        </div>
        <p style={{ fontSize: 13, color: C.faint, marginBottom: 16 }}>
          All data is persisted server-side in SQLite. Export a backup to keep a local copy.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="dd-btn sec" onClick={handleExport}>Export backup</button>
          <label className="dd-btn sec" style={{ cursor: "pointer" }}>
            Import backup
            <input type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
          </label>
          <Link href="/import" className="dd-btn sec">Import CSV data →</Link>
        </div>
        <div style={{ borderTop: `1px solid ${C.line2}`, marginTop: 20, paddingTop: 16 }}>
          {!confirmClear ? (
            <button
              style={{ color: C.red, fontWeight: 600, fontSize: 13.5, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              onClick={() => setConfirmClear(true)}
            >
              Clear all data…
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13 }}>
              <span style={{ color: C.red }}>Delete all players, games, and settings?</span>
              <button className="dd-btn pri sm" style={{ background: C.red }} onClick={async () => { await clearAllData(); setConfirmClear(false); }}>
                Clear everything
              </button>
              <button className="dd-btn ghost sm" onClick={() => setConfirmClear(false)}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
