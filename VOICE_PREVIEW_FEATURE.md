# 🎧 语音试听功能

## 🎉 新功能：在设置中直接试听语音！

现在你可以在 Tataru Assistant 的设置界面中，**点击按钮直接试听**每个 Speechify 语音，无需保存配置或打开外部播放器！

---

## ✨ 功能特点

### 🎯 即时试听
- ✅ 在语音选择下拉框旁边有 **🎧 试听语音** 按钮
- ✅ 选择任何语音后点击按钮即可试听
- ✅ 无需保存配置
- ✅ 无需打开外部播放器
- ✅ 直接在设置窗口中播放

### 📝 试听内容
每个语音会说一段介绍自己的话：
```
Welcome to Final Fantasy XIV!
This is [语音描述].
I hope you enjoy this voice!
```

例如：
- **Gwyneth Paltrow**: "This is Gwyneth Paltrow - 名人语音"
- **Snoop Dogg**: "This is Snoop Dogg - 名人语音，独特风格"
- **Matthew**: "This is Matthew - 适合游戏旁白的男声"

---

## 🚀 如何使用

### 步骤 1: 打开设置

```bash
# 启动 Tataru Assistant
npm start

# 点击设置图标
```

### 步骤 2: 配置 Speechify

1. 切换到 **API** 选项卡
2. 找到 **Speechify TTS 设置**
3. 填写 **Bearer Token**（必需）

### 步骤 3: 试听语音

```
语音选择: [Gwyneth Paltrow (gwyneth) - 推荐⭐ ▼]  [🎧 试听语音]
                                                    ↑
                                                点击这里
```

1. 在 **语音选择** 下拉框中选择任意语音
2. 点击 **🎧 试听语音** 按钮
3. 等待几秒（按钮会显示"🎧 生成中..."）
4. 自动播放语音（按钮会显示"🎧 播放中..."）
5. 播放结束后按钮恢复正常

### 步骤 4: 对比选择

1. 试听 **Gwyneth Paltrow** (女声)
2. 试听 **Snoop Dogg** (男声，独特)
3. 试听 **Matthew** (男声，标准)
4. 试听 **Joanna** (女声，清晰)
5. ...选择你最喜欢的！

### 步骤 5: 保存配置

找到喜欢的语音后：
1. 确保该语音在下拉框中已选中
2. 点击 **保存** 按钮
3. 切换到 **窗口** 选项卡
4. 语音引擎选择 **Speechify**
5. 勾选 **启用语音播放**
6. 点击 **保存**

---

## 🎬 使用场景

### 场景 1: 首次配置

```
用户: "我不知道选哪个语音好..."

步骤:
1. 填写 Bearer Token
2. 点击试听 gwyneth → "哇，这个声音真好听！"
3. 点击试听 snoop → "这个太有趣了哈哈"
4. 点击试听 matthew → "这个很适合游戏旁白"
5. 最终选择 gwyneth
6. 保存配置
```

### 场景 2: 更换语音

```
用户: "想换一个不同风格的语音"

步骤:
1. 打开设置 → API → Speechify TTS
2. 当前选择: gwyneth
3. 试听 snoop → "这个风格完全不同！"
4. 试听 mrbeast → "这个也不错"
5. 选择 snoop
6. 保存
```

### 场景 3: 为不同剧情选择

```
主线剧情: gwyneth (音质最好)
搞笑剧情: snoop (独特风格)
战斗场景: mrbeast (年轻活力)
标准对话: joanna 或 matthew
```

---

## 🔧 技术实现

### 前端 (config.html)

添加试听按钮：
```html
<div class="col-auto">
  <select class="form-select" id="select-speechify-voice-id">
    <!-- 19 个语音选项 -->
  </select>
</div>
<div class="col-auto">
  <button type="button" class="btn btn-secondary btn-sm" id="btn-preview-voice">
    🎧 试听语音
  </button>
</div>
```

### JavaScript (config.js)

试听逻辑：
```javascript
document.getElementById('btn-preview-voice').onclick = async () => {
  // 1. 获取当前选择的语音
  const selectedVoice = voiceSelect.value;

  // 2. 获取 Bearer Token
  const bearerToken = bearerTokenInput.value.trim();

  // 3. 生成试听文本
  const previewText = `Welcome to Final Fantasy XIV! This is ${voiceDescriptions[selectedVoice]}...`;

  // 4. 调用 IPC 生成音频
  const result = await ipcRenderer.invoke('preview-speechify-voice', {
    text: previewText,
    config: { bearerToken, voiceId: selectedVoice, audioFormat: 'ogg' }
  });

  // 5. 播放音频
  const audio = new Audio(result.audioUrl);
  audio.play();
};
```

