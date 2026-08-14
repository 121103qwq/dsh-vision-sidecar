# 免费视觉模型申请指南

> 核验日期：2026-08-14。免费额度、模型名称、地区可用性和隐私条款都可能变化；本页只记录官方公开的申请入口和插件配置方法。

## 先说结论：LLM7.io 是默认的免注册视觉端

[LLM7.io 图像识别文档](https://docs.llm7.io/guides/image-recognition)提供 OpenAI 兼容的视觉 Chat Completions 接口，默认 `model: default` 支持图像输入；[官方主页](https://llm7.io/)说明匿名层不需要 Token，并给出每日 500,000 tokens、每小时 60 次、每分钟 10 次、每秒 1 次的当前限制。插件默认使用：

```yaml
visionBaseURL: https://api.llm7.io/v1
visionModel: default
visionApiKeyEnv: ''
```

空的 `visionApiKeyEnv` 是有意设计：插件不读取凭据，直接使用 LLM7.io 匿名层。需要更高限额时，可在 [token.llm7.io](https://token.llm7.io/) 获取 Token。匿名额度、模型路由和可用性都可能变化，正式使用前应查看当前条款。

这不代表所有“免费 API”都免注册。OVHcloud 也提供官方匿名视觉端，作为第二个备选；其他网页服务没有可核验的插件 API，不能作为本插件后端。

有些网站可以直接在网页里试用识图，但这不等于有可供插件调用的 API。例如 [MulanAI 图片理解](https://www.mulanai.com/product/image_understand) 宣传无需注册，但没有公开可核验的 OpenAI 兼容 API 合同；[BYLO 4o Image API](https://bylo.ai/zh-CN/features/4o-image-api) 的同一页面同时出现“无需登录/Key”和“注册/创建 API Key”的相互矛盾说明。插件不会抓取这些网页，也不会使用共享 Key。

[Pollinations API](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md) 虽然提供视觉能力，但官方 API 文档要求从 `enter.pollinations.ai` 获取 API Key；[讯飞图像理解](https://www.xfyun.cn/doc/spark/ImageUnderstanding.html) 使用带应用凭据的签名 WebSocket，也不是免注册 OpenAI 兼容端点。因此，除 LLM7.io 和 OVHcloud 的官方匿名端外，“免注册”目前只能作为人工网页试用选项，不能作为本插件的即开即用后端。

## 推荐顺序

| 选项 | 需要注册 | 视觉模型/入口 | 适合谁 |
| --- | --- | --- | --- |
| LLM7.io | 不需要（匿名层） | `default`，OpenAI 兼容视觉路由 | 首次安装、想即开即用的人 |
| OVHcloud AI Endpoints | 不需要（匿名层） | `Qwen2.5-VL-72B-Instruct`，OpenAI 兼容 | 想要固定 VLM、低频使用的人 |
| 智谱 GLM | 需要 | `glm-4.6v-flash`，OpenAI 兼容 | 中国区优先、想要账号配额的人 |
| OpenRouter | 需要 | `google/gemma-4-31b-it:free` 或 `openrouter/free` | 想在多个免费模型间切换的人 |
| Hugging Face | 需要 | `Qwen/Qwen2.5-VL-7B-Instruct`，OpenAI 兼容 | 想使用 HF Inference Providers 路由的人 |
| ModelScope | 需要 | `Qwen/Qwen3-VL-8B-Instruct`，OpenAI 兼容 | 已有 ModelScope 账号的人 |

所有选项都把图片发送到远程服务。插件不限定主推理模型；`targetProvider` 和 `targetModel` 应指向 DeepSeek Desktop/profile 中已有的文本路由。

## 1. LLM7.io（默认，免注册）

无需注册或申请 Key，直接安装插件即可。官方当前匿名限制为每日 500,000 tokens、每小时 60 次、每分钟 10 次、每秒 1 次；视觉请求格式见[图像识别文档](https://docs.llm7.io/guides/image-recognition)。

```powershell
dsh plugin --profile web add github:121103qwq/dsh-vision-sidecar#v0.1.3
dsh --profile web
```

如需更高限额，在 [token.llm7.io](https://token.llm7.io/) 获取 Token，然后覆盖配置：

```yaml
- id: vision-sidecar
  config:
    visionBaseURL: https://api.llm7.io/v1
    visionModel: default
    visionApiKeyEnv: LLM7_API_KEY
```

PowerShell 使用 `$env:LLM7_API_KEY = '<你的 LLM7 Token>'`；POSIX shell 使用 `export LLM7_API_KEY='<你的 LLM7 Token>'`。Token 是可选项，不要把它写入 patch 或仓库。

## 2. OVHcloud AI Endpoints（免注册备选）

[官方能力说明](https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-capabilities)确认匿名层每个 IP、每个模型每分钟 2 次，并支持视觉模型；VLM 请求体上限为 10 MB。

```yaml
- id: vision-sidecar
  config:
    visionBaseURL: https://oai.endpoints.kepler.ai.cloud.ovh.net/v1
    visionModel: Qwen2.5-VL-72B-Instruct
    visionApiKeyEnv: ''
```

需要认证限额时，改用 `OVH_AI_ENDPOINTS_ACCESS_TOKEN`。

## 3. 智谱 GLM

官方模型页将 [`glm-4.6v-flash`](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.6v-flash) 列为免费视觉模型；其 [OpenAI 兼容文档](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction)说明了 Base URL、API Key 和图片输入格式。

1. 打开[智谱开放平台](https://open.bigmodel.cn/)并注册/登录。
2. 在[API Keys 页面](https://open.bigmodel.cn/usercenter/apikeys)创建自己的 Key。
3. 只在当前启动进程或 DSH Credentials 中提供 Key，不要写进 patch、仓库或截图。

PowerShell：

```powershell
$env:ZAI_API_KEY = '<你的智谱 Key>'
dsh plugin --profile web add github:121103qwq/dsh-vision-sidecar#v0.1.3
dsh --profile web
```

POSIX shell：

```sh
export ZAI_API_KEY='<你的智谱 Key>'
dsh plugin --profile web add github:121103qwq/dsh-vision-sidecar#v0.1.3
dsh --profile web
```

## 4. OpenRouter

[OpenRouter 的免费变体](https://openrouter.ai/docs/guides/routing/model-variants/free)使用 `:free` 后缀；[免费模型路由](https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground)也提供 `openrouter/free` 选择器。官方 FAQ 提醒免费模型的请求上限和可用性会变化，调用仍需要 API Key。

1. 在 [OpenRouter](https://openrouter.ai/) 注册/登录。
2. 在[密钥页面](https://openrouter.ai/settings/keys)创建 Key。
3. 提供 `OPENROUTER_API_KEY`，并将下面的行加入 profile 的 `cordis.patch.yml`：

```yaml
- id: vision-sidecar
  config:
    visionBaseURL: https://openrouter.ai/api/v1
    visionModel: google/gemma-4-31b-it:free
    visionApiKeyEnv: OPENROUTER_API_KEY
```

若使用 `openrouter/free`，请先确认当前被选中的模型支持图像输入；免费路由可能因供应商状态而改变。

## 5. Hugging Face Inference Providers

[Chat Completions 文档](https://huggingface.co/docs/inference-providers/en/tasks/chat-completion)给出了 OpenAI 兼容 Base URL `https://router.huggingface.co/v1`，并列出视觉模型示例；[Token 文档](https://huggingface.co/docs/hub/en/security-tokens)要求在 Settings → Access Tokens 创建 Token，并授予 Inference Providers 权限。免费用户的额度以[官方定价说明](https://huggingface.co/docs/inference-providers/en/pricing)为准，可能调整。

1. 在 [Hugging Face](https://huggingface.co/join) 注册/登录。
2. 打开[Access Tokens](https://huggingface.co/settings/tokens)，创建 read 或 fine-grained Token，并确认有 Inference Providers 权限。
3. 提供 `HF_TOKEN`，并使用：

```yaml
- id: vision-sidecar
  config:
    visionBaseURL: https://router.huggingface.co/v1
    visionModel: Qwen/Qwen2.5-VL-7B-Instruct
    visionApiKeyEnv: HF_TOKEN
```

模型供应商和地区可用性是动态的；如果收到模型/提供方不可用错误，请先在 HF 文档或模型页确认当前路由。

## 6. ModelScope

在 [Qwen3-VL 模型页](https://www.modelscope.cn/models/Qwen/Qwen3-VL-8B-Instruct)登录 ModelScope 后，从账号设置创建 Access Token。然后提供 `MODELSCOPE_API_TOKEN`：

```yaml
- id: vision-sidecar
  config:
    visionBaseURL: https://api-inference.modelscope.cn/v1
    visionModel: Qwen/Qwen3-VL-8B-Instruct
    visionApiKeyEnv: MODELSCOPE_API_TOKEN
```

ModelScope 的免费额度、每日限制和模型可用性需要以账号页面和服务返回为准。

## Key 和隐私检查清单

- 不要使用网上公开、群聊转发或插件内置的共享 Key；它们可能被撤销，也无法归因和轮换。
- 不要把 Key 写入 `cordis.patch.yml`、Git、Issue、Discussion、日志或截图。`visionApiKeyEnv` 只写变量名。
- 视觉请求会把完整图片发送到所选远程提供商；先检查其数据保留、训练和地区条款。
- 插件不要求某个特定主推理模型；请确保 DeepSeek Desktop/profile 已配置一个可用的文本路由。
- `401/403` 通常表示凭据无效或权限不足；`429/402` 通常表示限流、额度耗尽或计费限制。
- LLM7.io 匿名层遇到 `429` 时，等待限额窗口，或切换到自己的 Token；OVHcloud 匿名层遇到 `429` 时，等待下一个分钟窗口，或切换到自己的 Access Token。

如果你必须零注册、零 Key，建议只使用自己有权限的网页服务或企业内部网关，并让网关提供明确的 OpenAI 兼容 HTTPS 合同；不要把网页抓取器或他人共享凭据加入插件默认配置。
