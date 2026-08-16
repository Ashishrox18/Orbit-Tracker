# Orbit

**A personal assistant that plans your day around three wins — physical, mental, emotional — and rebuilds tomorrow from what you actually did today.**

Not a chatbot with a todo list. The differentiator is the feedback loop: Orbit measures your real completion behaviour and uses it to size the next day, and it turns the things you're stuck on into scheduled, escalating practice.

---

## The problem

Planning apps assume you'll do what you said you'd do. You won't — not all of it, not at the times you picked. So the plan drifts from reality, you stop trusting it, and you stop opening the app.

Two loops fix that, and Orbit is built around both:

```
  PLAN ──▶ ACT ──▶ TRACK ──▶ REFLECT ──▶ LEARN BEHAVIOUR ──▶ ADAPT ──┐
    ▲                                                                 │
    └─────────────────────────────────────────────────────────────────┘

  LEARN ──▶ CAPTURE DIFFICULTY ──▶ UNDERSTAND GAP ──▶ PRACTISE ──┐
    ▲                                                             │
    └────────── UPDATE FUTURE PLAN ◀── RESOLVE ◀── REFLECT ◀──────┘
```

**Target user:** one person — a student or self-directed learner juggling study, health and relationships, who has tried planners and abandoned them.

---

## What makes it different

| Most planners | Orbit |
|---|---|
| Plan the same load every day | Load shrinks when your completion rate drops, recovers when it rises |
| "You skipped 4 tasks" | "You finish 82% of morning tasks and 51% of evening ones — high-priority work moved to your morning" |
| Reschedule the same task you failed | Escalates the *kind* of practice: explanation → worked example → easier problem → guided → independent |
| AI writes your todo list | AI explains and teaches; **every** number, schedule and priority is deterministic TypeScript |
| Motivation slogans | Claims are only made when the data supports them, otherwise it says so |

---

## Core concepts

### Three wins

Exactly three headline wins per day. Physical is reused from a mandatory habit where one exists, so nothing is duplicated. Mental is your highest-priority unresolved difficulty — that's the difficulty-to-plan pipeline. Emotional asks you to reach out once your stated social cadence lapses, and stays light when it hasn't.

### Behavioural adaptation

Every task mutation recomputes a daily rollup (`behavior_metrics`). From the last 7 days a **load factor** is derived, clamped to 0.6–1.0, and multiplied into tomorrow's capacity. Clamped deliberately: a bad week must not spiral into a two-task day, and a good one must not overrun the time you actually have.

Insights are suppressed entirely below 4 days of history. You get *"Still learning your pattern — 3 more days of data will make these insights reliable"* instead of a fabricated statistic.

### Difficulty capture

No document upload, no question-paper parsing. Type what isn't clicking, pick a severity, done. Groq classifies it into topic/subject/gap/action; if Groq is unreachable a local heuristic classifier fills the same fields and the row is still written — losing a captured struggle is the worst possible failure here.

Marking one **"still struggling"** advances its intervention stage, so the next plan schedules a different kind of work rather than the same task again.

### Exam mode

Collapses the weekly variation rotation to revision and self-testing, draws practice from your exam subjects only, and suppresses the second-difficulty filler task. It cannot invent unrelated learning.

### Variation engine

A seven-theme weekly rotation (review, deep practice, concept learning, problem solving, project, revision, mock) applied to optional mental work. Mandatory habits repeat daily. Consistency without monotony.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ BROWSER                                                      │
│   Server Components (data) + Client islands (interaction)    │
│   lib/client-api.ts — never throws, always renders an error  │
└───────────────────────────┬──────────────────────────────────┘
                            │ fetch (same origin)
┌───────────────────────────▼──────────────────────────────────┐
│ NEXT.JS ROUTE HANDLERS          lib/api.ts                   │
│   body cap → Zod validate → rate limit → safe error shaping  │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│ SERVICES  plans · difficulties · learning · reviews · history │
│   the only layer that touches the database                    │
└──────────┬─────────────────────────────────┬─────────────────┘
           │                                 │
