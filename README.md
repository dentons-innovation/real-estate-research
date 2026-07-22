# Dentons · Real Estate Research (demo)

Narzędzie do researchu transakcji na polskim rynku nieruchomości — wersja demonstracyjna
dla zespołu marketingu. Frontend łączy się przez **SSE z backendem n8n** i pokazuje
„Mapę Misji": neonowy timeline z 11 checkpointami faz, po którym płynnie porusza się
wirtualny robot, listę faz z ikonami oraz dużą konsolę logów na żywo z nagłówkami sekcji
(zwijana przyciskiem „Ukryj szczegóły”). Tabela wyników renderuje dane odebrane
w finalnym evencie strumienia; eksport CSV działa naprawdę.

## Uruchomienie

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # produkcyjny build w dist/
```

## Stack

Vite · React 19 · TypeScript · Tailwind CSS 4 · GSAP · n8n (backend SSE)

## Backend (n8n + SSE)

1. Zaimportuj **`Poland RE Deals - Live Research SSE.json`** do n8n (Workflows → Import from File)
   i **aktywuj** workflow. Wymaga n8n ≥ 1.94 (testowane na 2.30). To jedyny workflow projektu —
   robi prawdziwy research (Tavily Research + Azure GPT) i streamuje postęp do frontendu.
2. Frontend domyślnie łączy się z `http://localhost:5678/webhook/research-sse`
   (POST z body `{"range":"30d"}`). Inny adres ustawisz w pliku `.env.local`
   (wzór: skopiuj `.env.example`):

   ```
   VITE_N8N_SSE_WEBHOOK_URL=https://twoj-n8n.example.com/webhook/research-sse
   ```

   > Uwaga na pułapkę n8n: ścieżka `/webhook-test/...` działa tylko, gdy edytor
   > nasłuchuje („Listen for test event”). Do normalnej pracy aktywuj workflow
   > i używaj `/webhook/...`.

   Przycisk „Zatrzymaj research” (i „Mock Error”) wysyła dodatkowo
   `POST /webhook/research-sse-stop` z `{run_id}` — drugi trigger w tym samym
   workflow zapisuje flagę stopu w n8n **Data Table** `research_stop`, a główna
   egzekucja sprawdza ją w pętlach i grzecznie się kończy. **Setup jednorazowy
   w n8n:** utwórz Data Table `research_stop` z kolumną `run_id` (String)
   i wskaż ją w węzłach „Zapisz flagę stopu” / „Stop flag? (research)” /
   „Stop flag? (deal)”. Adres stop-webhooka jest wyprowadzany automatycznie
   z głównego (`research-sse` → `research-sse-stop`); w razie potrzeby nadpisz
   go zmienną `VITE_N8N_SSE_STOP_WEBHOOK_URL`.

3. **Protokół strumienia:** eventy postępu to JSON-y
   `{"phase_id":"...","phase":"...","message":"...","progress":0.42,...}`.
   `phase_id` to jedno z 10 ID w kolejności timeline'u:
   `init → research_launch → research_1 → research_2 → research_3 → dedup → gap_analysis → deepening → compile → done`
   (fazy `research_1..3` odpowiadają kolejnym UKOŃCZONYM zadaniom deep research;
   `deepening` niesie `progress` 0..1 oraz meta `deal`, `deal_index`, `deal_total`).
   Frontend mapuje je na 11 własnych checkpointów (`src/lib/phases.ts`, `resolvePhase()`):
   `dedup` + `gap_analysis` → jeden checkpoint „Scalanie i braki”, a długie `deepening`
   dzieli wizualnie na trzy etapy po 1/3 postępu.
   Event finalny to czysta tablica transakcji z kluczami-etykietami kolumn
   (`"Data ogłoszenia"`, `"Deal/asset"`, …). Parser frontendu
   (`src/lib/researchStream.ts`) rozumie czyste SSE (`data: ...`), NDJSON
   i kopertę streamingu n8n (`{"type":"item","content":...}`).
4. **Szybkie testy frontendu bez n8n:** `npm run mock` odpala
   lokalny serwer streamujący pełny protokół (10 faz + finalna tabela) w ~30 s.
   Na czas testu ustaw w `.env.local`:
   `VITE_N8N_SSE_WEBHOOK_URL=http://localhost:5678/webhook/research-sse`.
5. Zerwanie połączenia lub HTTP ≠ 200 **nie zmienia ekranu**: robot łapie się
   za głowę w miejscu, w którym stanął na timeline, a pełny techniczny komunikat
   błędu ląduje na czerwono w konsoli misji. Przycisk w sidebarze zmienia się
   w „Spróbuj ponownie”.

## Ważne

- **Logo:** oficjalny logotyp znajduje się w `src/dentons_logo.png` (import w `src/components/Sidebar.tsx`).
- Dane transakcji: `src/data/transactions.ts` (typ `Transaction` + definicje kolumn `COLUMNS`,
  z których korzysta zarówno tabela, jak i eksport CSV).
- Definicje faz timeline'u (ID, etykiety, ikony): `src/lib/phases.ts` — kolejność musi
  odpowiadać grupom sticky notes w workflow n8n.
- Mapa Misji: `src/components/MissionTimeline.tsx` (ścieżka + robot + dymek),
  `src/components/PhaseList.tsx` (lista faz), `src/components/BackendLog.tsx` (konsola logów).
- Zabawne teksty w dymku robota: pula w `src/components/SearchingState.tsx` (czysto frontendowa).
- W trakcie researchu przycisk „Symuluj błąd (Mock Error)” w sidebarze wywołuje
  symulowany błąd backendu — identyczna obsługa jak przy prawdziwym błędzie
  (panika robota + czerwony wpis w konsoli), bez zmiany ekranu.
