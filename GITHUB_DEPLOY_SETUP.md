# GitHub-based deployment setup (Railway for Discord/API + Firebase for Web)

Repository:
- https://github.com/laxhmmu586/DISCORD-MU-BOT.git

This guide configures **both platforms to deploy directly from GitHub**.

---

## 1) Railway: connect GitHub for Discord bot + backend API

### A. Create Railway project from GitHub
1. Go to Railway dashboard.
2. `New Project` -> `Deploy from GitHub repo`.
3. Select repository: `laxhmmu586/DISCORD-MU-BOT`.
4. Railway root directory: `/` (repo root).

### B. Service settings
- Build/Start can use defaults from `package.json`:
  - Start command: `npm start`
- This launches `index.js` (Discord bot + Express `/search` API).

### C. Environment variables (Railway)
Set in Railway service variables:
- `DISCORD_TOKEN` = your discord bot token
- `WEB_ORIGIN` = your Firebase frontend domain (for CORS), e.g.
  - `https://china-eastern.web.app`
  - or your custom Firebase domain

### D. Domain
- Create/attach Railway public domain.
- Example: `https://api.mufcapp.net`
- You will use this as frontend API base.

---

## 2) Firebase Hosting: connect GitHub for web pages

Frontend files are under:
- `public/public/index.html`
- `public/public/login.html`

Firebase config files are under:
- `public/firebase.json`
- `public/.firebaserc`

### A. In Firebase Console
1. Go to Hosting -> `Get started` / existing site.
2. Open `GitHub integration`.
3. Connect GitHub account and select repo:
   - `laxhmmu586/DISCORD-MU-BOT`
4. Branch: usually `main` (or your production branch).

### B. Build/deploy settings for Firebase GitHub action
Because Firebase config is inside `public/`, set working directory to `public` in workflow.

If Firebase asks for build command/output:
- Build command: *(none required for static HTML)*
- Deploy target/public dir: from `public/firebase.json` (already `public` relative to that folder)

### C. Important
GitHub Actions deploy should run from `public/` directory so it picks up `public/firebase.json` and `public/.firebaserc` correctly.

---

## 3) Configure frontend to call Railway API (GitHub-managed files)

This project resolves API base from code/runtime in this order:
1. `window.MU_API_BASE`
2. `https://api.mufcapp.net`

Old `localStorage.mu_api_base` values are ignored so stale browser settings cannot break production SY search.

For permanent production config, add before app script in hosted page:

```html
<script>
  window.MU_API_BASE = 'https://api.mufcapp.net';
</script>
```

Use GitHub commit to update this value so everything remains source-controlled.

---

## 4) Recommended flow (all changes through GitHub)

1. Edit code locally.
2. Push to GitHub repo.
3. Railway auto-redeploys backend from GitHub.
4. Firebase Hosting auto-redeploys web from GitHub.

No manual file uploads needed.

---

## 5) Verification checklist

- Railway logs show Discord bot login success.
- `GET https://api.mufcapp.net/search?q=test` returns JSON or expected API error JSON.
- Firebase site loads `login.html` / `index.html`.
- Browser search no longer shows generic `Search failed`.
- CORS allowed origin matches your exact Firebase domain.

