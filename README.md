# dsh-vision-sidecar

[中文说明](README.zh-CN.md)

Give text-only models in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) hosted visual perception without replacing the reasoning model. Images go to a free or custom OpenAI-compatible vision API; the exact description sent to DeepSeek is then committed to the DSH session and replayed as ordinary text.

The default is Zhipu's officially free `glm-4.6v-flash`. No local VLM, GPU, or multi-gigabyte model download is required. A free Zhipu account and your own API key are required.

## Why this plugin

- **Hosted-free vision default.** On top of a working DSH text route, set one additional free `ZAI_API_KEY`; the vision endpoint and model already have defaults.
- **Durable and replayable.** VLM output is a real DSH session message, not a hidden request-time rewrite or process-only cache.
- **No image overhead for text.** The vision provider is contacted only when an undescribed image exists.
- **Replaceable reasoning target.** The default DeepSeek route is tested. Other DSH text routes that do not depend on opaque provider replay state can be selected with `targetProvider` and `targetModel`.
- **Fail-loud.** Missing credentials, timeouts, rate limits, and provider failures remain typed errors. The plugin never silently forwards an image to a text-only model.
- **Build-free Git install.** The repository ships native ESM JavaScript, so pnpm does not need permission to run a `prepare` script.

Requires DSH `0.1.0-rc.6` or newer within the `0.1.x` line and Node.js `22.19+` or `24+`.

## Quick start: free hosted vision

Before starting, have a DSH Web profile that can already call its text model. The default reasoning route is `deepseek-official/deepseek-v4-flash`, so it also needs your own `DEEPSEEK_API_KEY` and follows that model's existing billing rules.

1. Create a free key in the [Zhipu API console](https://open.bigmodel.cn/usercenter/apikeys).
2. Provide it only to DSH's launch process or store the same reference through DSH Credentials.
3. Install the plugin and start the Web profile.

```powershell
$env:DEEPSEEK_API_KEY = '<your DeepSeek key>'
$env:ZAI_API_KEY = '<your Zhipu key>'
dsh plugin --profile web add github:121103qwq/dsh-vision-sidecar#v0.1.0
dsh --profile web
```

On POSIX shells, export both values with `export DEEPSEEK_API_KEY='...'` and `export ZAI_API_KEY='...'`. The bundle adds and selects `deepseek-vision/deepseek-with-vision`. If a later user patch already selects another model, choose **DeepSeek + Hosted Vision** in the model picker.

The free claim applies to the default **vision preprocessing model**. Your selected reasoning route keeps its existing credential, quota, and billing rules; the default `deepseek-official/deepseek-v4-flash` still requires `DEEPSEEK_API_KEY`.

There is deliberately no shared or embedded API key. Any holder could consume the same quota, and per-user rotation, revocation, and attribution would be impractical. Every user keeps control of their own free quota and can rotate the key without changing plugin configuration.

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
| [Zhipu GLM](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.6v-flash) | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.6v-flash` | Default. Officially listed free vision model; free account key required. |
| [OpenRouter](https://openrouter.ai/google/gemma-4-31b-it%3Afree) | `https://openrouter.ai/api/v1` | `google/gemma-4-31b-it:free` | Key required. Free-account quota is shared across free models and may change. |
| [ModelScope](https://www.modelscope.cn/models/Qwen/Qwen3-VL-8B-Instruct) | `https://api-inference.modelscope.cn/v1` | `Qwen/Qwen3-VL-8B-Instruct` | Token required; daily quota and availability are dynamic. |

All three are remote services and receive the complete image. Do not send personal, confidential, or regulated images unless the provider's terms are acceptable.

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

Do not put a literal key in `cordis.patch.yml`. `visionApiKeyEnv` is a DSH credential reference/environment-variable name, not the secret value.

## Configuration

The hosted-free default needs no patch. To change the reasoning target or request bounds, override the `vision-sidecar` row:

```yaml
- id: vision-sidecar
  config:
    targetProvider: deepseek-official
    targetModel: deepseek-v4-pro
    visionBaseURL: https://open.bigmodel.cn/api/paas/v4
    visionModel: glm-4.6v-flash
    visionApiKeyEnv: ZAI_API_KEY
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

This plugin builds on the same external-VLM idea explored by [dsh-vision-proxy](https://github.com/Flyvhidbwo/dsh-vision-proxy), [dsh-vision-provider](https://github.com/libinyam/dsh-vision-provider), [modlens](https://github.com/liustack/modlens), [dsh-vision-toolkit](https://github.com/Anionex/dsh-vision-toolkit), and [dsh-tool-vision](https://github.com/Scorp1o117/dsh-tool-vision). Its deliberately narrower focus is a no-local-model hosted-free default plus DSH-native durable visual evidence for a text reasoning route.

MIT licensed.
