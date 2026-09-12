# Project guide: how Scannable works

What the app is, what each part of the code does, and how a request flows through it. For accounts, keys and testing, see [DEV_SETUP.md](DEV_SETUP.md). For the judges' summary, see [README.md](README.md).

---

## 1. The idea

**Stick a QR code on any physical thing and it becomes an agent with its own memory, its own inbox, and its own authority to act.**

Most AI demos put an agent next to a person. This one puts agents *inside things*. The memory, the email address and the scheduled future all belong to the object, not to whoever is talking to it. *Identity and memory attached to objects, not users.*

## 2. Who uses it, and how

| Person | What they do | Where |
|---|---|---|
| **Visitor** | Scans a QR code and talks (voice) or chats. No account needed. | `/agents/[id]` |
| **Staff member** | Logs in to approve purchases an object wants to make (coffee beans). | "Staff login" on the object page |
| **Owner** | Logs in and gives their own things a voice: from a photo, or from a knowledge file. Shares the QR code. | `/dashboard` |
| **Presenter** | Fires the 45-second self-scheduling demo. | `/auth/demo?id=coffee&task=descale` |

## 3. Two kinds of agents

This app merges two plans. **Part A** is the owner platform: dashboard, Convex, CopilotKit chat, voice. **Part B** is the integrations: object email identities, self-scheduling, the spending gate. Where they overlapped, Part B took priority. Both kinds of agent live at the same URL, `/agents/[id]`:

| | Built-in objects (Part B) | Owner-made scannables (Part A) |
|---|---|---|
| Which | `projector`, `coffee`, `room` | Any id Convex generates |
| Defined in | [lib/objects.ts](lib/objects.ts) | Convex `scannables` table |
| What it knows | Persona, model number, plus **memory** in `DATA_DIR/<id>.json` (facts + last 20 events, seeded in `data/`) | The uploaded `.txt`/`.md` (up to 60k characters used), or Markdown generated from a photo |
| Tools | `remember`, `lookup_manual`, `report_issue`, `schedule_maintenance`, `order_supplies` (only where `canSpend`, i.e. the coffee machine) | `notify_admin` |
| Emails from | **Its own Ambiguous address** | **Its own Ambiguous address**, created when the agent is created (the workspace address if that fails) |
| Page extras | Facts panel, live event log (refreshes every 5 s), Staff login | – |

## 4. Architecture

```
                    ┌───────────── /agents/[id]  (server page: loads context, memory panel, log) ─────────────┐
Phone scans QR ───► │  Chat: CopilotKit <CopilotChat>          Talk: OpenAI Realtime (WebRTC, in browser)     │
                    └──────┬───────────────────────────────────────────┬──────────────────────────────────────┘
                           │ POST /api/copilotkit                       │ POST /api/realtime/session → ephemeral key
                           │ header x-scannable-id                      │ tool calls → POST /api/tools
                           ▼                                            ▼
              BuiltInAgent (per request)                         runTool() on the server
              model: OpenRouter → OpenAI fallback (lib/llm.ts)
                           │                                            │
                           └──────────────► lib/agent-brain.ts ◄────────┘   prompt: persona/knowledge + rules + visitor
                                            lib/object-tools.ts            one implementation for every tool
                                               │
      ┌──────────────┬───────────────┬─────────┴─────────┬──────────────────────┬─────────────────────┐
  remember      lookup_manual    report_issue /       schedule_maintenance     order_supplies        notify_admin
  data/<id>.json   Exa           Ambiguous (own inbox)  Trigger.dev delay      getUser() staff check  Ambiguous → owner
                                                            │                   then Ambiguous
                                                            ▼ (days later)
                                          trigger/maintenance.ts: log line + email from the object's inbox
```

Everything runs on one laptop. Phones reach it through a Cloudflare tunnel; there is no deployment. Owner data lives in Convex; the built-in objects' memory lives in local JSON files.

## 5. Code map

