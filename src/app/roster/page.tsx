"use client";

import PlayerList from "@/components/roster/PlayerList";

export default function RosterPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Roster</h1>
        <p className="text-slate-400 text-sm mt-1">
          Add players, set their jersey numbers, and configure which positions they can play.
        </p>
      </div>
      <PlayerList />
    </div>
  );
}
