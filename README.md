# Tataru Assistant 是什麼?

**Tataru Assistant** 為 FFXIV 國際版的即時劇情字幕翻譯程式，主要功能如下

- 即時翻譯對話文字

- 即時翻譯過場字幕

- 螢幕文字擷取翻譯功能

- (僅支援中文翻譯)根據[**對照表**](https://github.com/winw1010/tataru-assistant-text)修正翻譯結果，例如將**タタル**修正為**塔塔露**

- (全語言)自訂翻譯

- 翻譯查詢器

# Tataru Assistant 的翻譯方式

## 線上翻譯機

翻譯能力一般，但基本上無使用限制

- 有道翻譯

- 百度翻譯

- 彩雲小譯

- Papago Naver

- DeepL

## AI 翻譯

翻譯能力較佳，可正確翻譯較艱深的句子，需申請 API key 才能使用，目前支援以下方案

### 單一模型方案
- Gemini
- ChatGPT
- Cohere
- Kimi

### AI 聚合平台（推薦）
- **OpenRouter** - 統一接口訪問 100+ AI 模型，支援 Claude 4.5、GPT-5、Gemini 2.5 等最新模型
  - 📖 [OpenRouter 模型列表](OPENROUTER_MODELS.md)
  - ✅ [驗證報告](OPENROUTER_VERIFICATION.md)

### 自訂方案
- 自訂 OpenAI(自訂模式，可自行輸入 POST URL 和 API KEY 使用與 OpenAI 相容的 AI 模型)

# 檔案下載

- [Tataru Assistant 安裝檔](https://github.com/winw1010/tataru-assistant/releases/latest/download/Tataru_Assistant_Setup.exe)

- [.NET Framework 4.8](https://dotnet.microsoft.com/en-us/download/dotnet-framework/thank-you/net48-web-installer) (執行 Tataru Assistant 的必要元件)

# 安裝步驟

1. 下載「Tataru Assistant 安裝檔」和「.NET Framework 4.8」

2. 執行「ndp48-web.exe」安裝 .NET Framework 4.8 (執行 Tataru Assistant 的必要元件)

3. 執行「Tataru Assistant Setup.exe」安裝 Tataru Assistant ，若顯示「Windows 已保護您的電腦」的訊息，請點選「其他資訊」，再點選下方的「仍要執行」

4. 點選視窗上的齒輪圖示開啟 Tataru Assistant 的設定視窗，切換到【翻譯設定】設置你的遊戲語言和翻譯語言，設定完畢後按儲存即可使用

5. 若安裝後無法自動翻譯，請至【設定】>【系統設定】，點選【修復字幕讀取器】，修復後重新開機即可

# 原始碼

- [原始碼使用說明](https://github.com/winw1010/tataru-assistant/blob/main/doc/README_SOURCE.md)

# Credits

- [FFXIVAPP/sharlayan](https://github.com/FFXIVAPP/sharlayan)
- [Electron](https://www.electronjs.org/)
- [@google-cloud/vision](https://github.com/googleapis/nodejs-vision)
- [axios](https://github.com/axios/axios)
- [crypto-js](https://github.com/brix/crypto-js)
- [sharp](https://github.com/lovell/sharp)
- [temp](https://github.com/bruce/node-temp)
- [tesseract.js](https://github.com/naptha/tesseract.js#tesseractjs)

# Support

[<img src="https://github.com/winw1010/tataru-assistant/blob/main/src/html/img/bmc/bmc-button.png" alt="Buy me a coffee" width="200"/>](https://www.buymeacoffee.com/winw1010)
