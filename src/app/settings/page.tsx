"use client";

import { useState } from "react";
import { useDiamondDraftStore } from "@/lib/store";
import type { LeagueRules } from "@/lib/types";

export default function SettingsPage() {
  const rules = useDiamondDraftStore((s) => s.settings.leagueRules);
  const updateLeagueRules = useDiamondDraftStore((s) => s.updateLeagueRules);
  const exportBackup = useDiamondDraftStore((s) => s.exportBackup);
  const importBackup = useDiamondDraftStore((s) => s.importBackup);
  const clearAllData = useDiamondDraftStore((s) => s.clearAllData);

  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const fields: Array<{
    key: keyof LeagueRules;
    label: string;
    type: "number" | "boolean";
    help?: string;
  }> = [
    { key: "defaultInnings", label: "Default innings per game", type: "number" },
    { key: "minFieldPlayers", label: "Min field players per inning", type: "number" },
    { key: "maxFieldPlayers", label: "Max field players per inning", type: "number" },
    {
      key: "maxConsecutiveBench",
      label: "Max consecutive bench innings",
      type: "number",
      help: "0 = no limit",
    },
    {
      key: "minFieldInningsPerPlayer",
      label: "Min field innings per player per game",
      type: "number",
    },
    {
      key: "globalPitchingLimitGame",
      label: "Global pitching limit per game (innings)",
      type: "number",
      help: "0 = no limit",
    },
    {
      key: "pitchingRestInnings",
      label: "Required rest innings between games for pitchers",
      type: "number",
      help: "0 = no rest required",
    },
    {
      key: "enforcePositionEligibility",
      label: "Enforce position eligibility",
      type: "boolean",
    },
    { key: "enforceFairPlayTime", label: "Enforce fair play time", type: "boolean" },
    {
      key: "enforceNoPitchingAfterCatching",
      label: "No pitching after catching in same game",
      type: "boolean",
    },
  ];

  async function handleSave(key: keyof LeagueRules, value: number | boolean) {
    await updateLeagueRules({ [key]: value });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleExport() {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
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
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Configure league rules and manage your data.</p>
      </div>

      {/* League Rules */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">League Rules</h2>
          {saved && (
            <span className="text-green-400 text-xs font-medium">Saved ✓</span>
          )}
        </div>

        {fields.map(({ key, label, type, help }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-200">{label}</p>
              {help && <p className="text-xs text-slate-500 mt-0.5">{help}</p>}
            </div>
            {type === "boolean" ? (
              <input
                type="checkbox"
                checked={rules[key] as boolean}
                onChange={(e) => handleSave(key, e.target.checked)}
                className="w-5 h-5 accent-blue-500 flex-shrink-0"
              />
            ) : (
              <input
                type="number"
                min={0}
                value={rules[key] as number}
                onChange={(e) => handleSave(key, Number(e.target.value))}
                className="w-20 bg-slate-700 border border-slate-600 rounded-md px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
              />
            )}
          </div>
        ))}
      </div>

      {/* Data Management */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-white">Data Management</h2>
        <p className="text-xs text-slate-400">
          All data is stored locally in your browser. Export a backup to keep a copy.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExport}
            className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Export Backup
          </button>
          <label className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer">
            Import Backup
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
          </label>
        </div>

        <div className="border-t border-slate-700 pt-4">
          {!confirmClear ? (
            <button
              onClick={() => setConfirmClear(true)}
              className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
            >
              Clear All Data…
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <span className="text-sm text-red-300">
                This will delete all players, games, and settings. Are you sure?
              </span>
              <button
                onClick={async () => {
                  await clearAllData();
                  setConfirmClear(false);
                }}
                className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors"
              >
                Clear Everything
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
