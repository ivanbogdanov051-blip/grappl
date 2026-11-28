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

export function computeStats(up, pas = {}) {
  const l = (k) => up[k] || 0;
  return {
    range: (90 + 30 * l('range')) * (pas.longarm ? 1.4 : 1),
    hookSpeed: 130 + 35 * l('hookSpeed'),
    pull: (56 + 9 * l('pull')) * (pas.turbopull ? 1.3 : 1),
    climbUp: 7 + 2.5 * l('climb'),
    climbReach: 10 + 4 * l('climb') + (pas.wallrunner ? 10 : 0),
    climbSpeed: 17 + 2.5 * l('climb') + (pas.wallrunner ? 5 : 0),
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
  { key: 'spear', icon: '🔱', name: 'Sky Spear', cost: 60, cd: 6, hk: ';', code: 'Semicolon', desc: 'Throw a super fast spear straight where you aim: 55 dmg to whoever it hits.' },
  { key: 'decoy', icon: '🧍', name: 'Decoy', cost: 80, cd: 15, hk: "'", code: 'Quote', desc: 'Drop a fake you. For 7 s bots go after the decoy instead of you.' },
  { key: 'anchor', icon: '⚓', name: 'Anchor Slam', cost: 70, cd: 8, hk: ',', code: 'Comma', desc: 'Dive straight down and smash the ground: up to 60 dmg in 10 m. The higher you fall from, the harder it hits.' },
  { key: 'overcharge', icon: '🔋', name: 'Overcharge', cost: 300, cd: 40, hk: '.', code: 'Period', desc: 'Instantly reset the cooldowns of all your other abilities.' },
  { key: 'blink', icon: '💫', name: 'Blink', cost: 60, cd: 5, hk: '/', code: 'Slash', desc: 'Teleport 20 m where you look (stops at walls).' },
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
  { key: 'blizzard', icon: '🌨️', name: 'Blizzard', rare: 'FROST QUEEN', cost: 0, cd: 18, hk: '[', code: 'BracketLeft', desc: 'A blizzard swirls around you for 4 s: everyone within 22 m keeps getting frozen and takes 8 dmg every 0.5 s.' },
  { key: 'shadowstep', icon: '🗡️', name: 'Shadow Step', rare: 'SKY REAPER', cost: 0, cd: 8, hk: ']', code: 'BracketRight', desc: 'Teleport behind the enemy you aim at (or the nearest one within 60 m) and backstab it for 60 dmg.' },
  { key: 'meteor', icon: '☄️', name: 'Meteor Storm', rare: 'INFERNO LORD', cost: 0, cd: 16, hk: 'Z', desc: 'Rain 7 meteors down where you aim (30 dmg each in 5 m).' },
  { key: 'boulder', icon: '🪨', name: 'Boulder Toss', rare: 'STONE COLOSSUS', cost: 0, cd: 9, hk: 'X', desc: 'Rip a huge boulder out of the ground and hurl it where you aim: up to 45 dmg, stuns for 2 s, smashes walls and lands as a solid block.' },
  { key: 'cage', icon: '⛓️', name: 'Stone Cage', rare: 'THE WARDEN', cost: 0, cd: 16, hk: '\\', code: 'Backslash', desc: 'Lock the enemy you aim at (or the nearest one within 50 m) inside a stone cage for 10 s. A Ground Grabber can rip it open.' },
);
export const ABILITY = Object.fromEntries(ABILITIES.map((a) => [a.key, a]));
// keyboard key for every ability (first ten use 1-9, 0)
export const abilityKey = (A) => A.hk || String((ABILITIES.indexOf(A) + 1) % 10);
export const abilityCode = (A) => A.code || (/\d/.test(abilityKey(A)) ? 'Digit' + abilityKey(A) : 'Key' + abilityKey(A));

// Passives: bought once in the rare purple PASSIVE SHOPS, always active.
export const PASSIVES = [
  { key: 'runner', icon: '🏃', name: 'RUNNER', cost: 2000, desc: 'Land on the ground while moving fast and you sprint at super speed for 2 seconds.' },
  { key: 'doublejump', icon: '🦅', name: 'Double Jump', cost: 1500, desc: 'Jump once more in mid-air.' },
  { key: 'lifesteal', icon: '🧛', name: 'Lifesteal', cost: 2500, desc: 'Heal 15% of all the damage you deal.' },
  { key: 'goldrush', icon: '💰', name: 'Gold Rush', cost: 1500, desc: '+50% coins from everything.' },
  { key: 'ironskin', icon: '🦾', name: 'Iron Skin', cost: 2500, desc: 'Take 25% less damage.' },
  { key: 'quickcharge', icon: '⚡', name: 'Quick Charge', cost: 3000, desc: 'All ability cooldowns are 25% shorter.' },
  { key: 'angel', icon: '😇', name: 'Guardian Angel', cost: 3500, desc: 'When you fall off an island, you are carried back to the last ground you stood on. Once every 60 s.' },
  { key: 'thorns', icon: '🌵', name: 'Thorns', cost: 2000, desc: 'Anyone who hurts you takes 10 damage back.' },
  { key: 'explosive', icon: '💥', name: 'Explosive Hook', cost: 3000, desc: 'Your hook explodes when it hits someone (18 dmg in 4.5 m).' },
  { key: 'regen', icon: '❤️‍🩹', name: 'Regenerator', cost: 1500, desc: 'Health comes back 3× faster and starts after 2 s instead of 4 s.' },
  { key: 'aircontrol', icon: '🪶', name: 'Air Control', cost: 1500, desc: 'Steer 2.5× better while flying through the air.' },
  { key: 'coinmagnet', icon: '🧲', name: 'Coin Magnet', cost: 1500, desc: 'Pick up coins from 12 m away (also dropped coin bags).' },
  { key: 'longarm', icon: '🎯', name: 'Long Arm', cost: 2500, desc: 'Your hook reaches 40% further.' },
  { key: 'turbopull', icon: '🚀', name: 'Turbo Pull', cost: 2500, desc: 'Pulls launch you 30% faster.' },
  { key: 'laststand', icon: '🛡️', name: 'Last Stand', cost: 4000, desc: 'Once per life, a hit that would kill you leaves you at 1 HP with 2 s of invincibility.' },
  { key: 'burning', icon: '🔥', name: 'Burning Hook', cost: 2000, desc: 'Your hook sets targets on fire: 40 extra dmg over 4 s.' },
  { key: 'wallrunner', icon: '🧗', name: 'Wall Runner', cost: 1500, desc: 'Scramble up walls 10 m higher and faster.' },
  { key: 'bloodlust', icon: '🩸', name: 'Bloodlust', cost: 2000, desc: 'Every kill heals you 30 HP.' },
  { key: 'bounty', icon: '🏆', name: 'Bounty Hunter', cost: 2500, desc: '+25 coins for every kill (+150 for bosses).' },
  { key: 'adrenaline', icon: '💢', name: 'Adrenaline', cost: 3000, desc: 'Below 30% health you move 40% faster and deal 50% more damage.' },
  // hook passives: each one only works while that grappling hook is equipped
  { key: 'hookmaster', hook: 'normal', icon: '🪝', name: 'Hook Master', cost: 2500, desc: 'STANDARD HOOK upgrade: reaches 30% further and hooking someone deals 50% more damage.' },
  { key: 'leechrope', hook: 'lightrope', icon: '🩸', name: 'Leech Rope', cost: 3000, desc: 'LIGHTROPE upgrade: whoever is tied to your rope loses 6 HP every second and you heal that much.' },
  { key: 'razorang', hook: 'boomerang', icon: '🪚', name: 'Razor Boomerang', cost: 3000, desc: 'BOOMERANG upgrade: 50% more damage, and it hits everyone again on the way back.' },
  { key: 'permafrost', hook: 'frost', icon: '🧊', name: 'Permafrost', cost: 3000, desc: 'FROST HOOK upgrade: freezes for 5 s instead of 2.5, and you can have 8 ice platforms that last 60 s.' },
  { key: 'warpblast', hook: 'warp', icon: '💥', name: 'Warp Blast', cost: 3500, desc: 'WARP HOOK upgrade: every warp leaves an explosion where you left (20 dmg in 5 m) and it recharges twice as fast.' },
  { key: 'tailwind', hook: 'wind', icon: '🌪️', name: 'Tailwind', cost: 3000, desc: 'WIND HOOK upgrade: 3 wind dashes instead of 2, and every dash blasts enemies within 7 m away (12 dmg).' },
  { key: 'stormcaller', hook: 'thunder', icon: '⛈️', name: 'Storm Caller', cost: 3500, desc: 'THUNDER HOOK upgrade: the lightning jumps to 6 enemies instead of 3 and stuns them for 1.5 s.' },
  { key: 'structgrab', hook: 'grabber', icon: '🏗️', name: 'Structure Lifter', cost: 5000, desc: 'GROUND GRABBER upgrade: grab a building and you rip out the WHOLE structure (houses, towers, windmills, even castles) and throw it. 60 dmg + 3 s stun.' },
];
export const PASSIVE = Object.fromEntries(PASSIVES.map((p) => [p.key, p]));

// Grappling hooks: bought with GEMS (+ coins) in the rare black-and-yellow HOOK SHOPS.
// Gems drop from bosses (5 each) and from players you take out (2).
export const HOOKS = [
  { key: 'normal', icon: '🪝', name: 'Standard Hook', gems: 0, cost: 0, design: 'Steel hook with a blue glow', desc: 'Your trusty hook: grapple onto anything, pull yourself there, yank enemies.' },
  { key: 'grabber', icon: '🟨', name: 'GROUND GRABBER', gems: 10, cost: 2500, design: 'A big striped yellow-and-black claw', desc: 'Rips a big chunk out of whatever it hits: dig holes in the ground, tear pieces out of walls, uproot trees and boulders. Click again to THROW it: a dotted arc shows exactly where it will land. It STUNS and hurts whoever it hits, smashes through walls and lands as a solid block, so you can wall in your friends or build cover to hide behind. Q sets it down in front of you. The crosshair turns yellow when something can be grabbed. Get STRUCTURE LIFTER at a passive shop to pick up whole buildings. It can\'t grapple you anywhere.', no: 'Snipe, Swap Shot, Hook Bomb, Super Leap shots, Explosive Hook, Burning Hook, Long Arm, Turbo Pull', block: ['snipe', 'swap', 'bomb'] },
  { key: 'lightrope', icon: '🪢', name: 'LIGHTROPE HOOK', gems: 5, cost: 3500, design: 'A small grey hook with black prongs on a thin loose rope', desc: 'Its rope is loose and dynamic and holds on to anything until you PULL. Hook a wall and swing around on it like a pendulum. Hook an enemy or a friend and they are tied to you: they can\'t get further away than the rope. Click to pull: you zoom to the wall, or you yank them in and keep them on a short leash. Q lets go.', no: 'Snipe', block: ['snipe'] },
  { key: 'boomerang', icon: '🪃', name: 'BOOMERANG HOOK', gems: 4, cost: 2000, design: 'A spinning orange-and-white curved blade', desc: 'Thrown, not fired: it flies out in a curve and comes back to you, slicing through EVERY enemy and player in its way (each one gets hit once). It scoops up coins and coin or gem bags on the way and brings them back to you. Click while it flies to call it back early. It can\'t grapple you anywhere.', no: 'Snipe, Swap Shot, Hook Bomb, Super Leap shots, Explosive Hook', block: ['snipe', 'swap', 'bomb'] },
  { key: 'frost', icon: '❄️', name: 'FROST HOOK', gems: 6, cost: 3000, design: 'An icy blue crystal hook on a frosted rope', desc: 'Grapples like the Standard Hook, but whoever it hits is FROZEN for 2.5 s. Click again while it is still flying and it freezes right there into an ICE PLATFORM you can stand on, and you stay hooked to it so you can pull yourself over. Build sky bridges or catch yourself when you fall. You can have 4 platforms at once and each one melts after 30 s.', no: 'Snipe', block: ['snipe'] },
  { key: 'warp', icon: '🌀', name: 'WARP HOOK', gems: 8, cost: 4500, design: 'A purple ring with a glowing cyan portal in the middle', desc: 'No pulling: wherever the hook lands, you TELEPORT there instantly and keep your speed. In mid-air a tap warps you right away to where you aim (or 20 m ahead if nothing is there). Hit an enemy or a player and you swap places with them (they get stunned for 1 s). It needs 1 s to recharge between warps.', no: 'Snipe, Swap Shot, Super Leap shots', block: ['snipe', 'swap'] },
  { key: 'wind', icon: '🌬️', name: 'WIND HOOK', gems: 6, cost: 3500, design: 'A white-and-teal fan hook wrapped in swirling wind', desc: 'While you hold it you have LOW GRAVITY: you jump higher and fall slowly. Tap in mid-air for a WIND DASH where you look (2 charges, refilled when you land or over time). Every hit on an enemy is a SWAP attack: you boost to them and they get flung to where you were. It still grapples walls normally.', no: 'Snipe, Swap Shot, Hook Bomb', block: ['snipe', 'swap', 'bomb'] },
  { key: 'thunder', icon: '⚡', name: 'THUNDER HOOK', gems: 7, cost: 4000, design: 'A crackling yellow bolt with electric-blue prongs', desc: 'Grapples like the Standard Hook but flies faster. Whoever it hits gets shocked, and the lightning jumps to 3 more enemies nearby (20 dmg each, short stun).', no: 'Snipe', block: ['snipe'] },
];
export const HOOK_DEF = Object.fromEntries(HOOKS.map((h) => [h.key, h]));
