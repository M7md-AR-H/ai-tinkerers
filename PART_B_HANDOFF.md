# Part B handoff: set up the integrations on top of Part A

> **Superseded.** Part A and Part B are now both built in this repo (branch `Junior`). Use [PROJECT_GUIDE.md](PROJECT_GUIDE.md) and [DEV_SETUP.md](DEV_SETUP.md) instead. This file is kept for reference only.

> **Human (A): how to use this file.** Open Claude Code at the root of the repo, on `main`, with your Part A work committed. Paste this whole file in (or say "read PART_B_HANDOFF.md and do it"). Claude will first read your code, then install Part B around it. It will stop at checkpoints and ask you for things only you can do: pasting keys, logging into Trigger.dev, checking your inbox. Get the secret values from B over chat. They are deliberately not in this file.

---

## 0. Instructions for Claude (read all of this before touching anything)

You are adding **Part B (integrations)** to an existing hackathon app whose **Part A (core loop)** is already built. Part B was first written and tested by a teammate on another machine. Everything they wrote and learned is in this file. Your job:

1. **First read Part A's actual code (section 4).** Part A was built from a plan, but it may have changed since, in ways that appear *only in the code*: renamed files, different exports, sync vs async functions, different object ids, extra imports. **The code is the source of truth, not this document.** Wherever Part A's real code differs from what's described here, adapt the Part B code in this file to fit Part A, and say what you adapted.
2. Then install Part B in the order given (sections 5–8), stopping at each **Checkpoint** to report and let the human test.

### Operating rules
- **The machine is native Windows with PowerShell.** Emit PowerShell, not bash: no `export`, no `&&` chains you rely on, no `rm -rf`, no `curl -fsSL`. Use `$env:X="y"` and `Remove-Item -Recurse -Force`. **Quote npm package names that start with `@`** (`npm i "@trigger.dev/sdk"`), because PowerShell treats a bare `@` as splatting. Don't write `.sh` files; use Node scripts.
- **Never run `npm run dev`, `npx trigger.dev dev`, or `cloudflared`.** The human keeps those running in their own terminals, and running them would block you. To check compilation, use `npx tsc --noEmit`.
- **Never kill or restart the tunnel.** Once QR codes are printed, its URL is the demo.
- **Never print secret values** from `.env.local`. To check a key, print only its prefix (e.g. whether it starts with `tr_dev_`).
- **Don't install packages** other than `@trigger.dev/sdk` (and whatever `trigger.dev init` installs) without asking.
- **No refactors, no tests, no new abstractions, no database, no deployment.** This is a 3-hour hackathon; speed beats elegance.
- **Commit after each checkpoint** so there's always a working state. Work on a branch `integrations` off `main`, and fast-forward `main` once a checkpoint passes.
- Keep replies to a few lines. The human is often reading on a phone.
- **Next.js here is v16** (App Router), not the version in your training data. Before writing Next.js code, check `node_modules/next/dist/docs/` and heed deprecations (e.g. `middleware.ts` → `proxy.ts`, `params` is a Promise).
- If something is ambiguous and small, pick the option that is faster to demo and say what you picked.

---

## 1. The project in brief

**Pitch:** stick a QR code on any physical thing and it becomes an agent with its own memory, its own inbox, and its own authority to act. *Identity and memory attached to objects, not users.*

**The flow:**
1. A phone scans a QR code, which opens `/o/<id>` (Next.js page: facts panel, chat, event log).
2. The chat sends `POST /api/agent {objectId, message}`, which runs an OpenAI Agents SDK agent for that object.
3. The agent has five tools:
   - `remember` → memory JSON
   - `lookup_manual` → Exa search for the object's own manual, with cited sources (Part A, see section 3)
   - `report_issue` → **email from the object's own inbox**
   - `schedule_maintenance` → **Trigger.dev delayed task**
   - `order_supplies` → staff-only (Auth0), then email

   It replies, and the page refreshes.

**Objects (as planned; verify against `lib/objects.ts`):**

| id | Name | Model | Can spend |
|---|---|---|---|
| `projector` | Main Hall Projector | Epson EB-L200SW | no |
| `coffee` | Lobby Coffee Machine | Jura X8 | yes |
| `room` | Meeting Room 2 Door | Meeting room, 6 seats, 1 screen | no |

**Memory (as planned; verify against `lib/memory.ts`):** one JSON file per object at `DATA_DIR/<id>.json`, shaped `{ facts: string[], log: {at, event}[] }`. Exports `loadMemory`, `saveMemory`, `addFact(id, fact)`, `addLog(id, event)`. The log is newest first, capped at 20.

