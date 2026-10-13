import OpenAI, { AzureOpenAI } from 'openai'
import { z } from 'zod'
import type { AppConfig } from '../config/env'
import { createLimiter, isAbort, throwIfAborted } from '../util/concurrency'

/**
 * Azure OpenAI client for structured extraction. Three API styles, chosen by
 * AZURE_OPENAI_API_STYLE:
 *   responses     — v1 endpoint, Responses API (default)
 *   chat          — v1 endpoint, Chat Completions
 *   azure-legacy  — deployment URL + api-version, Chat Completions
 *
 * Output is always validated with zod. If the deployment rejects strict
 * json_schema, the client falls back to JSON mode with the schema in the
 * prompt and remembers that for the rest of the process.
 */

export interface StructuredRequest<T> {
  /** Schema name, a-z/0-9/_ only. */
  name: string
  schema: z.ZodType<T>
  system: string
  user: string
  signal?: AbortSignal
}

export interface LlmClient {
  structured<T>(request: StructuredRequest<T>): Promise<T>
}

export class LlmError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'LlmError'
  }
}

type JsonSchema = Record<string, unknown>

/** zod → JSON schema acceptable to strict structured outputs. */
export function strictJsonSchema(schema: z.ZodType): JsonSchema {
  const json = z.toJSONSchema(schema, { target: 'draft-7' }) as JsonSchema
  delete json.$schema
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!node || typeof node !== 'object') return
    const obj = node as JsonSchema
    if (obj.type === 'object' && obj.properties && typeof obj.properties === 'object') {
      obj.required = Object.keys(obj.properties as object)
      obj.additionalProperties = false
    }
    Object.values(obj).forEach(visit)
  }
  visit(json)
  return json
}

function parseJsonLoose(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
  return JSON.parse(trimmed)
}

function statusOf(err: unknown): number | undefined {
  return typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number'
    ? (err as { status: number }).status
    : undefined
}

/** A 400 that names the response format / schema = strict mode is not supported here. */
function isSchemaRejection(err: unknown): boolean {
  if (statusOf(err) !== 400) return false
  const message = err instanceof Error ? err.message.toLowerCase() : ''
  return /json_schema|response_format|text\.format|schema|structured/.test(message)
}

/** A 400 caused by an unsupported optional parameter (reasoning effort). */
function isReasoningRejection(err: unknown): boolean {
  if (statusOf(err) !== 400) return false
  const message = err instanceof Error ? err.message.toLowerCase() : ''
  return /reasoning/.test(message)
}

export function normalizeAzureBaseUrl(endpoint: string): string {
  const base = endpoint.trim().replace(/\/+$/, '')
  if (/\/openai\/v1$/.test(base)) return `${base}/`
  if (/\/openai$/.test(base)) return `${base}/v1/`
  return `${base}/openai/v1/`
}

export function createLlmClient(config: AppConfig): LlmClient {
  const style = config.AZURE_OPENAI_API_STYLE
  const common = { apiKey: config.AZURE_OPENAI_API_KEY, timeout: config.LLM_TIMEOUT_MS, maxRetries: config.LLM_MAX_RETRIES }
  const client: OpenAI =
    style === 'azure-legacy'
      ? new AzureOpenAI({
          ...common,
          endpoint: config.AZURE_OPENAI_ENDPOINT.replace(/\/openai.*$/, ''),
          apiVersion: config.AZURE_OPENAI_API_VERSION,
          deployment: config.AZURE_OPENAI_DEPLOYMENT,
        })
      : new OpenAI({
          ...common,
          baseURL: normalizeAzureBaseUrl(config.AZURE_OPENAI_ENDPOINT),
          defaultHeaders: { 'api-key': config.AZURE_OPENAI_API_KEY },
        })

  const limit = createLimiter(config.LLM_CONCURRENCY)
  const model = config.AZURE_OPENAI_DEPLOYMENT
  let strictSupported = true
  let reasoningSupported = config.LLM_REASONING_EFFORT !== '' && config.LLM_REASONING_EFFORT !== 'none'
  const effort = config.LLM_REASONING_EFFORT as OpenAI.ReasoningEffort

  const call = async (request: StructuredRequest<unknown>, strict: boolean, extraUser?: string): Promise<string> => {
    const jsonSchema = strictJsonSchema(request.schema)
    const system = strict
      ? request.system
      : `${request.system}\n\nReply with ONE valid JSON object and nothing else. It must conform to this JSON schema:\n${JSON.stringify(jsonSchema)}`
    const user = extraUser ? `${request.user}\n\n${extraUser}` : request.user
    const options = { signal: request.signal }

    if (style === 'responses') {
      const response = await client.responses.create(
        {
          model,
          input: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          max_output_tokens: config.LLM_MAX_OUTPUT_TOKENS,
          store: false,
          ...(reasoningSupported ? { reasoning: { effort } } : {}),
          text: {
            format: strict
              ? { type: 'json_schema', name: request.name, schema: jsonSchema, strict: true }
              : { type: 'json_object' },
          },
        },
        options,
      )
      if (response.status === 'incomplete') {
        throw new LlmError(`Odpowiedź modelu niepełna (${response.incomplete_details?.reason ?? 'nieznany powód'})`)
      }
      return response.output_text
    }

    const completion = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_completion_tokens: config.LLM_MAX_OUTPUT_TOKENS,
        ...(reasoningSupported ? { reasoning_effort: effort } : {}),
        response_format: strict
          ? { type: 'json_schema', json_schema: { name: request.name, schema: jsonSchema, strict: true } }
          : { type: 'json_object' },
      },
      options,
    )
    const choice = completion.choices[0]
    if (!choice?.message?.content) {
      throw new LlmError(`Pusta odpowiedź modelu (finish_reason: ${choice?.finish_reason ?? 'brak'})`)
    }
    return choice.message.content
  }

  /** One model call with automatic downgrade of unsupported features. */
  const callAdaptive = async (request: StructuredRequest<unknown>, extraUser?: string): Promise<string> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await call(request, strictSupported, extraUser)
      } catch (err) {
        if (isAbort(err) || request.signal?.aborted) throw err
        if (reasoningSupported && isReasoningRejection(err)) {
          reasoningSupported = false
          continue
        }
        if (strictSupported && isSchemaRejection(err)) {
          strictSupported = false
          continue
        }
        throw err
      }
    }
    throw new LlmError('Model odrzucił żądanie mimo obniżenia wymagań')
  }

  return {
    structured: <T>(request: StructuredRequest<T>) =>
      limit(async () => {
        throwIfAborted(request.signal)
        let lastProblem = ''
        // first answer + one repair attempt
        for (let attempt = 0; attempt < 2; attempt++) {
          let raw: string
          try {
            raw = await callAdaptive(
              request as StructuredRequest<unknown>,
              attempt === 0 ? undefined : `Your previous answer was rejected: ${lastProblem}\nReturn the corrected JSON object only.`,
            )
          } catch (err) {
            if (isAbort(err) || request.signal?.aborted) throw err
            const reason = err instanceof Error ? err.message : String(err)
            throw new LlmError(`Azure OpenAI: ${reason}`, err)
          }
          try {
            const parsed = request.schema.safeParse(parseJsonLoose(raw))
            if (parsed.success) return parsed.data
            lastProblem = parsed.error.issues
              .slice(0, 5)
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; ')
          } catch {
            lastProblem = 'the answer was not valid JSON'
          }
        }
        throw new LlmError(`Azure OpenAI: odpowiedź niezgodna ze schematem (${lastProblem})`)
      }),
  }
}
