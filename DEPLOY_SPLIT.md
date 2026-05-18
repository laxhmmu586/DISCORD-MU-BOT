# Deployment split: Railway (bot/API) + Firebase Hosting (web)

## Goal
- **Railway** runs Node.js backend + Discord bot.
- **Firebase Hosting** serves website files from `public/public/`.
- Website calls Railway API endpoint `/search` cross-origin.

## Railway (backend)
1. Keep start command as `npm start`.
2. Required env vars:
   - `DISCORD_TOKEN`
   - `WEB_ORIGIN` (optional custom frontend domain, e.g. `https://your-domain.com`)
3. Deploy root project as before.

Notes:
- Backend now allows CORS for:
  - `https://china-eastern.web.app`
  - `https://china-eastern.firebaseapp.com`
  - `WEB_ORIGIN` (if provided)

## Firebase Hosting (frontend)
This repo already includes Firebase config under `public/`:
- `public/firebase.json`
- `public/.firebaserc`

Deploy steps:
```bash
cd public
firebase deploy --only hosting
```

`firebase.json` hosts folder `public/` (relative to `public/`), i.e. actual site files in:
- `public/public/index.html`
- `public/public/login.html`

## Behavior kept unchanged
- Firebase login flow remains the same.
- Search feature still uses `/search` logic from backend; only API base switched to Railway domain in production.
- On localhost, frontend still uses relative `/search` for local dev.
