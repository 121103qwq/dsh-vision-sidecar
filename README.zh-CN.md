# dsh-vision-sidecar

[English](README.md)

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的纯文本模型外挂托管视觉能力，同时保留 Desktop/profile 中配置的文本模型作为推理模型。图片先交给免费或自定义的 OpenAI 兼容视觉 API，VLM 实际生成并交给配置文本模型的描述会写入 DSH Session，之后按普通文本重放。

默认使用 LLM7.io 的匿名 `default` 视觉路由。官方文档给出的匿名额度为每日 500,000 tokens、每小时 60 次、每分钟 10 次、每秒 1 次；不需要注册账号或视觉 API Key，也不需要本地 VLM、GPU 或下载数 GB 模型。

## 和已有插件的不同点

- **默认就是免注册托管视觉。** 在已可用的 DSH 文本模型之上，默认 LLM7.io 视觉端点无需账号或 Key；可选用自己的 LLM7 Token 提高额度。
- **可持久重放。** VLM 输出是正式的 DSH Session 消息，不是只存在于单次请求改写或进程内缓存里的隐藏文本。
- **纯文本零额外开销。** 对话里没有尚未描述的图片时，完全不会访问视觉提供商。
- **主模型不设限定。** 通过 `targetProvider` 与 `targetModel` 指定 Desktop/profile 中已有的文本路由，不依赖某个特定主模型。
- **失败不伪装成功。** 缺凭据、超时、限流和服务端错误都会明确报错，不会把原图静默转交给纯文本模型。
- **Git 安装无需构建授权。** 仓库直接交付原生 ESM JavaScript，没有 `prepare` 构建脚本。

要求 DSH `0.1.0-rc.6` 或同一 `0.1.x` 线上的更高版本，以及 Node.js `22.19+` 或 `24+`。

## 三步即用：免注册托管视觉

开始前，你需要一个已能正常调用文本模型的 DSH Web profile。插件不要求特定的主推理提供方或模型，会把视觉描述交给配置中的 `targetProvider` 和 `targetModel`。

1. 确认 DSH Web profile 已能正常调用文本模型。
2. 安装插件并启动 Web profile；默认 LLM7.io 视觉层不需要注册或视觉 Key。

```powershell
dsh plugin --profile web add github:121103qwq/dsh-vision-sidecar#v0.1.4
dsh --profile web
```

POSIX shell 不需要导出视觉 Key。插件会新增并默认选择 `deepseek-vision/deepseek-with-vision`。如果你的 profile 有优先级更高的用户 patch，请在模型选择器中手动选择 **DeepSeek + Hosted Vision**。

“免注册”只指默认的**视觉预处理端点**。LLM7.io 的匿名额度和模型可用性可能变化；主推理路由仍沿用 Desktop/profile 已配置的凭据、额度和计费规则。

插件刻意不内置“大家共用的免费 Key”。默认使用 LLM7.io 匿名层；如需更高限额，请使用你自己的 Token，插件不会保存或收集它。

## 在模型选择页面添加自定义视觉模型

DeepSeek Desktop 已经自带模型设置页，插件复用它，不再增加第二套凭据表单。打开 **设置 → 模型**，在 `llm-pi-ai` 分区选择 **添加自定义提供方**：

1. Provider ID 填一个小写短横线格式，例如 `my-vision`。
2. 填视觉服务的 HTTPS Base URL，例如 `https://gateway.example/v1`。
3. 协议选择 `openai-completions`，添加至少一个视觉模型 ID。
4. 在 API Key 输入框粘贴自己的 Key 后保存。Key 通过 DSH Credentials 只写入凭据存储，不会写进 `settings.yaml`。

然后让外挂使用这个页面保存的路由：

```yaml
- id: vision-sidecar
  config:
    visionProvider: my-vision
    visionModel: default
```

`visionModel: default` 会使用页面中该路由的第一个模型；也可以直接填页面里的具体模型 ID。视觉路由必须是 OpenAI Chat Completions 兼容端点；Responses 或 Anthropic 协议不能直接作为本插件的视觉端点。对话框中选择 **DeepSeek + Hosted Vision** 后即可发送图片，主推理仍使用 `targetProvider`/`targetModel`，不要求更换 DeepSeek Desktop 的主模型。

## 图片处理流程

1. 从 DSH 已校验的 Attachment Store 读取图片。
2. 以有限批次发送到配置的 OpenAI 兼容 `/chat/completions` 端点。
3. 所有批次都成功后，才把完整视觉描述和附件 SHA-256 ID 写为持久 Session notice。
4. 调用纯文本主模型前，把图片替换成确定性的描述引用。
5. 后续轮次（包括 DSH 重启后）复用已记录描述，不会再次消耗免费 VLM 配额。

图片中的文字会被明确标记为“不可信视觉证据”，提醒主模型只当数据处理。这属于提示注入加固，不代表能从模型层面彻底消除提示注入。

## 免费提供商

免费计划会变化。下表核验于 2026-08-14，正式使用前请再次确认配额与隐私条款。

