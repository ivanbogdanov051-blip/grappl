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
| Abilities | keys 1–9, 0 (or click the icons) | ability buttons at the bottom |
| Mute | M | |

## How the hook works

1. **Shoot**: the hook flies to your crosshair. The ring turns green when something is in range and red when you are aiming at someone.
2. When it sticks, the button becomes **PULL**. Pulling makes the hook disappear and launches you at the hook point with a climb boost. If you hit a wall you scramble up it.
3. You can chain hooks in mid-air.
4. **✕** reels a missed or unwanted hook back in.
5. Hook an enemy or a player to damage them. Then **YANK** to fling them toward you and past you, ideally off the island.

## Enemies (red)

Enemies walk, chase you, grapple between islands, **hook-pull** you to them, and do the dangerous **swap**: they fly to you while you get flung to where they were standing. Knocked-off enemies try to grapple back to safety.

## Enemy types

| Enemy | Look | Health | Bounty | Style |
|---|---|---|---|---|
| Grappler | red | 60 | 30 | All-rounder: pulls, swaps, grapples around |
| Zipper | pink, small | 45 | 35 | Fast, attacks often, loves the swap move |
| Sniper | orange, small | 35 | 35 | Hooks you from up to 170 m away and keeps its distance |
| Brute | dark red, big | 160 | 50 | Slow but hits hard; its bump sends you flying |
| **Sky Titan** (boss) | giant with a gold crown | 900 | 300 | Can't be knocked around, ground-slams anyone near it, double-damage hooks. Appears every few minutes and shows a boss health bar |

## Rules

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

## Multiplayer

- **Online – public lobby**: everyone who clicks it ends up in the same world.
- **Create private room**: you get a 5-letter code. Click the room info at the top right to copy an invite link (`?room=CODE`).
- The first player in a room hosts it. If the host leaves, another player takes over automatically.
- You are blue, other players glow green (visible through walls and islands) and enemies are red. It's free-for-all with friendly fire.
- It uses the free public PeerJS server and WebRTC. Some strict networks (some school, work or mobile-carrier networks) can block peer-to-peer connections.

## Graphics

Pick **High** (shadows, longer view distance) or **Low** (for phones) in the menu. Phones default to Low.

## Dev hooks

- `?autotest`: runs about 30 simulated seconds of gameplay (grapple, attack, enemy fight) and prints the results to the page.
- `?shot=1|2|9`: preset camera views for screenshots.
