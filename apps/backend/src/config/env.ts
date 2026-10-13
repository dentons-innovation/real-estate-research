import type { OpointStatus } from '@re/shared'
import { z } from 'zod'

/**
 * Environment validation. The process refuses to boot on a bad configuration,
 * so a missing key shows up at deploy time and not in the middle of a research run.
 */

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase())))

const int = (def: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v.trim() === '') return def
      const n = Number(v)
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: `oczekiwano liczby całkowitej ${min}..${max}` })
        return z.NEVER
      }
      return n
    })

const str = (def = '') =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v.trim()))

const list = () =>
  z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )

const schema = z.object({
  PORT: int(8080, 1, 65535),
  HOST: str('::'),
  LOG_LEVEL: str('info'),

  ACCESS_PASSWORD: str(),
  ALLOW_NO_AUTH: bool(false),
  CORS_ALLOWED_ORIGINS: list(),

  MOCK_MODE: bool(false),
  MOCK_SPEED: z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v)
      return v && Number.isFinite(n) && n >= 0 ? n : 1
    }),

  DEFAULT_RANGE_DAYS: int(30, 1, 365),
  MAX_RANGE_DAYS: int(90, 1, 365),

  /** Master switch: false keeps Opoint out of every run even when a token is present. */
  OPOINT_ENABLED: bool(true),
  OPOINT_TOKEN: str(),
  OPOINT_BASE_URL: str('https://api.opoint.com'),
  OPOINT_STORED_SEARCH_ID: str(),
  OPOINT_MODE: z.enum(['auto', 'search_profile', 'feed', 'query']).optional().default('auto'),
  OPOINT_MAX_ARTICLES: int(300, 1, 2000),
  OPOINT_EXTRA_QUERY_ENABLED: bool(false),

  TAVILY_API_KEY: str(),
  TAVILY_BASE_URL: str('https://api.tavily.com'),
  TAVILY_SEARCH_DEPTH: z.enum(['basic', 'advanced']).optional().default('advanced'),
  TAVILY_MAX_DISCOVERY_QUERIES: int(48, 1, 100),
  TAVILY_CONCURRENCY: int(6, 1, 20),

  AZURE_OPENAI_ENDPOINT: str(),
  AZURE_OPENAI_API_KEY: str(),
  AZURE_OPENAI_DEPLOYMENT: str(),
  AZURE_OPENAI_API_STYLE: z.enum(['responses', 'chat', 'azure-legacy']).optional().default('responses'),
  AZURE_OPENAI_API_VERSION: str(),
  LLM_REASONING_EFFORT: str('low'),
  LLM_MAX_OUTPUT_TOKENS: int(6000, 256, 100000),
  LLM_CONCURRENCY: int(5, 1, 50),
  LLM_TIMEOUT_MS: int(120000, 1000),
  LLM_MAX_RETRIES: int(2, 0, 10),

  MAX_ARTICLES_FOR_EXTRACTION: int(120, 1, 1000),
  DEEPEN_LIMIT: int(15, 0, 200),
  MAX_QUERIES_PER_DEAL: int(4, 1, 10),
  MAX_NEW_SOURCES_PER_DEAL: int(4, 1, 20),
  DEEPEN_CONCURRENCY: int(3, 1, 20),
  STRICT_WINDOW: bool(true),
  MAX_DEAL_AGE_DAYS: int(60, 1, 365),

  MAX_CONCURRENT_JOBS: int(2, 1, 50),
  JOB_TIMEOUT_MS: int(720000, 10000),
  DAILY_JOB_BUDGET: int(40, 1, 100000),

  EXTRA_TRADE_DOMAINS: list(),
  EXTRA_LAW_DOMAINS: list(),
})

export type AppConfig = z.infer<typeof schema>

export class ConfigError extends Error {}

export function loadConfig(source: Record<string, string | undefined> = process.env, argv: string[] = process.argv): AppConfig {
  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
    throw new ConfigError(`Nieprawidłowa konfiguracja środowiska:\n${lines.join('\n')}`)
  }
  const config = parsed.data
  // `--mock` flag: keyless local run (npm run dev:mock)
  if (argv.includes('--mock')) {
    config.MOCK_MODE = true
    if (!config.ACCESS_PASSWORD) config.ALLOW_NO_AUTH = true
  }

  const missing: string[] = []
  if (!config.ACCESS_PASSWORD && !(config.MOCK_MODE && config.ALLOW_NO_AUTH)) missing.push('ACCESS_PASSWORD')
  if (!config.MOCK_MODE) {
    if (!config.TAVILY_API_KEY) missing.push('TAVILY_API_KEY')
    if (!config.AZURE_OPENAI_ENDPOINT) missing.push('AZURE_OPENAI_ENDPOINT')
    if (!config.AZURE_OPENAI_API_KEY) missing.push('AZURE_OPENAI_API_KEY')
    if (!config.AZURE_OPENAI_DEPLOYMENT) missing.push('AZURE_OPENAI_DEPLOYMENT')
    if (config.AZURE_OPENAI_API_STYLE === 'azure-legacy' && !config.AZURE_OPENAI_API_VERSION) {
      missing.push('AZURE_OPENAI_API_VERSION (wymagane dla AZURE_OPENAI_API_STYLE=azure-legacy)')
    }
  }
  if (missing.length > 0) {
    throw new ConfigError(`Brak wymaganych zmiennych środowiskowych:\n${missing.map((m) => `  ${m}`).join('\n')}`)
  }
  if (config.DEFAULT_RANGE_DAYS > config.MAX_RANGE_DAYS) {
    throw new ConfigError('DEFAULT_RANGE_DAYS nie może być większe niż MAX_RANGE_DAYS')
  }
  return config
}

/** Why Opoint can or cannot be plugged into a run. */
export function opointStatus(config: AppConfig): OpointStatus {
  if (!config.OPOINT_ENABLED) return 'disabled'
  if (config.MOCK_MODE || config.OPOINT_TOKEN !== '') return 'available'
  return 'not_configured'
}

/** True when Opoint can be used at all (enabled and token present). */
export function opointConfigured(config: AppConfig): boolean {
  return opointStatus(config) === 'available'
}
