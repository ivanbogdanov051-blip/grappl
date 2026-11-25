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
  { key: 'swap', icon: '🔄', name: 'Swap Shot', cost: 60, cd: 5, desc: 'Fire a hook: whoever it hits swaps places with you. They get flung to your spot.' },
  { key: 'leap', icon: '🦘', name: 'Super Leap', cost: 70, cd: 10, desc: 'Launch high into the air. Your next mid-air shot gets 2× range, speed and pull boost.' },
  { key: 'dash', icon: '💨', name: 'Dash', cost: 50, cd: 4, desc: 'Instant burst of speed where you look. Great for saving a fall.' },
  { key: 'shock', icon: '💥', name: 'Shockwave', cost: 90, cd: 9, desc: 'Blast everyone within 14 m away from you (20 dmg). Knock them off the island!' },
  { key: 'rewind', icon: '⏪', name: 'Rewind', cost: 100, cd: 15, desc: 'Teleport back to where you were 3 seconds ago. Undo a bad fall.' },
];
export const ABILITY = Object.fromEntries(ABILITIES.map((a) => [a.key, a]));
