# Hex & Hue: Magic Pixel Puzzle

_A Little Magic in Every Color._

A free-to-play, cozy pixel puzzle for the web. Pick a box and your familiars (a bat, a cat, an ant,
an owl, a frog or a spider) come out of its potion bottle, each fetching one cube of the box's colour
from the edge of the picture and carrying it into the hole. Choose well: a box whose colour is still
buried waits, and when every tray waits you are stuck (Retry is always free). Walk a witch's journey
of 24 pictures in six chapters, from a first candle to your own grimoire.

- Game design: [docs/GAME_DESIGN_V2.md](docs/GAME_DESIGN_V2.md)
- How it is built, and the problems solved along the way: [docs/COOKBOOK.md](docs/COOKBOOK.md)
- Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md) · [CHANGELOG.md](CHANGELOG.md)
- Deploying (Netlify or VPS): [docs/DEPLOY.md](docs/DEPLOY.md)
- Contributor / agent guide: [CLAUDE.md](CLAUDE.md)

Stack: Phaser 4 · TypeScript · Vite · Astro · PWA. Hosting: Netlify or VPS.

```bash
npm install
npm run dev      # the site, with the game at /play
npm run verify   # everything CI runs
```
