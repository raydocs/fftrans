# Speechify 配置指南 - 问题诊断和解决

**问题**: Speechify TTS 不能使用
**原因**: Bearer Token 未在应用设置中保存
**状态**: ✅ Token 已验证有效（测试成功）

---

## 🔍 问题诊断

### 测试结果

✅ **Bearer Token 有效性**: PASSED
- Token 测试成功
- API 响应: 200 OK
- 音频生成: 49.41 KB MP3
- 语音引擎: gwyneth
- 测试文本: "Drunken Stag: You'd like a chance to make some money, right? Then I know just how I can repay you for your kindness."

### 配置检查

❌ **应用配置文件**: NOT FOUND
- 路径: `~/Library/Application Support/tataru-assistant/config.json`
- 状态: 文件不存在或未配置 Speechify

**结论**: Bearer Token 本身有效，但**未在 Tataru Assistant 设置中保存**。

---

## ✅ 解决方法

### 方法 1: 通过设置界面配置（推荐）

1. **启动 Tataru Assistant**
   ```bash
   npm start
   ```

2. **打开设置窗口**
   - 点击主窗口的"设置"按钮

3. **进入 API 设置**
   - 在设置窗口顶部，点击"API 设置"标签

4. **找到 Speechify TTS 设置区域**
   - 向下滚动到 Speechify TTS 部分

5. **填写配置**:
   - **Bearer Token**: 粘贴你的 Token
     ```
     eyJhbGciOiJSUzI1NiIsImtpZCI6IjM4MDI5MzRmZTBlZWM0NmE1ZWQwMDA2ZDE0YTFiYWIwMWUzNDUwODMiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiUnVpcnVpIFdhbiIsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NJaVJES3BzSkdQd05JakxDTGNnZy13N3hJVExGRVhrZ3Jaak9MTkRRWXplVUwyX1hOMGZRPXMxMjAiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vc3BlZWNoaWZ5bW9iaWxlIiwiYXVkIjoic3BlZWNoaWZ5bW9iaWxlIiwiYXV0aF90aW1lIjoxNzYzMzMyNzA5LCJ1c2VyX2lkIjoiMThuaG03a2duWU5VVUFrZ0hna1hMbnpDWU5NMiIsInN1YiI6IjE4bmhtN2tnbllOVVVBa2dIZ2tYTG56Q1lOTTIiLCJpYXQiOjE3NjMzODU1MjgsImV4cCI6MTc2MzM4OTEyOCwiZW1haWwiOiJydWlydWl3YW44QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7Imdvb2dsZS5jb20iOlsiMTAzNDIyMjI4Njg1MzI0OTAxOTgxIl0sImVtYWlsIjpbInJ1aXJ1aXdhbjhAZ21haWwuY29tIl19LCJzaWduX2luX3Byb3ZpZGVyIjoiY3VzdG9tIn19.oOEbHoj6Y-7Fv7_uwT7-20LxYrG3YoFcmttj2c0xicGkYsL_FLNx_cEB5-v9wJL74poXfqHB0hXvBjKO-0rr0tblnn_iH1wfb6Y5_BpgxytGq5Y6ojRWWskAGmXi8IuvXjks9oXd7a5gjBp735Y1JCtZsNJnzILVBe74EwqfhdhAxGTK8s6GhUJfXOSlzd6E338d0gp7zRkWPOLXCcMv7MzKsx_neywwd4zAFeACz2RUT4vQJRXOzt34tN1D7fcb1q7zzWJLzpNWPlR0KjwRCubFk-LIboUcsOAPwUrzinm1pvW4NK2iEdXL8FusN3L0kMtD7pbDvq4WXG9A9NOLSw
     ```

   - **Voice ID**: `gwyneth` (默认，推荐)
     - 或选择其他语音: matthew, lily, snoop, henry 等

   - **Audio Format**: `mp3` (推荐)
     - 或选择 `ogg` (文件更小但兼容性稍差)

6. **测试配置**
   - 点击"🎧 试听语音"按钮
   - 应该能听到示例音频

7. **保存设置**
   - 点击窗口底部的"保存"按钮

