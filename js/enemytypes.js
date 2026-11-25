// Enemy roster. w = how often they pick each hook attack (pull / swap / approach-by-grapple).
export const ENEMY_TYPES = {
  grappler: {
    name: 'Grappler', color: 0xe2372f, scale: 1, hp: 60, reward: 30, walk: 5, run: 10.5,
    hookSpeed: 95, range: 95, cool: [2.2, 4.7], dmg: 1, bumpDmg: 8, bumpK: 1,
    w: { pull: 0.42, swap: 0.24, approach: 0.34 }, spawn: 30,
  },
  zipper: {
    name: 'Zipper', color: 0xff3d8b, scale: 0.85, hp: 45, reward: 35, walk: 6.5, run: 13.5,
    hookSpeed: 120, range: 85, cool: [1.2, 2.4], dmg: 1, bumpDmg: 6, bumpK: 1,
    w: { pull: 0.2, swap: 0.6, approach: 0.2 }, spawn: 14,
  },
  sniper: {
    name: 'Sniper', color: 0xff8a1f, scale: 0.8, hp: 35, reward: 35, walk: 4.5, run: 9,
    hookSpeed: 170, range: 170, cool: [2.8, 4.5], dmg: 1.3, bumpDmg: 5, bumpK: 1,
    w: { pull: 0.85, swap: 0, approach: 0.15 }, keepAway: 35, accuracy: 0.5, spawn: 12,
  },
  brute: {
    name: 'Brute', color: 0x8f1414, scale: 1.75, hp: 160, reward: 50, walk: 4, run: 8,
    hookSpeed: 80, range: 80, cool: [3, 5], dmg: 1.6, bumpDmg: 18, bumpK: 2.2,
    w: { pull: 0.75, swap: 0, approach: 0.25 }, spawn: 12,
  },
  bomber: {
    name: 'Bomber', color: 0xd88a12, scale: 1.1, hp: 70, reward: 40, walk: 4.5, run: 9,
    hookSpeed: 75, range: 110, cool: [2.4, 4], dmg: 1, bumpDmg: 8, bumpK: 1,
    w: { pull: 0.15, swap: 0, bomb: 0.7, approach: 0.15 }, spawn: 12,
  },
  magnetron: {
    name: 'Magnetron', color: 0xa0287a, scale: 1.2, hp: 90, reward: 45, walk: 4.5, run: 9.5,
    hookSpeed: 95, range: 95, cool: [2.5, 4], dmg: 1, bumpDmg: 12, bumpK: 1.6,
    w: { pull: 0.5, swap: 0.1, approach: 0.4 }, special: 'magnet', specialCd: 7, spawn: 10,
  },
  phantom: {
    name: 'Phantom', color: 0x5b6dff, scale: 0.95, hp: 50, reward: 45, walk: 6, run: 12,
    hookSpeed: 110, range: 90, cool: [2, 3.5], dmg: 1, bumpDmg: 14, bumpK: 1.9,
    w: { pull: 0.3, swap: 0.4, approach: 0.3 }, special: 'blink', specialCd: 6, ghost: true, spawn: 10,
  },
  titan: {
    name: 'SKY TITAN', color: 0x4a0d0d, scale: 3.4, hp: 900, reward: 300, walk: 4, run: 9,
    hookSpeed: 120, range: 140, cool: [1.6, 2.8], dmg: 2, bumpDmg: 25, bumpK: 2.6,
    w: { pull: 0.55, swap: 0.25, approach: 0.2 }, boss: true, spawn: 0,
  },
};
export const ENEMY_KEYS = Object.keys(ENEMY_TYPES);
