import {
  assertUsableApiKey,
  createUserMessage,
  deepFreeze,
  LlmAdapter,
  LlmError,
} from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import {
  batches,
  collectImageRefs,
  describedAttachmentIds,
  formatDescription,
  withoutImages,
  DESCRIPTION_SOURCE,
} from './content.js'
import { describeImages } from './openai-vision.js'

/** A composed route: external VLM preprocessing followed by the configured text model. */
export class VisionSidecarAdapter extends LlmAdapter {
  constructor(ctx, config, options = {}) {
    super()
    this.ctx = ctx
    this.config = config
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
  }

  providerInfo(provider) {
    return { id: provider, name: 'DeepSeek + Hosted Vision' }
  }

  providerRetryPolicy() {
    return this.ctx.llm.providerRetryPolicy(this.config.targetProvider)
  }

  async listModels(provider) {
    const target = await this.ctx.llm.resolveModelInfo(this.config.targetProvider, this.config.targetModel)
    return [{
      provider,
      id: this.config.routeModel,
      name: `${target.name} + Vision`,
      description: `Uses ${this.config.visionModel} for images, then ${target.name} for reasoning.`,
      inputModalities: ['text', 'image'],
    }]
  }

  async resolveModel(provider, model, signal) {
    if (provider !== this.config.routeProvider || model !== this.config.routeModel) {
      throw new LlmError(`unknown vision-sidecar model "${model}"`, 'UNKNOWN_MODEL')
    }
    const target = await this.ctx.llm.resolveModelInfo(this.config.targetProvider, this.config.targetModel, signal)
    return {
      ...target,
      provider,
      id: model,
      name: `${target.name} + Vision`,
      description: `External vision preprocessing with ${target.name} reasoning.`,
      inputModalities: ['text', 'image'],
    }
  }

  async resolveApiKey() {
    if (this.config.visionApiKeyEnv.length === 0) return undefined
    const ref = credentialRef(this.config.visionApiKeyEnv)
    const stored = await this.ctx.credentials.resolve(ref)
    if (stored !== undefined) {
      return assertUsableApiKey(stored.value, 'dsh-vision-sidecar', String(ref))
    }
    if (this.config.isLoopback) return undefined
    throw new LlmError(
      `vision endpoint requires a credential; store or export ${ref}`,
      'MISSING_CREDENTIAL',
    )
  }

  async *stream(options) {
    const callConfig = {
      provider: this.config.targetProvider,
      model: this.config.targetModel,
      ...options.reasoningEffort === undefined ? {} : { reasoningEffort: options.reasoningEffort },
      ...options.temperature === undefined ? {} : { temperature: options.temperature },
      ...options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
      ...options.stop === undefined ? {} : { stop: options.stop },
    }
    const targetCall = await this.ctx.llm.prepareCall(callConfig, options.signal)
    const refs = collectImageRefs(options.messages)
    let added = []
    if (refs.length > 0) {
      const session = options.sessionId === undefined
        ? undefined
        : this.ctx.sessions.get(options.sessionId)
      const requestIds = new Set(options.messages.map(message => message.id))
      const attachmentIds = new Set(refs.map(ref => String(ref.attachmentId)))
      added = (session?.deriveMessages() ?? []).filter(message => {
        if (requestIds.has(message.id)) return false
        const ids = describedAttachmentIds([message])
        return [...ids].some(id => attachmentIds.has(id))
      })
      const described = describedAttachmentIds([...options.messages, ...added])
      const pending = refs.filter(ref => !described.has(String(ref.attachmentId)))
      if (pending.length > 0) {
        if (options.sessionId === undefined) {
          throw new LlmError('new images through vision-sidecar require a durable session id', 'VISION_SESSION_REQUIRED')
        }
        if (session === undefined) {
          throw new LlmError(`vision-sidecar session "${String(options.sessionId)}" is not live`, 'VISION_SESSION_REQUIRED')
        }
        const model = this.config.visionModel
        const content = []
        let contentBytes = 0
        for (const batch of batches(pending, this.config.maxImagesPerRequest)) {
          const description = await describeImages(
            this.config,
            model,
            batch,
            this.ctx.attachments,
            () => this.resolveApiKey(),
            this.fetchImpl,
            options.signal,
          )
          const text = formatDescription(batch, description, model)
          contentBytes += new TextEncoder().encode(text).byteLength
          if (contentBytes > this.config.visionMaxSessionBytes) {
            throw new LlmError(
              `vision descriptions exceeded ${this.config.visionMaxSessionBytes} bytes`,
              'VISION_DESCRIPTION_TOO_LARGE',
            )
          }
          content.push({ type: 'text', text })
        }
        // One append after every batch succeeds keeps the durable publication
        // atomic: a failed request cannot leave partial visual evidence.
        const message = createUserMessage({ content, source: DESCRIPTION_SOURCE })
        const bytes = new TextEncoder().encode(JSON.stringify(message)).byteLength
        if (bytes > this.config.visionMaxSessionBytes) {
          throw new LlmError(
            `vision description message exceeded ${this.config.visionMaxSessionBytes} bytes`,
            'VISION_DESCRIPTION_TOO_LARGE',
          )
        }
        options.signal?.throwIfAborted()
        added.push(session.append('user/message', message, { surfaceOp: 'append' }).data)
      }
      // A concurrent retry can observe an in-memory append before the request
      // that created it reaches its own checkpoint. Every reused or new notice
      // therefore crosses the same durability barrier before model delivery.
      if (added.length > 0 && session !== undefined) await this.ctx.sessions.flush(session)
    }

    options.signal?.throwIfAborted()
    const forwarded = deepFreeze({
      ...options,
      ...targetCall.config,
      messages: withoutImages([...options.messages, ...added]),
    })
    for await (const chunk of targetCall.stream(forwarded)) yield chunk
  }
}
