# dsh-vision-sidecar

[English](README.md)

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的纯文本模型外挂“托管视觉眼睛”，同时保留 DeepSeek 作为推理大脑。图片先交给免费或自定义的 OpenAI 兼容视觉 API，VLM 实际生成并交给 DeepSeek 的描述会写入 DSH Session，之后按普通文本重放。

默认使用 OVHcloud AI Endpoints 的匿名 `Qwen2.5-VL-72B-Instruct`。默认每个 IP、每个模型每分钟 2 次，不需要注册账号或视觉 API Key；也不需要本地 VLM、GPU 或下载数 GB 模型。

## 和已有插件的不同点

- **默认就是免注册托管视觉。** 在已可用的 DSH 文本模型之上，默认 OVHcloud 视觉端点无需账号或 Key；匿名额度为每个 IP、每个模型每分钟 2 次，也可选用自己的 OVH Key 提高认证限额。
- **可持久重放。** VLM 输出是正式的 DSH Session 消息，不是只存在于单次请求改写或进程内缓存里的隐藏文本。
- **纯文本零额外开销。** 对话里没有尚未描述的图片时，完全不会访问视觉提供商。
- **主模型可替换。** 默认与 DeepSeek 路由一起测试；不依赖专有 replay state 的其他 DSH 文本路由也可通过 `targetProvider` 与 `targetModel` 指定。
- **失败不伪装成功。** 缺凭据、超时、限流和服务端错误都会明确报错，不会把原图静默转交给纯文本模型。
- **Git 安装无需构建授权。** 仓库直接交付原生 ESM JavaScript，没有 `prepare` 构建脚本。

要求 DSH `0.1.0-rc.6` 或同一 `0.1.x` 线上的更高版本，以及 Node.js `22.19+` 或 `24+`。

## 三步即用：免注册托管视觉

开始前，你需要一个已能正常调用文本模型的 DSH Web profile。默认主路由是 `deepseek-official/deepseek-v4-flash`，因此还需要你自己的 `DEEPSEEK_API_KEY`；这一主模型调用按其原有规则计费。

1. 确认 DSH Web profile 已能正常调用文本模型。
2. 安装插件并启动 Web profile；默认 OVHcloud 视觉层不需要注册或视觉 Key。

```powershell
$env:DEEPSEEK_API_KEY = '<你的 DeepSeek Key>'
dsh plugin --profile web add github:121103qwq/dsh-vision-sidecar#v0.1.2
dsh --profile web
```

POSIX shell 只需使用 `export DEEPSEEK_API_KEY='...'`。插件会新增并默认选择 `deepseek-vision/deepseek-with-vision`。如果你的 profile 有优先级更高的用户 patch，请在模型选择器中手动选择 **DeepSeek + Hosted Vision**。

“免注册”只指默认的**视觉预处理端点**。匿名层的额度、价格和地区限制仍以 OVHcloud 当前条款为准；主推理路由仍沿用它原有的凭据、额度和计费规则，默认的 `deepseek-official/deepseek-v4-flash` 仍需要 `DEEPSEEK_API_KEY`。

插件刻意不内置“大家共用的免费 Key”。默认使用 OVHcloud 按 IP/模型限制的匿名层；如需认证限额，请使用你自己的 Key，插件不会保存或收集它。

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
| [OVHcloud AI Endpoints](https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-endpoints-capabilities) | `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` | `Qwen2.5-VL-72B-Instruct` | 默认项。匿名层每个 IP、每个模型每分钟 2 次，不需要视觉 Key。 |
| [智谱 GLM](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.6v-flash) | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.6v-flash` | 需要账号 Key；官方当前列为免费视觉模型。 |
| [OpenRouter](https://openrouter.ai/google/gemma-4-31b-it%3Afree) | `https://openrouter.ai/api/v1` | `google/gemma-4-31b-it:free` | 需要 Key；免费账户额度由所有免费模型共享，可能调整。 |
| [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers/en/tasks/chat-completion) | `https://router.huggingface.co/v1` | `Qwen/Qwen2.5-VL-7B-Instruct` | 需要有 Inference Providers 权限的 HF Token；免费额度和提供方可用性会变化。 |
| [ModelScope](https://www.modelscope.cn/models/Qwen/Qwen3-VL-8B-Instruct) | `https://api-inference.modelscope.cn/v1` | `Qwen/Qwen3-VL-8B-Instruct` | 需要 Token；每日额度和可用性动态变化。 |

五者都是远程服务，会收到完整图片。个人、机密或受监管图片只有在你接受相应提供商条款时才应发送。匿名 OVHcloud 默认、账号申请、OpenAI 兼容切换示例，以及其他“免注册”方案核验见[免费模型申请指南](docs/free-models.zh-CN.md)。

### 使用 OVHcloud 认证 Key（可选）

默认 `visionApiKeyEnv` 为空，使用匿名层。若要使用 Public Cloud 项目中的 OVHcloud Access Token，提高认证限额：

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

默认免费托管配置不需要 patch。若要更换主推理模型或请求边界，覆盖 `vision-sidecar` 行：

```yaml
- id: vision-sidecar
  config:
    targetProvider: deepseek-official
    targetModel: deepseek-v4-pro
    visionBaseURL: https://oai.endpoints.kepler.ai.cloud.ovh.net/v1
    visionModel: Qwen2.5-VL-72B-Instruct
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