| 提供方 | Base URL | 模型 | 凭据与额度说明 |
| --- | --- | --- | --- |
| [LLM7.io](https://docs.llm7.io/guides/image-recognition) | `https://api.llm7.io/v1` | `default` | 默认项。匿名视觉无需 Key；官方给出每日 500,000 tokens、每分钟 10 次等限制。 |
| [OVHcloud AI Endpoints](https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-capabilities) | `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` | `Qwen2.5-VL-72B-Instruct` | 免 Key 备选；匿名层每个 IP、每个模型每分钟 2 次。 |
| [智谱 GLM](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.6v-flash) | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.6v-flash` | 需要账号 Key；官方当前列为免费视觉模型。 |
| [OpenRouter](https://openrouter.ai/google/gemma-4-31b-it%3Afree) | `https://openrouter.ai/api/v1` | `google/gemma-4-31b-it:free` | 需要 Key；免费账户额度由所有免费模型共享，可能调整。 |
| [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers/en/tasks/chat-completion) | `https://router.huggingface.co/v1` | `Qwen/Qwen2.5-VL-7B-Instruct` | 需要有 Inference Providers 权限的 HF Token；免费额度和提供方可用性会变化。 |
| [ModelScope](https://www.modelscope.cn/models/Qwen/Qwen3-VL-8B-Instruct) | `https://api-inference.modelscope.cn/v1` | `Qwen/Qwen3-VL-8B-Instruct` | 需要 Token；每日额度和可用性动态变化。 |

六者都是远程服务，会收到完整图片。个人、机密或受监管图片只有在你接受相应提供商条款时才应发送。匿名 LLM7.io 默认、OVHcloud 备选、账号申请、OpenAI 兼容切换示例，以及其他“免注册”方案核验见[免费模型申请指南](docs/free-models.zh-CN.md)。

### 使用 LLM7.io Token（可选）

默认 `visionApiKeyEnv` 为空，使用匿名层。可在 [token.llm7.io](https://token.llm7.io/) 获取 Token，然后设置：

```yaml
- id: vision-sidecar
  config:
    visionBaseURL: https://api.llm7.io/v1
    visionModel: default
    visionApiKeyEnv: LLM7_API_KEY
```

### 切换到 OVHcloud

要改用 OVHcloud 匿名或认证视觉端点：

```yaml
- id: vision-sidecar
  config:
    visionBaseURL: https://oai.endpoints.kepler.ai.cloud.ovh.net/v1
    visionModel: Qwen2.5-VL-72B-Instruct
    visionApiKeyEnv: OVH_AI_ENDPOINTS_ACCESS_TOKEN
```

### 切换到 OpenRouter

在 profile 的 `cordis.patch.yml` 中加入下列行，并提供 `OPENROUTER_API_KEY`：

```yaml
- id: vision-sidecar
  config:
    visionBaseURL: https://openrouter.ai/api/v1
    visionModel: google/gemma-4-31b-it:free
    visionApiKeyEnv: OPENROUTER_API_KEY
```

### 切换到 ModelScope

```yaml
- id: vision-sidecar
  config:
    visionBaseURL: https://api-inference.modelscope.cn/v1
    visionModel: Qwen/Qwen3-VL-8B-Instruct
    visionApiKeyEnv: MODELSCOPE_API_TOKEN
```

### 切换到 Hugging Face

创建一个拥有 Inference Providers 权限的 Token，然后提供 `HF_TOKEN`：

```yaml
- id: vision-sidecar
  config:
    visionBaseURL: https://router.huggingface.co/v1
    visionModel: Qwen/Qwen2.5-VL-7B-Instruct
    visionApiKeyEnv: HF_TOKEN
```

不要把明文 Key 写进 `cordis.patch.yml`。`visionApiKeyEnv` 是 DSH 凭据引用/环境变量名，不是密钥本身。

## 配置

默认免 Key 托管配置不需要 patch。若要更换主推理模型或请求边界，覆盖 `vision-sidecar` 行：

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

远程 URL 必须使用 HTTPS；HTTP 只允许回环开发端点。含用户名/密码、查询参数或 fragment 的 URL 会被拒绝。

## 开发与验证

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm pack:check
```

测试覆盖纯文本直通、tool-result 嵌套图片、真实 DSH Session 重建、持久重放、多批次原子发布、受管凭据、完整响应超时、字节上限、HTTP 错误映射、取消、内容转换和配置校验。CI 还会打包 tarball，安装到隔离 DSH profile，并检查最终组合配置。

卸载：

```sh
dsh plugin --profile web remove dsh-vision-sidecar
```

## 相关社区项目

本插件借鉴了 [dsh-vision-proxy](https://github.com/Flyvhidbwo/dsh-vision-proxy)、[dsh-vision-provider](https://github.com/libinyam/dsh-vision-provider)、[modlens](https://github.com/liustack/modlens)、[dsh-vision-toolkit](https://github.com/Anionex/dsh-vision-toolkit) 与 [dsh-tool-vision](https://github.com/Scorp1o117/dsh-tool-vision) 的外部 VLM 思路。这里刻意收窄到两个差异点：无需本地模型的免费托管默认值，以及把视觉证据作为 DSH 原生持久历史交给文本推理路由。

MIT 许可证。