**Sponsors that judges check for:** OpenAI (agent runtime), Exa (manual lookup), **Ambiguous (object email identity)**, **Trigger.dev (self-scheduled maintenance)**, **Auth0 (who may spend)**, OpenRouter (memory compaction stretch goal). The bold ones are Part B.

---

## 2. What Part B is

Part A's agent calls three functions, which Part A shipped as console-logging stubs. **Part B replaces the stub bodies with real calls. The names and argument order must not change.** That's the contract that lets Part B drop in without touching Part A's call sites.

| Function | Planned file | Real behaviour |
|---|---|---|
| `sendFromObject(objectId, to, subject, body)` | `lib/ambiguous.ts` | Sends email **from that object's own Ambiguous address** |
| `scheduleMaintenance(objectId, taskName, inDays)` | `lib/scheduler.ts` (an older plan said `lib/schedule.ts`) | Starts the Trigger.dev task `maintenance-due` with a delay of `<inDays>d` |
| `getUser()` → `{ email?, canSpend }` | `lib/auth.ts` | Auth0 session plus a staff allowlist (section 8: **skip unless the human says Auth0 isn't done**) |

Part B also adds:
- `trigger/maintenance.ts`: the `maintenance-due` task. When it fires, it writes "Maintenance due: …" to the object's log and emails a reminder from the object's inbox.
- `app/auth/demo/route.ts`: a hidden stage route that fires that task with a **45-second** delay, so judges watch the log update by itself.
- `scripts/provision-ambiguous.mjs`: the one-time script that created the object identities (**already run; don't re-run**, see section 3).

**The demo beats Part B enables:**
- **Coffee machine:** "Order beans" → denied → staff login → cost quoted → "yes" → an email arrives **from the coffee machine's own address**. *"This machine has an email address. It just placed its own order."*
- **Trigger.dev:** "It also booked its own descale." A log line appears by itself 45 seconds later. *"It'll still be doing that in three weeks when none of us are here."*

---

## 3. Facts already established (don't rediscover these)

### Ambiguous (tested and working)
- Ambiguous (ambiguous.ai) is a human–AI workspace. Each **agent** in a workspace has its own **email address** and its own **API key** (`ak_...`). Sending mail *with an agent's key* sends it *from that agent's address*. That's how an object "has its own inbox".
- **Base URL:** `https://app.ambiguous.ai`. **Auth:** `Authorization: Bearer <key>`.
- **Send mail:** `POST /api/mail/send`, body `{ "to": ["a@b.com"], "subject": "...", "body_markdown": "..." }`. Note that `to` is an **array** and the body field is **`body_markdown`**. The docs say the response is `{ id, status }`, but in the real test it returned `{ id: "<uuid>" }` with **no `status`**. Treat a 2xx response plus an `id` as success.
- **Provision an agent:** `POST /api/admin/users/provision-agent` with the **admin** key, body `{ "display_name": "...", "role": "member" }`. It returns `{ user: { workspace_email, ... }, api_key }`, and the key is shown only once.
- **The three object identities ALREADY EXIST** in the team workspace (`bug-ai-tinkerers`):
  - projector → `main.hall.projector@bug-ai-tinkerers.ambi.cc`
  - coffee → `lobby.coffee.machine@bug-ai-tinkerers.ambi.cc`
  - room → `meeting.room.2.door@bug-ai-tinkerers.ambi.cc`
- ⚠️ **Do NOT re-run the provision script to "set up" this machine.** It would create *duplicate* agents with new addresses. Instead, the human copies B's three `AMBIGUOUS_AGENT_KEY_*` values into this machine's `.env.local`. Only provision if B's keys are lost, and warn the human that the addresses will change.
- **Env naming changed from the original plan.** The plan said `AMBIGUOUS_WS_PROJECTOR / _COFFEE / _ROOM` (workspace ids). Ambiguous identities are *agent keys*, not workspace ids, so the real names are **`AMBIGUOUS_AGENT_KEY_PROJECTOR / _COFFEE / _ROOM`**. If Part A's `.env.local` or code has `AMBIGUOUS_WS_*` placeholders, replace them.
- A real test email from the coffee machine was sent successfully (`ok: true`).
- API reference: https://www.ambiguous.ai/agents/api. The Mail app also has `list_inbox` / `search_mail` tools, but reading replies is out of scope.

### Trigger.dev
- **SDK v4** (4.5.16 was installed on B's machine). v4 imports from **`@trigger.dev/sdk`** (v3 used `@trigger.dev/sdk/v3`). Use whatever version is actually installed, and keep the CLI version matching the SDK.
- Define a task: `task({ id, run })`. Trigger it from backend code **without importing the task's code** by using `tasks.trigger<typeof myTask>("task-id", payload, { delay: "45s" })` with an `import type`. Delays like `"45s"` and `"7d"` work.
- `npx trigger.dev@latest dev` **automatically loads `.env`, `.env.development`, `.env.local`, `.env.development.local`**, so `DATA_DIR`, `DEMO_EMAIL` and the Ambiguous keys in `.env.local` reach the task.
- **Landmine:** the dev CLI runs tasks from a separate build directory, so **`process.cwd()` is not the project root inside a task**. Memory paths must come from the absolute `DATA_DIR` (forward slashes). The task guards against a missing `DATA_DIR`.
- `TRIGGER_SECRET_KEY` must be the **Development** key (`tr_dev_...`), not `tr_prod_...`. Dev keys belong to a person's dev environment in the Trigger.dev project, so the key must belong to **whoever runs `trigger.dev dev` on the demo laptop**. If A runs the demo, A needs access to the Trigger.dev project (B invites A) or A's own project, and A's own dev key.
- `trigger.config.ts` **has not been created yet**. The human runs `npx trigger.dev@latest init` (it asks questions and logs in through the browser).

### Exa (Part A's code; Part B only checks it)
- Exa is a web search API. It lets an object **read its own manual**: "What does error E-04 mean?" → the object searches the web and answers with a cited source. It's a sponsor, and it's the last line of the pitch: *"Ambiguous gives each object an identity, Trigger.dev gives it a future, and Exa lets it read its own manual."*
- **It belongs to A**, not Part B. `lib/exa.ts`, the `exa-js` package and the `lookup_manual` tool are all Part A. Nothing in Part B calls Exa or depends on it. **Don't build or rewrite it**; if it's missing, say so at Checkpoint 0 (see section 4).
- **As planned** (verify against `lib/exa.ts`): `lookupManual(model, question)` searches `"<model> <question> manual troubleshooting"` and returns the top 3 results, each as `SOURCE: title (url)` plus an excerpt. If Exa can't be reached, it returns "I couldn't reach my manual" instead of breaking the reply.
- The agent passes the object's `model` from `lib/objects.ts` (e.g. `Epson EB-L200SW`, `Jura X8`). **Real model numbers are deliberate**, because they make the search return real documentation. A's agent instructions tell the model to cite the source when it uses the manual.
- Needs `EXA_API_KEY` (from https://dashboard.exa.ai, **API Keys**). It's server-only: the browser never calls Exa, only `POST /api/agent`.

### Environment
- Node 22+ is required (B's machine had Node 24.19).
- `.env.local` is gitignored (`.env*`) and never committed.
- `DATA_DIR` must be **absolute with forward slashes** and point at this repo's `data/` folder (where the seed JSON lives), e.g. `C:/Users/<you>/.../ai-tinkerers/data`.

---

## 4. Step 1: read Part A's code and adapt (do this first; no edits yet)

Read the files below, then fill in the decision table. Report a short summary of the deviations you found, then continue.

```powershell
git status; git log --oneline -10
Get-ChildItem -Recurse -File lib, app, data, trigger -ErrorAction SilentlyContinue | Select-Object FullName
```
Read in full: `package.json`, `next.config.ts`, `tsconfig.json`, `lib/objects.ts`, `lib/memory.ts`, `lib/exa.ts`, `lib/agent.ts`, `app/api/agent/route.ts`, the three stub files (wherever they are), `app/o/[id]/page.tsx`, and any `middleware.ts` / `proxy.ts` or `lib/auth0.ts`. Search for the contract functions:
```powershell
Select-String -Path (Get-ChildItem -Recurse -Include *.ts,*.tsx -Path lib,app) -Pattern 'sendFromObject|scheduleMaintenance|getUser|addLog|AMBIGUOUS_|DATA_DIR'
```

| Check | If you find this… | …then do this |
|---|---|---|
| Where the stubs live and their exact exports | e.g. `lib/schedule.ts` instead of `lib/scheduler.ts`, a default export, or different parameter names | Keep **A's file path and export style**, replace only the body, and fix the imports in the Part B files below to match. |
| What A's agent does with the return values | e.g. it checks `res.ok`, reads `res.id`, or ignores the result | Keep return shapes compatible. Part B returns `{ ok, stub? , id?, runId?, error? }` and never throws. |
| Whether A's tools already log after calling | `report_issue` → `addLog("Emailed facilities…")`, `schedule_maintenance` → `addLog("Scheduled…")` | Part B's functions **don't** log, to avoid double logging. The Trigger task logs only the *later* "Maintenance due" line. Keep it that way. |
| `addLog` signature | sync vs async; `(id, event)` vs `(id, {event})`; a different name | Adapt the calls in `trigger/maintenance.ts` and `app/auth/demo/route.ts`. `await` is harmless on sync functions. |
| How `lib/memory.ts` resolves its folder | `process.env.DATA_DIR \|\| path.join(process.cwd(), "data")` (as planned), or something else | If it doesn't read `DATA_DIR`, the Trigger task will write to the wrong place. **Don't edit the memory logic;** use the HTTP-callback variant (section 6c). |
| What `lib/memory.ts` / `lib/objects.ts` import | `next/*`, `server-only`, `@/` aliases, React | These can break the Trigger.dev bundle. Try the direct import first; if the task fails to build or run, use the HTTP-callback variant (section 6c). |
| Object ids and registry exports | ids other than `projector`/`coffee`/`room`; an exported `getObject(id)` / `OBJECTS` | Update the id set in the demo route and the `AMBIGUOUS_AGENT_KEY_<ID>` mapping. If there's a lookup, use `obj.name` and `obj.supplierEmail` in the task's email instead of the raw id and `DEMO_EMAIL`. |
| `supplierEmail` source | read from `DEMO_EMAIL` (as planned) or hardcoded | Make sure the email recipient is a real inbox the human can show on stage. |
| `@trigger.dev/sdk` in `package.json` | missing / v3 / v4 | Missing → `npm i "@trigger.dev/sdk"` (or let `init` install it). v3 → use the `@trigger.dev/sdk/v3` import path. |
| Auth0 / proxy routing | a `proxy.ts` / `middleware.ts` using `auth0.middleware`, or routes under `/auth/*` | Confirm `/auth/demo` isn't swallowed by Auth0. If it is, move the demo route to `app/api/demo/schedule/route.ts`. |
| `next.config.ts` | no `allowedDevOrigins` | Tell A (tunnel requests get blocked without it): `allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.ngrok.app"]`. |
| Exa (Part A) | `lib/exa.ts` missing or still a stub, `exa-js` not in `package.json`, or no `lookup_manual` tool in `lib/agent.ts` | **Don't build it** (it's A's, and the no-new-packages rule applies). Report it at Checkpoint 0 so A knows the manual-lookup beat won't work yet. Part B carries on regardless. |
| `.env.local` placeholders | `AMBIGUOUS_WS_*` | Rename to `AMBIGUOUS_AGENT_KEY_*` (see section 3). |
| Anything else that contradicts this doc | anything | **Follow the code**, adapt Part B, and list the deviation in your summary. |

**Checkpoint 0:** report the deviations found and the adaptations you'll make (a few lines). Then continue.

---

## 5. Step 2: environment

Make sure `.env.local` (repo root) contains these keys. **Add any missing names with empty values. Never overwrite existing values, never print values.** Ask the human to paste the values B sends over chat.

```
# Part B, required
AMBIGUOUS_API_KEY=                 # workspace admin key (ak_...); only needed for provisioning
AMBIGUOUS_AGENT_KEY_PROJECTOR=     # from B; do NOT re-provision
AMBIGUOUS_AGENT_KEY_COFFEE=        # from B
AMBIGUOUS_AGENT_KEY_ROOM=          # from B
TRIGGER_SECRET_KEY=                # tr_dev_... of whoever runs `trigger.dev dev` on THIS machine
DEMO_EMAIL=                        # inbox shown on stage (all object emails go here)
DATA_DIR=                          # absolute, forward slashes, this repo's data/ folder
INTERNAL_SECRET=hackathon123       # only used by the HTTP-callback variant

# Part A (check it's set; A supplies it, not B)
EXA_API_KEY=                       # dashboard.exa.ai; powers lookup_manual

# Auth0 (section 8, only if not already done)
AUTH0_SECRET=
AUTH0_DOMAIN=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
APP_BASE_URL=http://localhost:3000
STAFF_EMAILS=                      # comma-separated staff emails allowed to spend
```

To verify without leaking anything, print only whether each key is set and, for Trigger, its prefix:
```powershell
Get-Content .env.local | Where-Object { $_ -match '^(AMBIGUOUS_|TRIGGER_|EXA_|DEMO_EMAIL|DATA_DIR)' } | ForEach-Object { $k,$v = $_ -split '=',2; "$k : " + $(if ($v.Trim()) { if ($k -eq 'TRIGGER_SECRET_KEY') { $v.Substring(0,7) + '...' } else { 'set' } } else { 'EMPTY' }) }
```

---

## 6. Step 3: Ambiguous (the object's own inbox)

### 6a. `lib/ambiguous.ts` (replace the stub body; keep A's file path and export style)

```ts
const BASE = "https://app.ambiguous.ai";

// Each object is its own Ambiguous agent; sending with its key sends from its own address.
function agentKey(objectId: string) {
  return process.env[`AMBIGUOUS_AGENT_KEY_${objectId.toUpperCase()}`];
}

export async function sendFromObject(objectId: string, to: string, subject: string, body: string) {
  const key = agentKey(objectId);
  if (!key) {
    console.log(`[ambiguous stub] ${objectId} -> ${to}: ${subject}\n${body}`);
    return { ok: true, stub: true };
  }

  try {
    const res = await fetch(`${BASE}/api/mail/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: [to], subject, body_markdown: body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[ambiguous] ${objectId} send failed ${res.status}`, data);
      return { ok: false, error: `Ambiguous returned ${res.status}` };
    }
    return { ok: true, id: data.id as string | undefined, status: data.status as string | undefined };
  } catch (err) {
    console.error(`[ambiguous] ${objectId} send error`, err);
    return { ok: false, error: String(err) };
  }
}
```
Notes:
- The missing-key fallback (log and return success) is deliberate, so a missing key never blocks the demo.
- Real API errors return `ok: false` instead of throwing, so the agent can say it couldn't send.
- If A's object ids aren't the planned three, the env var is `AMBIGUOUS_AGENT_KEY_<ID uppercased>`.

### 6b. Test it directly (no dev server needed)
Node 22.18+/24 strips TypeScript types natively, so this works as long as `lib/ambiguous.ts` has no `@/` imports:
```powershell
node --env-file=.env.local -e "import('./lib/ambiguous.ts').then(m => m.sendFromObject('coffee', process.env.DEMO_EMAIL, 'Hello from the Lobby Coffee Machine', 'Hi! I have my own email address now.')).then(console.log).catch(console.error)"
```
- **Pass:** it prints `{ ok: true, id: '<uuid>', ... }` (ignore the `MODULE_TYPELESS_PACKAGE_JSON` warning), **and** the human sees an email **from `lobby.coffee.machine@bug-ai-tinkerers.ambi.cc`**.
- `stub: true` means the agent key is missing.
- `ok: false` with 401 means the key is wrong.

**Checkpoint 1:** a real email from an object. Commit: `Wire Ambiguous: objects send mail from their own inbox`.

---

## 7. Step 4: Trigger.dev (the object schedules its own future)

### 7a. Init (the human runs this, since it's interactive)
Ask the human to run `npx trigger.dev@latest init` in the repo root:
- log in through the browser;
- pick the team's Trigger.dev project (or create one);
- answer **No** to the MCP server and **No** to the example task.

It creates `trigger.config.ts` and may add `@trigger.dev/sdk` to `package.json`. Afterwards, read `trigger.config.ts`:
- confirm `dirs` includes `./trigger`;
- note the SDK import path it used, and use that same path in the files below;
- confirm the installed SDK version matches the CLI (`npm ls "@trigger.dev/sdk"`).

### 7b. `trigger/maintenance.ts`

```ts
import { task } from "@trigger.dev/sdk";
import { addLog } from "../lib/memory";
import { sendFromObject } from "../lib/ambiguous";

export type MaintenancePayload = { objectId: string; taskName: string };

export const maintenanceDue = task({
  id: "maintenance-due",
  run: async ({ objectId, taskName }: MaintenancePayload) => {
    // Trigger runs tasks from its own build dir, so a cwd-relative fallback would write to the wrong file.
    if (!process.env.DATA_DIR) throw new Error("DATA_DIR is not set in .env.local");

    await addLog(objectId, `Maintenance due: ${taskName}`);

    const to = process.env.DEMO_EMAIL;
    if (to) {
      await sendFromObject(
        objectId,
        to,
        `Maintenance due: ${taskName}`,
        `Hi, this is the ${objectId}. I booked this myself: "${taskName}" is due now. Please come and take care of it.`
      );
    }

    return { ok: true };
  },
});
```
Adapt to Part A:
- Use A's real `addLog` name and signature.
- If `lib/objects.ts` exports a lookup, use `obj.name` in the email body ("this is the Lobby Coffee Machine") and `obj.supplierEmail` as the recipient.
- Relative imports are used on purpose (the Trigger.dev bundler and `@/` aliases can disagree).

### 7c. `lib/scheduler.ts` (replace the stub body; keep A's file path, e.g. `lib/schedule.ts` if that's what A used)

```ts
import { tasks } from "@trigger.dev/sdk";
import type { maintenanceDue } from "@/trigger/maintenance";

export async function scheduleMaintenance(objectId: string, taskName: string, inDays: number) {
  if (!process.env.TRIGGER_SECRET_KEY) {
    console.log("[scheduler stub] no TRIGGER_SECRET_KEY", { objectId, taskName, inDays });
    return { ok: true, stub: true };
  }
  try {
    const handle = await tasks.trigger<typeof maintenanceDue>(
      "maintenance-due",
      { objectId, taskName },
      { delay: `${inDays}d` }
    );
    return { ok: true, runId: handle.id };
  } catch (err) {
    console.error("[scheduler] trigger failed", err);
    return { ok: false, error: String(err) };
  }
}
```
The `import type` matters: it keeps the task's code (and its memory/Ambiguous imports) out of the Next.js bundle.

### 7d. `app/auth/demo/route.ts` (the hidden 45-second stage route)

```ts
import { tasks } from "@trigger.dev/sdk";
import type { maintenanceDue } from "@/trigger/maintenance";
import { addLog } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IDS = new Set(["projector", "coffee", "room"]);

// Hidden stage route: GET /auth/demo?id=coffee&task=descale -> log line now, "Maintenance due" 45s later.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "coffee";
  const taskName = url.searchParams.get("task") ?? "descale";
  if (!IDS.has(id)) return Response.json({ ok: false, error: "unknown object" }, { status: 400 });

  const handle = await tasks.trigger<typeof maintenanceDue>(
    "maintenance-due",
    { objectId: id, taskName },
    { delay: "45s" }
  );
  await addLog(id, `Booked my own ${taskName}. Reminder set.`);

  return Response.json({ ok: true, objectId: id, taskName, firesIn: "45s", runId: handle.id });
}
```
Adapt to Part A:
- The `IDS` allowlist is a security guard, because this route is public through the tunnel and `id` becomes a file name. Keep it, updated to A's real ids (or build it from A's registry).
- If Auth0's proxy/middleware intercepts `/auth/*`, move this route to `app/api/demo/schedule/route.ts`.

### 7e. HTTP-callback variant (use ONLY if the direct approach fails)
Use this if the task can't import `lib/memory.ts` in the Trigger.dev worker (a bundling error, `server-only` or `next/*` imports), or if it writes to the wrong folder (the object's JSON *modified* time doesn't change after a run). With this variant, the task calls back into the Next.js app, which does the logging and the email. Don't spend more than 10 minutes debugging the direct approach first.

`app/api/hook/maintenance/route.ts`:
```ts
import { addLog } from "@/lib/memory";
import { sendFromObject } from "@/lib/ambiguous";

export const runtime = "nodejs";

const IDS = new Set(["projector", "coffee", "room"]);

export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.INTERNAL_SECRET}`) {
    return new Response("forbidden", { status: 403 });
  }
  const { objectId, taskName } = await req.json();
  if (!IDS.has(objectId)) return Response.json({ ok: false }, { status: 400 });

  await addLog(objectId, `Maintenance due: ${taskName}`);
  const to = process.env.DEMO_EMAIL;
  if (to) {
    await sendFromObject(objectId, to, `Maintenance due: ${taskName}`,
      `Hi, this is the ${objectId}. I booked this myself: "${taskName}" is due now. Please come and take care of it.`);
  }
  return Response.json({ ok: true });
}
```
Then change the body of `trigger/maintenance.ts`'s `run` to (and remove its memory/Ambiguous imports):
```ts
const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
const res = await fetch(`${base}/api/hook/maintenance`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.INTERNAL_SECRET}`, "Content-Type": "application/json" },
  body: JSON.stringify({ objectId, taskName }),
});
if (!res.ok) throw new Error(`hook returned ${res.status}`);
return { ok: true };
```
In dev, the Trigger.dev worker and Next.js run on the same laptop, so `localhost:3000` works. That's also why `APP_BASE_URL` stays `http://localhost:3000` for this purpose.

### 7f. Test (the human runs the servers)
1. Ask the human to start (or restart, since env changed) terminal 1: `npm run dev`, and terminal 2: `npx trigger.dev@latest dev`.
2. Open `http://localhost:3000/auth/demo?id=coffee&task=descale`. It should return JSON with `runId` and `"firesIn": "45s"`.
3. Right away: `DATA_DIR/coffee.json` has "Booked my own descale. Reminder set."
4. After about 45 seconds:
   - the run shows Completed in the Trigger.dev dashboard;
   - `coffee.json` gains "Maintenance due: descale", and its *modified* time updates (check with `(Get-Item $env:DATA_DIR/coffee.json).LastWriteTime`, or the literal path);
   - a reminder email arrives from the coffee machine's address.
5. On `/o/coffee`, the new log line shows after the next chat message (`router.refresh()`) or a page reload.

**Checkpoint 2:** a 45-second delayed task lands a log line on its own and sends the email. Commit: `Wire Trigger.dev: objects schedule their own maintenance`.

---

## 8. Step 5 (OPTIONAL): Auth0, the gate on who may spend money

> **Skip this section by default.** Auth0 is being handled separately. Only do it if the human says Auth0 is not done, or `lib/auth.ts` is still the stub returning `{ email: undefined, canSpend: false }` **and** the human confirms.

- Use the Auth0 Next.js SDK v4 (`@auth0/nextjs-auth0`), which is middleware-based and reads `AUTH0_SECRET`, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` and `APP_BASE_URL`. Follow the current quickstart. **Next 16 renamed `middleware.ts` to `proxy.ts`**, so check `node_modules/next/dist/docs/` and the SDK README for which one to use.
- `lib/auth0.ts`: `export const auth0 = new Auth0Client();`, then wire `auth0.middleware(request)` in the proxy/middleware file. Login must be reachable at **`/auth/login`**, because A's object page already links there.
- `lib/auth.ts` (keep the `getUser` name and return shape):
  ```ts
  import { auth0 } from "./auth0";

  const STAFF = new Set((process.env.STAFF_EMAILS ?? "").split(",").map(s => s.trim()).filter(Boolean));

  export async function getUser() {
    const session = await auth0.getSession();
    const email = session?.user?.email as string | undefined;
    return { email, canSpend: !!email && STAFF.has(email) };
  }
  ```
- **The tunnel gotcha:** `APP_BASE_URL` must be the tunnel URL when demoing through the tunnel. Tell the human to add **both** `http://localhost:3000` and the tunnel URL (with `/auth/callback`) to the Auth0 app's Allowed Callback URLs, and both base URLs to Allowed Logout URLs. They have to do that in the Auth0 dashboard.
- **Fallback if this takes more than 20 minutes:** temporarily honour `?staff=1` as an override and move on. Losing the Auth0 prize is cheaper than losing the demo.
- **Test:** as a guest, "order beans" is denied with a prompt to log in. After staff login, the same request quotes a cost, asks for a yes, then sends the order from the coffee machine's inbox.

---

## 9. Step 6: end-to-end through the agent

These need A's agent, `OPENAI_API_KEY`, `EXA_API_KEY` (for step 4), and both dev terminals running:
1. `/o/projector`, send "Report a problem: the fan is really loud" → an email **from `main.hall.projector@…`** plus A's log line.
2. `/o/coffee`, send "Schedule a descale in 7 days" → a delayed run (7 days) appears in the Trigger.dev dashboard, plus A's "Scheduled" log line.
3. `/o/coffee`, send "Order beans" → as a guest it's DENIED; as staff it quotes the cost → "yes" → an email **from `lobby.coffee.machine@…`**.
4. `/o/coffee`, send "What does error E-04 mean?" → the reply answers in the first person and **cites a source** (title and URL) from the Jura X8 docs. This is Part A's feature; if it fails, report it to A rather than fixing it.
5. `npx tsc --noEmit` shows no errors in Part B files. The Next config may ignore type errors during build, but keep Part B clean anyway.

**Checkpoint 3:** full flow works. Commit, and fast-forward `main`.

---

## 10. Step 7: submission bits

Make sure the README lists these, one line each (judges check):
- **Ambiguous:** each object has its own agent identity and email address and sends mail as itself (e.g. `lobby.coffee.machine@bug-ai-tinkerers.ambi.cc`).
- **Trigger.dev:** objects schedule their own maintenance, delayed tasks that fire days later with nobody logged in.
- **Auth0:** decides who may spend money on an object's behalf (staff allowlist).
- **Exa:** objects read their own manuals, with a model-specific web search that cites its sources. This is Part A's feature, but add the line if A hasn't, because judges check every sponsor.

Also include setup instructions that list the env var names (no values), including `AMBIGUOUS_AGENT_KEY_*`, `DATA_DIR` and `EXA_API_KEY`.

---

## 11. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `stub: true` from `sendFromObject` | That object's `AMBIGUOUS_AGENT_KEY_*` is missing. Get it from B. Only re-provision as a last resort (new addresses). |
| `ok: false, 'Ambiguous returned 401'` | Wrong or revoked agent key. |
| `ok: true` but no email | Check spam. The plan may only deliver inside the workspace, so tell the human. |
| Email arrives but not from the object's address | It was sent with the admin key instead of the agent key. Check the key mapping. |
| Trigger run fails: "DATA_DIR is not set" | The dev CLI isn't reading `.env.local`. Restart it, check the file is in the repo root, else use the HTTP callback (7e). |
| Run completes but the page shows no new log line | The write went to another folder. Check `DATA_DIR` and the file's modified time, else use the HTTP callback (7e). |
| Task bundle/build error mentioning `next/*`, `server-only` or path aliases | Part A's memory/objects imports don't work in the Trigger.dev worker. Use the HTTP callback (7e). |
| No run in the dashboard | The dev CLI isn't running, or `TRIGGER_SECRET_KEY` is a `tr_prod_` key or someone else's dev key. |
| SDK/CLI version mismatch warning | Run the CLI at the installed SDK version: `npx trigger.dev@<version> dev`. |
| `/auth/demo` returns an Auth0 page or 404 | Auth0 is intercepting `/auth/*`. Move the route to `app/api/demo/schedule/route.ts`. |
| `npm i @trigger.dev/sdk` → "splatting operator" error | PowerShell. Quote it: `npm i "@trigger.dev/sdk"`. |
| Tunnel requests blocked in dev | `allowedDevOrigins` is missing from `next.config.ts`. |
| Object replies "I couldn't reach my manual" | `EXA_API_KEY` is missing or wrong, or Exa is unreachable. Check the key is set (print only `set`/`EMPTY`) and restart `npm run dev`. Part A's code, so tell A. |
| Manual answers are vague or about the wrong product | The `model` in `lib/objects.ts` isn't the real model number, so the search finds generic pages. Part A's code. |
| Manual answer has no source | A's agent instructions should tell the model to cite the source. Part A's code. |
| `Invalid schema for function … type: "None"` | A zod major-version mismatch with `@openai/agents` (Part A territory). Check `npm ls zod`. |

---

## Appendix: `scripts/provision-ambiguous.mjs` (already run; kept for reference/recovery)

Only needed if the object identities must be recreated (a new workspace, or lost keys). **Re-running creates new agents with new addresses** for any object whose `AMBIGUOUS_AGENT_KEY_*` is missing from `.env.local`. Objects that already have a key are skipped.

```js
// One-time: gives each object its own Ambiguous agent identity + email address.
// Usage (PowerShell, project root): node scripts/provision-ambiguous.mjs
// Needs AMBIGUOUS_API_KEY (admin) in .env.local. Appends AMBIGUOUS_AGENT_KEY_<ID> lines; safe to re-run.
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
try {
  process.loadEnvFile(envPath);
} catch {
  console.error(`Could not read ${envPath}`);
  process.exit(1);
}

const admin = process.env.AMBIGUOUS_API_KEY;
if (!admin) {
  console.error("Set AMBIGUOUS_API_KEY in .env.local first.");
  process.exit(1);
}

const objects = [
  ["projector", "Main Hall Projector"],
  ["coffee", "Lobby Coffee Machine"],
  ["room", "Meeting Room 2 Door"],
];

let append = "";
for (const [id, name] of objects) {
  const envName = `AMBIGUOUS_AGENT_KEY_${id.toUpperCase()}`;
  if (process.env[envName]) {
    console.log(`${id}: already provisioned, skipping`);
    continue;
  }
  const res = await fetch("https://app.ambiguous.ai/api/admin/users/provision-agent", {
    method: "POST",
    headers: { Authorization: `Bearer ${admin}`, "Content-Type": "application/json" },
    body: JSON.stringify({ display_name: name, role: "member" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.api_key) {
    console.error(`${id}: failed (${res.status}) ${data.error ?? data.message ?? ""}`);
    continue;
  }
  append += `${envName}=${data.api_key}\n`;
  console.log(`${id}: ${data.user?.workspace_email ?? "(no email in response)"}`);
}

if (append) {
  fs.appendFileSync(envPath, `\n${append}`);
  console.log("Agent keys written to .env.local");
}
```

**Git note:** B's original versions of these files are also committed on branch `Junior` (local commit `95221a5`, pushed only if B has pushed it since). Merging `Junior` gives the same files, but **section 4's reconciliation still applies**. The code in this document is what was tested.
