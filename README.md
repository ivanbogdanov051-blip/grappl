# Sky Grapple

A first-person grappling-hook game set high above the clouds. The world is generated endlessly and is the same for every player. It has sky islands with trees, lakes, waterfalls, ruins, houses, towers and arches, plus rare shops. Red AI "Grapplers" hunt you, and the online mode is free-for-all through PeerJS.

## Run it

Double-click **`start.bat`** (needs [Node.js](https://nodejs.org)). It starts a small local server and opens `http://localhost:8080`.

The game is a set of ES modules, so double-clicking `index.html` does **not** work. It has to be served over http.

**On your phone (same Wi-Fi):** the server prints a LAN address such as `http://192.168.1.20:8080`. Open it on your phone.

**To play with friends anywhere:** upload the folder (`index.html`, `style.css`, `js/`) to any static host: GitHub Pages, Netlify Drop, itch.io (HTML game) or Cloudflare Pages. Then share the link. Three.js and PeerJS load from a CDN, so you need an internet connection.

## Install it as an app

Open the GitHub Pages link in Chrome or Edge (PC or Android) and press **📲 Install app** in the menu, or use the browser's install icon or menu. On iPhone, open it in Safari and tap **Share → Add to Home Screen**. The app gets its own icon, opens fullscreen, and solo mode also works offline.

## Controls

| | PC | Phone |
|---|---|---|
| Move | WASD / arrows | left-side joystick (push it fully to run) |
| Look | mouse | drag on the right side |
| Run | Shift | RUN toggle |
| Jump | Space | JUMP |
| Shoot hook → **Pull** | left click (or F) | SHOOT → PULL button |
| Cancel hook | right click / Q | ✕ button |
| Shop (when near one) | E | SHOP button |
| Switch grappling hook | Tab / mouse wheel | 🪝 button |
| Abilities | keys 1–9, 0, R, T Y U I O P G H J K, boss drops C V B N Z (or click the icons) | ability buttons at the bottom |
| Mute | M | |

## How the hook works

1. **Shoot**: the hook flies to your crosshair. The ring turns green when something is in range and red when you are aiming at someone.
2. When it sticks, the button becomes **PULL**. Pulling makes the hook disappear and launches you at the hook point with a climb boost. If you hit a wall you scramble up it.
3. You can chain hooks in mid-air.
4. **✕** reels a missed or unwanted hook back in.
5. Hook an enemy or a player to damage them. Then **YANK** to fling them toward you and past you, ideally off the island.

## Enemies (red)

Enemies walk, chase you, grapple between islands, **hook-pull** you to them, and do the dangerous **swap**: they fly to you while you get flung to where they were standing. Knocked-off enemies try to grapple back to safety. Bots that get stuck (on a wall, at a cliff edge, in a pond, or with no line of sight to you) notice within a couple of seconds: they grapple right next to you, hop over the obstacle, or after a few failed tries blink to open ground near you. Camping in a spot they can't reach no longer works.

## Enemy types

| Enemy | Look | Health | Bounty | Style |
|---|---|---|---|---|
| Grappler | red | 60 | 30 | All-rounder: pulls, swaps, grapples around |
| Zipper | pink, small | 45 | 35 | Fast, attacks often, loves the swap move |
| Sniper | orange, small | 35 | 35 | Hooks you from up to 170 m away and keeps its distance |
| Brute | dark red, big | 160 | 50 | Slow but hits hard; its bump sends you flying |
| Bomber | orange | 70 | 40 | Throws exploding hooks (up to 32 damage, knockback) |
| Magnetron | purple | 90 | 45 | Every 7 s yanks every player within 32 m to itself |
| Phantom | see-through blue | 50 | 45 | Teleports right behind you, then shoves you |
| Frostbite | icy blue | 65 | 45 | Its hook freezes you: you move at 45% speed for 2.5 s |
| Leaper | orange-red | 70 | 45 | Pounces through the air at you and ground-slams where it lands |
| Splitter | magenta, big | 90 | 40 | Splits into 2 fast Splitlings (22 HP, 15 coins each) when it dies |
| Medic | light pink | 55 | 50 | Stays back and heals nearby enemies (bosses too). Kill it first! |
| Kamikaze | bright red, small | 35 | 35 | Dives at you, sparks for 0.7 s, then explodes (9 m). Kill it, freeze it or get away |
| 👑 **Frost Queen** (boss) | ice-blue giant | 900 | 700 | Freezing hooks, a frost nova that freezes everyone within 24 m, and summons Frostbites. Drops **🌨️ Blizzard** |
| 👑 **Sky Reaper** (boss) | dark crimson giant | 800 | 700 | Fast; teleports behind you ("is behind you!" warning) and strikes, summons Phantoms. Drops **🗡️ Shadow Step** |
| 👑 **Inferno Lord** (boss) | orange-red giant | 950 | 700 | Rains meteors on you (red rings, so move!) and leaps across islands to slam down next to you. Drops **☄️ Meteor Storm** |
| 👑 **Stone Colossus** (boss) | huge brown-grey giant | 1100 | 700 | Rips boulders out of the island and hurls them at you (they stun for 1.6 s; every third throw is a volley of three), stomps when you get close and leaves holes everywhere. Drops **🪨 Boulder Toss** |
| 👑 **The Warden** (boss) | slate-blue giant | 950 | 700 | Locks you in stone cages (rip them open with the Ground Grabber, or wait 10 s) and chains you to itself so you can't get more than ~12 m away for 4 s. Drops **⛓️ Stone Cage** |
| 👑 **Thunder King** (boss) | blue giant | 850 | 600 | Calls lightning on every player near it (red warning rings, so move!). Drops **⚡ Thunder Strike** |
| 👑 **Void Maw** (boss) | black-purple giant | 1000 | 700 | Gravity pulses suck all nearby players in. Drops **🌀 Black Hole** |
| 👑 **Hive Queen** (boss) | gold giant | 750 | 600 | Exploding hooks and summons Zippers/Bombers. Drops **🐝 Hive Missiles** |
| **Sky Titan** (boss, drops 🌋 Titan Slam) | giant with a gold crown | 900 | 600 | Can't be knocked around, ground-slams anyone near it, double-damage hooks. Appears about every minute near you, marked by a red light beam and a 👑 BOSS compass arrow |

## Rules

- **When you die you drop ALL your coins** in a bag (with a gold beam) where you died, or where you fell from if you fell into the clouds. Grab it back before anyone else does: in multiplayer other players can steal it. Bags vanish after 3 minutes. Upgrades, abilities and passives are never lost.

- Falling into the clouds kills you. You respawn on the **spawn island** after 5 seconds. Spawn is a safe zone: nobody can hurt you there, you can't hurt anyone from there, and you heal quickly there. Everywhere else your health regenerates slowly once you go 4 seconds without taking damage. Its blue light beam is visible from far away.
- Coins come from pickups (2 each), killing enemies (30) and killing players (50). Your coins and upgrades are saved in your browser.
- Shops only appear on big islands. The arrow at the top of the screen points to the nearest one. They sell 7 upgrades with 5 levels each: range, hook speed, pull power, climb boost, damage, max health and sprint speed.

## Abilities (shop, buy once)

| Key | Ability | Cooldown | What it does |
|---|---|---|---|
| 1 | 🔄 Swap Shot | 5 s | A hook that swaps places with whoever it hits |
| 2 | 🦘 Super Leap | 10 s | Launches you high, and your next mid-air shot gets 2× range, speed and pull boost |
| 3 | 💨 Dash | 4 s | A burst of speed where you look |
| 4 | 💥 Shockwave | 9 s | Blasts everyone within 14 m away from you (20 damage) |
| 5 | ⏪ Rewind | 15 s | Teleports you back to where you were 3 seconds ago |
| 6 | 🧲 Magnet | 8 s | Yanks every enemy and player within 35 m straight to you |
| 7 | 🛡️ Shield | 14 s | Blocks every hit, hook and knockback for 4 s |
| 8 | 🪂 Glide | 12 s | Slow fall with free steering for 6 s |
| 9 | 💣 Hook Bomb | 7 s | An exploding hook: up to 40 damage and knockback in 9 m. Blast yourself for a rocket jump |
| 0 | 💚 Heal | 20 s | Restores 50 health instantly |
| T | 🔥 Fireball | 5 s | A fireball straight where you aim, up to 35 damage in 5 m |
| Y | ❄️ Frost Nova | 10 s | Freezes everyone within 16 m for 3 s (10 damage). Frozen bots can't move or shoot; bosses thaw faster |
| U | 👻 Cloak | 18 s | Invisible for 5 s: bots lose track of you |
| I | 🌩️ Chain Lightning | 9 s | Zaps the nearest enemy within 35 m and jumps to 3 more (25 damage each) |
| O | 🌪️ Tornado | 10 s | Throws everyone within 14 m high into the air (12 damage) |
| P | 🧨 Sky Mine | 6 s | Drops a mine that explodes when someone comes near (45 damage). Up to 3 at once |
| G | ⏳ Time Warp | 22 s | Slows every bot around you to 30% speed for 5 s |
| H | 🚀 Jetpack | 12 s | Fly wherever you look for 2.5 s |
| J | 🩸 Vampire | 16 s | For 6 s you heal half of the damage you deal |
| K | 😡 Rage | 15 s | For 5 s you deal double damage |
| ; | 🔱 Sky Spear (60) | 6 s | A super fast spear straight where you aim, 55 damage |
| ' | 🧍 Decoy (80) | 15 s | A fake you: bots chase it instead of you for 7 s |
| , | ⚓ Anchor Slam (70) | 8 s | Dive down and smash the ground: up to 60 damage in 10 m, more from higher up |
| . | 🔋 Overcharge (300) | 40 s | Resets all your other cooldowns |
| / | 💫 Blink (60) | 5 s | Teleport 20 m where you look |
| L | 🎯 **SNIPE** (200 coins) | 2 s | Zooms in and locks onto the closest enemy. Your next shot has 3× range and speed, deals 2.5× damage and explodes on impact (45 damage in 7 m), but only works on enemies/players: if it hits a wall it just fizzles (no grab, no pull). ✕ cancels it |
| - | 🎆 **MISSILE BARRAGE** (500, SUPER) | 18 s | 12 homing missiles at up to 6 targets within 100 m, 40 damage each |
| = | 🔴 **DEATH LASER** (800, SUPER) | 25 s | A beam from your gun for 3.5 s that burns whatever you aim at, about 100 damage per second, 200 m range |
| ` | ☢️ **NUKE** (1300, SUPER) | 45 s | Marks a spot up to 160 m away; 2 s later: 160 damage in 24 m plus a ring of meteors. It can't hurt you |
| R | ⚔️ **PARRY** (200 coins) | 10 s | For 2 s you can't be hurt, and anyone who hits you gets launched at you at super speed and takes 50 damage. You deal no damage while parrying |

**Button bar:** it holds 10 abilities on phones and 12 on PC (PARRY always has its own button). In the shop, owned abilities have an **✓ ON BAR / + ADD TO BAR** button to choose which ones get a button. On PC every owned ability works on its key either way.

## Passives (Passive Shops)

About 1 in 3 shops is a purple **PASSIVE SHOP** (purple roof, "PASSIVES" sign, purple keeper). A purple arrow at the top of the screen points to the nearest one. Passives are bought once, cost a lot and are always active: no button needed.

| Passive | Cost | Effect |
|---|---|---|
| 🏃 **RUNNER** | 2000 | Land on the ground while moving fast and you sprint at super speed (34+ m/s) for 2 seconds |
| 🦅 Double Jump | 1500 | Jump once more in mid-air |
| 🧛 Lifesteal | 2500 | Heal 15% of all damage you deal |
| 💰 Gold Rush | 1500 | +50% coins from everything |
| 🦾 Iron Skin | 2500 | Take 25% less damage |
| ⚡ Quick Charge | 3000 | All ability cooldowns 25% shorter |
| 😇 Guardian Angel | 3500 | Falling off an island carries you back to the last ground you stood on (once every 60 s) |
| 🌵 Thorns | 2000 | Anyone who hurts you takes 10 damage back |
| 💥 Explosive Hook | 3000 | Your hook explodes when it hits someone (18 damage in 4.5 m) |
| ❤️‍🩹 Regenerator | 1500 | Health regenerates 3× faster and starts after 2 s instead of 4 s |
| 🪶 Air Control | 1500 | Steer 2.5× better in the air |
| 🧲 Coin Magnet | 1500 | Pick up coins (and coin bags) from 12 m away |
| 🎯 Long Arm | 2500 | Hook reaches 40% further |
| 🚀 Turbo Pull | 2500 | Pulls launch you 30% faster |
| 🛡️ Last Stand | 4000 | Once per life, a killing hit leaves you at 1 HP with 2 s of invincibility |
| 🔥 Burning Hook | 2000 | Your hook sets targets on fire: 40 extra damage over 4 s |
| 🧗 Wall Runner | 1500 | Climb walls 10 m higher and faster |
| 🩸 Bloodlust | 2000 | Every kill heals 30 HP |
| 🏆 Bounty Hunter | 2500 | +25 coins per kill (+150 for bosses) |
| 💢 Adrenaline | 3000 | Below 30% health: 40% faster and 50% more damage |
| 🏗️ **Structure Lifter** | 5000 | GROUND GRABBER upgrade: grabbing a building rips out the WHOLE structure (house, tower, windmill, castle…) in one go. Throw it: 60 damage and a 3 s stun to everyone it hits, and it lands as a solid building. Grab a thrown building again to pick the whole thing back up |

## Gems and grappling hooks

**💎 Gems** drop from every boss (5, follow the cyan beam) and from players you take out online (2). Spend them at the very rare black-and-yellow **HOOK SHOP** (striped roof, "🪝 HOOKS" sign, a giant claw spinning over it). A yellow-black arrow at the top points to the nearest one. Bought hooks are kept forever; switch with Tab / mouse wheel (🪝 button on phones).

| Hook | Cost | Look | What it does |
|---|---|---|---|
| 🪝 Standard Hook | free | steel hook, blue glow | grapple, pull, yank |
| 🟨 **GROUND GRABBER** | 💎 10 + 🪙 2500 | big striped yellow-and-black claw | Rips a big chunk out of whatever it hits (3.2 m holes, 3.8 m wall pieces): digs holes in the ground, tears pieces out of walls, uproots trees and boulders, picks up blocks. Click again to **throw** it: a yellow dotted arc and a ghost box show exactly where it will land. It **stuns** (2.2 s) and hurts whoever it hits, smashes through walls and lands as a solid block, so you can wall in your friends or build cover. Q puts it down in front of you. The crosshair turns yellow over things you can grab and red over things that won't come loose. With the **Structure Lifter** passive it picks up whole buildings. Its claw also stuns people it hits. It can't grapple you anywhere, and Snipe, Swap Shot, Hook Bomb, Super Leap shots, Explosive Hook, Burning Hook, Long Arm and Turbo Pull don't work with it. Nothing can be ripped out of the safe zone or shops. |
| 🪢 **LIGHTROPE HOOK** | 💎 5 + 🪙 3500 | small grey hook, black prongs, thin loose rope | The rope is loose and holds on to anything until you **pull**. Hook a wall and swing like a pendulum. Hook an enemy or a player and they are tied to you: they can't get further away than the rope (a boss is too heavy and drags you instead). Click to pull: you zoom to the wall, or you yank them in and keep them on a short 4.5 m leash. Q lets go. Snipe doesn't work with it. |
| 🪃 **BOOMERANG HOOK** | 💎 4 + 🪙 2000 | spinning orange-and-white curved blade | Thrown, not fired: it curves out and comes back to you, slicing through every enemy and player in its way (each one hit once, 1.1× hook damage). It scoops up coins and coin or gem bags and brings them back to you. Click to call it back early. It can't grapple you anywhere; Snipe, Swap Shot, Hook Bomb, Super Leap shots and Explosive Hook don't work with it. |
| ❄️ **FROST HOOK** | 💎 6 + 🪙 3000 | icy blue crystal hook, frosted rope | Grapples like the Standard Hook, but whoever it hits is **frozen** for 2.5 s. Click again while it's still flying and it freezes right there into a 4 × 4 m **ice platform** you can stand on, and you stay hooked to it so you can pull yourself over. You can have 4 platforms at once and each one melts after 30 s. Snipe doesn't work with it. |
| 🌀 **WARP HOOK** | 💎 8 + 🪙 4500 | purple ring with a glowing cyan portal | No pulling: wherever it lands you **teleport** there instantly and keep your speed. If it hits an enemy or a player, you **swap places** (they're stunned for 1 s; bosses are too heavy, so you land behind them). 1 s recharge. Snipe, Swap Shot and Super Leap shots don't work with it. |

Everything the Ground Grabber changes (holes, ripped walls, thrown blocks) is shared with everyone in the room, including players who join later.

## Buildings

Islands now have castles (walls, gate, corner towers and a keep), windmills with turning sails, lighthouses with rotating beams, watchtowers with ladders, sandstone temples, barns, villages with a well, crate stacks and giant cube statues, as well as the old ruins, houses, towers and arches.

## Music

A fast (150 BPM), epic soundtrack is generated live in the browser: drums, bass, arpeggios, pads and lead melodies in D minor, about 2.5 minutes per pass through intro, verses, choruses, a breakdown and a build. Each time it loops it writes new melodies, so it doesn't repeat exactly. Set the **Music volume** in the menu or pause menu; **M** mutes all sound.

## Rare abilities (boss drops)

Killing a boss drops a golden gem with a gold light beam. Walk into it to unlock that boss's rare ability; if you already have it you get 150 coins instead.

| Key | Ability | Cooldown | Dropped by |
|---|---|---|---|
| C | 🌋 Titan Slam: 35 damage and huge knockback within 18 m | 12 s | Sky Titan |
| V | ⚡ Thunder Strike: lightning where you aim, up to 45 damage | 10 s | Thunder King |
| B | 🌀 Black Hole: sucks everyone in for 3 s, then bursts | 18 s | Void Maw |
| N | 🐝 Hive Missiles: 4 homing stingers, 30 damage each | 14 s | Hive Queen |
| [ | 🌨️ Blizzard: freezes and damages everyone within 22 m for 4 s | 18 s | Frost Queen |
| ] | 🗡️ Shadow Step: teleport behind an enemy and backstab it for 60 | 8 s | Sky Reaper |
| Z | ☄️ Meteor Storm: 7 meteors rain down where you aim, 30 damage each | 16 s | Inferno Lord |
| X | 🪨 Boulder Toss: rip a boulder out of the ground and hurl it where you aim, up to 45 damage and a 2 s stun; it lands as a block | 9 s | Stone Colossus |
| \\ | ⛓️ Stone Cage: lock the enemy you aim at (or the nearest within 50 m) in a stone cage for 10 s | 16 s | The Warden |

## Multiplayer

- **Online – public lobby**: everyone who clicks it ends up in the same world.
- **Create private room**: you get a 5-letter code. Click the room info at the top right to copy an invite link (`?room=CODE`).
- The first player in a room hosts it. If the host leaves, another player takes over automatically.
- You are blue, other players glow green (visible through walls and islands) and enemies are red. It's free-for-all with friendly fire.
- It uses the free public PeerJS server and WebRTC. Some strict networks (some school, work or mobile-carrier networks) can block peer-to-peer connections.

## Graphics

Pick **High** (shadows, longer view distance) or **Low** (for phones) in the menu. Phones default to Low.

Realism details (characters and enemies are still cubes): stone blocks, wood planks and roof shingles on buildings with real bumpy lighting, bare rock on steep slopes, softened cube edges, soft contact shadows under everyone, ropes that hang when they are slack, warmer sunlight, head bob, a camera dip and dust when you land, and dust from your feet when you run.

## Dev hooks

- `?autotest`: runs about 30 simulated seconds of gameplay (grapple, attack, enemy fight) and prints the results to the page.
- `?shot=1|2|9`: preset camera views for screenshots.
