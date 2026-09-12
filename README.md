# Scannable

**Stick a QR code on any physical thing and it becomes an agent with its own memory, its own inbox, and its own authority to act.**

*The surprising pattern: identity and memory attached to objects, not users.*

<!-- Screenshots: replace with real captures -->
| Object page (chat) | Voice mode | Owner dashboard |
|---|---|---|
| ![Object page](docs/screenshot-object.png) | ![Voice](docs/screenshot-voice.png) | ![Dashboard](docs/screenshot-dashboard.png) |

🎬 **90-second demo video:** _link here_

---

## What it does

Every agent demo puts an agent next to a person. We put agents *inside things*. Scan the code on the lobby coffee machine and you're talking to the machine, by voice or chat. It knows its own history ("my bean hopper's at 20%, and someone keeps pressing espresso when they want lungo"). It learns from whoever talks to it, and that memory belongs to the machine, not to anyone's account. It can read its own manual on the web, report its own faults from its own email address, book its own maintenance weeks ahead, and order its own beans once a staff member has logged in to approve the spend.

Anyone can also give their own things a voice. An owner signs in, snaps a photo of an object (or uploads a knowledge file), answers a couple of follow-up questions, and gets a printable QR code. Visitors who scan it talk to that object, which answers only from what it knows and emails the owner when something is wrong, fixed, or broken.

## Sponsor usage

| Sponsor | What it does here |
|---|---|
| **OpenAI** | Realtime voice agents in the browser (Agents SDK + WebRTC, ephemeral keys). GPT-4.1-mini vision turns a photo into a new agent. Direct OpenAI is also the chat fallback. |
| **OpenRouter** | Primary chat model route (`openai/gpt-4.1-mini`), with automatic fallback to OpenAI on timeout, 429 or 5xx. |
| **CopilotKit** | Chat UI and runtime. A `BuiltInAgent` is built per request for whichever object was scanned, with that object's tools. |
| **Exa** | Objects read their own manuals: a model-specific search whose results the agent cites by source. |
| **Ambiguous** | Every object is its own Ambiguous agent **with its own email address**: the three built-ins (`lobby.coffee.machine@…`) and every agent created on the dashboard, which gets a fresh inbox the moment it's made. Fault reports, supply orders, maintenance reminders and owner alerts come from the object's own inbox. |
| **Trigger.dev** | Objects schedule their own future. A delayed task fires days later, writes to the object's log, and emails from its inbox, with nobody logged in. |
| **Auth0** | Owner accounts for the dashboard, and the staff allowlist that decides who may spend money on an object's behalf. |

Convex stores owner accounts, scannables and knowledge files.

## What works

| Surface | URL | Who | What |
|---|---|---|---|
| Landing | `/` | Anyone | Log in / sign up, or try a demo object. Signed-in users go to the dashboard. |
| Auth | `/auth/login`, `/auth/logout` | Anyone | Auth0 session. |
| Dashboard | `/dashboard` | Signed-in owners | Create an agent from a **photo** or a knowledge file; edit, share (QR) and delete it. Overview of the built-in objects. |
| Agent | `/agents/[id]` | Anyone with the QR | **Talk** (voice) or **Chat**. Built-in objects also show their memory, a live event log and a Staff login. |
| Chat runtime | `/api/copilotkit` | Agent page | CopilotKit runtime (header `x-scannable-id` picks the object). |
| Voice session | `/api/realtime/session` | Talk | Mints a short-lived OpenAI Realtime key. |
| Voice tools | `/api/tools` | Talk | Runs voice tool calls on the server, using the same code as chat. |
| Stage demo | `/auth/demo?id=coffee&task=descale` | Presenter | Books maintenance that lands 45 seconds later. |
| Old links | `/o/[id]` | Anyone | Redirects to `/agents/[id]`. |

## Two kinds of agents, one page

| | Built-in objects | Owner-made scannables |
|---|---|---|
| Examples | Main Hall Projector, Lobby Coffee Machine, Meeting Room 2 Door | Anything an owner photographs or describes |
| Defined in | `lib/objects.ts` | Convex (`scannables` table), created on the dashboard |
| Knowledge | Persona, model number, and memory in `data/<id>.json` (facts + last 20 events) | The uploaded `.txt`/`.md`, or the Markdown generated from a photo |
| Tools | `remember`, `lookup_manual`, `report_issue`, `schedule_maintenance`, `order_supplies` (coffee only, staff only) | `notify_admin` |
| Email identity | Its own Ambiguous address | Its own Ambiguous address, created automatically when the agent is made |

## How a visit works

```
Phone scans QR ─► /agents/coffee
                   ├─ Chat ─► /api/copilotkit ─► BuiltInAgent (OpenRouter → OpenAI fallback)
                   └─ Talk ─► /api/realtime/session ─► OpenAI Realtime (WebRTC in the browser)
                                                         └─ tool calls ─► /api/tools
Both use lib/agent-brain.ts (prompt) and lib/object-tools.ts (tools):
   remember ─────────────► data/coffee.json
   lookup_manual ────────► Exa
   report_issue / order ─► Ambiguous, from lobby.coffee.machine@…
   schedule_maintenance ─► Trigger.dev delayed task ─► (days later) log line + email
   order_supplies ───────► allowed only if Auth0 user is in STAFF_EMAILS
```

