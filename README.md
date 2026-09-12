# AI Tinkerers

Turn a physical object or place into a scannable agent. You create the agent in a dashboard, attach a knowledge file, then print or share a QR code. Anyone who scans it can talk to that object by voice or chat. The agent answers only from its knowledge file and can email you when a visitor reports something wrong, fixed, or broken.

## What works

| Surface | URL | Who can use it | What it does |
| --- | --- | --- | --- |
| Landing | `/` | Anyone | Sign in / sign up. Logged-in users go straight to the dashboard. |
| Auth | `/auth/login`, `/auth/logout` | Anyone | Auth0 session. After login, return to `/dashboard`. |
| Dashboard | `/dashboard` | Signed-in owners | Create, edit, share, and delete scannable agents. |
| Agent | `/agents/[id]` | Anyone with the link or QR | Talk (voice) or Chat (text) as that object. No login. |
| CopilotKit | `/api/copilotkit` | Agent chat page | Server-side text brain for Chat mode. |
| Realtime session | `/api/realtime/session` | Agent talk page | Mints a short-lived OpenAI Realtime key for WebRTC voice. |
| Admin notify | `/api/notify-admin` | Agent talk page | Emails the owner when voice mode calls `notify_admin`. |

## How a visit works

```
Owner                          Visitor
  |                               |
  |  Auth0 login                  |
  |  Dashboard: create agent      |
  |  Upload .txt / .md / .pdf     |
  |  Share QR → /agents/{id}      |
  |                               |  Scan QR
  |                               |  Talk  → OpenAI Realtime (browser WebRTC)
  |                               |  Chat  → CopilotKit → OpenRouter (OpenAI fallback)
  |                               |
  |  Email if visitor reports     |  Agent may call notify_admin
  |  wrong info / fix / problem   |
```

1. Owner signs in with Auth0. The dashboard upserts them into Convex (`users` table keyed by Auth0 `sub`).
2. Owner creates a **scannable**: a display name plus a knowledge file. Convex stores the file; `.txt` and `.md` are also saved as extracted text. PDFs are stored but not parsed.
3. Share dialog builds a QR and link to `/agents/{convexId}`.
4. Visitor opens that page. Convex `getById` loads the name. Chat and Talk both pull the same persona from `lib/agent-brain.ts`.
5. If the visitor says the knowledge is wrong, a problem is fixed, or something is broken, the agent calls `notify_admin`. Chat sends mail from the CopilotKit runtime. Voice posts to `/api/notify-admin`. Both go through Ambiguous to `ADMIN_EMAIL`.

## Pages

### `/` — landing (`app/page.tsx`)

If there is an Auth0 session, redirect to `/dashboard`. Otherwise show Log in and Sign up. Signup is `/auth/login?screen_hint=signup`.

### `/dashboard` — owner console

Server page (`app/dashboard/page.tsx`) requires a session, then `ensureConvexUser` so the Auth0 user exists in Convex.

The client (`dashboard-client.tsx`) lists that owner's scannables:

- **+** opens create. If the list is empty, create opens automatically.
- Row menu: **Edit**, **Share**, **Delete**.
- Knowledge column links to the Convex storage URL when a file exists.

Dialogs:

- **Create / edit** (`create-scannable-dialog.tsx`) — name required; create also requires a `.txt`, `.md`, or `.pdf`. Upload uses `scannables.generateUploadUrl`, then `create` or `update`. Edit can keep, replace, or clear the file.
- **Share** (`share-scannable-dialog.tsx`) — QR, copy link, open in a new tab, native share. URL is `{origin}/agents/{id}`.
- **Delete** (`delete-scannable-dialog.tsx`) — removes the row and its stored file.
- **User icon** — avatar / initials and Log out (`/auth/logout`).

### `/agents/[id]` — public agent

No login. Unknown ids show “Agent not found”.

Header toggles **Talk** and **Chat**. Both wrap in `CopilotKitProvider` so Chat can reach `/api/copilotkit` with header `x-scannable-id`.

**Talk** (`talk-panel.tsx`): tap the mic → `POST /api/realtime/session` → OpenAI Realtime WebRTC in the browser. Live transcript, speaking pulse, stop button. Voice tools run in the browser, so `notify_admin` hits `/api/notify-admin`.

**Chat** (`CopilotChat`): text UI against the CopilotKit runtime. The `notify_admin` tool runs on the server.

## Agent brain

`lib/agent-brain.ts` is the shared prompt for Chat and Talk.

- Speak in first person as the scannable’s name.
- Use only the knowledge text (truncated at 60k characters).
- If the file is a PDF or missing, say there are no details yet.
- Do not invent facts.
- Call `notify_admin` only for `wrong_info`, `fixed`, `problem`, or `other` — not ordinary questions.

## Backend

### Convex (`convex/`)

Realtime database and file storage. Dashboard uses `convex/react`; API routes use `ConvexHttpClient` in `lib/convex-server.ts`.

**`users`**

| Field | Purpose |
| --- | --- |
| `auth0Id` | Auth0 `sub`, unique |
| `email`, `name` | Copied from the Auth0 session |

Mutations/queries: `upsertByAuth0`, `getByAuth0`.

**`scannables`**

| Field | Purpose |
| --- | --- |
| `ownerId` | Convex user id |
| `name` | Display name / persona |
| `knowledgeFileId` | Convex storage id |
| `knowledgeFileName`, `knowledgeContentType` | Original upload |
| `knowledgeText` | Extracted text for `.txt` / `.md` only |

