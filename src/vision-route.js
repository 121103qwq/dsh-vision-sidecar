import { LlmError } from '@deepseek-ai/dsh-llm'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const CREDENTIAL_REF = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Validate and normalize an OpenAI-compatible vision endpoint.
 * @param {string} value - endpoint URL.
 * @param {string} [field] - configuration field used in diagnostics.
 * @returns {{ baseURL: string, isLoopback: boolean }} normalized endpoint facts.
 */
export function normalizeVisionBaseURL(value, field = 'visionBaseURL') {
  let url
  try {
    url = new URL(value)
  } catch (error) {
    throw new Error(`dsh-vision-sidecar: ${field} must be an absolute URL`, { cause: error })
  }
  const isLoopback = LOOPBACK_HOSTS.has(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    throw new Error(`dsh-vision-sidecar: remote ${field} must use HTTPS`)
  }
  if (url.username.length > 0 || url.password.length > 0 || url.search.length > 0 || url.hash.length > 0) {
    throw new Error(`dsh-vision-sidecar: ${field} cannot contain credentials, query, or fragment`)
  }
  return Object.freeze({
    baseURL: url.toString().replace(/\/+$/, ''),
    isLoopback,
  })
}

/**
 * Resolve the vision endpoint selected through the Desktop Models page.
 *
 * A `visionProvider` points at a profile in the existing `llm-pi-ai` settings
 * namespace. The page owns the URL, protocol, model list, and credential
 * reference; the sidecar only accepts the OpenAI Chat Completions protocol.
 * @param {object} ctx - Cordis context.
 * @param {object} config - resolved sidecar configuration.
 * @returns {object} an immutable request configuration for one operation.
 */
export function resolveVisionRoute(ctx, config) {
  if (config.visionProvider.length === 0) return config

  const settings = typeof ctx?.get === 'function' ? ctx.get('settings') : ctx?.settings
  const section = settings?.get?.('llm-pi-ai')
  const profile = section?.providers?.[config.visionProvider]
  if (profile === undefined) {
    throw new LlmError(
      `vision provider route "${config.visionProvider}" is not configured in the Desktop Models page`,
      'VISION_PROVIDER_NOT_CONFIGURED',
    )
  }
  if (profile.api !== undefined && profile.api !== 'openai-completions') {
    throw new LlmError(
      `vision provider route "${config.visionProvider}" must use the openai-completions protocol`,
      'VISION_PROVIDER_UNSUPPORTED_PROTOCOL',
    )
  }
  if (typeof profile.baseURL !== 'string' || profile.baseURL.trim().length === 0) {
    throw new LlmError(
      `vision provider route "${config.visionProvider}" has no base URL`,
      'VISION_PROVIDER_NOT_CONFIGURED',
    )
  }
  const model = config.visionModel === 'default'
    ? profile.models?.[0]?.id
    : config.visionModel
  if (typeof model !== 'string' || model.trim().length === 0) {
    throw new LlmError(
      `vision provider route "${config.visionProvider}" has no selectable model`,
      'VISION_PROVIDER_NOT_CONFIGURED',
    )
  }
  const apiKeyEnv = profile.apiKeyEnv === undefined ? '' : String(profile.apiKeyEnv).trim()
  if (apiKeyEnv.length > 0 && !CREDENTIAL_REF.test(apiKeyEnv)) {
    throw new LlmError(
      `vision provider route "${config.visionProvider}" has an invalid API key reference`,
      'INVALID_CREDENTIAL',
    )
  }
  const endpoint = normalizeVisionBaseURL(profile.baseURL.trim(), `llm-pi-ai.providers.${config.visionProvider}.baseURL`)
  return Object.freeze({
    ...config,
    visionBaseURL: endpoint.baseURL,
    visionModel: model.trim(),
    visionApiKeyEnv: apiKeyEnv,
    isLoopback: endpoint.isLoopback,
  })
}
