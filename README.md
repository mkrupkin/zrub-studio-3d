# ЗРУБ.студія — immersive 3D log-cabin configurator

An immersive scrollytelling site for a Carpathian log-cabin (зруб) workshop. A photo panorama of the Carpathians sits behind a real-time Three.js foreground — a green alpine meadow with configurable log cabins. Scroll drives a cinematic camera journey; at the configurator station you design your own cabin live (length, width, courses, roof, log diameter, wood tone) with an instant cost estimate.

## Stack
- Plain **HTML / CSS / JS** — no build step, no npm
- **Three.js r160** via CDN import map
- HDRI IBL lighting + PBR wood textures (Poly Haven CC0)
- Fonts: Fraunces + Karla

## Run
```bash
python -m http.server 8123
# → http://localhost:8123
```
Must be served over http (ES-module import map won't work over `file://`).

## ⚠️ Backdrop photo
`assets/backdrop.jpg` is **not** included in this repo (it was a stock photo used only for prototyping). Add your own **licensed or self-shot** wide Carpathian panorama (~2:1 landscape) as `assets/backdrop.jpg` and the site will use it automatically.

## Structure
- `index.html` — fixed full-viewport canvas + scroll sections (glass panels over the 3D)
- `css/style.css` — timber-craft design system
- `js/cabin.js` — pure procedural log-cabin builder (PBR wood) → THREE.Group
- `js/world.js` — the 3D world: meadow, spruce, path, cabins, camera journey, photo backdrop
- `js/main.js` — bootstrap, scroll→camera, configurator wiring

See `CLAUDE.md` for full architecture notes.