```
proxy.ts                         Auth0 middleware (Next.js 16 calls it "proxy"); mounts /auth/login, /auth/logout, /auth/callback
next.config.ts                   Allows tunnel origins in dev
trigger.config.ts                Trigger.dev project ref + task folder
app/
  layout.tsx, globals.css        Shell and styles
  page.tsx                       Landing: log in / sign up, demo objects; signed-in → /dashboard
  dashboard/
    page.tsx                     Server: requires a session, upserts the user in Convex, lists scannables + built-ins
    actions.ts                   Server actions (check the Auth0 session): upload URL, create, update, delete, photo analyze/create
    dashboard-client.tsx         Table, row menu (Edit/Share/Delete), built-in cards, account menu
    create-scannable-dialog.tsx  Create/edit with a knowledge file (keep / replace / remove)
    photo-scannable-dialog.tsx   Photo → questions → agent
    share-scannable-dialog.tsx   QR code, copy, open, native share
    delete-scannable-dialog.tsx  Confirm delete
    modal.tsx                    Shared dialog frame
  agents/[id]/
    page.tsx                     Server: resolves the agent, memory panel, log, Staff login (force-dynamic)
    agent-client.tsx             Talk/Chat toggle, CopilotKitProvider (sends x-scannable-id), quick-tap suggestions
    talk-panel.tsx               Mic → Realtime session, live transcript, speaking pulse, stop
    auto-refresh.tsx             router.refresh() every 5 s so task-written log lines appear by themselves
  api/copilotkit/[[...slug]]/    CopilotKit v2 runtime; builds a BuiltInAgent per request with that object's tools
  api/realtime/session/          Mints a short-lived Realtime key; returns instructions and tool names
  api/tools/                     Executes voice tool calls with the same code as chat
  auth/demo/                     Hidden stage route: log line now, "Maintenance due" in 45 s
  o/[id]/                        Old link format → redirects to /agents/[id]
convex/
  schema.ts                      users (auth0Id, email, name) · scannables (owner, name, knowledge file + text)
  users.ts                       upsertByAuth0, getByAuth0 (server-secret gated)
  scannables.ts                  generateUploadUrl, create, update, remove, listByOwner (secret-gated); getById, getKnowledge (public)
  secret.ts                      Checks CONVEX_SERVER_SECRET
lib/
  objects.ts                     The three built-in objects
  memory.ts                      loadMemory / saveMemory / addFact / addLog on DATA_DIR/<id>.json
  agent-brain.ts                 loadAgentContext(id) and buildInstructions(ctx, visitor, channel)
  tool-defs.ts                   Tool names, descriptions, zod schemas (safe to import in the browser)
  object-tools.ts                runTool(): the implementations, with validation, clamping and the staff check
  llm.ts                         OpenRouter chat model with OpenAI fallback on timeout/429/5xx
  photo-agent.ts                 analyzePhoto() and writeKnowledge() with GPT-4.1-mini vision
  ambiguous.ts                   sendFromObject(): object's own key, else the workspace key; logs instead of sending if neither
  scheduler.ts                   scheduleMaintenance(): triggers "maintenance-due" with a delay of <n>d
  exa.ts                         lookupManual(): model-specific search, returns sources
  auth0.ts / auth.ts             Auth0 client; getUser() → { email, canSpend } via STAFF_EMAILS
  convex-server.ts               Server-side Convex client (adds the server secret)
  constants.ts                   The x-scannable-id header name
trigger/maintenance.ts           Task "maintenance-due": add log line, email from the object's inbox
scripts/
  provision-ambiguous.mjs        One-time: created the three object identities (done)
  sync-convex-secret.mjs         Copies CONVEX_SERVER_SECRET to Convex (npm run convex:secret)
data/*.json                      Seeded memories (committed on purpose)
```

## 6. Flows, step by step

### 6.1 A chat message
1. `agent-client.tsx` wraps the chat in `CopilotKitProvider` with header `x-scannable-id: <id>`.
2. `/api/copilotkit` calls `loadAgentContext(id)`: a built-in object plus its memory, or a Convex scannable plus its knowledge.
3. It asks Auth0 who the visitor is (`getUser()`), builds the prompt with `buildInstructions(…, "chat")`, and creates a `BuiltInAgent` with that object's tools (up to 5 tool steps).
4. The model runs on OpenRouter. On timeout, 429 or 5xx the same request goes to OpenAI directly.
5. Tool calls run `runTool()` on the server. The reply streams back into the chat.
6. For built-in objects, `auto-refresh.tsx` re-renders the page every 5 seconds, so new facts and log lines show up.

