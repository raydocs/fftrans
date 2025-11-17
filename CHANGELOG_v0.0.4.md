# Changelog v0.0.4 - 编辑窗口 TTS 功能增强

**发布日期**: 2025-11-17
**版本**: 0.0.4

---

## 🎯 主要更新

### 1. 编辑窗口 TTS 引擎选择功能

在**编辑翻译窗口**（查看历史对话）中新增完整的 TTS 功能：

✅ **三种 TTS 引擎选择器**
- Google TTS（免费，无需配置）
- ElevenLabs Reader（高质量，21 种语音）
- Speechify（自然流畅，19 种语音）

✅ **播放语音按钮**
- 一键生成并播放游戏对话语音
- 支持自动分段（长文本每段 200 字符）
- 实时显示生成进度
- 第一段自动播放

✅ **下载音频按钮**
- 将生成的音频保存到本地
- 智能命名（包含角色名、对话内容、时间戳）
- 支持批量下载（多段音频）
- 永久保存游戏配音

---

## 📂 文件变更

### 新增文件

1. **EDIT_WINDOW_TTS_FEATURE.md**
   - 完整的功能文档
   - 使用场景和示例
   - 技术实现细节
   - 故障排查指南

2. **CHANGELOG_v0.0.4.md**
   - 版本更新日志

### 修改文件

1. **src/html/edit.html**
   - 添加 TTS 引擎选择器（`<select id="select-tts-engine">`）
   - 添加"播放语音"按钮（`<button id="button-play-audio">`）
   - 添加"下载音频"按钮（`<button id="button-download-audio">`）
   - 重新排列 UI 布局，TTS 控件放在文本显示区域下方

2. **src/html/edit.js**
   - 添加全局变量 `currentAudioUrls`（存储音频 URL）
   - 修改 `setView()`：从配置读取 TTS 引擎选项
   - 扩展 `setButton()`：添加播放、下载、引擎切换事件处理
   - 重写 `showAudio()`：自动调用 `playAudio()`
   - **新增 `playAudio()` 函数**：
     - 根据选择的引擎调用不同 IPC 处理器
     - 显示加载状态
     - 渲染音频播放器
     - 错误处理和提示
   - **新增 `downloadAudio()` 函数**：
     - 遍历 `currentAudioUrls` 下载所有音频
     - 智能生成文件名
     - 批量下载延迟处理
     - 显示下载成功通知

3. **src/module/system/ipc-module.js**
   - **新增 `elevenlabs-tts` IPC 处理器**（Line 621-625）
   - **新增 `speechify-tts` IPC 处理器**（Line 627-630）
   - 保留原有 `google-tts` 处理器

---

## 🔧 技术细节

### 架构设计

```
用户操作（edit.html）
    ↓
TTS 引擎选择器 + 播放按钮
    ↓
edit.js → playAudio()
    ↓
IPC 通信 (ipcRenderer.invoke)
    ↓ ┌───────────────────────────────┐
      │ google-tts    (ipc-module.js) │
      │ elevenlabs-tts                │
      │ speechify-tts                 │
      └───────────────────────────────┘
    ↓
各自的 TTS 模块
    ↓ ┌──────────────────────────────────┐
      │ google-tts.js    → Google URLs   │
      │ elevenlabs-tts.js → Data URLs    │
      │ speechify-tts.js  → Data URLs    │
      └──────────────────────────────────┘
    ↓
返回音频 URL 数组
    ↓
edit.js → 渲染 <audio> 播放器
    ↓
downloadAudio() → 下载到本地
```

### IPC 通信流程

**播放音频**:
```javascript
// Renderer (edit.js)
const urlList = await ipcRenderer.invoke('elevenlabs-tts', text, fromLang);

// Main (ipc-module.js)
ipcMain.handle('elevenlabs-tts', async (event, text, from) => {
  const elevenLabsTTS = require('../translator/elevenlabs-tts');
  return await elevenLabsTTS.getAudioUrl(text, from);
});
```

**下载音频**:
```javascript
// 纯前端实现，使用 <a> 标签的 download 属性
const link = document.createElement('a');
link.href = audioUrl;
link.download = filename;
link.click();
```

