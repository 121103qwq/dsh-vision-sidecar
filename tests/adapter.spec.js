import { describe, expect, it, vi } from 'vitest'
import { VisionSidecarAdapter } from '../src/adapter.js'
import { resolveConfig } from '../src/index.js'

const ref = id => ({
  attachmentId: `sha256:${id}`,
  mediaType: 'image/png',
  bytes: 3,
  width: 1,
  height: 1,
})

async function collect(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function harness(fetchImpl) {
  const appended = []
  const session = {
    append: vi.fn((_type, message) => {
      appended.push(message)
      return { data: message }
    }),
    deriveMessages: vi.fn(() => [...appended]),
  }
  const llm = {
    resolveModelInfo: vi.fn(async (provider, model) => ({
      provider,
      id: model,
      name: 'DeepSeek target',
      inputModalities: ['text'],
      context: { contextWindow: 1000 },
    })),
    stream: vi.fn(async function* () {
      yield { type: 'text-delta', index: 0, text: 'answer' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }),
  }
  llm.providerRetryPolicy = vi.fn(() => ({ ladder: 'normal' }))
  llm.prepareCall = vi.fn(async config => ({
    config: Object.freeze({ ...config }),
    retryPolicy: Object.freeze({ ladder: 'normal' }),
    adapterDefaults: Object.freeze({}),
    stream: options => llm.stream(options),
  }))
  const ctx = {
    llm,
    attachments: {
      readImage: vi.fn(async attachment => ({ ref: attachment, data: Uint8Array.of(1, 2, 3) })),
    },
    sessions: {
      get: vi.fn(() => session),
      flush: vi.fn(async () => true),
    },
    settings: {
      get: vi.fn(() => undefined),
    },
    credentials: {
      resolve: vi.fn(async () => ({ value: 'test-vision-key', source: 'managed' })),
    },
  }
  const config = resolveConfig({ visionModel: 'test-vlm', visionApiKeyEnv: 'TEST_VISION_KEY' })
  return { adapter: new VisionSidecarAdapter(ctx, config, { fetchImpl }), ctx, session, appended }
}

const message = content => ({
  id: 'message-1',
  role: 'user',
  source: { kind: 'user' },
  content,
})

describe('vision-sidecar adapter', () => {
  it('bypasses the VLM for text-only requests and preserves target controls', async () => {
    const fetchImpl = vi.fn()
    const { adapter, ctx, session } = harness(fetchImpl)
    const chunks = await collect(adapter.stream({
      provider: 'deepseek-vision',
      model: 'deepseek-with-vision',
      messages: [message([{ type: 'text', text: 'hello' }])],
      tools: [{ name: 'x', description: 'x', parameters: {} }],
      maxTokens: 123,
      temperature: 0.2,
    }))
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(session.append).not.toHaveBeenCalled()
    expect(ctx.llm.prepareCall).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      maxTokens: 123,
      temperature: 0.2,
    }), undefined)
    expect(ctx.llm.stream).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      maxTokens: 123,
      temperature: 0.2,
      tools: [{ name: 'x', description: 'x', parameters: {} }],
    }))
  })

  it('describes nested images once, logs the result, and strips binary content before DeepSeek', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Image 1 is a red square.' } }],
    }), { status: 200 }))
    const { adapter, ctx, session, appended } = harness(fetchImpl)
    const image = ref('nested')
    const original = message([{
      type: 'tool-result',
      toolCallId: 'call-1',
      content: [{ type: 'image', attachment: image }],
    }])
    const options = {
      provider: 'deepseek-vision',
      model: 'deepseek-with-vision',
      sessionId: 'session-1',
      messages: [original],
    }
    await collect(adapter.stream(options))

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(session.append).toHaveBeenCalledWith('user/message', expect.any(Object), { surfaceOp: 'append' })
    expect(ctx.sessions.flush).toHaveBeenCalledWith(session)
    expect(ctx.sessions.flush.mock.invocationCallOrder[0]).toBeLessThan(ctx.llm.stream.mock.invocationCallOrder[0])
    const forwarded = ctx.llm.stream.mock.calls[0][0]
    expect(Object.isFrozen(forwarded)).toBe(true)
    expect(Object.isFrozen(forwarded.messages[0])).toBe(true)
    expect(JSON.stringify(forwarded.messages)).not.toContain('"type":"image"')
    expect(JSON.stringify(forwarded.messages)).toContain('untrusted visual evidence')
    expect(JSON.stringify(forwarded.messages)).toContain('red square')

    ctx.llm.stream.mockClear()
    // A retry can reuse the already-built outer request. The adapter reloads
    // its just-flushed description from the live Session instead of spending
    // the VLM quota and publishing it again.
    await collect(adapter.stream(options))
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(session.append).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(ctx.llm.stream.mock.calls[0][0].messages)).toContain('red square')
  })

  it('flushes a live-session description again before a concurrent reuse can reach the target', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'durable evidence' } }],
    }), { status: 200 }))
    const { adapter, ctx, session } = harness(fetchImpl)
    const options = {
      provider: 'deepseek-vision',
      model: 'deepseek-with-vision',
      sessionId: 'session-1',
      messages: [message([{ type: 'image', attachment: ref('race') }])],
    }
    await collect(adapter.stream(options))

    ctx.llm.stream.mockClear()
    ctx.sessions.flush.mockRejectedValueOnce(new Error('persistence unavailable'))
    await expect(collect(adapter.stream(options))).rejects.toThrow('persistence unavailable')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(session.append).toHaveBeenCalledTimes(1)
    expect(ctx.llm.stream).not.toHaveBeenCalled()
  })

  it('publishes no partial descriptions when a later batch fails', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'first' } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
    const { adapter, session } = harness(fetchImpl)
    adapter.config = resolveConfig({ visionModel: 'test-vlm', maxImagesPerRequest: 1 })
    await expect(collect(adapter.stream({
      provider: 'deepseek-vision',
      model: 'deepseek-with-vision',
      sessionId: 'session-1',
      messages: [message([
        { type: 'image', attachment: ref('one') },
        { type: 'image', attachment: ref('two') },
      ])],
    }))).rejects.toMatchObject({ code: 'SERVER' })
    expect(session.append).not.toHaveBeenCalled()
  })

  it('commits successful multi-batch evidence in one session append', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'first' } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'second' } }] }), { status: 200 }))
    const { adapter, session } = harness(fetchImpl)
    adapter.config = resolveConfig({ visionModel: 'test-vlm', maxImagesPerRequest: 1 })
    await collect(adapter.stream({
      provider: 'deepseek-vision',
      model: 'deepseek-with-vision',
      sessionId: 'session-1',
      messages: [message([
        { type: 'image', attachment: ref('one') },
        { type: 'image', attachment: ref('two') },
      ])],
    }))
    expect(session.append).toHaveBeenCalledTimes(1)
    expect(session.append.mock.calls[0][1].content).toHaveLength(2)
  })

  it('rejects an oversized durable description before publishing it', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'a'.repeat(512) } }],
    }), { status: 200 }))
    const { adapter, session } = harness(fetchImpl)
    adapter.config = resolveConfig({
      visionModel: 'test-vlm',
      visionMaxResponseBytes: 2048,
      visionMaxSessionBytes: 128,
    })
    await expect(collect(adapter.stream({
      provider: 'deepseek-vision',
      model: 'deepseek-with-vision',
      sessionId: 'session-1',
      messages: [message([{ type: 'image', attachment: ref('one') }])],
    }))).rejects.toMatchObject({ code: 'VISION_DESCRIPTION_TOO_LARGE' })
    expect(session.append).not.toHaveBeenCalled()
  })

  it('requires a live durable session for an image request', async () => {
    const { adapter, ctx } = harness(vi.fn())
    const request = {
      provider: 'deepseek-vision',
      model: 'deepseek-with-vision',
      messages: [message([{ type: 'image', attachment: ref('one') }])],
    }
    await expect(collect(adapter.stream(request))).rejects.toMatchObject({ code: 'VISION_SESSION_REQUIRED' })
    ctx.sessions.get.mockReturnValue(undefined)
    await expect(collect(adapter.stream({ ...request, sessionId: 'missing' }))).rejects.toMatchObject({ code: 'VISION_SESSION_REQUIRED' })
  })

  it('requires the configured credential only when a new remote image is sent', async () => {
    const { adapter, ctx } = harness(vi.fn())
    ctx.credentials.resolve.mockResolvedValue(undefined)
    await expect(collect(adapter.stream({
      provider: 'deepseek-vision',
      model: 'deepseek-with-vision',
      sessionId: 'session-1',
      messages: [message([{ type: 'image', attachment: ref('one') }])],
    }))).rejects.toMatchObject({ code: 'MISSING_CREDENTIAL' })
  })

  it('uses the anonymous endpoint when no credential reference is configured', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      expect(init.headers.authorization).toBeUndefined()
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'anonymous evidence' } }],
      }), { status: 200 })
    })
    const { adapter, ctx, session } = harness(fetchImpl)
    adapter.config = resolveConfig({
      visionModel: 'anonymous-vlm',
      visionApiKeyEnv: '',
    })
    await collect(adapter.stream({
      provider: 'deepseek-vision',
      model: 'deepseek-with-vision',
      sessionId: 'session-1',
      messages: [message([{ type: 'image', attachment: ref('anonymous') }])],
    }))
    expect(ctx.credentials.resolve).not.toHaveBeenCalled()
    expect(session.append).toHaveBeenCalledTimes(1)
  })

  it('uses a custom provider saved by the Desktop Models page', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(url).toBe('https://vision.example/v1/chat/completions')
      expect(init.headers.authorization).toBe('Bearer custom-key')
      expect(JSON.parse(init.body).model).toBe('custom-vlm')
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'custom route evidence' } }],
      }), { status: 200 })
    })
    const { adapter, ctx, session } = harness(fetchImpl)
    ctx.settings = {
      get: vi.fn(() => ({
        providers: {
          'my-vision': {
            api: 'openai-completions',
            baseURL: 'https://vision.example/v1',
            models: [{ id: 'custom-vlm' }],
            apiKeyEnv: 'MY_VISION_API_KEY',
          },
        },
      })),
    }
    ctx.credentials.resolve.mockResolvedValue({ value: 'custom-key', source: 'managed' })
    adapter.config = resolveConfig({ visionProvider: 'my-vision' })
    await collect(adapter.stream({
      provider: 'deepseek-vision',
      model: 'deepseek-with-vision',
      sessionId: 'session-1',
      messages: [message([{ type: 'image', attachment: ref('custom') }])],
    }))
    expect(ctx.credentials.resolve).toHaveBeenCalledWith('MY_VISION_API_KEY')
    expect(session.append).toHaveBeenCalledTimes(1)
  })

  it('fails clearly when the selected Desktop provider is missing or uses another protocol', async () => {
    const { adapter, ctx } = harness(vi.fn())
    adapter.config = resolveConfig({ visionProvider: 'missing-vision' })
    await expect(collect(adapter.stream({
      provider: 'deepseek-vision',
      model: 'deepseek-with-vision',
      sessionId: 'session-1',
      messages: [message([{ type: 'image', attachment: ref('missing') }])],
    }))).rejects.toMatchObject({ code: 'VISION_PROVIDER_NOT_CONFIGURED' })

    ctx.settings.get.mockReturnValue({
      providers: {
        'responses-vision': {
          api: 'openai-responses',
          baseURL: 'https://vision.example/v1',
          models: [{ id: 'responses-vlm' }],
        },
      },
    })
    adapter.config = resolveConfig({ visionProvider: 'responses-vision' })
    await expect(collect(adapter.stream({
      provider: 'deepseek-vision',
      model: 'deepseek-with-vision',
      sessionId: 'session-1',
      messages: [message([{ type: 'image', attachment: ref('responses') }])],
    }))).rejects.toMatchObject({ code: 'VISION_PROVIDER_UNSUPPORTED_PROTOCOL' })
  })

  it('rejects a malformed managed credential without attempting provider I/O', async () => {
    const fetchImpl = vi.fn()
    const { adapter, ctx } = harness(fetchImpl)
    ctx.credentials.resolve.mockResolvedValue({ value: 'bad\nkey', source: 'managed' })
    await expect(collect(adapter.stream({
      provider: 'deepseek-vision',
      model: 'deepseek-with-vision',
      sessionId: 'session-1',
      messages: [message([{ type: 'image', attachment: ref('one') }])],
    }))).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not publish visual evidence after cancellation', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn()
    const { adapter, ctx, session } = harness(fetchImpl)
    ctx.credentials.resolve.mockImplementation(async () => {
      controller.abort()
      return { value: 'test-vision-key', source: 'managed' }
    })
    await expect(collect(adapter.stream({
      provider: 'deepseek-vision',
      model: 'deepseek-with-vision',
      sessionId: 'session-1',
      signal: controller.signal,
      messages: [message([{ type: 'image', attachment: ref('one') }])],
    }))).rejects.toMatchObject({ code: 'ABORTED' })
    expect(session.append).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('can replay an already durable description without a live session', async () => {
    const fetchImpl = vi.fn()
    const { adapter, ctx, appended } = harness(fetchImpl)
    const image = ref('replay')
    const firstFetch = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'replay evidence' } }],
    }), { status: 200 }))
    adapter.fetchImpl = firstFetch
    await collect(adapter.stream({
      provider: 'deepseek-vision',
      model: 'deepseek-with-vision',
      sessionId: 'session-1',
      messages: [message([{ type: 'image', attachment: image }])],
    }))

    ctx.llm.stream.mockClear()
    adapter.fetchImpl = fetchImpl
    await collect(adapter.stream({
      provider: 'deepseek-vision',
      model: 'deepseek-with-vision',
      messages: [message([{ type: 'image', attachment: image }]), ...appended],
    }))
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(JSON.stringify(ctx.llm.stream.mock.calls[0][0].messages)).toContain('replay evidence')
  })

  it('advertises only the configured wrapper model as image-capable', async () => {
    const { adapter } = harness(vi.fn())
    await expect(adapter.resolveModel('deepseek-vision', 'deepseek-with-vision')).resolves.toMatchObject({
      provider: 'deepseek-vision',
      id: 'deepseek-with-vision',
      inputModalities: ['text', 'image'],
    })
    await expect(adapter.resolveModel('deepseek-vision', 'wrong')).rejects.toMatchObject({ code: 'UNKNOWN_MODEL' })
  })
})