| Function | Used by | Notes |
| --- | --- | --- |
| `generateUploadUrl` | Create/edit dialog | Convex storage upload URL |
| `create` | Create dialog | Validates owner, file type, text size (400k chars) |
| `update` | Edit dialog | Owner-only; can replace or clear knowledge |
| `remove` | Delete dialog | Owner-only; deletes file then row |
| `listByOwner` | Dashboard | Includes public file URL |
| `getById` | Agent page | Public: id + name only |
| `getKnowledge` | Chat + voice APIs | Public on purpose so QR visitors work without login |

### Auth0 (`lib/auth0.ts`, `proxy.ts`)

Next.js 16 `proxy.ts` runs Auth0 middleware on almost every path (static assets excluded). Session cookies gate `/` and `/dashboard`. `/agents/[id]` stays reachable without an account.

### Chat LLM (`lib/llm.ts` → `/api/copilotkit`)

Primary: OpenRouter (`OPENROUTER_MODEL`, default `openai/gpt-4.1-mini`).  
Fallback: OpenAI (`OPENAI_FALLBACK_MODEL`, default `gpt-4.1-mini`) on OpenRouter timeout, 429, or 5xx.

The runtime builds a `BuiltInAgent` per request from `x-scannable-id`. Missing id → placeholder that tells the visitor to scan again.

### Voice (`/api/realtime/session`)

Server holds `OPENAI_API_KEY`. Browser gets an ephemeral `clientSecret` and never sees the real key.

Defaults: model `gpt-realtime`, voice `marin`. Override with `OPENAI_REALTIME_MODEL` and `OPENAI_REALTIME_VOICE`.

### Admin email (`lib/ambiguous.ts`)

`POST https://app.ambiguous.ai/api/mail/send` with `AMBIGUOUS_API_KEY`. Recipient is `ADMIN_EMAIL`. Subject/body include agent name, channel (chat vs voice), summary, and a link to `/agents/{id}` when `APP_BASE_URL` or `PUBLIC_URL` is set.

## Project layout

```
app/
  page.tsx                          Landing + auth CTAs
  layout.tsx                        Fonts, Convex provider
  ConvexClientProvider.tsx          Browser Convex client
  dashboard/                        Owner UI
  agents/[id]/                      Public Talk / Chat
  api/copilotkit/                   CopilotKit runtime (Chat)
  api/realtime/session/             OpenAI Realtime mint (Talk)
  api/notify-admin/                 Voice → Ambiguous email
convex/
  schema.ts                         users + scannables
  users.ts                          Auth0 upsert
  scannables.ts                     CRUD, knowledge, public getters
lib/
  auth0.ts                          Auth0 client
  convex-server.ts                  Server Convex helpers
  agent-brain.ts                    Shared Talk + Chat prompt
  llm.ts                            OpenRouter + OpenAI fallback
  ambiguous.ts                      Admin email
  constants.ts                      x-scannable-id header name
  objects.ts                        Unused leftover demo objects
proxy.ts                            Auth0 middleware (Next.js 16)
```

## Local setup

Needs Node.js, an Auth0 app, a Convex project, and the API keys below.

```bash
npm install
```

Create `.env.local` (this file is gitignored):

```bash
# Auth0
APP_BASE_URL=http://localhost:3000
AUTH0_DOMAIN=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
AUTH0_SECRET=                       # openssl rand -hex 32

# Convex
CONVEX_DEPLOYMENT=                  # from `npx convex dev`
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CONVEX_SITE_URL=

# Chat (at least one of these)
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4.1-mini
OPENAI_API_KEY=                     # also required for Talk
OPENAI_FALLBACK_MODEL=gpt-4.1-mini

# Talk (optional overrides)
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=marin

# Admin alerts
AMBIGUOUS_API_KEY=
ADMIN_EMAIL=
PUBLIC_URL=                         # optional public origin for email links
```

Run Next and Convex together:

```bash
npm run dev:all
```

Or separately: `npm run dev` and `npx convex dev`.

Open [http://localhost:3000](http://localhost:3000). Sign in, create an agent, Share, then open the QR link.

`next.config.ts` allows the LAN origin `10.6.128.23` so phones on the same network can hit the dev server. For a real QR on a phone, the share URL must be reachable (same LAN, or a tunnel in `PUBLIC_URL` / `APP_BASE_URL`).

## Scripts

| Script | What it runs |
| --- | --- |
| `npm run dev` | Next.js only |
| `npm run dev:all` | Next.js + `npx convex dev` |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

## Auth0 notes

Callback and logout URLs should include `{APP_BASE_URL}/auth/callback` and `{APP_BASE_URL}`. The Auth0 client sets `signInReturnToPath` to `/dashboard`.

## Limits and caveats

- **PDFs are not read.** The file is stored and shown on the dashboard, but Talk/Chat will say there are no details. Use `.txt` or `.md` if the agent must answer from the file.
- **Knowledge is public** to anyone who has the agent id. `getKnowledge` is intentionally unauthenticated.
- **Admin mail is one inbox** (`ADMIN_EMAIL`), not per-owner.
- **`lib/objects.ts` is unused.** Old hardcoded projector / coffee / room demos. Live agents come from Convex.
- **`EXA_API_KEY` and `TRIGGER_SECRET_KEY`** may appear in a local env file; nothing in this repo reads them.

## Stack

Next.js 16 (App Router), React 19, Tailwind 4, Auth0, Convex, CopilotKit, OpenRouter / OpenAI, OpenAI Realtime, Ambiguous mail, `qrcode.react`.
