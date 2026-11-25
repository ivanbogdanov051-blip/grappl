export const COSTS = [20, 45, 80, 130, 200];
export const MAX_LEVEL = COSTS.length;

export const UPGRADES = [
  { key: 'range', icon: '🎯', name: 'Hook Range', desc: 'How far your hook can fly', val: (l) => 90 + 30 * l, unit: 'm' },
  { key: 'hookSpeed', icon: '💨', name: 'Hook Speed', desc: 'How fast the hook flies', val: (l) => 130 + 35 * l, unit: 'm/s' },
  { key: 'pull', icon: '🚀', name: 'Pull Power', desc: 'Launch speed when you pull', val: (l) => 42 + 8 * l, unit: 'm/s' },
  { key: 'climb', icon: '🧗', name: 'Climb Boost', desc: 'Extra lift + how high you can scramble up walls', val: (l) => 6 + 3 * l, unit: 'm' },
  { key: 'damage', icon: '⚔️', name: 'Hook Damage', desc: 'Damage when your hook hits someone', val: (l) => 20 + 8 * l, unit: 'dmg' },
  { key: 'health', icon: '❤️', name: 'Max Health', desc: 'Survive more hits', val: (l) => 100 + 25 * l, unit: 'hp' },
  { key: 'speed', icon: '👟', name: 'Sprint Speed', desc: 'Running speed', val: (l) => 12 + 1.5 * l, unit: 'm/s' },
];

export function computeStats(up) {
  const l = (k) => up[k] || 0;
  return {
    range: 90 + 30 * l('range'),
    hookSpeed: 130 + 35 * l('hookSpeed'),
    pull: 42 + 8 * l('pull'),
    climbUp: 4 + 2 * l('climb'),
    climbReach: 6 + 3 * l('climb'),
    climbSpeed: 12 + 2 * l('climb'),
    damage: 20 + 8 * l('damage'),
    health: 100 + 25 * l('health'),
    speed: 12 + 1.5 * l('speed'),
  };
}
