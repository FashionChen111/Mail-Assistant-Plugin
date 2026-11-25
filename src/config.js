import Schema from '@deepseek-ai/schemastery'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

export const DEFAULT_LIMITS = Object.freeze({
  max_search_results: 100,
  max_attachment_mb: 25,
  max_body_chars: 20000,
  request_timeout_seconds: 30,
})

export const DEFAULT_TRIGGER = Object.freeze({
  explicit_prefix: '@mail',
})

export const Config = Schema.object({
  limits: Schema.object({
    max_search_results: Schema.number().min(1).max(500).default(DEFAULT_LIMITS.max_search_results)
      .description('Maximum number of emails returned per search query (1-500).'),
    max_attachment_mb: Schema.number().min(1).max(25).default(DEFAULT_LIMITS.max_attachment_mb)
      .description('Maximum downloadable attachment size in MiB (1-25).'),
    max_body_chars: Schema.number().min(100).max(200000).default(DEFAULT_LIMITS.max_body_chars)
      .description('Maximum body characters returned by exchange_read_email before truncation.'),
    request_timeout_seconds: Schema.number().min(1).max(300).default(DEFAULT_LIMITS.request_timeout_seconds)
      .description('EWS HTTP request timeout in seconds (1-300).'),
  }).default({ ...DEFAULT_LIMITS }),
  trigger: Schema.object({
    explicit_prefix: Schema.string().default(DEFAULT_TRIGGER.explicit_prefix)
      .description('Explicit session trigger prefix (default @mail).'),
  }).default({ ...DEFAULT_TRIGGER }),
  data_dir: Schema.string().default('')
    .description('Optional directory override for state.json and audit.jsonl.'),
})

function clampInt(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

export function resolveConfig(rawConfig = {}) {
  const limitsRaw = rawConfig?.limits ?? {}
  const triggerRaw = rawConfig?.trigger ?? {}

  const maxSearchResults = clampInt(limitsRaw.max_search_results, DEFAULT_LIMITS.max_search_results, 1, 500)
  const maxAttachmentMb = clampInt(limitsRaw.max_attachment_mb, DEFAULT_LIMITS.max_attachment_mb, 1, 25)
  const maxBodyChars = clampInt(limitsRaw.max_body_chars, DEFAULT_LIMITS.max_body_chars, 100, 200000)
  const requestTimeoutSeconds = clampInt(limitsRaw.request_timeout_seconds, DEFAULT_LIMITS.request_timeout_seconds, 1, 300)

  const rawPrefix = typeof triggerRaw.explicit_prefix === 'string' ? triggerRaw.explicit_prefix.trim() : ''
  const explicitPrefix = rawPrefix || DEFAULT_TRIGGER.explicit_prefix

  const rawDataDir = typeof rawConfig?.data_dir === 'string' ? rawConfig.data_dir.trim() : ''
  const dataDir = rawDataDir || dshHomePath('dsh-exchange')

  return {
    maxSearchResults,
    maxAttachmentMb,
    maxAttachmentBytes: maxAttachmentMb * 1024 * 1024,
    maxBodyChars,
    requestTimeoutSeconds,
    requestTimeoutMs: requestTimeoutSeconds * 1000,
    explicitPrefix,
    dataDir,
  }
}
