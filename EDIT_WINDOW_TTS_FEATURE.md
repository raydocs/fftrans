# 编辑窗口 TTS 语音朗读功能

**版本**: v0.0.4
**更新日期**: 2025-11-17
**功能**: 在编辑翻译窗口中添加三种 TTS 引擎选择和音频下载功能

---

## 🎯 功能概述

在**编辑翻译窗口**（查看历史对话记录）中，现在可以：

1. **选择 TTS 引擎**：Google TTS、ElevenLabs Reader、Speechify
2. **播放语音**：一键生成并播放游戏对话语音
3. **下载音频**：将生成的音频文件保存到本地，永久保存游戏对话配音

---

## 📋 功能详情

### 1. TTS 引擎选择器

**位置**: 编辑窗口顶部，文本显示区域下方

**可选引擎**:
| 引擎 | 特点 | 配置要求 |
|------|------|----------|
| **Google TTS** | 免费，稳定，快速 | 无需配置 |
| **ElevenLabs Reader** | 高质量，21种语音可选 | 需要 Bearer Token |
| **Speechify** | 自然流畅，19种语音可选 | 需要 Bearer Token |

### 2. 播放语音按钮 (🔊 播放语音)

**功能**:
- 根据选择的 TTS 引擎生成语音
- 自动在页面中播放音频
- 第一段音频自动播放，后续音频可手动控制
- 支持长文本自动分段（每段最多 200 字符）

**使用流程**:
1. 在编辑窗口中打开历史对话记录
2. 选择想要使用的 TTS 引擎
3. 点击 "🔊 播放语音" 按钮
4. 等待语音生成（显示"⏳ 正在生成语音..."）
5. 音频自动播放

### 3. 下载音频按钮 (💾 下载音频)

**功能**:
- 将生成的音频文件下载到本地
- 自动命名（包含角色名、对话内容、时间戳）
- 支持批量下载（长文本分段后每段单独下载）
- 下载位置：浏览器默认下载文件夹

**文件命名格式**:
```
{tts引擎}_{角色名}_{对话内容前20字符}_part{序号}_{时间戳}.{格式}
```

**示例**:
```
google_Yshtola_Greetings_Warr_part1_1700123456789.mp3
elevenlabs_Alphinaud_I_have_been_waiti_part1_1700123456790.mp3
speechify_System_Quest_completed_part1_1700123456791.ogg
```

**文件格式**:
- Google TTS: `.mp3`
- ElevenLabs: `.mp3`
- Speechify: `.ogg` (可在设置中配置为 mp3/wav)

---

## 🎬 使用场景

### 场景 1: 回顾游戏剧情并保存配音

1. 打开 Tataru Assistant 主窗口
2. 点击历史记录，选择想要回顾的对话
3. 在编辑窗口中选择 ElevenLabs（高质量）
4. 点击"播放语音"听一遍
5. 点击"下载音频"保存到本地
6. **用途**: 制作游戏剧情视频、回顾经典对话、学习语言

### 场景 2: 对比不同 TTS 引擎效果

1. 打开同一条对话记录
2. 选择 Google TTS，点击"播放语音"
3. 选择 ElevenLabs，点击"播放语音"
4. 选择 Speechify，点击"播放语音"
5. **用途**: 选择最喜欢的语音效果

### 场景 3: 创建游戏对话音频库

1. 批量打开多条对话记录
2. 逐条选择 TTS 引擎并下载音频
3. 所有音频自动保存到下载文件夹
4. **用途**: 创建游戏配音素材库、制作音频集锦

---

## ⚙️ 技术实现

### 前端 (edit.html)

**新增 UI 元素**:
```html
<!-- TTS 引擎选择器 -->
<select id="select-tts-engine">
  <option value="google">Google TTS</option>
  <option value="elevenlabs">ElevenLabs Reader</option>
  <option value="speechify">Speechify</option>
</select>

<!-- 播放按钮 -->
<button id="button-play-audio">🔊 播放语音</button>

<!-- 下载按钮 -->
<button id="button-download-audio">💾 下载音频</button>

<!-- 音频播放区域 -->
<div id="div-audio"></div>
```

