"use client";

import { useState } from "react";
import { useDiamondDraftStore } from "@/lib/store";
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
  const teamName = useDiamondDraftStore((s) => s.settings.teamName);
  const updateSettings = useDiamondDraftStore((s) => s.updateSettings);
  const updateLeagueRules = useDiamondDraftStore((s) => s.updateLeagueRules);
  const exportBackup = useDiamondDraftStore((s) => s.exportBackup);
  const importBackup = useDiamondDraftStore((s) => s.importBackup);
  const clearAllData = useDiamondDraftStore((s) => s.clearAllData);

  const [localTeamName, setLocalTeamName] = useState(teamName);
  const [defaultInnings, setDefaultInnings] = useState(String(rules.defaultInnings));
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  async function handleSaveTeam() {
    await updateSettings({ teamName: localTeamName.trim() });
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
          <span className="dd-eyebrow">Team</span>
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
            <input className="dd-input" placeholder="e.g. Coach Jamie" />
          </div>
          <div className="dd-field">
            <label>League / division</label>
            <input className="dd-input" placeholder="e.g. Spring Minors · 9U" />
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
          <button className="dd-btn sec" onClick={() => { setLocalTeamName(teamName); setDefaultInnings(String(rules.defaultInnings)); }}>
            Discard
          </button>
          <button className="dd-btn pri" onClick={handleSaveTeam}>Save team info</button>
        </div>
      </div>

      {/* Fair-play rules card */}
      <div className="dd-card" style={{ padding: "8px 24px 14px", marginTop: 18 }}>
        <div style={{ padding: "18px 0 6px" }}>
          <span className="dd-eyebrow">Fair-play rules</span>
        </div>
        <RuleRow
          title="Minimum 2 innings on the field"
          body="Flag any player who fields fewer than two innings across the game."
          on={rules.enforceFairPlayTime}
          onToggle={() => updateLeagueRules({ enforceFairPlayTime: !rules.enforceFairPlayTime })}
        />
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
