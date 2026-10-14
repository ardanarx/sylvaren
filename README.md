# Sylvaren 🌿

Cozy top-down farming adventure prototype built with Phaser 3, TypeScript, and Vite. Designed to work in mobile and desktop browsers.

## What's included

- Procedural pixel-style village map, river, house, well, garden, trees, bridge, and cave-side rocks.
- Keyboard controls (WASD / arrow keys), plus touch controls on small screens.
- Four tools: hoe, tomato seeds, water, and hand/harvest.
- Planting, watering, crop growth across days, harvesting, coins, seeds, wood, and stone counters.
- Local save using `localStorage`.
- Optional Supabase client configuration and SQL schema for secure per-user cloud saves.
- Responsive UI, Vercel config, and GitHub-ready source.

## Requirements

- Node.js 20 LTS or newer recommended
- npm
- Git (for GitHub deployment)

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`).

Check types/build:

```bash
npm run typecheck
npm run build
npm run preview
```

## Controls

### Desktop
- `W A S D` or arrow keys: move
- `1`: hoe
- `2`: seeds
- `3`: water
- `4`: hand / harvest / gather
- `Space` or `E`: use the selected tool on the tile in front of the character
- Click the tool cards to choose a tool.
- Click **Tidur & lanjut hari** to advance the day.

### Mobile
- Use the on-screen directional pad to move.
- `A / Aksi` uses the current tool.
- `B / Alat` cycles through tools.

## Farming loop

1. Move next to an empty tile and select **Cangkul**.
2. Face the tile and press Space/E (or Aksi).
3. Select **Benih**, then use it on the tilled tile.
4. Select **Siram** and water the crop once that day.
5. Press **Tidur & lanjut hari**. A watered crop advances one growth stage.
6. At stage 3, select **Tangan** and harvest for two tomatoes and 8 coins.

The game is a prototype: crop placement is tile-based, interactions target the tile in front of the player, and collision/pathfinding are intentionally simple.

## Supabase setup (optional)

The game works without Supabase and stores progress locally. To configure the Supabase client:

1. Create a project at [Supabase](https://supabase.com/).
2. Open **Project Settings → API** (or **Connect**) and copy the Project URL and the publishable/anon key.
3. Copy `.env.example` to `.env.local` and fill in:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

4. In Supabase **SQL Editor**, run `supabase/schema.sql`.
5. Restart the Vite dev server after changing environment variables.

**Security:** only put a publishable/anon key in client-side environment variables. Never put the `service_role` key in frontend code. The included table uses RLS to restrict rows to the owning authenticated user.

### Current cloud-save scope

This MVP includes the table, RLS policies, Supabase client, and a cloud-save write path when a user session exists. A full sign-up/login screen and loading cloud saves are not yet included. Until authentication is implemented, local saves are the reliable default. Do not treat the cloud save as active just because environment variables are set.

## Deploy with GitHub + Vercel

1. Create a new empty repository on GitHub named `sylvaren`.
2. From this project folder, run:

```bash
git init
git add .
git commit -m "Build Sylvaren MVP"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/sylvaren.git
git push -u origin main
```

3. Sign in to [Vercel](https://vercel.com/) and choose **Add New → Project**.
4. Import the `sylvaren` GitHub repository.
5. Vercel should detect Vite. Use:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
6. If using Supabase, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Project → Settings → Environment Variables**. Redeploy after setting them.
7. Open the deployment URL and test on desktop and mobile.

## Project structure

```text
sylvaren/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vercel.json
├── .env.example
├── supabase/
│   └── schema.sql
└── src/
    ├── main.ts
    ├── save.ts
    ├── style.css
    ├── supabase.ts
    └── vite-env.d.ts
```

## Suggested next milestones

1. Add sign-up/login and cloud save loading.
2. Replace code-drawn sprites with a consistent original tileset and sprite animations.
3. Add shop/NPC dialogue, recipes, quest tracking, and day/night transitions.
4. Add area transitions to Forest and Hollowdeep.
5. Add sound effects, accessibility settings, and a PWA install option.
6. Design server-authoritative multiplayer only after the single-player loop is stable.

## License

Prototype source is provided for your project; add your chosen license before public distribution.