### 逻辑 (edit.js)

**核心功能**:

1. **TTS 引擎切换**:
```javascript
async function playAudio() {
  const ttsEngine = document.getElementById('select-tts-engine').value;

  switch (ttsEngine) {
    case 'google':
      urlList = await ipcRenderer.invoke('google-tts', text, fromLang);
      break;
    case 'elevenlabs':
      urlList = await ipcRenderer.invoke('elevenlabs-tts', text, fromLang);
      break;
    case 'speechify':
      urlList = await ipcRenderer.invoke('speechify-tts', text, fromLang);
      break;
  }

  // 显示音频播放器
  currentAudioUrls = urlList;
  // ...
}
```

2. **音频下载**:
```javascript
async function downloadAudio() {
  for (let url of currentAudioUrls) {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${ttsEngine}_${nameInfo}_${textInfo}_${timestamp}.${ext}`;
    link.click();
  }
}
```

### IPC 通信 (ipc-module.js)

**新增 IPC 处理器**:
```javascript
// ElevenLabs TTS
ipcMain.handle('elevenlabs-tts', async (event, text, from) => {
  const elevenLabsTTS = require('../translator/elevenlabs-tts');
  return await elevenLabsTTS.getAudioUrl(text, from);
});

// Speechify TTS
ipcMain.handle('speechify-tts', async (event, text, from) => {
  return await speechifyTTS.getAudioUrl(text, from);
});
```

---

## 🔧 配置说明

### Google TTS

**无需配置** - 开箱即用

### ElevenLabs Reader

**配置步骤**:
1. 打开设置 → API 设置 → ElevenLabs Reader
2. 填入 Bearer Token（参考 `GET_TOKEN_README.md`）
3. 选择语音（推荐: Brian, Sarah, Daniel）
4. 点击"测试配置"验证

### Speechify

**配置步骤**:
1. 打开设置 → API 设置 → Speechify TTS
2. 填入 Bearer Token（参考 `GET_TOKEN_README.md`）
3. 选择语音（推荐: gwyneth, matthew, lily）
4. 选择音频格式（推荐: ogg）
5. 点击"试听语音"验证

---

## 📊 音频格式对比

| TTS 引擎 | 格式 | 大小（1分钟） | 质量 | 兼容性 |
|---------|------|--------------|------|--------|
| **Google TTS** | MP3 | ~1 MB | 中等 | ✅ 全平台 |
| **ElevenLabs** | MP3 | ~1.5 MB | 高 | ✅ 全平台 |
| **Speechify** | OGG | ~800 KB | 高 | ⚠️ 部分播放器 |
| **Speechify** | MP3 | ~1.2 MB | 高 | ✅ 全平台 |

**推荐配置**:
- **播放**: Speechify OGG（文件小，质量高）
- **存档**: ElevenLabs MP3（质量高，兼容性好）
- **分享**: Google TTS MP3（文件小，兼容性最佳）

---

## 💡 高级技巧

### 1. 批量下载对话音频

**方法**: 使用浏览器扩展自动化
1. 安装 Tampermonkey 或 Violentmonkey
2. 编写脚本自动遍历历史记录
3. 逐条生成并下载音频

### 2. 创建游戏角色语音库

**方法**: 按角色分类下载
1. 筛选特定角色的对话（如 Yshtola、Alphinaud）
2. 使用同一 TTS 引擎和语音
3. 批量下载并重命名为统一格式
4. 用于制作视频、音频剧等

### 3. 制作游戏剧情音频集锦

**方法**: 合并多段音频
1. 下载主线剧情的所有对话音频
2. 使用 Audacity 或 FFmpeg 合并音频
3. 添加背景音乐和音效
4. 导出为完整剧情音频

**FFmpeg 合并示例**:
```bash
# 创建文件列表
echo "file 'part1.mp3'" > list.txt
echo "file 'part2.mp3'" >> list.txt

