import { describe, expect, it, vi } from 'vitest'
import { describeImages } from '../src/openai-vision.js'

const ref = {
  attachmentId: 'sha256:one',
  mediaType: 'image/png',
  bytes: 3,
  width: 1,
  height: 1,
}

const config = {
  visionBaseURL: 'https://open.bigmodel.cn/api/paas/v4',
  visionPrompt: 'Describe.',
  visionTemperature: 0,
  visionMaxTokens: 512,
  visionTimeoutMs: 100,
  visionMaxResponseBytes: 65536,
}

const attachments = {
  readImage: vi.fn(async () => ({ ref, data: Uint8Array.of(1, 2, 3) })),
}

describe('OpenAI-compatible vision client', () => {
  it('sends images as data URLs, applies an optional bearer key, and returns text', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      expect(init.headers.authorization).toBe('Bearer secret')
      const body = JSON.parse(init.body)
      expect(body.messages[1].content[2].image_url.url).toBe('data:image/png;base64,AQID')
      return new Response(JSON.stringify({ choices: [{ message: { content: 'a red square' } }] }), { status: 200 })
    })
    await expect(describeImages(config, 'vlm', [ref], attachments, async () => 'secret', fetchImpl)).resolves.toBe('a red square')
  })

  it.each([
    [401, 'INVALID_CREDENTIAL'],
    [402, 'QUOTA'],
    [429, 'RATE_LIMIT'],
    [500, 'SERVER'],
  ])('maps HTTP %i to a stable error', async (status, code) => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status }))
    await expect(describeImages(config, 'vlm', [ref], attachments, async () => undefined, fetchImpl)).rejects.toMatchObject({ code })
  })

  it('cancels a failed HTTP response body before returning the typed error', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream({ cancel })
    const fetchImpl = vi.fn(async () => new Response(body, { status: 500 }))
    await expect(describeImages(
      config,
      'vlm',
      [ref],
      attachments,
      async () => undefined,
      fetchImpl,
    )).rejects.toMatchObject({ code: 'SERVER' })
    await Promise.resolve()
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('rejects invalid JSON and empty model output', async () => {
    const badJson = vi.fn(async () => new Response('not json', { status: 200 }))
    await expect(describeImages(config, 'vlm', [ref], attachments, async () => undefined, badJson)).rejects.toMatchObject({ code: 'VISION_PROTOCOL' })
    const empty = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 }))
    await expect(describeImages(config, 'vlm', [ref], attachments, async () => undefined, empty)).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' })
  })

  it('aborts a request at the configured deadline', async () => {
    const slow = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    await expect(describeImages({ ...config, visionTimeoutMs: 5 }, 'vlm', [ref], attachments, async () => undefined, slow)).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('keeps the deadline active while reading a stalled response body', async () => {
    const stalled = vi.fn(async () => new Response(new ReadableStream({ start() {} }), { status: 200 }))
    await expect(describeImages(
      { ...config, visionTimeoutMs: 5 },
      'vlm',
      [ref],
      attachments,
      async () => undefined,
      stalled,
    )).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('rejects a response body beyond the configured byte limit', async () => {
    const oversized = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'x'.repeat(256) } }],
    }), { status: 200 }))
    await expect(describeImages(
      { ...config, visionMaxResponseBytes: 64 },
      'vlm',
      [ref],
      attachments,
      async () => undefined,
      oversized,
    )).rejects.toMatchObject({ code: 'VISION_RESPONSE_TOO_LARGE' })
  })
})