### IPC Handler (ipc-module.js)

添加 `preview-speechify-voice` 处理器：
```javascript
ipcMain.handle('preview-speechify-voice', async (event, { text, config }) => {
  try {
    const audioUrl = await speechifyTTS.synthesizeSpeech(text, 'en', config);
    return { success: true, audioUrl: audioUrl };
  } catch (error) {
    return { success: false, message: error.message };
  }
});
```

---

## ⚠️ 注意事项

### 必需条件
- ✅ 必须填写有效的 Bearer Token
- ✅ 网络连接正常
- ✅ Token 未过期（通常 1 小时有效）

### 使用限制
- ⏱️ 每次生成需要 1-2 秒
- 📶 需要网络连接
- 🔑 Token 过期需要重新获取

### 常见问题

**Q: 点击试听后没有声音？**
A: 检查：
1. Bearer Token 是否正确填写
2. Token 是否过期
3. 网络连接是否正常
4. 浏览器音量是否开启

**Q: 提示"请先填写 Bearer Token"？**
A: 必须先在 Bearer Token 输入框中填写有效的 token

**Q: 试听失败怎么办？**
A:
1. 检查 Token 是否有效
2. 尝试重新获取 Token
3. 查看错误提示信息

**Q: 可以同时播放多个语音吗？**
A: 不建议。等当前语音播放完后再试听下一个。

---

## 🆚 功能对比

### 之前：需要外部播放器 ❌

```
步骤:
1. 打开终端
2. 运行: open voice-samples/index.html
3. 在浏览器中试听
4. 记住喜欢的语音 ID
5. 回到 Tataru 设置
6. 手动输入 Voice ID
7. 保存
```

### 现在：设置内直接试听 ✅

```
步骤:
1. 打开 Tataru 设置
2. 选择语音
3. 点击"🎧 试听语音"
4. 立即听到效果
5. 满意后直接保存
```

**效率提升**: 7 步 → 5 步，省去外部工具！

---

## 📊 修改的文件

| 文件 | 修改内容 | 行数 |
|------|----------|------|
| `src/html/config.html` | 添加试听按钮 | +3 行 |
| `src/html/config.js` | 添加试听事件处理器 | +85 行 |
| `src/module/system/ipc-module.js` | 添加 preview IPC handler | +15 行 |

**总计**: 3 个文件，+103 行代码

---

## 🎯 使用建议

### 推荐试听顺序

1. **先试听名人语音** (3 个)
   - Gwyneth Paltrow (女声)
   - Snoop Dogg (男声)
   - MrBeast (男声)

2. **再试听推荐标准语音** (4 个)
   - Joanna (女声 - 清晰自然)
   - Olivia (女声 - 适合游戏)
   - Matthew (男声 - 适合旁白)
   - Brian (男声)

3. **最后试听其他语音** (12 个)
   - 根据个人喜好选择

### 选择建议

| 场景 | 推荐语音 | 理由 |
|------|----------|------|
| **最佳音质** | Gwyneth Paltrow | 名人语音，音质最好 |
| **独特风格** | Snoop Dogg | 非常有个性 |
| **年轻活力** | MrBeast | 适合年轻角色 |
| **清晰标准** | Joanna, Matthew | 适合大部分场景 |
| **游戏对话** | Olivia | 专门优化 |

---

## 🎉 总结

语音试听功能让选择 Speechify 语音变得**前所未有的简单**！

### 核心优势
- ✅ **即时反馈** - 点击即听，无需等待
- ✅ **无需外部工具** - 全部在设置中完成
- ✅ **直观对比** - 轻松切换试听不同语音
- ✅ **提高效率** - 节省配置时间

### 使用步骤
1. 填写 Token
2. 选择语音
3. 点击 🎧 试听语音
4. 满意后保存

**就这么简单！** 🎊

---

**现在就打开 Tataru Assistant，试听你最喜欢的语音吧！** 🎧🎮

---

**更新时间**: 2025-11-16
**版本**: 1.2.0
**功能**: 语音试听按钮