8. **验证配置已保存**
   ```bash
   cat ~/Library/Application\ Support/tataru-assistant/config.json | grep -A 5 '"speechify"'
   ```

   应该看到:
   ```json
   "speechify": {
     "bearerToken": "eyJhbGciOiJSUzI1NiIs...",
     "voiceId": "gwyneth",
     "audioFormat": "mp3"
   }
   ```

---

### 方法 2: 直接编辑配置文件（高级用户）

1. **创建配置文件目录**
   ```bash
   mkdir -p ~/Library/Application\ Support/tataru-assistant
   ```

2. **启动应用生成默认配置**
   ```bash
   npm start
   ```
   - 启动后立即关闭，会生成默认 config.json

3. **编辑配置文件**
   ```bash
   code ~/Library/Application\ Support/tataru-assistant/config.json
   # 或使用其他编辑器
   ```

4. **找到 `api.speechify` 部分**，修改为:
   ```json
   "api": {
     "speechify": {
       "bearerToken": "你的完整Token",
       "voiceId": "gwyneth",
       "audioFormat": "mp3"
     }
   }
   ```

5. **保存文件并重启应用**

---

## 🎯 使用 Speechify

### 在编辑窗口使用

1. 打开 Tataru Assistant
2. 查看历史对话（编辑窗口）
3. 选择"语音引擎" → "Speechify"
4. 点击"🔊 播放语音"
5. 点击"💾 下载音频"（可选）

### 在主窗口使用

1. 打开设置 → 翻译设置
2. "语音引擎 (TTS)" → 选择 "Speechify"
3. 保存设置
4. 游戏对话将使用 Speechify 朗读

---

## 🧪 验证配置

### 测试脚本

运行测试脚本验证 Token:
```bash
node test-speechify-bearer.js
```

**成功输出**:
```
✅ SUCCESS! Speechify API响应成功
   Status: 200 OK
   Audio Size: 49.41 KB
🎉 Speechify Token is VALID and working!
```

**失败输出**:
```
❌ ERROR: Speechify API请求失败
   HTTP Status: 401 Unauthorized
🔐 认证失败原因:
   1. Bearer Token 已过期（有效期 1-4 小时）
```

### 检查配置

```bash
# 查看 Speechify 配置
cat ~/Library/Application\ Support/tataru-assistant/config.json | jq '.api.speechify'
```

**正确配置示例**:
```json
{
  "bearerToken": "eyJhbGciOiJSUzI1NiIs...(完整Token)",
  "voiceId": "gwyneth",
  "audioFormat": "mp3"
}
```

**错误配置示例**:
```json
{
  "bearerToken": "",  // ❌ 空值
  "voiceId": "gwyneth",
  "audioFormat": "mp3"
}
```

---

## ⚠️ 常见错误

### 错误 1: "Not configured. Please set Bearer Token in settings."

**原因**: Bearer Token 未保存或为空

**解决**:
1. 打开设置 → API 设置 → Speechify TTS
2. 粘贴 Bearer Token
3. 点击保存

### 错误 2: "Authentication failed. Please update your Bearer Token."

**原因**: Bearer Token 已过期（1-4 小时有效期）

**解决**:
```bash
node get-bearer-tokens.js
```
重新获取新的 Bearer Token，然后在设置中更新。

### 错误 3: "Network Error: 无法连接到 Speechify API"

**原因**: 网络问题或防火墙阻止

**解决**:
1. 检查网络连接
2. 尝试使用 VPN
3. 检查防火墙设置

### 错误 4: Token 格式错误

**错误示例**:
```
Bearer eyJhbGciOiJSUzI1NiIs...  // ❌ 包含 "Bearer " 前缀
```

**正确示例**:
```
eyJhbGciOiJSUzI1NiIs...  // ✅ 只有 Token 本身
```

---

## 📊 配置对比

| 配置项 | 正确值 | 错误值 | 说明 |
|--------|--------|--------|------|
| **bearerToken** | `eyJhbGciOiJSUzI1NiIs...` (完整) | `""` (空) | 必填，从 F12 获取 |
| **bearerToken** | `eyJhbGciOiJSUzI1NiIs...` | `Bearer eyJ...` | 不要包含 "Bearer " |
| **voiceId** | `gwyneth` | `undefined` | 必填，默认 gwyneth |
| **audioFormat** | `mp3` 或 `ogg` | `wav` | 仅支持 mp3/ogg |