# 合并音频
ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp3
```

### 4. 音频格式转换

**OGG → MP3**:
```bash
ffmpeg -i input.ogg -acodec libmp3lame -ab 192k output.mp3
```

**MP3 → WAV** (无损):
```bash
ffmpeg -i input.mp3 output.wav
```

---

## ⚠️ 注意事项

### 1. Bearer Token 有效期

| 服务 | 有效期 | 过期后 |
|------|--------|--------|
| **ElevenLabs** | 1-4 小时 | 需重新获取 Token |
| **Speechify** | 1-4 小时 | 需重新获取 Token |

**提示**: Token 过期后会显示"生成语音失败"错误，重新运行 `get-bearer-tokens.js` 即可。

### 2. 文件大小和存储

- **长文本**: 可能生成多个音频文件（每段 200 字符）
- **存储位置**: 浏览器默认下载文件夹
- **命名冲突**: 使用时间戳避免文件覆盖

**建议**: 定期整理下载的音频文件到专门的文件夹。

### 3. 网络请求

- **Google TTS**: 直接 URL，速度快
- **ElevenLabs**: API 请求，需等待 2-5 秒
- **Speechify**: API 请求，需等待 2-5 秒

**提示**: 高质量 TTS 需要等待时间，请耐心等待"正在生成语音..."提示消失。

### 4. 版权和使用限制

- **个人使用**: ✅ 自由使用
- **商业用途**: ⚠️ 请查看各 TTS 服务条款
- **分享传播**: ⚠️ 请注明音频来源

**免责声明**: 本功能仅供个人学习和游戏体验使用，请遵守各 TTS 服务的使用条款。

---

## 🐛 常见问题

### Q1: 点击"播放语音"无反应？

**可能原因**:
1. TTS 引擎未配置（ElevenLabs、Speechify）
2. Bearer Token 已过期
3. 网络连接问题

**解决方法**:
1. 检查设置中 Bearer Token 是否已填写
2. 重新运行 `get-bearer-tokens.js` 获取新 Token
3. 检查网络连接，尝试使用 Google TTS

### Q2: 下载的音频文件无法播放？

**可能原因**:
1. 文件格式不兼容（OGG 格式）
2. 下载未完成
3. 文件损坏

**解决方法**:
1. 使用 VLC 或支持 OGG 的播放器
2. 将 Speechify 音频格式改为 MP3
3. 重新下载音频

### Q3: 长文本只生成了第一段音频？

**可能原因**: 后续段落生成失败（网络错误、API 限流）

**解决方法**:
1. 等待几秒后重新点击"播放语音"
2. 切换到 Google TTS（更稳定）
3. 查看控制台错误信息（F12）

### Q4: 音频质量不满意？

**解决方法**:
1. 切换到 ElevenLabs（质量最高）
2. 在设置中更换语音（如 Brian → Sarah）
3. 尝试不同 TTS 引擎对比效果

---

## 📚 相关文档

- [GET_TOKEN_README.md](./GET_TOKEN_README.md) - Bearer Token 获取指南
- [BEARER_TOKEN_GUIDE.md](./BEARER_TOKEN_GUIDE.md) - 详细 Token 配置教程
- [TTS_ENGINE_COMPARISON.md](./TTS_ENGINE_COMPARISON.md) - TTS 引擎技术对比
- [SPEECHIFY_QUICKSTART.md](./SPEECHIFY_QUICKSTART.md) - Speechify 快速入门

---

## 🎉 总结

现在你可以：

✅ 在编辑窗口中**选择任意 TTS 引擎**朗读对话
✅ **播放语音**实时试听游戏对话配音
✅ **下载音频**永久保存游戏对话到本地
✅ **对比引擎**选择最喜欢的语音效果
✅ **创建音频库**制作游戏剧情音频集锦

享受更丰富的 FFXIV 翻译体验！🎙️✨
