/**
 * n8n SSE webhook endpoint. The default is the production n8n cloud instance,
 * so deployments (e.g. Railway) work without any env configuration. Override
 * per environment via Vite env (baked in at BUILD time, not runtime):
 *   VITE_N8N_SSE_WEBHOOK_URL=http://localhost:5678/webhook/research-sse  # local mock
 * Note the n8n gotcha: `/webhook-test/...` works only while the workflow
 * editor is in "Listen for test event" mode; use `/webhook/...` with the
 * workflow activated for normal operation.
 */
export const N8N_SSE_WEBHOOK_URL: string =
  import.meta.env.VITE_N8N_SSE_WEBHOOK_URL ?? 'https://pathof.app.n8n.cloud/webhook/research-sse'
