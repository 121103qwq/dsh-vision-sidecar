# dsh-vision-sidecar

[中文说明](README.zh-CN.md)

Give text-only models in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) hosted visual perception without replacing the reasoning model. Images go to a free or custom OpenAI-compatible vision API; the exact description sent to the configured reasoning model is then committed to the DSH session and replayed as ordinary text.

The default is LLM7.io's anonymous `default` vision route. No local VLM, GPU, account, or vision API key is required for its documented anonymous allowance. No local VLM, GPU, or multi-gigabyte model download is required.

## Why this plugin

- **No-key hosted vision default.** On top of a working DSH text route, the default LLM7.io vision endpoint works without registration or a vision key; an LLM7 token is optional for higher limits.
- **Durable and replayable.** VLM output is a real DSH session message, not a hidden request-time rewrite or process-only cache.
- **No image overhead for text.** The vision provider is contacted only when an undescribed image exists.
- **Replaceable reasoning target.** The sidecar forwards to `targetProvider` and `targetModel`; any DSH text route that does not depend on opaque provider replay state can be selected.
- **Fail-loud.** Missing credentials, timeouts, rate limits, and provider failures remain typed errors. The plugin never silently forwards an image to a text-only model.
- **Build-free Git install.** The repository ships native ESM JavaScript, so pnpm does not need permission to run a `prepare` script.

Requires DSH `0.1.0-rc.6` or newer within the `0.1.x` line and Node.js `22.19+` or `24+`.

## Quick start: no-key hosted vision

Before starting, have a DSH Web profile that can already call its text model. The plugin does not require a particular reasoning provider or model; it forwards descriptions to the configured `targetProvider` and `targetModel`.

1. Make sure your DSH Web profile can already call its text model.
2. Install the plugin and start the Web profile. The default LLM7.io vision tier needs no vision account or key.

```powershell
dsh plugin --profile web add github:121103qwq/dsh-vision-sidecar#v0.1.4
dsh --profile web
```

On POSIX shells, no vision key export is needed. The bundle adds and selects `deepseek-vision/deepseek-with-vision`. If a later user patch already selects another model, choose **DeepSeek + Hosted Vision** in the model picker.

The no-key claim applies to the default **vision preprocessing endpoint**. LLM7.io documents anonymous access up to 500,000 tokens/day, 60 requests/hour, 10 requests/minute, and 1 request/second; these limits and model availability can change. Your selected reasoning route keeps its existing credential, quota, and billing rules.

There is deliberately no shared or embedded API key. LLM7.io's anonymous allowance is provider-enforced; any optional authenticated key remains user-owned and is never stored in this package.

## Add a custom vision model from the Models page

DeepSeek Desktop already includes the model settings page, so the plugin reuses it instead of adding a second credential form. Open **Settings → Models**, then under `llm-pi-ai` choose **Add custom provider**:

1. Enter a lowercase hyphenated Provider ID, such as `my-vision`.
2. Enter the provider's HTTPS Base URL, such as `https://gateway.example/v1`.
3. Choose `openai-completions` and add at least one vision model ID.
4. Paste your own key into the API key field and apply. DSH stores it write-only through the credentials service, not in `settings.yaml`.

Point the sidecar at the route saved by the page:

```yaml
- id: vision-sidecar
  config:
    visionProvider: my-vision
    visionModel: default
```

`visionModel: default` selects the first model listed for that route; you can instead enter an exact model ID. The vision route must speak OpenAI Chat Completions; Responses and Anthropic protocols cannot be used directly as this plugin's vision endpoint. Select **DeepSeek + Hosted Vision** in the conversation model picker to send images. The reasoning call still uses `targetProvider`/`targetModel`, so the Desktop text model does not need to change.

## What happens to an image

1. DSH resolves the image from its verified attachment store.
2. The plugin sends a bounded batch to the configured OpenAI-compatible `/chat/completions` endpoint.
3. Only after every batch succeeds, the exact visual description and attachment SHA-256 IDs are appended to the durable session as an untrusted-evidence notice.
4. Images are replaced with deterministic text pointers before the configured text model is called.
5. Later turns reuse the logged description, including after a process restart. They do not spend the free VLM quota again.

Text detected inside an image is explicitly framed as untrusted data before it reaches the reasoning model. This is prompt-injection hardening, not a claim that model-level prompt injection can be eliminated.

## Free provider options

Free plans change. These options were checked on 2026-08-14; verify current limits and privacy terms before relying on one.

