import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/index.js'

describe('vision-sidecar config', () => {
  it('defaults to the hosted free Zhipu vision model', () => {
    expect(resolveConfig({})).toMatchObject({
      routeProvider: 'deepseek-vision',
      routeModel: 'deepseek-with-vision',
      visionBaseURL: 'https://open.bigmodel.cn/api/paas/v4',
      visionModel: 'glm-4.6v-flash',
      visionApiKeyEnv: 'ZAI_API_KEY',
      visionMaxResponseBytes: 524288,
      visionMaxSessionBytes: 1048576,
      isLoopback: false,
    })
  })

  it.each([
    [{ routeProvider: 'deepseek-official' }, /must differ/],
    [{ routeProvider: '' }, /non-empty/],
    [{ visionBaseURL: 'http://example.com/v1' }, /must use HTTPS/],
    [{ visionBaseURL: 'https://user:pass@example.com/v1' }, /cannot contain credentials/],
    [{ visionApiKeyEnv: 'not-valid-key' }, /environment-variable name/],
    [{ visionMaxTokens: 0 }, /positive safe integer/],
    [{ visionMaxResponseBytes: 0 }, /positive safe integer/],
    [{ visionMaxSessionBytes: Number.MAX_SAFE_INTEGER + 1 }, /positive safe integer/],
    [{ visionTimeoutMs: 0 }, /positive finite/],
    [{ visionTemperature: 3 }, /between 0 and 2/],
  ])('rejects unsafe or incomplete config %#', (input, error) => {
    expect(() => resolveConfig(input)).toThrow(error)
  })
})
