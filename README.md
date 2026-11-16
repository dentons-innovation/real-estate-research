# Dentons · Real Estate Research

A research tool for transactions on the Polish commercial real estate market,
built for the Dentons marketing team. It searches the press and law firm
announcements for a chosen period (the last month, 3 months, 6 months or
year) and returns a table of deals: parties, value, legal advisors, status,
sector and sources.

The rule the backend is built around: **a field appears in the table only if a
quote supporting it was found, by code, in the text of a source article.**
Anything the model cannot back with a real quote stays empty.

## Repository layout

```
apps/frontend     Vite · React 19 · TypeScript · Tailwind 4 · GSAP (the UI)
apps/backend      Node 22 · Fastify · TypeScript (research pipeline + API)
packages/shared   Types shared by both: stream protocol, table record
```

npm workspaces; one `npm install` at the root installs everything.

## Running locally

Requires Node 22 or newer.

```bash
npm install

# Terminal 1 — backend with fictional test data, no API keys needed
npm run dev:mock

# Terminal 2 — frontend on http://localhost:5173
npm run dev:frontend
```

Mock mode runs the real pipeline over fictional articles, so the whole flow
can be tested without spending API credits. No password is asked for in this
mode.

To run against the real services, copy `apps/backend/.env.example` to
`apps/backend/.env`, fill in the keys, and use `npm run dev:backend` instead of
`dev:mock`.

Other commands:

```bash
npm test            # backend tests
npm run typecheck   # both apps
npm run build       # both apps
```

### Checking the API keys first

Three scripts check each provider on its own and print what it returned.
Run them once after filling in `.env`, before the first real research:

```bash
npm run probe:llm -w @re/backend      # Azure deployment, API style, structured output
npm run probe:tavily -w @re/backend   # Tavily key, which source sites return results
npm run probe:opoint -w @re/backend   # what the Opoint key permits, article counts
```

`probe:opoint` matters most: it shows whether the key can search the stored
search over the whole 30-day window or only read its feed. Set `OPOINT_MODE`
to the mode that returned the most articles, or leave `auto`.

A fourth script checks the search itself, not the key:

```bash
npm run probe:queries -w @re/backend   # every discovery query: hits, sites, dates
```

It runs the real query generator for the current window and prints, per
query, how many results came back, how many were usable (lawyer profiles and
the like are excluded), how many carry a date, and which sites answered.
Use it after changing the queries or the source lists; it costs about as many
Tavily credits as the discovery phase of one research run.

## How a research run works

| Step | What happens | Timeline phase |
|---|---|---|
| Start | Job created, window resolved (30, 90, 180 or 365 days, as chosen in the sidebar) | `init` |
| Opoint | Only when plugged in (see below): articles from the stored search for the window | `research_launch` |
| Tavily | ~42 natural-language queries in three lanes (sales and acquisitions, financing and JV, law firm announcements) over the open web, the trade press, the legal press and the law firms' own sites | `research_launch` |
| Prefilter | Unusable pages (profiles, practice pages, PDFs, listings) and irrelevant ones dropped in code, best 120 kept | `research_1` |
| Extraction | GPT-5.6 reads one article at a time and returns deals, each fact with a verbatim quote | `research_1..3` |
| Verification | Code checks every quote against the article text and every value against its quote | `research_1..3` |
| Dedup | Reports of the same deal merged; deals dated outside the window or older than the age limit dropped; undated deals kept for now | `dedup` |
| Gap analysis | Deals with a missing date, advisors, value or parties selected | `gap_analysis` |
| Deepening | Targeted Tavily queries per deal, results gated in code, extraction restricted to the known deal, only empty fields filled (the date included) | `deepening` |
| Window, again | Deals still undated after deepening dropped; age limit re-checked with the new sources; deals that became identical merged | `compile` |
| Compile | Model writes the one-sentence description from verified facts; code assembles the record | `compile`, `done` |

### How the search is phrased

Tavily is a semantic engine: it answers sentences, not keyword lists. A
template such as "refinancing facility Poland office logistics retail bank EUR
million October 2026" returned one page; "Polish real estate company secures
financing from bank for portfolio" returned twenty. The generator
(`apps/backend/src/queries/discoveryQueries.ts`) therefore holds plain PL and
EN sentences, one per asset group and deal type, and runs each of them:

- on the open web as news, with the window as a date filter (these results
  carry publication dates);
