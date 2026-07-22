# Dentons · Real Estate Research (demo)

A research tool for transactions on the Polish real estate market — a demo
for the marketing team. The frontend connects to an **n8n backend over SSE**
and renders a live progress view: a neon timeline with 11 phase checkpoints
along which a virtual robot travels smoothly, a phase list with icons, and a
large live log console with section headers. The results table renders the
data received in the final stream event; the CSV export is fully functional.

The whole UI is bilingual — a **PL / EN switcher** lives in the sidebar (and in
the top-right header chip). Switching the language translates everything,
including backend messages already printed in the console: the n8n workflow
always streams Polish text, and the frontend re-renders it in English by
matching the known message templates (`src/lib/i18n.tsx`).

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Stack

Vite · React 19 · TypeScript · Tailwind CSS 4 · GSAP · n8n (SSE backend)

## Deployment (Railway)

The app is a Vite build served by `server.mjs` — a zero-dependency Node server
that also **relays the n8n stream** (see below):

- **Build command:** `npm run build` (Railway detects it automatically)
- **Start command:** `npm start` → `node server.mjs` (binds to `0.0.0.0` on
  Railway's `$PORT`)
- No environment variables are required — the n8n cloud webhook URL is the
  built-in default. To override the upstream for the relay, set
  `N8N_SSE_WEBHOOK_URL` in the Railway service variables (runtime, no rebuild
  needed). `VITE_N8N_SSE_WEBHOOK_URL` still exists but only affects the
  browser's *direct-stream fallback* and is baked in at build time.
- The n8n webhook allows all origins (`allowedOrigins: "*"`), so the Railway
  domain needs no CORS changes.

### Why a relay? (corporate proxies vs SSE)

Corporate web proxies (common on law-firm laptops) silently **buffer
long-lived streamed POST responses**: the n8n domain is reachable, but the
browser never receives a single byte of the SSE stream, so the UI hangs on
"Connecting to backend…". The fix: the long-lived connection to n8n lives
**server-side** (Railway ↔ n8n, outside the corporate network), and the
browser only makes short same-origin requests:

1. `POST /api/research/start` → server opens the n8n stream, returns a job id
2. `GET /api/research/poll?id=…&after=N` every ~0.8 s → new raw stream lines
3. the existing client parser (`src/lib/researchStream.ts`) interprets the
   lines exactly as if they had arrived over the direct stream

The client tries the relay first; when it is absent (local `vite` dev,
`vite preview`, the mock) the start request 404s and the client falls back to
streaming directly from the browser — so local dev needs no server.

## Backend (n8n + SSE)

1. Import **`Poland RE Deals - Live Research SSE.json`** into n8n
   (Workflows → Import from File) and **activate** the workflow. Requires
   n8n ≥ 1.94 (streaming Respond to Webhook). This is the project's only
   workflow — it performs the real research (Tavily Research + Azure GPT)
   and streams progress to the frontend.
2. The production n8n cloud webhook URL is the built-in default
   (`src/config.ts`), so a fresh build works with no env configuration —
   the frontend POSTs `{"range":"30d"}` to it. To point at a different
   instance (or the local mock), set the override in `.env.local`
   (copy `.env.example` as a template):

   ```
   VITE_N8N_SSE_WEBHOOK_URL=https://your-n8n.example.com/webhook/research-sse
   ```

   Vite bakes `VITE_*` variables in at **build time** — changing them
   requires a rebuild, not just a restart.

   > n8n gotcha: the `/webhook-test/...` path only works while the editor is
   > listening ("Listen for test event"). For normal operation activate the
   > workflow and use `/webhook/...`.

   The "Stop research" button only aborts the connection on the frontend —
   the n8n execution finishes in the background (a deliberate simplification).

3. **Stream protocol:** progress events are JSON objects
   `{"phase_id":"...","phase":"...","message":"...","progress":0.42,...}`.
   `phase_id` is one of 10 ids in timeline order:
   `init → research_launch → research_1 → research_2 → research_3 → dedup → gap_analysis → deepening → compile → done`
   (the `research_1..3` phases correspond to consecutive COMPLETED deep
   research tasks; `deepening` carries `progress` 0..1 plus the meta fields
   `deal`, `deal_index`, `deal_total`).
   The frontend maps them onto 11 checkpoints of its own (`src/lib/phases.ts`,
   `resolvePhase()`): `dedup` + `gap_analysis` → a single "Merge & gaps"
   checkpoint, and the long `deepening` phase is split visually into three
   stages of 1/3 progress each.
   The final event is a plain array of transactions keyed by column labels
   (`"Data ogłoszenia"`, `"Deal/asset"`, …). The frontend parser
   (`src/lib/researchStream.ts`) understands plain SSE (`data: ...`), NDJSON
   and the n8n streaming envelope (`{"type":"item","content":...}`).
4. **Quick frontend testing without n8n:** `npm run mock` starts a local
   server that streams the full protocol (10 phases + final table) in ~30 s.
   For the duration of the test set in `.env.local`:
   `VITE_N8N_SSE_WEBHOOK_URL=http://localhost:5678/webhook/research-sse`.
5. A dropped connection or an HTTP status ≠ 200 **does not switch the
   screen**: the robot grabs its head right where it stopped on the timeline
   and the full technical error message is printed in red in the log
   console. The sidebar button turns into "Try again".

## Notes

- **Language:** UI strings, phase labels, table columns and robot messages
  live in both languages (`src/lib/i18n.tsx`, pools in
  `src/components/SearchingState.tsx`). Backend messages are translated at
  render time by template matching — the n8n workflow needs no changes.
- **Logo:** the official logotype is `src/dentons_logo.png` (imported in
  `src/components/Sidebar.tsx`); the favicon is `src/dentons_logo_square.png`.
- Transaction data: `src/data/transactions.ts` (the `Transaction` type and
  the `COLUMNS` definitions used by both the table and the CSV export).
- Timeline phase definitions (ids, labels, icons): `src/lib/phases.ts` —
  the order must match the sticky-note groups in the n8n workflow.
- Progress timeline: `src/components/MissionTimeline.tsx` (path + robot +
  bubble), `src/components/PhaseList.tsx` (phase list),
  `src/components/BackendLog.tsx` (log console). The console can be
  shown/hidden with the "Details" switch in the sidebar.
- During a run the "Simulate error (Mock Error)" sidebar button triggers a
  simulated backend error — handled identically to a real one (robot panic +
  a red console entry), without switching the screen.
