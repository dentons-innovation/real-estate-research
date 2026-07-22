/**
 * n8n SSE webhook endpoint. Override per environment via Vite env:
 *   VITE_N8N_SSE_WEBHOOK_URL=https://your-n8n/webhook/research-sse
 * Note the n8n gotcha: `/webhook-test/...` works only while the workflow
 * editor is in "Listen for test event" mode; use `/webhook/...` with the
 * workflow activated for normal operation.
 */
export const N8N_SSE_WEBHOOK_URL: string =
  import.meta.env.VITE_N8N_SSE_WEBHOOK_URL ?? 'http://localhost:5678/webhook/research-sse'

/**
 * Webhook zatrzymania researchu (drugi trigger w tym samym workflow n8n).
 * Domyślnie wyprowadzany z adresu głównego webhooka: research-sse → research-sse-stop.
 */
export const N8N_SSE_STOP_WEBHOOK_URL: string =
  import.meta.env.VITE_N8N_SSE_STOP_WEBHOOK_URL ??
  N8N_SSE_WEBHOOK_URL.replace(/research-sse\/?$/, 'research-sse-stop')
