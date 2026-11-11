# Radar Deck

A small installable PWA for one person (VJ) to swipe through the daily radar's
job/grant/contest cards: right = Apply, left = Pass, Later to snooze 3 days,
CV first to request a tailored CV before applying. Works offline, syncs when
back online.

```
Cowork radar (daily) ──writes──▶ Drive: radar-deck-cards.json
                       ◀─reads── Drive: radar-deck-decisions.json
                                        ▲   │
              Apps Script web app (runs as you) reads both, writes decisions
                                        ▲   │  HTTPS (shared secret, no CORS preflight)
                            This PWA, static, deployed to Netlify
```

No secrets live in this repo, in chat, or in the cloud radar. The radar has no
tokens and can't call the Apps Script directly — it only reads/writes the two
Drive files, which is why those files are the hand-off point in both directions.

## 1. The Apps Script backend

This is the only piece that touches your data, so it runs under your own
Google account, not a shared one.

1. Create a new Apps Script project: go to
   [script.google.com/home](https://script.google.com/home) → New project.
2. Replace the default `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs)
   from this repo, and add `appsscript.json` ([`apps-script/appsscript.json`](apps-script/appsscript.json))
   via **Project Settings → Show "appsscript.json" manifest file in editor**.

   Or, with [clasp](https://github.com/google/clasp) (no account creation needed —
   it uses your existing Google login):
   ```sh
   npx @google/clasp login          # opens a browser, you sign in yourself
   cd apps-script
   npx @google/clasp create --type webapp --title "Radar Deck Backend"
   npx @google/clasp push
   ```

3. **Generate the shared secret yourself, in your own terminal** (not through
   this chat, and not inside the Apps Script editor's Logger):
   ```sh
   openssl rand -hex 32 | pbcopy
   ```
   In the Apps Script editor: **Project Settings → Script properties → Add script
   property**, name `RADAR_DECK_SECRET`, paste the value. Nobody but you ever
   sees it.

4. Run `setup()` once from the editor (select it in the function dropdown, click
   Run). It creates a Drive folder `Radar Deck PWA` with two JSON files and
   prints their ids to the execution log — ids aren't secret, only the
   script property is.

5. Deploy: **Deploy → New deployment → Web app**.
   - **Execute as: Me**
   - **Who has access: Anyone** (exactly this — not "Anyone with a Google
     account", or you'll get an HTML login page back instead of JSON)

   Copy the `/exec` URL. If you ever change the code, deploy a **new version
   of the same deployment** (Deploy → Manage deployments → Edit → New
   version) — creating a brand-new deployment changes the URL, which would
   break every device that already has the old one saved.

6. Run `test_probeRoundTrip` and `test_rejectsMissingKey` from the editor once,
   as a sanity check. Both just log "passed".

## 2. The PWA

```sh
npm install
npm run icons   # rasterizes public/icon-source.svg -> public/icons/*.png
npm run test    # unit tests
npm run build   # tsc + vite build -> dist/
```

### Deploy to Netlify

```sh
npx netlify-cli login       # opens a browser, sign in yourself
npx netlify-cli init        # or connect the GitHub repo via app.netlify.com
npx netlify-cli deploy --prod
```

Or push this repo to a new **private** GitHub repo and connect it at
[app.netlify.com](https://app.netlify.com) — `netlify.toml` already has the
build command and publish directory. Netlify will give you a URL like
`https://radar-deck-xyz.netlify.app`.

### First run on your phone

1. Open the Netlify URL in mobile Safari or Chrome.
2. Go to **Settings** in the app, paste the Apps Script `/exec` URL and the
   secret you generated above. Tap Save.
3. iPhone: tap the Share icon → **Add to Home Screen** to install it.
   Android/Chrome: use the browser's install prompt (or menu → Install app).

The secret and API URL are stored only in that device's `localStorage` — never
synced anywhere, never sent anywhere except to your own Apps Script URL.

## 3. Testing

```sh
npm run test           # Vitest: deck ordering, IST countdown math, offline-queue merge
npm run test:e2e        # Playwright: full swipe/pass/later/CV/undo flow + offline reload
```

The Playwright test runs against a built-and-previewed copy of the app
(`npm run build && npm run preview`) with a mocked backend — no real Apps
Script or Drive calls. It was run once locally with Chromium
(`npx playwright install chromium`) while building this.

Run Lighthouse against the deployed Netlify URL (Chrome DevTools → Lighthouse,
or `npx lighthouse <url> --view`) to confirm it reports as an installable PWA
with an Accessibility score of 95 or higher.

## 4. Troubleshooting

- **Settings screen says "Can't reach the backend"**: open the `/exec` URL
  directly in a browser tab. If you see a Google login page instead of JSON,
  the deployment's access is set to something other than "Anyone".
- **A new deployment "lost" your saved secret**: it didn't — the secret lives
  in Script Properties, not in a deployment. But a *new deployment* (not a new
  version of the same one) does get a new URL, so update it in every device's
  Settings screen if that happens.
- **Nothing happens on Apply**: some browsers block a popup that isn't opened
  synchronously from the tap — the app also shows a toast with a direct link
  as a fallback; tap that.

## 5. Handing this to the radar

Once the backend is deployed and `setup()` has run, you'll have three ids from
the execution log (folder, cards file, decisions file) and the Netlify URL.
Paste this, filled in, into Claude Cowork so the daily radar starts feeding
this app — this is the one step that needs to happen from your own session,
since the radar has no access to your Apps Script project:

```
RADAR STEP: Radar Deck PWA
Drive folder "Radar Deck PWA": <folder id from setup()>
Cards file radar-deck-cards.json: <file id from setup()>   (the radar overwrites it every run)
Decisions file radar-deck-decisions.json: <file id from setup()>   (the radar only reads it)
Each run: (1) read the decisions file and merge it with the claude.ai deck's decisions; for each id the newer `at` wins, and a decision is new when handled[id] != its `at`. (2) After Open now is final, write {"meta": <meta/run>, "cards": <every card, same fields as the claude.ai deck>, "handled": {id: at for every decision acted on}} to the cards file with update_file.
App URL (for the digest only, no secret): <netlify url>
```
