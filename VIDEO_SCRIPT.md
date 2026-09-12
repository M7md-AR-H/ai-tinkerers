# 2-minute video script — functionality + integrations

**Runtime:** ~2:00  
**Pace:** ~150 words/min  
**Tone:** demo first, then a quick code walk — no setup, no env-var recitation.

Suggested on-screen labels are in `[brackets]`. Cut on the action, not the sentence.

---

## 0:00–0:18 — What it is

**Show:** Landing → Log in → dashboard with one scannable → Share dialog (QR + link).

**Say:**

> This is Scannable. You turn a physical object into an agent. Sign in, give it a name and a knowledge file, print the QR. Anyone who scans it can talk to that object — no account required.

**Click:** Open the agent URL in a new tab. Toggle Talk / Chat once so both modes are visible.

---

## 0:18–0:32 — Auth0

**Show:** `lib/auth0.ts` (3 lines), then `proxy.ts`, then `app/dashboard/page.tsx`.

**Say:**

> Owners go through Auth0. The Next.js proxy runs Auth0 on almost every path. The dashboard checks the session, then upserts the user into Convex by Auth0 `sub`. Public agent pages stay open — visitors never log in.

**Highlight:**

```ts
// lib/auth0.ts
export const auth0 = new Auth0Client({ signInReturnToPath: "/dashboard" });
```

```ts
// app/dashboard/page.tsx
const session = await auth0.getSession();
if (!session) redirect("/auth/login?returnTo=/dashboard");
const ownerId = await ensureConvexUser(session.user);
```

---

## 0:32–0:55 — Chat: OpenRouter, OpenAI fallback

**Show:** Agent Chat tab, send a short question. Then jump to `lib/llm.ts` and `app/api/copilotkit/[[...path]]/route.ts`.

**Say:**

> Chat is CopilotKit. The model factory in `lib/llm.ts` hits OpenRouter first — OpenAI-compatible `/chat/completions`. If OpenRouter times out, rate-limits, or 500s, the same request is replayed against OpenAI with a swapped URL, key, and model. The CopilotKit runtime loads the scannable from the request header and builds the brain on the fly.

**Highlight:**

```ts
// lib/llm.ts — createChatModel()
const openrouter = createOpenAI({ apiKey: openrouterKey, baseURL: OPENROUTER_BASE, fetch: ... });
return openrouter.chat(OPENROUTER_MODEL);
```

```ts
// withOpenAIFallback — on 429 / 5xx / throw
url.replace(OPENROUTER_BASE, OPENAI_BASE)
headers.set("Authorization", `Bearer ${openaiKey}`);
parsed.model = OPENAI_FALLBACK_MODEL;
```

```ts
// copilotkit route
model: createChatModel(),
prompt: buildInstructions(scannable),
tools: [notifyAdmin, lookup],
```

---

## 0:55–1:18 — Talk: OpenAI Realtime

**Show:** Talk tab, tap the mic (or a pre-recorded clip of a 5-second exchange). Then `app/api/realtime/session/route.ts` and the `start()` function in `talk-panel.tsx`.

**Say:**

> Voice is OpenAI Realtime over WebRTC. The browser never sees our API key. We POST to `/api/realtime/session`, the server mints an ephemeral client secret, and the Talk panel connects with that. Same persona prompt as chat — `lib/agent-brain.ts` — so Talk and Chat stay in sync.

**Highlight:**

```ts
// /api/realtime/session
fetch("https://api.openai.com/v1/realtime/client_secrets", { ... session: { instructions, audio } })
return { clientSecret: data.value, instructions, name };
```

```ts
// talk-panel.tsx
await session.connect({ apiKey: data.clientSecret });
```

---

## 1:18–1:36 — Exa: grounded web lookup

**Show:** Chat or Talk asking something public (“What’s the official descale cycle?”). Then `lib/exa.ts` and the `lookup_product` tool.

**Say:**

> When the visitor asks about manuals, specs, or error codes, the agent calls `lookup_product`. That hits Exa’s `/answer` endpoint — one call, a grounded answer plus citations. Private stuff — this building, this Wi-Fi, these prices — stays in the knowledge file. Web never overrides it.

**Highlight:**

```ts
// lib/exa.ts
fetch(`${EXA_API}/answer`, { headers: { "x-api-key": apiKey }, body: { query, model, text: false } })
```

Voice uses `/api/lookup`. Chat calls `lookupProduct` inside the CopilotKit runtime. Same helper.

---

## 1:36–1:55 — Ambiguous: tasks + email

**Show:** Visitor saying “the hopper is jammed” (or type it in Chat). Then `lib/admin-actions.ts` → `lib/ambiguous.ts`. Optionally flash an Ambiguous task / the alert email.

**Say:**

> If someone reports a problem, a fix, or wrong info, the agent calls `notify_admin`. We list open Ambiguous tasks for that object, triage with a cheap LLM call — new, duplicate, or resolved — then create, comment, or close the ticket. After that, Ambiguous sends the owner an email. Chat runs this on the server. Voice posts to `/api/notify-admin` because Realtime tools run in the browser.

**Highlight:**

```ts
// lib/ambiguous.ts
POST ${AMBIGUOUS_API}/tasks
POST ${AMBIGUOUS_API}/mail/send
```

```ts
// lib/admin-actions.ts
listOpenTasksFor → triageReport → create / comment / resolve → sendAdminAlert
```

---

## 1:55–2:00 — Close

**Show:** Split: QR on the left, live Talk on the right. Overlay the five names.

**Say:**

> Auth0 for owners. OpenRouter plus OpenAI for chat. OpenAI Realtime for voice. Exa for the public web. Ambiguous for the back office. Scan it — the object talks back.

---

## Shot list (if you cut it tighter)

| Time | Camera | File / UI |
| --- | --- | --- |
| 0:00 | Product | `/` → `/dashboard` → Share QR |
| 0:18 | Code | `lib/auth0.ts`, `proxy.ts`, `app/dashboard/page.tsx` |
| 0:32 | Product + code | Chat message → `lib/llm.ts` → copilotkit route |
| 0:55 | Product + code | Talk mic → `app/api/realtime/session/route.ts` |
| 1:18 | Product + code | Lookup question → `lib/exa.ts` |
| 1:36 | Product + code | Report a problem → `lib/admin-actions.ts`, `lib/ambiguous.ts` |
| 1:55 | Product | QR + Talk, five-logo overlay |

## Demo lines (pre-record these)

Use one scannable whose knowledge file names a real product (brand + model).

1. **Chat / Talk (knowledge):** “How do I start you?”
2. **Exa:** “What’s the official cleaning cycle for you?”
3. **Ambiguous:** “The hopper is jammed — can you tell the owner?”

Do not invent prices or local facts in the knowledge file; the brain will refuse them on camera, which is a good 2-second cut if you have time.