---

## 🎙️ 推荐语音

| Voice ID | 语音特点 | 适用场景 |
|----------|----------|----------|
| **gwyneth** | 女声，清晰自然 | 日常对话，默认推荐 |
| **matthew** | 男声，沉稳有力 | 男性角色，叙事 |
| **lily** | 女声，年轻活泼 | 年轻女性角色 |
| **snoop** | 男声，独特风格 | 特色角色 |
| **henry** | 男声，英式口音 | 正式场合 |

---

## 🔧 完整配置示例

```json
{
  "indexWindow": {
    "ttsEngine": "speechify"
  },
  "api": {
    "speechify": {
      "bearerToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjM4MDI5MzRmZTBlZWM0NmE1ZWQwMDA2ZDE0YTFiYWIwMWUzNDUwODMiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiUnVpcnVpIFdhbiIsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NJaVJES3BzSkdQd05JakxDTGNnZy13N3hJVExGRVhrZ3Jaak9MTkRRWXplVUwyX1hOMGZRPXMxMjAiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vc3BlZWNoaWZ5bW9iaWxlIiwiYXVkIjoic3BlZWNoaWZ5bW9iaWxlIiwiYXV0aF90aW1lIjoxNzYzMzMyNzA5LCJ1c2VyX2lkIjoiMThuaG03a2duWU5VVUFrZ0hna1hMbnpDWU5NMiIsInN1YiI6IjE4bmhtN2tnbllOVVVBa2dIZ2tYTG56Q1lOTTIiLCJpYXQiOjE3NjMzODU1MjgsImV4cCI6MTc2MzM4OTEyOCwiZW1haWwiOiJydWlydWl3YW44QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7Imdvb2dsZS5jb20iOlsiMTAzNDIyMjI4Njg1MzI0OTAxOTgxIl0sImVtYWlsIjpbInJ1aXJ1aXdhbjhAZ21haWwuY29tIl19LCJzaWduX2luX3Byb3ZpZGVyIjoiY3VzdG9tIn19.oOEbHoj6Y-7Fv7_uwT7-20LxYrG3YoFcmttj2c0xicGkYsL_FLNx_cEB5-v9wJL74poXfqHB0hXvBjKO-0rr0tblnn_iH1wfb6Y5_BpgxytGq5Y6ojRWWskAGmXi8IuvXjks9oXd7a5gjBp735Y1JCtZsNJnzILVBe74EwqfhdhAxGTK8s6GhUJfXOSlzd6E338d0gp7zRkWPOLXCcMv7MzKsx_neywwd4zAFeACz2RUT4vQJRXOzt34tN1D7fcb1q7zzWJLzpNWPlR0KjwRCubFk-LIboUcsOAPwUrzinm1pvW4NK2iEdXL8FusN3L0kMtD7pbDvq4WXG9A9NOLSw",
      "voiceId": "gwyneth",
      "audioFormat": "mp3"
    }
  }
}
```

---

## ✅ 配置检查清单

- [ ] Bearer Token 已复制（完整，无 "Bearer " 前缀）
- [ ] Tataru Assistant 已启动
- [ ] 打开设置 → API 设置
- [ ] 找到 Speechify TTS 设置区域
- [ ] 粘贴 Bearer Token
- [ ] 选择 Voice ID（推荐 gwyneth）
- [ ] 选择 Audio Format（推荐 mp3）
- [ ] 点击"试听语音"测试
- [ ] 点击"保存"按钮
- [ ] 验证配置文件已保存

---

## 🎉 下一步

配置完成后，你可以:

1. **在编辑窗口使用**
   - 查看历史对话
   - 选择 Speechify 引擎
   - 播放并下载语音

2. **设置为默认 TTS**
   - 设置 → 翻译设置 → 语音引擎 (TTS) → Speechify
   - 保存设置
   - 游戏对话自动使用 Speechify

3. **对比不同引擎**
   - Google TTS（免费）
   - ElevenLabs（高质量）
   - Speechify（自然流畅）

---

**享受高质量的游戏对话配音！** 🎙️✨