┌──────────▼──────────────────┐   ┌──────────▼──────────────────┐
│ DETERMINISTIC CORE          │   │ AI LAYER  (optional)        │
│  scheduler  behavior        │   │  cache → client → Zod       │
│  planner    difficulty      │   │  timeout · retry-once       │
│  variation  time            │   │  typed fallback, no throw   │
│  ── no AI, no I/O, pure ──  │   └──────────┬──────────────────┘
└──────────┬──────────────────┘              │
           │                          ┌──────▼──────┐
     ┌─────▼───────┐                  │  GROQ API   │
     │ NEON        │                  └─────────────┘
     │ PostgreSQL  │
     │ (Drizzle)   │
     └─────────────┘
```

**The load-bearing boundary is the dashed one.** Scheduling, streaks, percentages, priorities and every date calculation live in the deterministic core. Nothing there imports the AI layer. Delete `GROQ_API_KEY` and the app still plans, schedules, tracks and adapts — you lose prose, not function.

### Database

Eight tables, indexed on the paths that are actually queried.

| Table | Holds | Key index |
|---|---|---|
| `users` | The single user's preferences | — |
| `habits` | Mandatory daily habits | `(user, active)` |
| `daily_plans` | One plan per day | unique `(user, date)` |
| `tasks` | Scheduled blocks with status and actuals | `(plan)`, `(user, status)` |
| `difficulties` | Captured struggles + intervention stage | `(user, status)` |
| `learning_sessions` | One card per day | unique `(user, date)` |
| `daily_reviews` | Evening answers + insight | unique `(user, date)` |
| `behavior_metrics` | Deterministic daily rollup | unique `(user, date)` |
| `ai_cache` | Groq responses by input fingerprint | unique `(user, key)` |

The unique constraints are load-bearing: they make "start my day" and "generate today's card" idempotent, so a double-click or a refresh cannot produce two plans or spend two AI requests.

---

## AI usage and free-tier strategy

Groq is the only provider. It is used in exactly six places:

1. Difficulty classification
2. Morning learning topic + cross-domain connections
3. Plan rationale (prose only — the plan is already committed)
4. Evening behavioural insight
5. Assistant Q&A
6. A behaviour-grounded reflection line

Everything else — dates, scheduling, streaks, completion rates, planning accuracy, difficulty prioritisation, conflict detection, load sizing — is deterministic TypeScript.

**How requests are minimised:**

- **Persistent cache keyed by `(user, kind, day, sha256(input))`.** In Postgres, not memory — serverless instances don't live long enough for an in-process cache to help. A page refresh costs zero requests.
- **Only genuine AI results are cached.** Caching a fallback would pin the degraded answer for the whole day.
- **Retry once, and only for malformed JSON.** A rate limit or timeout falls straight through to the fallback rather than spending more quota.
- **Unique day indexes** prevent duplicate generation at the database level.
- **Concise context builder**, not a database dump — see below.
- **12-second timeout**, 4,000-character input cap.

**What is sent to Groq:** your first name, today's mode, energy level and available minutes, the three win titles, up to three open difficulty topics, and up to three already-computed insight sentences. That's it. Reviews, reflections, learning answers and history beyond those summaries never leave the machine. This is documented in-app on the Settings page.

**Model:** set `GROQ_MODEL` in `.env.local`. Run `npm run groq:models` to list what your key can actually reach and verify your choice — availability changes, so the script asks rather than assuming.

---

## Failure behaviour

Every AI path has a typed fallback and the client wrapper returns a result rather than throwing.

| Failure | Behaviour |
|---|---|
| No API key | App fully functional. Learning cards become prompt-only, labelled "offline card". |
| Groq rate-limited or down | Same as above, plus a visible notice. Difficulty capture uses the local classifier. |
| Malformed model JSON | One retry, then deterministic fallback. Never rendered unvalidated. |
| Network error in browser | "Network error. Check your connection and try again." |
| No history yet | "Still learning your pattern — N more days…" |
| No plan today | "Today has no plan yet" + a direct action |
| Nothing difficult | "Nothing is currently marked difficult." |
| Missed yesterday | No punishment. Load factor adjusts silently; streak copy offers a restart. |

---

## Security

- `GROQ_API_KEY` is server-side only. `server-only` is imported by every AI and service module, so an accidental client import is a **build error**, not a runtime leak. There is no `NEXT_PUBLIC_` variant anywhere.
- Zod validates every API input **and** every AI output. The model is treated as untrusted input.
- 32KB request body cap, per-route in-memory rate limits, 12s AI timeout.
- Errors are shaped: only `UserFacingError` messages reach the client, everything else becomes "Something went wrong." Logs record the error *type* only — never the message, which can carry connection strings or user text.
- No `dangerouslySetInnerHTML` anywhere. All model output renders as text through React's escaping.
- No secrets in logs, no internal database errors exposed.

---

## Accessibility

Targets WCAG 2.1 AA, verified by axe on every route.

Semantic landmarks and one `h1` per page · skip-to-content link as the first tab stop, moving focus to `main` · `aria-current="page"` in navigation · every input has a `<label>`, grouped inputs use `fieldset`/`legend` · `aria-live` regions for async status · visible focus rings in both themes · `prefers-reduced-motion` honoured · status conveyed by text as well as colour · 40px+ touch targets · light and dark palettes both contrast-checked.

---

## Testing

```
npm run typecheck     # tsc --noEmit, strict + noUnusedLocals/Parameters
npm run lint          # eslint
npm test              # 113 unit/integration tests
npm run test:e2e      # Playwright: core loop, accessibility, responsive
npm run build         # production build
```

**113 unit tests** across time arithmetic, behavioural analysis, the scheduler, difficulty prioritisation, the planner, the variation engine, input/output contracts and the rate limiter. They exercise real logic — midnight-crossing schedules, the load-factor clamp, mandatory habits surviving an exhausted capacity, the escalation ladder changing task *kind*, malformed AI responses being rejected.

**E2E** covers onboarding → plan → three wins → complete → capture → learn → settings, plus validation rejection and the Groq-disclosure page.

**Accessibility:** axe runs against all seven routes with `wcag2a/wcag2aa/wcag21a/wcag21aa`, plus explicit landmark, skip-link, `aria-current`, keyboard-order and live-region tests.

> E2E runs against the **real Neon database** — this is a single-user app with no fixture database. Specs are idempotent and safe to re-run, but point `DATABASE_URL` at a branch if you'd rather keep test rows out of your data. Neon branching makes that a one-click operation.

---

## Running it

```bash
cp .env.example .env.local     # then fill in both values
npm install
npm run db:push                # create the schema on Neon
npm run groq:models            # confirm your model is reachable
npm run dev
```

`.env.local`:

```
GROQ_API_KEY=gsk_...           # https://console.groq.com/keys
GROQ_MODEL=llama-3.3-70b-versatile
DATABASE_URL=postgresql://...  # Neon pooled connection string
```

### Deployment

Any host that runs a Node server — Vercel, Render, Railway, Fly.io. **Not GitHub Pages**, which serves static files only. Set both environment variables in the host's dashboard; nothing else is required.

---

## Assumptions

- **Single user, no authentication.** Deliberate: the brief rules out unnecessary auth. One row in `users`, resolved per request, created on first boot. **This means anyone who can reach the URL can read and write the data** — deploy it privately, or add auth before exposing it.
- Times are wall-clock strings in the user's local timezone; there is no timezone conversion because a single user in a single place doesn't need one.
- The user's own difficulty rating overrides the model's, since they know whether they're stuck.
- "Morning" and "evening" split at 12:00.
- Four days is the minimum history for an insight — short enough to be useful quickly, long enough not to over-read one bad day.

## Known limitations

- **No timezone handling.** Travel across zones will mis-bucket morning/evening.
- **The rate limiter is per-instance.** Fine for one user on one instance; it does not coordinate across serverless invocations.
- **No ICS export or calendar integration.** The built-in timeline is the whole calendar. Deliberate — the brief warns against making Google OAuth a dependency, and a half-working integration is worse than none.
- **Rebuilding a plan mid-day discards that day's task history.** The confirmation copy says so, but there is no undo.
- **Progress charts are CSS bars, not Recharts.** For 14 daily values a bar list is lighter, fully screen-reader accessible, and adds no dependency. Recharts would earn its place at higher data density.
- **No cache eviction.** `ai_cache` grows unbounded; at one user's volume that is a rounding error, but it would need a TTL sweep at scale.
- **Actual task durations are only recorded if supplied.** Planning-accuracy insights fall back to estimates, which biases accuracy toward 1.0 until durations are logged.