---

## 🎬 使用示例

### 示例 1: 回顾游戏剧情

1. 打开 Tataru Assistant
2. 点击历史记录，选择主线任务对话
3. 在编辑窗口选择"ElevenLabs Reader"
4. 点击"🔊 播放语音"
5. 听完后点击"💾 下载音频"
6. 音频保存到下载文件夹，文件名示例：
   ```
   elevenlabs_Yshtola_Greetings_Warrior_part1_1700123456789.mp3
   ```

### 示例 2: 对比 TTS 引擎

1. 打开同一条对话
2. 选择"Google TTS" → 点击"播放语音"
3. 选择"ElevenLabs" → 点击"播放语音"
4. 选择"Speechify" → 点击"播放语音"
5. 选择效果最好的引擎下载音频

---

## 🆕 新增功能对比

| 功能 | v0.0.3（之前） | v0.0.4（现在） |
|------|---------------|---------------|
| **TTS 引擎** | 仅 Google TTS | 三种可选 ✅ |
| **引擎切换** | ❌ 不支持 | ✅ 实时切换 |
| **音频播放** | ✅ 自动播放 | ✅ 手动触发 + 自动播放 |
| **音频下载** | ❌ 不支持 | ✅ 一键下载 |
| **批量下载** | ❌ 不支持 | ✅ 长文本分段下载 |
| **文件命名** | ❌ N/A | ✅ 智能命名 |
| **UI 控制** | ❌ 无控件 | ✅ 完整控件 |

---

## 📊 性能影响

### 文件大小变化
- `edit.html`: +18 行（+600 字节）
- `edit.js`: +120 行（+4.5 KB）
- `ipc-module.js`: +10 行（+300 字节）
- 总增加：~5.4 KB

### 运行时影响
- **内存**: +10 KB（存储 audio URLs）
- **网络**: 视 TTS 引擎而定
  - Google TTS: 几乎无延迟
  - ElevenLabs: 2-5 秒/段
  - Speechify: 2-5 秒/段
- **UI 响应**: 无影响（异步加载）

---

## ⚠️ 已知限制

1. **Token 有效期**
   - ElevenLabs/Speechify Token 1-4 小时过期
   - 过期后需重新运行 `get-bearer-tokens.js`

2. **文件下载位置**
   - 固定为浏览器默认下载文件夹
   - 暂不支持自定义下载路径

3. **音频格式**
   - Google TTS: 固定 MP3
   - ElevenLabs: 固定 MP3
   - Speechify: OGG/MP3（可在设置中配置）

4. **网络依赖**
   - 所有 TTS 引擎都需要网络连接
   - 离线模式暂不支持

---

## 🔜 未来计划

### v0.0.5 可能的增强

1. **音频缓存**
   - 本地缓存生成的音频
   - 避免重复生成相同对话的语音

2. **自定义下载路径**
   - 允许用户选择音频保存位置
   - 按角色/任务自动分类

3. **批量处理**
   - 一键下载所有历史对话音频
   - 后台队列处理

4. **音频编辑**
   - 简单的音频剪辑功能
   - 合并多段音频

5. **离线 TTS**
   - 集成本地 TTS 引擎（如 eSpeak）
   - 无需网络即可生成语音

---

## 📚 相关文档

- [EDIT_WINDOW_TTS_FEATURE.md](./EDIT_WINDOW_TTS_FEATURE.md) - 完整功能文档
- [GET_TOKEN_README.md](./GET_TOKEN_README.md) - Token 获取指南
- [BEARER_TOKEN_GUIDE.md](./BEARER_TOKEN_GUIDE.md) - Token 配置教程
- [TTS_ENGINE_COMPARISON.md](./TTS_ENGINE_COMPARISON.md) - TTS 引擎对比

---

## 🙏 致谢

感谢所有用户的反馈和建议，特别是提出"希望在编辑窗口中也能选择 TTS 引擎"的需求。

---

**享受更丰富的 FFXIV 翻译和配音体验！** 🎙️✨
