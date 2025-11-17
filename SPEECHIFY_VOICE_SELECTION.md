# 🎙️ Speechify 语音选择指南

## ✨ 新功能：语音选择下拉框

Tataru Assistant 现在支持从 **19 个 Speechify 语音**中选择你喜欢的语音！

---

## 🎯 可用语音列表

### 👩 女性语音 (10 个)

#### 名人语音
- **Gwyneth Paltrow (gwyneth)** - 推荐⭐ - 音质最好的女声

#### 标准女声
- **Joanna** - 清晰自然
- **Olivia** - 适合游戏对话
- **Ivy**
- **Salli**
- **Kimberly**
- **Emma**
- **Amy**
- **Nicole**
- **Aria**

### 👨 男性语音 (9 个)

#### 名人语音
- **Snoop Dogg (snoop)** - 独特风格⭐
- **MrBeast (mrbeast)** - 年轻活力⭐

#### 标准男声
- **Matthew** - 适合游戏旁白
- **Henry**
- **Justin**
- **Joey**
- **Stephen**
- **Brian**
- **Russell**

---

## ⚙️ 如何使用

### 1. 启动 Tataru Assistant

```bash
cd /Users/ruirui/Code/Ai_Code/tataru
npm start
```

### 2. 打开设置窗口

点击主窗口的设置图标

### 3. 配置 Speechify TTS

1. 切换到 **API** 选项卡
2. 找到 **Speechify TTS 设置**
3. 填写 **Bearer Token**（如果还没有填写）
4. 在 **语音选择** 下拉框中选择你喜欢的语音：
   - 默认推荐：**Gwyneth Paltrow (gwyneth)**
   - 男声推荐：**Snoop Dogg (snoop)** 或 **Matthew**
5. 选择 **音频格式**（推荐 OGG）
6. 点击 **测试配置** 按钮验证
7. 点击 **保存**

### 4. 启用 Speechify 引擎

1. 切换到 **窗口** 选项卡
2. 在 **语音引擎** 下拉框中选择 **Speechify**
3. 勾选 **启用语音播放**
4. 点击 **保存**

### 5. 进入游戏

启动 FFXIV，当 NPC 对话出现时，会自动使用你选择的 Speechify 语音播放！

---

## 🎧 如何试听语音

### 方法 1: 网页播放器（推荐）

```bash
# 打开语音对比播放器
open voice-samples/index.html
```

播放器功能：
- ✅ 显示所有 19 个语音样本
- ✅ 按性别分类（女性/男性）
- ✅ 标注名人语音
- ✅ 每个语音独立播放
- ✅ 连续播放所有语音（自动对比）

### 方法 2: 测试脚本

```bash
# 重新生成所有语音样本
node test-all-voices.js [你的Bearer-Token]
```

### 方法 3: Tataru 设置中测试

1. 在 Speechify TTS 设置中
2. 选择不同的语音
3. 点击 **测试配置** 按钮
4. 听听看效果如何

---

## 📊 语音推荐

### 游戏场景推荐

| 场景 | 推荐语音 | 理由 |
|------|----------|------|
| **主线剧情** | Gwyneth Paltrow | 音质最好，情感丰富 |
| **男性 NPC** | Matthew, Henry | 标准男声，适合旁白 |
| **女性 NPC** | Joanna, Olivia | 清晰自然，适合对话 |
| **搞笑剧情** | Snoop Dogg | 独特风格，有趣 |
| **年轻角色** | MrBeast | 年轻活力 |

### 个人偏好推荐

#### 喜欢清晰标准声音
- 女声：**Joanna**, **Olivia**
- 男声：**Matthew**, **Brian**

#### 喜欢名人语音
- 女声：**Gwyneth Paltrow**
- 男声：**Snoop Dogg**, **MrBeast**

#### 喜欢尝试不同风格
- 可以在设置中随时切换语音
- 每个语音都有独特的音色和风格

---

## 🔧 技术细节

### 配置文件位置

语音选择会保存在配置文件中：

```bash
# Mac/Linux
~/.tataru-assistant/config.json

# Windows
C:\Users\<用户名>\AppData\Roaming\tataru-assistant\config.json
```

配置结构：

```json
{
  "api": {
    "speechify": {
      "bearerToken": "your-token-here",
      "voiceId": "gwyneth",
      "audioFormat": "ogg"
    }
  },
  "indexWindow": {
    "ttsEngine": "speechify"
  }
}
```

### 修改的文件

1. **src/html/config.html** (line 790-825)
   - 将 Voice ID 文本输入框改为下拉选择框
   - 添加所有 19 个语音选项
   - 按性别和类型分组（optgroup）

2. **src/html/config.js** (line 895)
   - 更新元素 ID 引用：`input-speechify-voice-id` → `select-speechify-voice-id`

### 向后兼容性

- ✅ 旧配置自动兼容
- ✅ 如果配置中有自定义 voiceId，会自动选中
- ✅ 如果 voiceId 不在列表中，会默认选择 gwyneth

---

## ❓ 常见问题

### Q: 可以添加更多语音吗？

A: 当前列表包含了经过测试的 19 个可用语音。如果你发现了其他可用的语音 ID，可以：
1. 在 `config.html` 中添加新的 `<option>` 标签
2. 测试是否可用
3. 提交 PR 或 Issue

### Q: 语音切换后需要重启应用吗？

A: 不需要。保存配置后，新的对话会自动使用新语音。

### Q: 可以为不同角色设置不同语音吗？

A: 目前不支持。当前版本只能设置一个全局语音。这是一个很好的功能建议，可以在未来版本中实现。

### Q: 名人语音需要额外付费吗？

A: 不需要。只要你有 Speechify 会员账号，所有语音（包括名人语音）都可以使用。

### Q: 如何获取更多语音？

A: 运行提取脚本查找新语音：

```bash
node extract-speechify-voices.js [你的Bearer-Token]
```

---

## 📖 相关文档

- **SPEECHIFY_COMPLETE.md** - Speechify TTS 完成报告
- **SPEECHIFY_QUICKSTART.md** - 快速开始指南
- **SPEECHIFY_VOICES.md** - 语音对比表
- **SPEECHIFY_README.md** - 总览文档

---

## 🎉 享受你的语音吧！

现在启动 Tataru Assistant，选择你最喜欢的语音，享受 FFXIV 的精彩剧情！🎮🎧

---

**最后更新**: 2025-11-16
**版本**: 1.1.0
**功能**: 语音选择下拉框