- on the trade press sites, with the same date filter;
- on the legal press (`ceelegalmatters.com`, `rynekprawniczy.pl`), which
  reports every firm's deal credits in one place;
- on the law firms' own sites, five sites per query, undated (Tavily has no
  dates for them; the text and the URL do).

The queries are spread over these lane × scope queues in turns, so
`TAVILY_MAX_DISCOVERY_QUERIES` (default 48) never silences a kind of source.
Lawyer profiles, practice pages, job ads, magazine issues and tag listings are
excluded by URL path before any model call; they describe careers, not news.

### Dates and the age limit

- A deal's date is the earliest date stated in a verified quote; failing that,
  the publication date of its source. Tavily rarely dates trade-press pages, so
  a date in the URL path (`/2026/06/29/...`) is used as the publication date.
- The date quote may be as short as the printed date line ("Dodano: 30 wrz
  2026", "05 Oct 2026"); Polish month abbreviations are understood.
- A deal found only on an undated page (most law firm sites) is not dropped
  at once: the date becomes its most valuable gap, deepening looks for a
  second report, and the date is taken from there. Only a deal still undated
  after deepening is dropped (`no_date`).
- A month in a URL (`/news/2026/october/...`) is never used as the deal's
  date, but it bounds how old the page can be, which is enough for the age
  limit below.
- `MAX_DEAL_AGE_DAYS` (default 60): a deal is dropped when its oldest trace,
  a stated date or the publication date of any report, lies more than this many
  days before the end of the window. A sale first reported in June and repeated
  in a September results note is not a September deal. The audit lists such
  deals under `too_old`. The rule runs before and after deepening, because
  follow-up sources can reveal an earlier report. The configured value holds
  for windows of up to 30 days; a longer window extends it by the extra days
  (90 days → 120, 180 → 210, 365 → 395), otherwise the limit would cut off the
  older part of the window itself.

### Longer periods

The period is chosen in the sidebar: 1 month (`30d`, the default), 3 months
(`90d`), 6 months (`180d`) or 1 year (`365d`). What changes with it:

- The window sent to Tavily as the date filter of every dated query, and the
  window Opoint is asked for.
- The window enforced in code on every deal, and the age limit above.
- One extra check for windows longer than a month. A date quoted without its
  year ("podpisano 7 lipca") gets its year from the model; in a 30-day window
  a wrong year falls outside the window, in a yearly one it could pass. Such
  a date is therefore accepted only when the article's publication date
  confirms it (not later than the publication, at most half a year before
  it); otherwise the publication date is used, or the deal goes to deepening
  undated. The audit lists the rejected date under `announcement_date`.

What does not change is the budget: the same ~42 queries, 120 articles and 15
deepened deals cover the whole period. A one-month run is exactly what it was;
a yearly run returns the most relevant deals of the year, not all of them.
Splitting a long window into monthly slices, each with its own budget, would
be the next step if fuller coverage is needed.

### Looking for legal advisors

Most trade-press reports name no law firm, so advisors come mainly from the
deepening phase. A deal with a missing advisor gets up to three advisor
searches out of its `MAX_QUERIES_PER_DEAL` (default 6): the law firms' own
sites, the legal press (which credits every firm on a deal, including firms
outside the list in `config/domains.ts`), and the open web. A firm is still
assigned to a side only when a quote says whom it advised; otherwise it is
listed under "Other legal advisors involved". An empty advisor field means no
source found by these searches names one.

### Duplicate entries

Names of the same asset differ between languages and sources ("drugi etap
BOOSTER Zabrze", "Phase 2 of BOOSTER ZABRZE", "second stage of Booster
Zabrze"). Three rules keep them together: ordinals and phase words are
normalised before names are compared; the same buyer and seller (or one of
them plus the same price) with one shared identifying token count as one deal;
and after deepening the deals are clustered once more, since filled-in parties
often reveal a duplicate. Merges are listed in the audit under
`duplicate_merged`.

### Plugging Opoint in and out

Opoint is an optional accelerator, not a dependency. One pipeline, one switch:

- **Server:** `OPOINT_ENABLED` in the backend environment. `false` (the current
  setting, because of the token budget) keeps Opoint out of every run; `/healthz`
  then reports `"opoint": "disabled"`. `true` with a token makes it `available`.
- **Frontend:** `OPOINT_UI_ENABLED` in `apps/frontend/src/config.ts`. It is
  `false` for now: the switch below is hidden and every run goes on Tavily
  alone. Set it to `true` and rebuild to bring the switch back.
- **Per run:** the "Opoint (media monitoring)" switch in the sidebar sends
  `useOpoint: true` with the start request. It is off at every page load.
  While the server reports Opoint as unavailable, flipping the switch only shows
  a short notice ("Opoint is currently unavailable due to a token limit") and
  stays off; the backend also refuses such a request with `opoint_unavailable`.

Without Opoint the run discovers articles with Tavily alone and the log says
"Opoint switched off — research on Tavily alone."

### What the verification rejects

- A quote that does not occur in the article (exact after normalisation, or
  at least 92% of its words in order).
- A value that is not in its own quote: a name, or an amount with its currency.
- A law firm assigned to a side when the quote does not say whom it advised.
  The firm is kept, under "Other legal advisors involved".
- A description in place of a party name ("osoba prawna", "a Polish
  company", "Nabywca pozostaje nieujawniony"). The field stays empty; the
  audit lists it under `not_a_name`.
- A property merely put up for sale (offer, tender, auction): the model marks
  it as a market report and it is dropped.
- A firm that different sources assign to opposite sides, unless a law firm's
  own site settles it.
- Leases, market reports, assets outside Poland, deals outside the window.
- A description that mentions a name or number absent from the verified facts.
  It is replaced by a sentence built from the verified values.

Conflicting values are resolved by source: law firm site, then trade or legal
press, then anything else.

### Audit

After a run, `GET /api/research/audit?id=<jobId>` returns, for every filled
field, the value, the quote and the URL it came from, plus everything that was
rejected and why. The job id is printed in the log console at the start of a
run. Jobs are kept for 15 minutes after the last read.

## API

All endpoints except the health check require `Authorization: Bearer <password>`.

| Endpoint | Purpose |
|---|---|
| `GET /healthz` | Health check |
| `POST /api/auth/check` | 204 if the password is accepted |
| `POST /api/research/start` | Body `{range?: "30d" \| "90d" \| "180d" \| "365d", from?, to?, useOpoint?}` → `{jobId, window}` |
| `GET /api/research/stream?id&after` | Server-Sent Events from event number `after` |
| `GET /api/research/poll?id&after` | The same events as JSON: `{lines, done, error}` |
| `POST /api/research/abort` | Body `{id}`; stops the job |
| `GET /api/research/audit?id` | Evidence and rejections of a finished job |

The job runs independently of the connection and writes to an append-only log.
The stream and the polling endpoint both read that log from a cursor.

### Why there is a polling fallback

Corporate web proxies and VPNs often buffer long-lived responses: the stream
opens but no data reaches the browser. The frontend opens the live stream
first; if nothing arrives within 6 seconds it switches to short polling
requests from the same position, and remembers that choice for the browser
tab. Add `?transport=poll` to the URL to force polling.

### Stream events

Progress events: `{"phase_id", "phase", "message", "progress"?, ...meta}` with
`phase_id` one of `init`, `research_launch`, `research_1`, `research_2`,
`research_3`, `dedup`, `gap_analysis`, `deepening`, `compile`, `done`.

Final event: `{"type": "result", "transactions": [...], "meta": {...}}`.
Each transaction has exactly 14 string keys (`TRANSACTION_KEYS` in
`packages/shared/src/transaction.ts`); a missing fact is an empty string.

Failure: `{"type": "error", "message", "code"}`.

Messages are Polish. The frontend translates them to English at render time
with regex rules in `apps/frontend/src/lib/i18n.tsx` (`LINE_RULES`). The
templates are in `apps/backend/src/pipeline/messages.ts`. When changing a
message, change both; `npm test` fails if a backend message has no rule.

## Deployment on Railway

One Railway project, two services from this repository.

### 1. Backend service

- Name the service **`backend`** (the frontend refers to it by this name).
- Settings → Root Directory: `/`
- Settings → Config file path: `/apps/backend/railway.toml`
- No public domain is needed.
- Variables (see `apps/backend/.env.example` for the full list):

| Variable | Value |
|---|---|
| `PORT` | `8080` |
| `ACCESS_PASSWORD` | the shared team password |
| `TAVILY_API_KEY` | Tavily key |
| `TAVILY_MAX_DISCOVERY_QUERIES` | `48` (one run issues ~42 queries; lower values thin out every source kind evenly) |
| `AZURE_OPENAI_ENDPOINT` | `https://<resource>.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | Azure key |
| `AZURE_OPENAI_DEPLOYMENT` | name of the GPT-5.6 deployment |
| `OPOINT_ENABLED` | `false` for now (token budget); `true` lets a run use Opoint |
| `OPOINT_TOKEN` | Opoint key |
| `OPOINT_STORED_SEARCH_ID` | id of the stored search |

Keep the backend at one replica: jobs are held in memory.

### 2. Frontend service

- Settings → Root Directory: `/`
- Settings → Config file path: `/apps/frontend/railway.toml`
- Generate a public domain for this service.
- Variable:

| Variable | Value |
|---|---|
| `BACKEND_URL` | `http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:${{backend.PORT}}` |

The frontend container is Caddy: it serves the built app and forwards `/api/*`
to the backend over Railway's private network. The browser only talks to the
frontend's domain, and the API keys never leave the backend.

### Keys and secrets

- API keys and the password live only in Railway service variables and in the
  local, gitignored `apps/backend/.env`.
- Nothing prefixed `VITE_` may hold a secret: those values are compiled into
  the browser bundle.
- To change the password, change `ACCESS_PASSWORD` and redeploy the backend.
  Browsers holding the old password are asked for the new one.

### Cost protection

| Setting | Default | Effect |
|---|---|---|
| Start rate limit | 6 per hour per address | fixed |
| `MAX_CONCURRENT_JOBS` | 2 | further starts get "busy" |
| `DAILY_JOB_BUDGET` | 40 | runs per day, all users |
| `JOB_TIMEOUT_MS` | 12 minutes | a run is stopped after this |
| Wrong passwords | 10 per 15 minutes per address | then locked out |

The "Stop research" button stops the run on the server too.

## Comparing with the n8n prototype

`Example/Railway.csv` is a table produced by the previous n8n workflow and
`Example/localhost.csv` one produced by this application for the same window.
The two barely overlap, and the difference is instructive. Of the eight rows in
the n8n table, four are not deals of the period: the Hillwood / Bank Pekao
financing was reported on 4 June 2026 (the workflow stamped it with its own run
date), the Serenada and Krokus acquisition dates from 2017 and was later
abandoned, the Realty Income / KKR joint venture is not a Polish transaction,
and the Urban Partners refinancing is from January. Two rows were real and
missing here: the Van der Vorm / ING financing (the old keyword queries never
reached it) and the Dębica factory sale (found, but dropped because its page
carried no date). The query rewrite and the deepening of undated deals above
are the answer to both.

## Frontend notes

- The UI is bilingual; the PL / EN switch is in the sidebar and the header.
- The robot's comments cycle on a timer, independently of the backend
  (`apps/frontend/src/components/SearchingState.tsx`). The log console below
  the timeline prints the real backend events.
- On a failure the screen does not switch: the robot panics where it stopped
  and the error is printed in red in the console. "Simulate error" in the
  sidebar triggers the same state by hand.
- Table columns and Excel (`.xlsx`) export: `apps/frontend/src/data/transactions.ts`,
  `apps/frontend/src/lib/xlsx.ts`. The export library is loaded on the first
  click, not with the page. Dates are `DD.MM.YYYY` in the table and real
  Excel dates in the same format in the workbook. Every source is a clickable
  link; in the workbook each one gets a column of its own ("Źródło 1",
  "Źródło 2", …), because an Excel cell holds a single hyperlink.
- Research periods: `apps/frontend/src/lib/range.ts`.
- Timeline phases: `apps/frontend/src/lib/phases.ts`.

## Known limits

- The UI offers four periods (1, 3, 6 and 12 months). The backend accepts any
  `range` up to `MAX_RANGE_DAYS` (default 365) and explicit `from` / `to`
  dates. A deployment that sets `MAX_RANGE_DAYS` below 365 rejects the longer
  periods with `bad_window`.
- The search budget does not grow with the period (see "Longer periods"), so
  long periods are covered less densely than one month.
- With `STRICT_WINDOW=true` a deal needs a date: one written in an article, or
  a publication date supplied by the search provider or read from the URL.
  Deals without any date are dropped.
- Strict verification leaves some true facts out, for example an advisor whose
  client is only implied. The audit endpoint shows what was rejected.
- Jobs are lost when the backend restarts; the user sees an error and retries.
