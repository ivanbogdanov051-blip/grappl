export const COSTS = [20, 45, 80, 130, 200];
export const MAX_LEVEL = COSTS.length;

export const UPGRADES = [
  { key: 'range', icon: '🎯', name: 'Hook Range', desc: 'How far your hook can fly', val: (l) => 90 + 30 * l, unit: 'm' },
  { key: 'hookSpeed', icon: '💨', name: 'Hook Speed', desc: 'How fast the hook flies', val: (l) => 130 + 35 * l, unit: 'm/s' },
  { key: 'pull', icon: '🚀', name: 'Pull Power', desc: 'Launch speed when you pull', val: (l) => 56 + 9 * l, unit: 'm/s' },
  { key: 'climb', icon: '🧗', name: 'Climb Boost', desc: 'Extra lift + how high you can scramble up walls', val: (l) => 10 + 4 * l, unit: 'm' },
  { key: 'damage', icon: '⚔️', name: 'Hook Damage', desc: 'Damage when your hook hits someone', val: (l) => 20 + 8 * l, unit: 'dmg' },
  { key: 'health', icon: '❤️', name: 'Max Health', desc: 'Survive more hits', val: (l) => 100 + 25 * l, unit: 'hp' },
  { key: 'speed', icon: '👟', name: 'Sprint Speed', desc: 'Running speed', val: (l) => 12 + 1.5 * l, unit: 'm/s' },
];

export function computeStats(up) {
  const l = (k) => up[k] || 0;
  return {
    range: 90 + 30 * l('range'),
    hookSpeed: 130 + 35 * l('hookSpeed'),
    pull: 56 + 9 * l('pull'),
    climbUp: 7 + 2.5 * l('climb'),
    climbReach: 10 + 4 * l('climb'),
    climbSpeed: 17 + 2.5 * l('climb'),
    damage: 20 + 8 * l('damage'),
    health: 100 + 25 * l('health'),
    speed: 12 + 1.5 * l('speed'),
  };
}

