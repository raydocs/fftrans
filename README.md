<p align="center">
  <img src="src/html/img/icon/tataru.ico" alt="FFTrans Logo" width="120" height="120">
</p>

<h1 align="center">FFTrans</h1>

<p align="center">
  <strong>Final Fantasy XIV 实时翻译助手</strong>
</p>

<p align="center">
  <a href="https://github.com/raydocs/tataru/releases/latest">
    <img src="https://img.shields.io/github/v/release/raydocs/tataru?style=flat-square&color=blue" alt="Release">
  </a>
  <a href="https://github.com/raydocs/tataru/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/raydocs/tataru?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/raydocs/tataru/releases">
    <img src="https://img.shields.io/github/downloads/raydocs/tataru/total?style=flat-square&color=green" alt="Downloads">
  </a>
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/version-0.1.1-orange?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/electron-37.2.6-blue?style=flat-square" alt="Electron">
</p>

<p align="center">
  <a href="#-功能特性">功能特性</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-翻译引擎">翻译引擎</a> •
  <a href="#-开发指南">开发指南</a> •
  <a href="#-常见问题">常见问题</a>
</p>

---

## 📖 简介

**FFTrans** 是一款专为 Final Fantasy XIV 国际服设计的实时翻译工具。通过读取游戏内存，自动捕获对话和过场字幕，并即时翻译成目标语言，让您无障碍体验游戏剧情。

## ✨ 功能特性

| 功能 | 描述 |
|------|------|
| 🎮 **实时翻译** | 自动捕获并翻译游戏对话和过场字幕 |
| 📸 **OCR 截图翻译** | 屏幕区域截取，识别并翻译任意文字 |
| 🔊 **TTS 语音朗读** | 支持 Google TTS、Speechify、ElevenLabs、MiMo TTS |
| 📝 **智能修正** | 3.8MB 游戏术语词库，精准翻译角色名/地名/技能名 |
| 🎨 **自定义翻译** | 支持用户自定义翻译规则 |
| 🌐 **多引擎支持** | 15+ 翻译引擎，含 AI 大模型 |
| 🖥️ **悬浮窗口** | 透明悬浮显示，支持点击穿透 |

## 🚀 快速开始

### 系统要求

