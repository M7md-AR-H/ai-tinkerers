# Scannable: dev setup manual

Everything you need to set up outside the code, then the order to test in. Commands are PowerShell, run from the project root.

---

## 0. Already done

- Dependencies are installed (`npm install`).
- **Ambiguous:** the three object identities exist, and their keys are in `.env.local`:
  - projector → `main.hall.projector@bug-ai-tinkerers.ambi.cc`
  - coffee → `lobby.coffee.machine@bug-ai-tinkerers.ambi.cc`
  - room → `meeting.room.2.door@bug-ai-tinkerers.ambi.cc`
- **Keys you already added:** OpenAI, OpenRouter, Exa, Trigger.dev (dev key), `DEMO_EMAIL`, `DATA_DIR`.
- **Generated for you:** `AUTH0_SECRET` and `CONVEX_SERVER_SECRET` are random values already written to `.env.local`. Don't change them.
- **Auth0 keys:** domain (`aitinkerers.eu.auth0.com`), client id and client secret are in `.env.local`. `STAFF_EMAILS` is set to your `DEMO_EMAIL`, so log in with that address to approve purchases, or edit it.

## 1. What's still missing

| # | What | Where it goes | Section |
|---|---|---|---|
| 1 | Register the callback and logout URLs in your Auth0 application | Auth0 dashboard | 2.1, step 3 |
| 2 | Convex project | Written into `.env.local` by `npx convex dev` | 2.2 |
| 3 | Trigger.dev project ref | `trigger.config.ts` | 2.3 |
| 4 | Tunnel URL (for phones) | `.env.local` (`PUBLIC_URL`, `APP_BASE_URL`) and Auth0 | 2.4 |
| 5 | *(optional)* Owner alert inbox | `ADMIN_EMAIL` in `.env.local`. Falls back to `DEMO_EMAIL`. | – |

---

## 2. Step by step

### 2.1 Auth0 (login for owners and staff)
1. Go to https://manage.auth0.com and open **Applications**. Choose **Create Application**, then **Regular Web Application**.
2. On the **Settings** tab, copy these into `.env.local`:
   - **Domain** → `AUTH0_DOMAIN` (e.g. `dev-abc123.us.auth0.com`, without `https://`)
   - **Client ID** → `AUTH0_CLIENT_ID`
   - **Client Secret** → `AUTH0_CLIENT_SECRET`
3. Still on **Settings**, fill in these fields (add the tunnel URL later, in section 2.4):
   - **Allowed Callback URLs:** `http://localhost:3000/auth/callback`
   - **Allowed Logout URLs:** `http://localhost:3000`
   - Then click **Save**.
4. Set `STAFF_EMAILS` to the email you'll log in with. For more than one, separate them with commas. Only these people can approve purchases (the coffee machine's "order beans").

### 2.2 Convex (owner accounts, scannables, uploaded files)
1. Run `npx convex dev`. It opens a browser to log in, then asks you to create a project (name it e.g. `every-object`).
2. It writes `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` into `.env.local` and uploads the functions in `convex/`. Once it says it's ready, press Ctrl+C.
3. Run `npm run convex:secret`. This copies `CONVEX_SERVER_SECRET` to your Convex deployment, so only this app's server can change owners' data.

### 2.3 Trigger.dev (objects booking their own maintenance)
1. In the Trigger.dev dashboard, open your project, then **Project settings**, and copy the **Project ref** (starts with `proj_`).
2. Paste it into [trigger.config.ts](trigger.config.ts), replacing `proj_REPLACE_ME`.
3. `TRIGGER_SECRET_KEY` must be the **Development** key (`tr_dev_…`). It already is.