### 6.2 A voice session
1. Tap the mic. `/api/realtime/session` builds the same prompt (`"voice"` style), mints an ephemeral key, and returns the model, voice and tool names.
2. The browser creates a `RealtimeAgent` whose tools forward to `/api/tools` and connects over WebRTC. The real OpenAI key never leaves the server.
3. `/api/tools` loads the agent again and calls the same `runTool()` as chat, so there's one implementation for both.

### 6.3 Tools (built-in objects)
- **remember:** adds a fact to `data/<id>.json`.
- **lookup_manual:** Exa search for `"<model> <question> manual troubleshooting"`; the agent cites the source.
- **report_issue:** emails facilities (`DEMO_EMAIL`) **from the object's own address** and logs "Emailed facilities: …".
- **schedule_maintenance:** starts a Trigger.dev run delayed by 1–60 days and logs "Scheduled: …". When it fires, [trigger/maintenance.ts](trigger/maintenance.ts) logs "Maintenance due: …" and emails from the object's inbox.
- **order_supplies:** `getUser()` must be a logged-in `STAFF_EMAILS` user, otherwise it returns `DENIED` and the agent points to Staff login. The prompt makes the agent quote the cost and wait for a yes first. The order is emailed from the object's inbox and logged.

### 6.4 Tools (scannables)
- **notify_admin:** only for wrong information, fixes, problems, or other owner-relevant news. Emails `ADMIN_EMAIL` (else `DEMO_EMAIL`) with the kind, the summary and a link to the agent.

### 6.5 Owner: create from a file
Dashboard **+** → a name and a `.txt`/`.md`/`.pdf`. The browser reads the text for `.txt`/`.md`, gets an upload URL through a server action, uploads the file straight to Convex storage, then `createScannable` saves it. PDFs are stored but not read.

### 6.6 Owner: create from a photo
Dashboard **From photo** → the photo is shrunk to 1024 px JPEG in the browser (server actions take about 1 MB) → `analyzePhoto` (GPT-4.1-mini vision, JSON mode) returns the object type, a suggested name, brand/model if visible, observations and 3–5 questions → the owner answers → `writeKnowledge` turns everything into a Markdown knowledge file without inventing specifics → the server uploads it to Convex, gives the agent its own Ambiguous inbox (`provisionAgent`), and creates it → the share QR opens, showing the new address. Agents created from a file get their inbox the same way.

### 6.7 The 45-second demo
`/auth/demo?id=coffee&task=descale` writes "Booked my own descale" now and starts `maintenance-due` with `delay: "45s"`. The page's auto-refresh shows "Maintenance due: descale" when it lands, and the reminder email arrives from the coffee machine.

## 7. Security model (hackathon-grade, but deliberate)

- **Owner writes are server-only.** Convex owner functions require `CONVEX_SERVER_SECRET`, which only the Next.js server holds. It only calls them after checking the Auth0 session.
- **Visitors are anonymous.** `getById`/`getKnowledge` are public on purpose; don't put secrets in knowledge files.
- **Spending** is checked on the server at the moment the tool runs, not only in the prompt.
- **Inputs are bounded:** tool arguments are validated and clamped; memory file names only allow `[a-z0-9-]`; the demo route only accepts known object ids; photos must be image data URLs under 3 MB.
- **Agent inbox keys** for dashboard-made agents live in Convex and are only returned by the secret-gated `getSender` query. The public queries never include them.
- **Secrets:** the OpenAI key stays on the server (voice uses ephemeral keys); `.env.local` is gitignored.

## 8. Known gotchas

1. **Next.js 16:** middleware is now `proxy.ts`; `params` is a Promise; check `node_modules/next/dist/docs/` before changing Next.js code.
2. **Pages that read memory must be `force-dynamic`**, otherwise the facts panel is cached.
3. **`DATA_DIR` must be absolute with forward slashes.** Trigger.dev runs tasks from a different folder, so a relative path would write to the wrong file.
4. **zod v4** is required by `@openai/agents`; don't downgrade it.
5. **The tunnel URL is the demo.** Never restart the tunnel once QR codes are printed.
6. **Trigger.dev CLI and SDK versions must match:** use `npx trigger.dev@4.5.16 dev`.
7. **Voice on phones needs HTTPS** (the tunnel).
8. **Convex functions use the untyped builders** (`queryGeneric`/`mutationGeneric`, `anyApi`), so the code compiles before a deployment exists. `npx convex dev` still generates `convex/_generated`, which isn't needed.
