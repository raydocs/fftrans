# FFTrans 是什么?

**FFTrans** (Final Fantasy Translator) 是 FFXIV 国际版的即时剧情字幕翻译程序，主要功能如下：

- 即时翻译对话文字

- 即时翻译过场字幕

- 屏幕文字截取翻译功能

- (仅支持中文翻译)根据[**对照表**](https://github.com/winw1010/tataru-assistant-text)修正翻译结果，例如将 **タタル** 修正为 **塔塔露**

- (全语言)自定义翻译

- 翻译查询器

# FFTrans 的翻译方式

## 在线翻译引擎

翻译能力一般，但基本上无使用限制

- 有道翻译

- 百度翻译

- 彩云小译

- Papago Naver

- DeepL

- Google 翻译

## AI 翻译

翻译能力较佳，可正确翻译较艰深的句子，需申请 API key 才能使用，目前支持以下方案：

### 单一模型方案
- Gemini
- ChatGPT
- Cohere
- Kimi

### AI 聚合平台（推荐）
- **OpenRouter** - 统一接口访问 100+ AI 模型，支持 Claude 4.5、GPT-5、Gemini 2.5 等最新模型
  - 📖 [OpenRouter 模型列表](OPENROUTER_MODELS.md)
  - ✅ [验证报告](OPENROUTER_VERIFICATION.md)

### VibeProxy（免费使用 AI）
- **内置 VibeProxy** - 无需 API key，通过 OAuth 授权直接使用 Claude、ChatGPT、Gemini 等 AI 服务
  - 支持 Claude、ChatGPT、Gemini、通义千问
  - 自动管理认证令牌
  - 一键启动，开箱即用

### 自定义方案
- 自定义 OpenAI（自定义模式，可自行输入 POST URL 和 API KEY 使用与 OpenAI 兼容的 AI 模型）

# 文件下载

- [FFTrans 安装包](https://github.com/raydocs/tataru/releases/latest/download/Tataru_Assistant_Setup.exe)

- [.NET Framework 4.8](https://dotnet.microsoft.com/en-us/download/dotnet-framework/thank-you/net48-web-installer) (运行 FFTrans 的必要组件)

# 安装步骤

1. 下载「FFTrans 安装包」和「.NET Framework 4.8」

2. 执行「ndp48-web.exe」安装 .NET Framework 4.8（运行 FFTrans 的必要组件）

3. 执行「Tataru_Assistant_Setup.exe」安装 FFTrans，若显示「Windows 已保护你的电脑」的消息，请点击「更多信息」，再点击下方的「仍要运行」

4. 点击窗口上的齿轮图标打开 FFTrans 的设置窗口，切换到【翻译设置】设置你的游戏语言和翻译语言，设定完毕后按保存即可使用

5. 若安装后无法自动翻译，请至【设置】>【系统设置】，点击【修复字幕读取器】，修复后重新启动即可

# 源代码

- [源代码使用说明](https://github.com/raydocs/tataru/blob/main/doc/README_SOURCE.md)

# 致谢

- [FFXIVAPP/sharlayan](https://github.com/FFXIVAPP/sharlayan) - FFXIV 内存读取库
- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [@google-cloud/vision](https://github.com/googleapis/nodejs-vision) - Google Cloud Vision OCR
- [axios](https://github.com/axios/axios) - HTTP 客户端
- [crypto-js](https://github.com/brix/crypto-js) - 加密库
- [sharp](https://github.com/lovell/sharp) - 图像处理库
- [tesseract.js](https://github.com/naptha/tesseract.js) - OCR 文字识别
- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) - VibeProxy OAuth 代理
- [winw1010/tataru-assistant](https://github.com/winw1010/tataru-assistant) - 原始项目

# 项目信息

- **作者**: [raydocs](https://github.com/raydocs)
- **版本**: 0.0.2
- **项目名称**: FFTrans (Final Fantasy Translator)
- **原始项目**: Tataru Assistant by [winw1010](https://github.com/winw1010)
- **许可证**: MIT License
- **仓库地址**: https://github.com/raydocs/tataru

# 更新日志

## 0.0.2
- 集成 VibeProxy，支持免 API key 使用 AI 翻译
- 更新文档为简体中文
- 优化 OCR 识别准确率
- 新增更多翻译引擎支持

## 0.0.1
- 初始版本
- 基于 Tataru Assistant 进行二次开发