### 2.4 Tunnel (so phones can scan and open the QR codes)
1. Install once: `winget install --id Cloudflare.cloudflared -e`
2. In its own terminal, run `cloudflared tunnel --url http://localhost:3000` and copy the `https://….trycloudflare.com` URL.
3. In `.env.local`, set **both** `PUBLIC_URL` and `APP_BASE_URL` to that URL. QR codes, email links and Auth0 all use it.
4. In Auth0, add `https://<tunnel>/auth/callback` to Allowed Callback URLs and `https://<tunnel>` to Allowed Logout URLs. Keep the localhost entries and **Save**.
5. **Never restart the tunnel once QR codes are printed.** A restart changes the URL.

Voice needs HTTPS on a phone; the tunnel provides it.

---

## 3. Run it

| Terminal | Command | What |
|---|---|---|
| 1 | `npm run dev:all` | Next.js on http://localhost:3000 plus Convex |
| 2 | `npx trigger.dev@4.5.16 dev` | Runs the scheduled maintenance tasks. The first run asks you to log in. |
| 3 | `cloudflared tunnel --url http://localhost:3000` | Public URL for phones. Don't restart it. |

**After editing `.env.local`, restart terminals 1 and 2.**

---

## 4. Test, in this order

**A. An object sends a real email** (works without the servers running):
```powershell
node --env-file=.env.local -e "import('./lib/ambiguous.ts').then(m => m.sendFromObject('coffee', process.env.DEMO_EMAIL, 'test', 'hello from the coffee machine')).then(console.log)"
```
Pass: it prints `{ ok: true, id: … }` and an email arrives from `lobby.coffee.machine@…`. You can ignore the `MODULE_TYPELESS_PACKAGE_JSON` warning.

**B. Chat with a built-in object:** open http://localhost:3000/agents/projector.
- Tap "What's wrong with you?" → it answers in the first person from its memory (HDMI 1 is flaky).
- Type "The fan is loud today" → within about 5 seconds the fact appears in "What I know about myself".
- Type "What does error E-04 mean?" → it searches its manual and names a source.

**C. The 45-second Trigger.dev beat:** keep `/agents/coffee` open, and in another tab open http://localhost:3000/auth/demo?id=coffee&task=descale.
- Straight away, "Booked my own descale" appears in the coffee machine's log.
- About 45 seconds later, "Maintenance due: descale" appears by itself, and a reminder email arrives from the coffee machine.

**D. Staff gate:** on `/agents/coffee`, send "Order beans".
- As a guest it's refused and tells you to log in.
- Tap **Staff login** and log in with a `STAFF_EMAILS` address. Ask again: it quotes the item and cost. Reply "yes": the order email arrives from the coffee machine, and a log line appears.

**E. Voice:** on any agent page tap **Talk**, then the mic, and allow microphone access. Say "What's wrong with you?" You should see a live transcript and hear a spoken answer. Tap again to stop.

**F. Owner dashboard:** go to `/` and log in; you land on `/dashboard`.
1. Tap **+**, name it "Lobby Printer", upload a `.txt` or `.md` describing it, and choose **Create**. It appears with its own email address in the **Inbox** column.
2. Open **⋯**, then **Share**. You get a QR code, a link and its inbox address. Open the link and ask something that's in your file.
3. Say "your info is wrong: …" → the owner email arrives (`ADMIN_EMAIL`, or else `DEMO_EMAIL`) **from the agent's own address**.
4. Try Edit and Delete.

**G. Photo → agent:** on the dashboard tap **From photo**, take or choose a photo of something, and tap **Analyze photo**. It names the object and asks a few questions. Answer some, then tap **Create agent**. The share QR opens. Scan it, and the new agent answers from what it saw and what you told it.

---

## 5. Environment variable reference

