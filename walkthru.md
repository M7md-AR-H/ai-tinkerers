# Code walkthrough

## 1. Auth0 — owners only

Visitors never sign in. Owners hit Auth0, then get upserted into Convex.

1. [lib/auth0.ts](lib/auth0.ts) — Auth0 client, return path `/dashboard`
2. [proxy.ts](proxy.ts) — Auth0 middleware on almost every path
3. [app/page.tsx](app/page.tsx) — landing; session → dashboard
4. [app/dashboard/page.tsx](app/dashboard/page.tsx) — require session, then `ensureConvexUser`
5. [lib/convex-server.ts](lib/convex-server.ts) — `upsertByAuth0` from the Auth0 `sub`
6. [convex/users.ts](convex/users.ts) — `users` table keyed by `auth0Id`

## 2. OpenRouter + OpenAI — Chat

CopilotKit text brain. OpenRouter first; OpenAI if OpenRouter 429s, 5xxs, or throws.

1. [lib/llm.ts](lib/llm.ts) — `createChatModel()` and `withOpenAIFallback`
2. [lib/agent-brain.ts](lib/agent-brain.ts) — shared Talk + Chat prompt
3. [app/api/copilotkit/[[...path]]/route.ts](app/api/copilotkit/[[...path]]/route.ts) — per-request agent, `notify_admin` + `lookup_product`
4. [app/agents/[id]/agent-page-client.tsx](app/agents/[id]/agent-page-client.tsx) — Chat UI, sends `x-scannable-id`

## 3. OpenAI Realtime — Talk

Server mints an ephemeral key. Browser WebRTC never sees `OPENAI_API_KEY`.

1. [app/api/realtime/session/route.ts](app/api/realtime/session/route.ts) — mint `clientSecret`, attach `buildInstructions`
2. [app/agents/[id]/talk-panel.tsx](app/agents/[id]/talk-panel.tsx) — `RealtimeSession.connect`, voice tools
3. [app/agents/[id]/page.tsx](app/agents/[id]/page.tsx) — public agent page (no login)

## 4. Exa — public web lookup

`lookup_product`: manuals, specs, error codes. Not private/local facts.

1. [lib/exa.ts](lib/exa.ts) — Exa `/answer`, citations
2. [app/api/lookup/route.ts](app/api/lookup/route.ts) — voice tool hits this
3. Chat calls the same helper inside [the CopilotKit route](app/api/copilotkit/[[...path]]/route.ts)

## 5. Ambiguous — tasks + owner email

Visitor report → triage open tasks → create / comment / resolve → email.

1. [lib/ambiguous.ts](lib/ambiguous.ts) — `/tasks` CRUD + `/mail/send`
2. [lib/admin-actions.ts](lib/admin-actions.ts) — `handleVisitorReport` (list → triage → act → email)
3. [app/api/notify-admin/route.ts](app/api/notify-admin/route.ts) — voice path (tools run in the browser)
4. Chat calls `handleVisitorReport` directly in [the CopilotKit route](app/api/copilotkit/[[...path]]/route.ts)

## Owner UI (optional)

1. [app/dashboard/dashboard-client.tsx](app/dashboard/dashboard-client.tsx) — list, edit, share, delete
2. [app/dashboard/create-scannable-dialog.tsx](app/dashboard/create-scannable-dialog.tsx) — name + knowledge (write / photo / upload)
3. [app/dashboard/share-scannable-dialog.tsx](app/dashboard/share-scannable-dialog.tsx) — QR + link to `/agents/{id}`
4. [convex/scannables.ts](convex/scannables.ts) — CRUD and `getKnowledge` (public on purpose)
