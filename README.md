<p align="center">
  <img src="src/html/img/icon/tataru.ico" alt="FFTrans Logo" width="120" height="120">
</p>

<h1 align="center">FFTrans</h1>

<p align="center">
  <strong>Final Fantasy XIV 实时翻译助手</strong>
</p>

<p align="center">
  <a href="https://github.com/raydocs/fftrans/releases/latest">
    <img src="https://img.shields.io/github/v/release/raydocs/fftrans?style=flat-square&color=blue" alt="Release">
  </a>
  <a href="https://github.com/raydocs/fftrans/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/raydocs/fftrans?style=flat-square" alt="License">
  </a>
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/version-0.1.4-orange?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/electron-42-blue?style=flat-square" alt="Electron">
</p>

<p align="center">
  <a href="#-简介">简介</a> •
  <a href="#-功能特性">功能特性</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-翻译引擎">翻译引擎</a> •
  <a href="#-模型对比与选择">模型对比</a> •
  <a href="#-tts-语音朗读">语音朗读</a> •
  <a href="#-开发指南">开发指南</a> •
  <a href="#-常见问题">常见问题</a>
</p>

---

## 📖 简介

**FFTrans** 是一款专为 Final Fantasy XIV 国际服设计的实时翻译工具。通过读取游戏内存，自动捕获对话和过场字幕，即时翻译成目标语言，让你无障碍体验游戏剧情。它基于 [winw1010/tataru-assistant](https://github.com/winw1010/tataru-assistant) 深度魔改：重做了 UI、扩充了大量配置、接入了更多 AI/语音引擎，并加入了一套**模型对比工具**——因为 AI 模型几乎每个月都有新版本发布，与其猜哪个好，不如当场测。

## ✨ 功能特性

| 功能 | 描述 |
|------|------|
| 🎮 **实时翻译** | 自动捕获并翻译游戏对话与过场字幕 |
| 🧠 **多引擎 AI 翻译** | NVIDIA / OpenRouter / Gemini / GPT / Kimi / 自定义 LLM，覆盖免费到付费 |
| 📊 **模型对比** | 应用内实时对比译文质量与延迟；配套 Cloudflare 云端评测站 |
| 📸 **OCR 截图翻译** | 屏幕区域截取，识别并翻译任意文字（Tesseract / Google Vision / AI 视觉） |
| 🔊 **TTS 语音朗读** | ElevenLabs / Fish Audio（含声音克隆）/ MiMo v2.5 / Speechify |
| 📝 **智能修正** | 内置游戏术语词库，精准处理角色名 / 地名 / 技能名 |
| 🌐 **多目标语言** | 简中 / 繁中 / 英 / 日 等，随上游持续更新 |
| 🖥️ **悬浮窗口** | 透明悬浮显示，支持点击穿透，含掌机紧凑模式 |

## 🚀 快速开始

### 系统要求

- Windows 10 / 11（64 位）
- Final Fantasy XIV 国际服
- 读取游戏内存需以**管理员身份**运行

### 安装步骤

1. 前往 [Releases](https://github.com/raydocs/fftrans/releases/latest) 下载最新安装包
2. 运行 `FFTrans_Setup.exe` 完成安装
3. 启动游戏并进入，再以管理员身份启动 FFTrans
4. 打开设置，选择翻译引擎并（如需）填入 API Key，保存即可

---

## 🌐 翻译引擎

在「设置 → 翻译」里选择引擎后，**只会展开该引擎的配置**（API Key、模型、AI 参数），不必再跨多个标签页。可另设一个**备用引擎**，主引擎失败时自动切换。

### AI 翻译（推荐）

| 引擎 | 提供方 | 费用 | 说明 |
|------|--------|------|------|
| **NVIDIA NIM** ⭐ | NVIDIA | 免费 | 免费调用大量顶级开源模型，默认推荐 |
| **OpenRouter** | OpenRouter | 按量付费 | 一个 Key 接入 100+ 模型（Claude / GPT / Gemini / DeepSeek…） |
| **Gemini** | Google | 免费额度 | Google AI Studio Key |
| **GPT** | OpenAI | 付费 | 官方 API，可填任意模型名 |
| **Kimi** | 月之暗面 | 付费 | 中文场景优化 |
| **自定义 LLM** | 任意 | — | 任何 OpenAI 兼容端点，自填 URL / Key / 模型 |

> 💡 **模型名可自由填写**。NVIDIA / OpenRouter 的推荐由[评测榜单](#-模型对比与选择)实测驱动、每月自动更新；其它引擎新模型发布后直接在设置里改模型名即可，无需等应用更新。

**当前默认模型**（随时可改）：

| 引擎 | 默认模型 | 说明 |
|------|---------|------|
| NVIDIA | `deepseek-ai/deepseek-v4-pro` | 评测榜单实测 #1（性价比），随榜单自动更新 |
| OpenRouter | `inception/mercury-2` | 应用内按榜单显示推荐（≤ $6/M） |
| Gemini | `gemini-flash-latest` | 自动指向最新 Flash，无需手动升级 |
| GPT | `gpt-5.6-luna` | GPT-5.6 家族中最快最省的一档 |
| Kimi | `kimi-k2.5` | 中文场景优化 |

[获取 NVIDIA 免费 Key →](https://build.nvidia.com/) · [获取 OpenRouter Key →](https://openrouter.ai/)

<details>
<summary>传统在线翻译（免费、无需配置，可作备用）</summary>

| 引擎 | 语言支持 | 说明 |
|------|---------|------|
| 有道翻译 | 中/英/日/韩 | 免费直连 |
| 百度翻译 | 多语言 | 免费直连 |
| 彩云小译 | 中/英/日 | 免费直连 |
| Papago | 中/英/日/韩 | 免费直连 |
| DeepL | 多语言 | 免费额度 |

选中即用，无需填写任何密钥。

</details>

---

## 📊 模型对比与选择

> **AI 模型几乎每个月都有新版本**。FFTrans 提供两套对比工具，帮你用数据选模型，而不是凭感觉。

### 1. 应用内实时对比

打开「设置 → 系统 → 模型对比」：

- **AI 翻译对比**：输入一句测试文本（或用默认），一键跑遍所有已配置的 AI 引擎，**并排显示译文与延迟**，最快的自动标记。未配置密钥或失败的引擎会清楚标注。
- **语音延迟对比**：测试各 TTS 引擎合成同一句话的真实延迟（不走缓存），每条可试听。

适合：手头已配好几个引擎，想快速看"这句话谁翻得好、谁更快"。

### 2. Cloudflare Benchmark Lab（云端深度评测）

一个独立部署的评测站点，专门批量评测 **NVIDIA 托管模型**在 FF14 / 崩坏：星穹铁道字幕翻译上的表现。

- 🌐 **在线站点**：<https://ff14-nvidia-benchmark.pages.dev>
- 📁 **源码**：本仓库 [`cloudflare-benchmark/`](cloudflare-benchmark/)（Cloudflare Pages + Functions + D1）

**它能做什么：**

- 从 NVIDIA 拉取**实时模型列表**，浏览器里搜索、勾选、批量跑分
- 综合评分 = **准确度 45% + 可用性 35% + 延迟 20%**
- 额外检测"思考泄漏"（模型把推理过程当译文吐出）、可用字幕率、ASCII 回声等
- 用真实游戏台词作语料，英译简中字幕风格
- 评测历史存入 **Cloudflare D1**，跨设备排名持久化
- API Key 存在 Cloudflare Secret，**不暴露给浏览器**

**新模型上线时的用法**：打开站点 → 刷新模型列表 → 勾选新模型和你的常用模型 → 跑一轮 → 看排名，决定要不要把应用里的默认模型换成它。部署方式见 [`cloudflare-benchmark/README.md`](cloudflare-benchmark/README.md)。

---

## 🔊 TTS 语音朗读

在「设置 → 语音」里选择引擎，同样只展开所选引擎的配置。失败时静默处理（不出声，译文照常显示）。

### ElevenLabs Reader ⭐

通过 ElevenLabs Reader App 的账号（Refresh Token / 浏览器扩展导入）即可使用，无需单独购买 API 套餐。内置数十款语音，支持音调 / 风格 / 相似度调节，并可按 MSQ 说话人性别自动切换男女声。

| 模型 | 延迟 | 适用 |
|------|------|------|
| **Flash v2.5** | 极低（~75ms） | 实时朗读、快节奏战斗任务 |
| **Turbo v2.5** | 低（~250ms） | 日常平衡 |
| **Eleven v3** | 中等（不支持流式） | 剧情精读、最高音质 |
| **Multilingual v2** | 中等 | 多语言兼容 |

### Fish Audio 🐟（含声音克隆）

支持在 [fish.audio](https://fish.audio) 克隆你自己的声音，在设置里点"刷新"即可选用。

- 默认模型 **`s2.1-pro-free`**（限免，无需 API 余额）；`s2.1-pro` 为付费模型
- 声音克隆通过 `reference_id` 引用你的语音模型
- 注意：Fish 的 **API 余额与平台余额独立计算**，付费模型需单独为 API 充值

### MiMo TTS（v2.5）

小米 MiMo-V2.5-TTS，OpenAI 兼容接口，限时免费。内置预设音色（mimo_default / 冰糖 / 茉莉 / 苏打 / 白桦 / Mia / Chloe / Milo / Dean），支持用自然语言描述控制情感、语气、方言，也支持声音克隆模型。

### Speechify

需自备 Bearer Token，多语音可选。

---

## 📸 OCR 截图翻译

框选屏幕区域即可识别并翻译任意文字（游戏 UI、非国际服文本、图片等）。支持：

- **Tesseract**（本地离线，日 / 英）
- **Google Vision**（需在「系统」页配置 API Key 或 JSON 凭证，识别更准）
- **AI 视觉**（Gemini / GPT / Kimi 的多模态识别）

---

## 🧭 设置界面导览

界面按任务重新组织为 **5 个标签**：

| 标签 | 内容 |
|------|------|
| **通用** | 界面语言、主题、窗口行为、紧凑模式；冷门外观微调收进"高级外观" |
| **翻译** | 自动化开关、目标语言、翻译引擎；选中引擎后就地展开其 API Key / 模型 / AI 参数 |
| **语音** | TTS 引擎选择与配置、试听 |
| **系统** | 模型对比、截图 OCR、维护工具、代理设置 |
| **关于** | 版本与链接 |

---

## 🛠️ 开发指南

### 环境准备

```bash
# 克隆仓库
git clone https://github.com/raydocs/fftrans.git
cd fftrans

# 安装依赖
npm install

# 启动开发模式
npm start
```

### 项目结构

```
fftrans/
├── src/
│   ├── main.js               # Electron 主进程入口
│   ├── html/                 # 渲染进程 UI（index / config / capture …）
│   ├── module/
│   │   ├── system/           # 核心系统模块（tts-service、config、sharlayan…）
│   │   ├── translator/       # 翻译 / TTS 引擎实现
│   │   ├── fix/              # 文本修正处理
│   │   └── ipc/              # IPC 通信（分类处理）
│   └── data/text/            # 游戏术语词库
├── cloudflare-benchmark/     # 云端模型评测站（Cloudflare Pages + Functions + D1）
├── package.json
└── CLAUDE.md                 # AI 开发指南
```

### 构建发布

```bash
npm run pack    # 打包（不生成安装包）
npm run dist    # 构建安装包 → build/FFTrans_Setup.exe
npm run lint    # 代码检查
```

---

## ❓ 常见问题

<details>
<summary><b>Q: 启动后没有翻译显示？</b></summary>

1. 确认 FFXIV 已启动且进入游戏
2. 前往「设置 → 系统 → 修复字幕读取器」
3. 以管理员身份重新启动程序
</details>

<details>
<summary><b>Q: 该选哪个翻译模型？新模型出来了怎么办？</b></summary>

1. 用「设置 → 系统 → 模型对比」当场跑一句对比译文质量与延迟
2. 想深度评测 NVIDIA 模型，用 [Cloudflare Benchmark Lab](https://ff14-nvidia-benchmark.pages.dev)
3. 选定后，直接在引擎设置里把"模型"改成最新模型名即可，无需等应用更新
</details>

<details>
<summary><b>Q: 如何配置 AI 翻译？</b></summary>

1. 前往「设置 → 翻译」
2. 在"翻译引擎"选择 AI 引擎（推荐 NVIDIA，有免费额度）
3. 下方会就地展开该引擎的 API Key / 模型 / AI 参数，填好保存
4. 可用同页的对比或引擎旁的"测试链接"验证
</details>

<details>
<summary><b>Q: 想用自己的声音朗读？</b></summary>

1. 在 [fish.audio](https://fish.audio) 克隆你的声音
2. 「设置 → 语音」选 Fish Audio，填 API Key
3. 克隆语音栏点"刷新"，选中你的声音，试听并保存
</details>

<details>
<summary><b>Q: 翻译延迟很高？</b></summary>

1. 检查网络连接，必要时配置代理（系统页）
2. 用模型对比换一个更快的引擎 / 模型
3. AI 翻译首次请求较慢，后续会命中缓存
</details>

<details>
<summary><b>Q: OCR 识别不准确？</b></summary>

1. 确保截取区域清晰、对比度高，避免过小文字
2. 尝试 Google Vision 或 AI 视觉识别
</details>

---

## 🤝 致谢

- [FFXIVAPP/sharlayan](https://github.com/FFXIVAPP/sharlayan) — FFXIV 内存读取
- [winw1010/tataru-assistant](https://github.com/winw1010/tataru-assistant) — 原始项目
- [NVIDIA NIM](https://build.nvidia.com/) · [OpenRouter](https://openrouter.ai/) — AI 推理
- [ElevenLabs](https://elevenlabs.io/) · [Fish Audio](https://fish.audio/) · 小米 MiMo — 语音合成
- [Electron](https://www.electronjs.org/) · [tesseract.js](https://github.com/naptha/tesseract.js) · [sharp](https://github.com/lovell/sharp)

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

<p align="center">
  <sub>Made with ❤️ by <a href="https://github.com/raydocs">raydocs</a></sub>
</p>