| Provider | Base URL | Model | Credential and limit notes |
| --- | --- | --- | --- |
| [LLM7.io](https://docs.llm7.io/guides/image-recognition) | `https://api.llm7.io/v1` | `default` | Default. Anonymous vision works without a key; documented anonymous limit is 500,000 tokens/day and 10 requests/minute. |
| [OVHcloud AI Endpoints](https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-capabilities) | `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` | `Qwen2.5-VL-72B-Instruct` | No-key alternative. Anonymous allowance is 2 requests/minute per IP and model. |
| [Zhipu GLM](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.6v-flash) | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.6v-flash` | Account key required; officially listed free vision model. |
| [OpenRouter](https://openrouter.ai/google/gemma-4-31b-it%3Afree) | `https://openrouter.ai/api/v1` | `google/gemma-4-31b-it:free` | Key required. Free-account quota is shared across free models and may change. |
| [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers/en/tasks/chat-completion) | `https://router.huggingface.co/v1` | `Qwen/Qwen2.5-VL-7B-Instruct` | HF account and token with Inference Providers permission; free credit and provider availability may change. |
| [ModelScope](https://www.modelscope.cn/models/Qwen/Qwen3-VL-8B-Instruct) | `https://api-inference.modelscope.cn/v1` | `Qwen/Qwen3-VL-8B-Instruct` | Token required; daily quota and availability are dynamic. |

All six are remote services and receive the complete image. Do not send personal, confidential, or regulated images unless the provider's terms are acceptable. The [free-model application guide](docs/free-models.zh-CN.md) documents the anonymous LLM7.io default, OVHcloud alternative, account steps, OpenAI-compatible overrides, and the current no-registration findings.

### LLM7.io token override

The default leaves `visionApiKeyEnv` empty for anonymous access. Create an optional token at [token.llm7.io](https://token.llm7.io/) for higher limits, then set:

```yaml
- id: vision-sidecar
  config:
    visionBaseURL: https://api.llm7.io/v1
    visionModel: default
    visionApiKeyEnv: LLM7_API_KEY
```

### OVHcloud alternative

To use OVHcloud's anonymous or authenticated vision endpoint instead, set:

```yaml
- id: vision-sidecar
  config:
    visionBaseURL: https://oai.endpoints.kepler.ai.cloud.ovh.net/v1
    visionModel: Qwen2.5-VL-72B-Instruct
    visionApiKeyEnv: OVH_AI_ENDPOINTS_ACCESS_TOKEN
```

### OpenRouter override

Add this row to the profile's `cordis.patch.yml`, then provide `OPENROUTER_API_KEY`:

```yaml
- id: vision-sidecar
  config:
    visionBaseURL: https://openrouter.ai/api/v1
    visionModel: google/gemma-4-31b-it:free
    visionApiKeyEnv: OPENROUTER_API_KEY
```

### ModelScope override

```yaml
- id: vision-sidecar
  config:
    visionBaseURL: https://api-inference.modelscope.cn/v1
    visionModel: Qwen/Qwen3-VL-8B-Instruct
    visionApiKeyEnv: MODELSCOPE_API_TOKEN
```

### Hugging Face override

Create a token with Inference Providers permission, then provide `HF_TOKEN`:

```yaml
- id: vision-sidecar
  config:
    visionBaseURL: https://router.huggingface.co/v1
    visionModel: Qwen/Qwen2.5-VL-7B-Instruct
    visionApiKeyEnv: HF_TOKEN
```

Do not put a literal key in `cordis.patch.yml`. `visionApiKeyEnv` is a DSH credential reference/environment-variable name, not the secret value.

## Configuration

The no-key LLM7.io default needs no patch. To change the reasoning target or request bounds, override the `vision-sidecar` row:

```yaml
- id: vision-sidecar
  config:
    targetProvider: your-existing-text-provider
    targetModel: your-existing-text-model
    visionBaseURL: https://api.llm7.io/v1
    visionModel: default
    visionApiKeyEnv: ''
    visionTimeoutMs: 60000
    visionMaxResponseBytes: 524288
    visionMaxSessionBytes: 1048576
    maxImagesPerRequest: 4
```

Remote URLs must use HTTPS. HTTP is accepted only for loopback-compatible development endpoints. URL-embedded credentials, query strings, and fragments are rejected.

## Development and verification

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm pack:check
```

The suite covers text-only bypass, nested tool-result images, real DSH Session reconstruction, durable replay, atomic multi-batch publication, managed credentials, full-response deadlines, byte limits, HTTP error mapping, cancellation, content conversion, and configuration validation. CI also packs a tarball, installs it into an isolated DSH profile, and checks the composed configuration.

Remove the bundle with:

```sh
dsh plugin --profile web remove dsh-vision-sidecar
```

## Related community work

This plugin builds on the same external-VLM idea explored by [dsh-vision-proxy](https://github.com/Flyvhidbwo/dsh-vision-proxy), [dsh-vision-provider](https://github.com/libinyam/dsh-vision-provider), [modlens](https://github.com/liustack/modlens), [dsh-vision-toolkit](https://github.com/Anionex/dsh-vision-toolkit), and [dsh-tool-vision](https://github.com/Scorp1o117/dsh-tool-vision). Its deliberately narrower focus is a no-local-model, no-key default plus DSH-native durable visual evidence for a text reasoning route.

MIT licensed.
