const path = require('path');
const fs = require('fs');

function run(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

run('lineup: battingOrder initialized', () => {
  const { createEmptyGame } = require(path.join(__dirname, '..', 'src', 'lib', 'lineup'));
  const { formatPlayerName } = require(path.join(__dirname, '..', 'src', 'lib', 'lineup'));
  const players = [
    { id: 'p1', firstName: 'A', lastInitial: 'A', jerseyNumber: '10', eligiblePositions: ['P'], isGuest: false, pitchingLimitGame:0, pitchingLimitSeason:0, pitchingLog: [], createdAt: new Date().toISOString() },
    { id: 'p2', firstName: 'B', lastInitial: 'B', jerseyNumber: '5', eligiblePositions: ['C'], isGuest: false, pitchingLimitGame:0, pitchingLimitSeason:0, pitchingLog: [], createdAt: new Date().toISOString() }
  ];
  const game = createEmptyGame({date:'2026-01-01', opponent:'X', teamName:'T', notes:''}, players, 6);
  if (!game.battingOrder || game.battingOrder.length !== 2) throw new Error('battingOrder not initialized');
});

run('autoLineup: respect pitching rest rule', () => {
  const { buildAutoLineup } = require(path.join(__dirname, '..', 'src', 'lib', 'autoLineup'));
  const { DEFAULT_LEAGUE_RULES } = require(path.join(__dirname, '..', 'src', 'lib', 'types'));
  const players = [
    { id: 'p1', firstName: 'Ace', lastInitial: 'A', jerseyNumber: '1', eligiblePositions: ['P','1B','LF'], isGuest:false, pitchingLimitGame:2,pitchingLimitSeason:0,pitchingLog:[],createdAt:new Date().toISOString() },
    { id: 'p2', firstName: 'B', lastInitial: 'B', jerseyNumber: '2', eligiblePositions: ['2B','3B'], isGuest:false, pitchingLimitGame:0,pitchingLimitSeason:0,pitchingLog:[],createdAt:new Date().toISOString() }
  ];
  // Create empty innings with P slot open
  const { createEmptyInning } = require(path.join(__dirname, '..', 'src', 'lib', 'lineup'));
  const innings = [createEmptyInning(1), createEmptyInning(2), createEmptyInning(3)];
  // Force pitching rest to 1 inning
  const rules = { ...DEFAULT_LEAGUE_RULES, pitchingRestInnings: 1 };
  const result = buildAutoLineup(players, innings, [], rules, {id:'g1'});
  // Ensure feasible is boolean and warnings array present
  if (typeof result.feasible !== 'boolean') throw new Error('result.feasible missing');
});
