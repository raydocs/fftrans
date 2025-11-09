# OpenRouter 可用模型列表

本文档列出了 OpenRouter 上可用的主要 AI 模型，供 Tataru Assistant 使用。

> **更新日期**: 2025-11-09
> **完整模型列表**: https://openrouter.ai/models

## 🌟 推荐模型

### 最佳性价比
```
openai/gpt-4o-mini              # 默认推荐 - 快速且经济
anthropic/claude-haiku-4.5      # 快速、便宜的 Claude
google/gemini-2.5-flash-preview # 超长上下文、超低价格
```

### 最强性能
```
anthropic/claude-sonnet-4.5     # Claude 最新旗舰 - 1M上下文
anthropic/claude-opus-4.1       # Claude 最强推理
openai/gpt-5-pro                # OpenAI 最新旗舰
google/gemini-2.5-flash-preview # Google 最新模型
```

---

## 📊 模型分类

### OpenAI 模型

| 模型 ID | 名称 | 上下文 | 特点 |
|---------|------|--------|------|
| `openai/gpt-5-pro` | GPT-5 Pro | 400K | 最新旗舰，推理能力强 |
| `openai/gpt-5-image-mini` | GPT-5 Image Mini | 400K | 支持图像输入 |
| `openai/gpt-4o-mini` | GPT-4o Mini | 128K | **推荐** - 性价比高 |
| `openai/o3-deep-research` | o3 Deep Research | 200K | 深度研究专用 |
| `openai/o4-mini-deep-research` | o4 Mini Deep Research | 200K | 轻量研究模型 |

### Anthropic Claude 模型

| 模型 ID | 名称 | 上下文 | 特点 |
|---------|------|--------|------|
| `anthropic/claude-sonnet-4.5` | Claude Sonnet 4.5 | 1M | **推荐** - 最新旗舰 |
| `anthropic/claude-opus-4.1` | Claude Opus 4.1 | 200K | 最强推理 |
| `anthropic/claude-haiku-4.5` | Claude Haiku 4.5 | 200K | 快速且便宜 |
| `anthropic/claude-3.5-sonnet` | Claude 3.5 Sonnet | 200K | 前代旗舰 |

### Google Gemini 模型

| 模型 ID | 名称 | 上下文 | 特点 |
|---------|------|--------|------|
| `google/gemini-2.5-flash-preview-09-2025` | Gemini 2.5 Flash | 1M | **推荐** - 超低价格 |
| `google/gemini-2.5-flash-lite-preview-09-2025` | Gemini 2.5 Flash Lite | 1M | 更轻量版本 |
| `google/gemini-2.0-flash-exp` | Gemini 2.0 Flash Exp | 1M | 实验性版本 |
| `google/gemini-pro-1.5` | Gemini Pro 1.5 | 1M | 稳定版本 |

### Meta Llama 模型

| 模型 ID | 名称 | 上下文 | 特点 |
|---------|------|--------|------|
| `nvidia/llama-3.3-nemotron-super-49b-v1.5` | Llama 3.3 Nemotron | 131K | NVIDIA 优化版 |
| `meta-llama/llama-3.3-70b-instruct` | Llama 3.3 70B | 128K | 开源旗舰 |
| `meta-llama/llama-3.1-405b-instruct` | Llama 3.1 405B | 128K | 最大参数量 |

### Mistral 模型

| 模型 ID | 名称 | 上下文 | 特点 |
|---------|------|--------|------|
| `mistralai/mistral-medium-3.1` | Mistral Medium 3.1 | 131K | 平衡性能 |
| `mistralai/codestral-2508` | Codestral 2508 | 256K | 代码专用 |
| `mistralai/mistral-large-2411` | Mistral Large | 128K | 旗舰模型 |

### DeepSeek 模型

| 模型 ID | 名称 | 上下文 | 特点 |
|---------|------|--------|------|
| `deepseek/deepseek-v3.2-exp` | DeepSeek V3.2 Exp | 163K | 实验性最新版 |
| `deepseek/deepseek-v3.1-terminus` | DeepSeek V3.1 Terminus | 163K | 稳定版 |
| `deepseek/deepseek-chat-v3.1:free` | DeepSeek V3.1 Free | 163K | **免费版本** |
| `deepseek/deepseek-r1` | DeepSeek R1 | 64K | 推理专用 |

### Qwen 模型

| 模型 ID | 名称 | 上下文 | 特点 |
|---------|------|--------|------|
| `qwen/qwen3-max` | Qwen3 Max | 256K | 最强版本 |
| `qwen/qwen3-vl-235b-a22b-thinking` | Qwen3 VL 235B Thinking | 262K | 视觉+思维链 |
| `qwen/qwen3-vl-8b-instruct` | Qwen3 VL 8B | 131K | 轻量视觉模型 |

### Amazon Nova 模型

| 模型 ID | 名称 | 上下文 | 特点 |
|---------|------|--------|------|
| `amazon/nova-premier-v1` | Nova Premier 1.0 | 1M | AWS 旗舰模型 |
| `amazon/nova-pro-v1` | Nova Pro 1.0 | 300K | 平衡性能 |
| `amazon/nova-lite-v1` | Nova Lite 1.0 | 300K | 快速响应 |

### 其他推荐模型

| 模型 ID | 名称 | 上下文 | 特点 |
|---------|------|--------|------|
| `openrouter/polaris-alpha` | Polaris Alpha | 256K | **免费** - 社区模型 |
| `moonshotai/kimi-k2-thinking` | Kimi K2 Thinking | 262K | 推理专用 |
| `moonshotai/kimi-linear-48b-a3b-instruct` | Kimi Linear 48B | 1M | 长上下文优化 |

---

## 💡 使用建议

### 日常翻译推荐
```
openai/gpt-4o-mini              # 性价比最佳
anthropic/claude-haiku-4.5      # Claude 粉丝首选
google/gemini-2.5-flash-preview # 预算有限
```

### 高质量翻译推荐
```
anthropic/claude-sonnet-4.5     # 质量最佳
openai/gpt-5-pro                # OpenAI 旗舰
google/gemini-2.5-flash-preview # 性价比旗舰
```

### 免费模型
```
openrouter/polaris-alpha        # 社区免费模型
deepseek/deepseek-chat-v3.1:free # DeepSeek 免费版
```

---

## 🔧 配置方法

在 Tataru Assistant 配置中设置：

1. **选择翻译引擎**: `OpenRouter`
2. **配置 API Key**: 在 https://openrouter.ai/ 获取
3. **选择模型**: 在 `openRouterModel` 字段填入上述任一模型 ID

例如：
```json
{
  "openRouterApiKey": "sk-or-v1-xxxx",
  "openRouterModel": "anthropic/claude-sonnet-4.5"
}
```

---

## 📝 注意事项

1. **模型更新**: OpenRouter 会定期添加新模型，请访问 https://openrouter.ai/models 查看最新列表
2. **定价**: 不同模型价格差异很大，请根据需求选择
3. **上下文长度**: 翻译任务通常不需要很长的上下文
4. **免费模型**: 免费模型可能有使用限制或数据记录政策

---

**最后更新**: 2025-11-09
**维护者**: Tataru Assistant Team