| Variable | Needed for | Where it comes from |
|---|---|---|
| `OPENAI_API_KEY` | Voice, photo → agent, chat fallback | platform.openai.com/api-keys |
| `OPENROUTER_API_KEY` | Chat (primary) | openrouter.ai/keys |
| `OPENROUTER_MODEL` / `OPENAI_FALLBACK_MODEL` | Chat model choice | Preset to `openai/gpt-4.1-mini` / `gpt-4.1-mini` |
| `OPENAI_REALTIME_MODEL` / `OPENAI_REALTIME_VOICE` | Voice | Preset to `gpt-realtime` / `marin` |
| `OPENAI_VISION_MODEL` *(optional)* | Photo → agent | Defaults to `gpt-4.1-mini` |
| `EXA_API_KEY` | Manual lookups | dashboard.exa.ai |
| `AMBIGUOUS_API_KEY` | Owner alerts (workspace sender), provisioning | Ambiguous admin settings |
| `AMBIGUOUS_AGENT_KEY_PROJECTOR` / `_COFFEE` / `_ROOM` | Each object's own inbox | Created by `scripts/provision-ambiguous.mjs` (done) |
| `TRIGGER_SECRET_KEY` | Scheduling | Trigger.dev → API Keys → **Development** |
| `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` | Login | Auth0 application settings (section 2.1) |
| `AUTH0_SECRET` | Login cookies | Generated (done) |
| `APP_BASE_URL` | Auth0 redirects, email links | `http://localhost:3000`, or the tunnel URL for the demo |
| `STAFF_EMAILS` | Who may approve purchases | Your email(s), comma-separated |
| `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` | Dashboard data | Written by `npx convex dev` |
| `CONVEX_SERVER_SECRET` | Locks owner writes to this server | Generated (done); synced by `npm run convex:secret` |
| `DEMO_EMAIL` | Where objects' emails go on stage | Your inbox |
| `ADMIN_EMAIL` *(optional)* | Owner alerts from scannables | Your inbox. Falls back to `DEMO_EMAIL`. |
| `DATA_DIR` | Built-in objects' memory files | `C:/Users/moham/Desktop/ai-tinkerers/data` (forward slashes) |
| `PUBLIC_URL` | QR codes and links for phones | Tunnel URL |

`INTERNAL_SECRET` is left over from an earlier plan; nothing reads it.

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| Dashboard says "Convex isn't reachable: NEXT_PUBLIC_CONVEX_URL is not set" | Run `npx convex dev` once (section 2.2), then restart `npm run dev:all`. |
| Dashboard says "Unauthorized" or "CONVEX_SERVER_SECRET is not set on the Convex deployment" | Run `npm run convex:secret`. |
| `/auth/login` errors, or it loops | Check `AUTH0_DOMAIN` (no `https://`), the client id and secret, and that the callback URL for the host you're on is registered in Auth0. |
| Login on the phone redirects to localhost | Set `APP_BASE_URL` to the tunnel URL and restart. |
| "Order beans" is still denied after login | Your login email isn't in `STAFF_EMAILS` (the check ignores case). Restart after editing. |
| Chat shows an error | Check `OPENROUTER_API_KEY` or `OPENAI_API_KEY`. The terminal shows `[llm]` messages when the OpenAI fallback kicks in. |
| Voice: "Could not start a voice session" | Check `OPENAI_API_KEY`. On a phone, use the https tunnel URL, because browsers block the mic on plain http. |
| No "Maintenance due" line after 45 seconds | Terminal 2 isn't running, `trigger.config.ts` still has `proj_REPLACE_ME`, or the key isn't `tr_dev_`. Check the run in the Trigger.dev dashboard. |
| Trigger run fails with "DATA_DIR is not set" | The Trigger.dev CLI isn't picking up `.env.local`. Restart it from the project root. |
| Version mismatch warning from Trigger.dev | Run the CLI at the SDK's version: `npx trigger.dev@4.5.16 dev`. |
| An email result shows `stub: true` | Neither the object's key nor `AMBIGUOUS_API_KEY` is set. |
| Photo → agent: "Please use a JPEG, PNG or WebP photo" | Take the photo with the camera, or convert HEIC first. |
| Tunnel requests blocked in dev | The tunnel domain must match `allowedDevOrigins` in `next.config.ts` (trycloudflare and ngrok are included). |
| A new agent's Inbox column says "workspace" | Creating its Ambiguous identity failed. Look for `[ambiguous] provisioning` in terminal 1. The agent still works and emails from the workspace address. |