**Photo → agent:** dashboard "From photo" → the image is shrunk in the browser → GPT-4.1-mini vision identifies the object and asks 3–5 follow-up questions → the owner answers → a Markdown knowledge file is written, stored in Convex, and a new agent with its QR code is ready.

## Setup

Full step-by-step instructions (accounts, keys, tests): **[DEV_SETUP.md](DEV_SETUP.md)**. How the code fits together: **[PROJECT_GUIDE.md](PROJECT_GUIDE.md)**.

```powershell
npm install
npx convex dev            # first run: log in, create the project, writes Convex URLs to .env.local
npm run convex:secret     # copies CONVEX_SERVER_SECRET to the Convex deployment
```

Run in three terminals:

```powershell
npm run dev:all                          # Next.js + Convex
npx trigger.dev@4.5.16 dev               # scheduled maintenance tasks
cloudflared tunnel --url http://localhost:3000   # public HTTPS URL for phones
```

Environment variables (`.env.local`, never committed): `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENAI_FALLBACK_MODEL`, `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`, `EXA_API_KEY`, `AMBIGUOUS_API_KEY`, `AMBIGUOUS_AGENT_KEY_PROJECTOR` / `_COFFEE` / `_ROOM`, `TRIGGER_SECRET_KEY`, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, `APP_BASE_URL`, `STAFF_EMAILS`, `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_SERVER_SECRET`, `DEMO_EMAIL`, `ADMIN_EMAIL`, `DATA_DIR`, `PUBLIC_URL`.

## Project layout

```
app/
  page.tsx                      Landing
  dashboard/                    Owner console: list, create (file or photo), share QR, edit, delete
  agents/[id]/                  Public agent page: Talk + Chat, memory panel, live log
  api/copilotkit/[[...slug]]/   CopilotKit runtime (chat)
  api/realtime/session/         OpenAI Realtime key minting (voice)
  api/tools/                    Voice tool execution
  auth/demo/                    45-second maintenance demo
convex/                         schema, users, scannables (secret-gated owner functions)
lib/
  objects.ts, memory.ts         Built-in objects and their JSON memory (DATA_DIR)
  agent-brain.ts                Shared prompt for chat and voice
  tool-defs.ts, object-tools.ts Tool schemas (browser-safe) and implementations (server)
  llm.ts                        OpenRouter with OpenAI fallback
  photo-agent.ts                Photo analysis and knowledge writing
  ambiguous.ts                  sendFromObject(): mail from the object's own inbox
  scheduler.ts                  scheduleMaintenance(): Trigger.dev delayed task
  exa.ts                        lookupManual()
  auth0.ts, auth.ts             Auth0 client; getUser() with the staff allowlist
  convex-server.ts              Server-side Convex calls
trigger/maintenance.ts          The "maintenance-due" task
scripts/                        One-time Ambiguous provisioning; Convex secret sync
data/                           Seeded memories for the three built-in objects
proxy.ts                        Auth0 (Next.js 16 proxy)
```

## Demo script (3 minutes)

1. **Hook:** "Every agent demo puts an agent next to a person. We put agents inside things."
2. **Projector:** scan it. "What's wrong with you?" → it says HDMI 1 is flaky and to use HDMI 2, from memory. "The fan is loud today" → the fact appears in its panel. *"That memory belongs to the projector, not to anyone's account."*
3. **Coffee machine:** "Order beans" → denied. Staff login → ask again → it quotes the cost → "yes" → the email arrives from `lobby.coffee.machine@…`. *"This machine has an email address. It just placed its own order."*
4. **Trigger.dev:** open `/auth/demo?id=coffee&task=descale` beforehand, keep talking; the log line appears by itself. *"It'll still be doing that in three weeks when none of us are here."*
5. **Photo:** snap a new object on stage, answer two questions, and scan its fresh QR code.
6. **Close:** Ambiguous gives each object an identity, Trigger.dev gives it a future, Exa lets it read its own manual.

## Limits and caveats

- PDFs are stored but not read; use `.txt`, `.md`, or the photo flow.
- Knowledge of owner-made agents is public to anyone with the link (by design, since visitors have no accounts).
- Owner alerts go to one inbox (`ADMIN_EMAIL`, falling back to `DEMO_EMAIL`), sent from each agent's own address. Deleting an agent doesn't remove its Ambiguous identity.
- Voice needs HTTPS on phones (use the tunnel); `localhost` works on the laptop.
- Built-in objects' memory lives in local JSON files; there's no deployment.

## Stack

Next.js 16 (App Router), React 19, Tailwind 4, CopilotKit v2, OpenAI Agents SDK (Realtime), OpenRouter / OpenAI, Exa, Ambiguous, Trigger.dev v4, Auth0, Convex, `qrcode.react`.