- **操作系统**: Windows 10/11 (64-bit)
- **运行环境**: [.NET Framework 4.8](https://dotnet.microsoft.com/download/dotnet-framework/net48)
- **游戏版本**: Final Fantasy XIV (国际服)

### 安装步骤

1. **下载安装包**
   
   [![Download](https://img.shields.io/badge/下载-最新版本-blue?style=for-the-badge)](https://github.com/raydocs/tataru/releases/latest/download/Tataru_Assistant_Setup.exe)

2. **安装 .NET Framework 4.8**（如未安装）
   
   [点击下载 .NET Framework 4.8](https://dotnet.microsoft.com/download/dotnet-framework/net48)

3. **运行安装程序**
   
   执行 `Tataru_Assistant_Setup.exe`，如遇 Windows 安全提示，点击「更多信息」→「仍要运行」

4. **配置翻译设置**
   
   启动程序 → 点击齿轮图标 ⚙️ → 设置源语言和目标语言 → 保存

5. **开始游戏**
   
   启动 FFXIV，翻译将自动开始工作

> ⚠️ **提示**: 如无法自动翻译，请前往「设置」→「系统设置」→「修复字幕读取器」

## 🌐 翻译引擎

### AI 翻译（推荐）

#### NVIDIA NIM ⭐ 默认推荐

NVIDIA 提供的免费 AI 推理服务，无需付费即可使用顶级开源模型。内置 4 款优选模型：

| 模型 | 速度 | 特点 |
|------|------|------|
| **Llama 4 Maverick** | ~500ms | 速度最快，翻译精准（默认） |
| **Qwen 3 Next 80B** | ~590ms | 中文最自然，游戏术语准确 |
| **Mistral Small 4** | ~650ms | 稳定可靠，多语言均衡 |
| **Mistral Nemotron** | ~1200ms | 翻译简洁，表达地道 |

[获取免费 API Key →](https://build.nvidia.com/)

#### OpenRouter

统一接入 100+ AI 模型的代理平台，一个 API Key 即可切换 Claude、GPT、Gemini、DeepSeek 等所有主流模型。默认使用 `inception/mercury-2`，付费按量计费，适合需要精细控制模型的用户。

[获取 API Key →](https://openrouter.ai/)

#### 其他 AI 引擎

| 引擎 | 提供方 | 说明 |
|------|--------|------|
| GPT | OpenAI | 官方 API，默认 `gpt-5.4-nano`，可手动填写其他模型 |
| Claude | Anthropic | 高质量翻译，长文本表现出色 |
| Gemini | Google | 默认 `gemini-3.1-flash-lite-preview`，可手动填写其他模型 |
| Kimi | 月之暗面 | 默认 `kimi-k2.5`，中文场景优化 |

<details>
<summary>在线翻译（免费备用）</summary>

| 引擎 | 语言支持 | 说明 |
|------|---------|------|
| 有道翻译 | 中/英/日/韩 | 免费，无需配置 |
| 百度翻译 | 多语言 | 免费，无需配置 |
| 彩云小译 | 中/英/日 | 免费，无需配置 |
| Papago | 中/英/日/韩 | 免费，无需配置 |
| DeepL | 多语言 | 免费额度 |

</details>

### 🔊 TTS 语音朗读

#### ElevenLabs Reader

通过 ElevenLabs Reader App 的账号登录（Refresh Token）即可使用，无需单独购买 API 套餐。支持 4 款模型：

| 模型 | 延迟 | 语言支持 |
|------|------|---------|
| **Eleven v3**（推荐） | 中等 | 32 种语言 |
| **Flash v2.5** | 极低 | 32 种语言 |
| **Turbo v2.5** | 低 | 32 种语言 |
| **Multilingual v2** | 中等 | 29 种语言 |

**支持的语言包（v3 / Flash v2.5 / Turbo v2.5）：**

英语、中文（普通话）、西班牙语、印地语、葡萄牙语、法语、德语、日语、阿拉伯语、韩语、印尼语、意大利语、荷兰语、土耳其语、波兰语、瑞典语、菲律宾语、马来语、罗马尼亚语、乌克兰语、希腊语、捷克语、丹麦语、芬兰语、保加利亚语、克罗地亚语、斯洛伐克语、泰米尔语，以及更多

内置 59 款语音，涵盖男性、女性及多种口音风格，支持音调/风格/相似度等细节调节。

## 🛠️ 开发指南

### 环境准备

```bash
# 克隆仓库
git clone https://github.com/raydocs/tataru.git
cd tataru

# 安装依赖
npm install

# 启动开发模式
npm start
```

### 项目结构

```
tataru/
├── src/
│   ├── main.js              # Electron 主进程入口
│   ├── html/                 # 渲染进程 UI
│   │   ├── index.html       # 主窗口（翻译显示）
│   │   ├── config.html      # 设置窗口
│   │   └── capture.html     # 截图窗口
│   ├── module/
│   │   ├── system/          # 核心系统模块
│   │   ├── translator/      # 翻译引擎实现
│   │   ├── fix/             # 文本修正处理
│   │   └── ipc/             # IPC 通信
│   └── data/
│       └── text/            # 翻译词库 (3.8MB)
├── package.json
└── CLAUDE.md                 # AI 开发指南
```

### 构建发布

```bash
# 打包（不生成安装包）
npm run pack

# 构建安装包
npm run dist
```

输出目录: `build/Tataru_Assistant_Setup.exe`

## ❓ 常见问题

<details>
<summary><b>Q: 启动后没有翻译显示？</b></summary>

1. 确认 FFXIV 已启动且进入游戏
2. 前往「设置」→「系统设置」→「修复字幕读取器」
3. 以管理员身份重新启动程序
</details>

<details>
<summary><b>Q: 翻译延迟很高？</b></summary>

1. 检查网络连接
2. 尝试切换翻译引擎
3. AI 翻译首次请求可能较慢，后续会使用缓存
</details>

<details>
<summary><b>Q: OCR 识别不准确？</b></summary>

1. 确保截取区域清晰、对比度高
2. 尝试使用 Google Vision（需配置 API）
3. 避免截取过小的文字区域
</details>

<details>
<summary><b>Q: 如何使用 AI 翻译？</b></summary>

1. 前往「设置」→「AI 翻译」Tab
2. 选择 AI 引擎（推荐 NVIDIA，有免费额度）
3. 在对应设置中填入 API Key
4. 保存并测试
</details>

## 🤝 致谢

- [FFXIVAPP/sharlayan](https://github.com/FFXIVAPP/sharlayan) - FFXIV 内存读取
- [winw1010/tataru-assistant](https://github.com/winw1010/tataru-assistant) - 原始项目
- [Electron](https://www.electronjs.org/) - 跨平台框架
- [tesseract.js](https://github.com/naptha/tesseract.js) - OCR 引擎
- [sharp](https://github.com/lovell/sharp) - 图像处理

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

<p align="center">
  <sub>Made with ❤️ by <a href="https://github.com/raydocs">raydocs</a></sub>
</p>