// Active abilities: bought once in the shop, then used with their own button (keys 1-5 on PC).
export const ABILITIES = [
  { key: 'swap', icon: '🔄', name: 'Swap Shot', cost: 30, cd: 5, desc: 'Fire a hook: whoever it hits swaps places with you. They get flung to your spot.' },
  { key: 'leap', icon: '🦘', name: 'Super Leap', cost: 35, cd: 10, desc: 'Launch high into the air. Your next mid-air shot gets 2× range, speed and pull boost.' },
  { key: 'dash', icon: '💨', name: 'Dash', cost: 25, cd: 4, desc: 'Instant burst of speed where you look. Great for saving a fall.' },
  { key: 'shock', icon: '💥', name: 'Shockwave', cost: 45, cd: 9, desc: 'Blast everyone within 14 m away from you (20 dmg). Knock them off the island!' },
  { key: 'rewind', icon: '⏪', name: 'Rewind', cost: 50, cd: 15, desc: 'Teleport back to where you were 3 seconds ago. Undo a bad fall.' },
  { key: 'magnet', icon: '🧲', name: 'Magnet', cost: 40, cd: 8, desc: 'Yank every enemy and player within 35 m straight to you (10 dmg).' },
  { key: 'shield', icon: '🛡️', name: 'Shield', cost: 45, cd: 14, desc: 'Block every hit, hook and knockback for 4 seconds.' },
  { key: 'glide', icon: '🪂', name: 'Glide', cost: 30, cd: 12, desc: 'Fall slowly and steer freely through the air for 6 seconds.' },
  { key: 'bomb', icon: '💣', name: 'Hook Bomb', cost: 55, cd: 7, desc: 'Fire an exploding hook: up to 40 dmg and big knockback in 9 m. Blast yourself for a rocket jump!' },
  { key: 'heal', icon: '💚', name: 'Heal', cost: 35, cd: 20, desc: 'Instantly restore 50 health.' },
  { key: 'snipe', icon: '🎯', name: 'SNIPE', cost: 200, cd: 2, hk: 'L', desc: 'Zoom in on the closest enemy. Your next shot flies 3× as far and 3× as fast, deals 2.5× damage and EXPLODES on impact (45 dmg in 7 m). Only works on enemies or players: if it hits a wall it does nothing.' },
  { key: 'barrage', icon: '🎆', name: 'MISSILE BARRAGE', super: true, cost: 500, cd: 18, hk: '-', code: 'Minus', desc: 'SUPER: fire 12 homing missiles at up to 6 targets within 100 m (40 dmg each, big blasts).' },
  { key: 'laser', icon: '🔴', name: 'DEATH LASER', super: true, cost: 800, cd: 25, hk: '=', code: 'Equal', desc: 'SUPER: a beam fires from your gun for 3.5 s and burns whatever you aim at (about 100 dmg per second, 200 m range).' },
  { key: 'nuke', icon: '☢️', name: 'NUKE', super: true, cost: 1300, cd: 45, hk: '`', code: 'Backquote', desc: 'SUPER: mark a spot up to 160 m away. 2 s later it is obliterated: 160 dmg in 24 m plus a ring of meteors. You are immune to your own nuke.' },
  { key: 'parry', icon: '⚔️', name: 'PARRY', cost: 200, cd: 10, hk: 'R', desc: 'For 2 seconds nothing can hurt you. Anyone who hits you gets launched at you at super speed and takes 50 damage. (You deal no damage while parrying.)' },
  { key: 'fireball', icon: '🔥', name: 'Fireball', cost: 45, cd: 5, hk: 'T', desc: 'Throw a fireball straight where you aim. Explodes for up to 35 dmg in 5 m.' },
  { key: 'frost', icon: '❄️', name: 'Frost Nova', cost: 45, cd: 10, hk: 'Y', desc: 'Freeze everyone within 16 m for 3 s (10 dmg). Frozen enemies can\'t move or shoot. Bosses thaw faster.' },
  { key: 'cloak', icon: '👻', name: 'Cloak', cost: 40, cd: 18, hk: 'U', desc: 'Turn invisible for 5 s: bots lose track of you and stop attacking.' },
  { key: 'chain', icon: '🌩️', name: 'Chain Lightning', cost: 50, cd: 9, hk: 'I', desc: 'Zap the nearest enemy within 35 m. It jumps to 3 more nearby (25 dmg each).' },
  { key: 'tornado', icon: '🌪️', name: 'Tornado', cost: 35, cd: 10, hk: 'O', desc: 'Throw everyone within 14 m high into the air (12 dmg). Great for knocking them off islands.' },
  { key: 'mine', icon: '🧨', name: 'Sky Mine', cost: 30, cd: 6, hk: 'P', desc: 'Drop a mine at your feet. Explodes when someone steps near (45 dmg). Up to 3 at once.' },
  { key: 'timewarp', icon: '⏳', name: 'Time Warp', cost: 60, cd: 22, hk: 'G', desc: 'Slow down every bot around you to 30% speed for 5 s.' },
  { key: 'jetpack', icon: '🚀', name: 'Jetpack', cost: 40, cd: 12, hk: 'H', desc: 'Fly wherever you look for 2.5 s.' },
  { key: 'vampire', icon: '🩸', name: 'Vampire', cost: 40, cd: 16, hk: 'J', desc: 'For 6 s you heal half of all the damage you deal.' },
  { key: 'rage', icon: '😡', name: 'Rage', cost: 50, cd: 15, hk: 'K', desc: 'For 5 s everything you do deals double damage.' },
];
// Rare abilities: only dropped by bosses
ABILITIES.push(
  { key: 'titanslam', icon: '🌋', name: 'Titan Slam', rare: 'SKY TITAN', cost: 0, cd: 12, hk: 'C', desc: 'Slam the ground: 35 dmg and huge knockback to everyone within 18 m.' },
  { key: 'thunder', icon: '⚡', name: 'Thunder Strike', rare: 'THUNDER KING', cost: 0, cd: 10, hk: 'V', desc: 'Call lightning where you aim (up to 120 m): up to 45 dmg in 7 m.' },
  { key: 'blackhole', icon: '🌀', name: 'Black Hole', rare: 'VOID MAW', cost: 0, cd: 18, hk: 'B', desc: 'Open a black hole where you aim. It sucks in enemies and players for 3 s, then bursts.' },
  { key: 'missiles', icon: '🐝', name: 'Hive Missiles', rare: 'HIVE QUEEN', cost: 0, cd: 14, hk: 'N', desc: 'Launch 4 homing stingers at the nearest targets (30 dmg each).' },
  { key: 'meteor', icon: '☄️', name: 'Meteor Storm', rare: 'INFERNO LORD', cost: 0, cd: 16, hk: 'Z', desc: 'Rain 7 meteors down where you aim (30 dmg each in 5 m).' },
);
export const ABILITY = Object.fromEntries(ABILITIES.map((a) => [a.key, a]));
// keyboard key for every ability (first ten use 1-9, 0)
export const abilityKey = (A) => A.hk || String((ABILITIES.indexOf(A) + 1) % 10);
export const abilityCode = (A) => A.code || (/\d/.test(abilityKey(A)) ? 'Digit' + abilityKey(A) : 'Key' + abilityKey(A));
