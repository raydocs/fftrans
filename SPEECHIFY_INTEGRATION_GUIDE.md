# Speechify Integration Guide

## 📋 概述

本指南将帮助你通过抓取 Speechify Chrome 扩展的 Cookie 和 API 信息，在 Tataru Assistant 中使用你的 Speechify 会员音效。

## 🔍 步骤 1: 提取 Speechify API 信息

### 1.1 打开 Chrome 开发者工具

1. 打开 Chrome 浏览器
2. 安装并登录 Speechify 扩展
3. 按 `F12` 或 `Ctrl+Shift+I` (Mac: `Cmd+Option+I`) 打开开发者工具
4. 切换到 **Network（网络）** 标签

### 1.2 触发 TTS 请求

1. 在任意网页上选中一段文字
2. 点击 Speechify 扩展图标，开始播放
3. 观察 Network 标签中的请求

### 1.3 查找 API 端点

在 Network 标签中查找以下类型的请求：
- 包含 `speechify` 域名的请求
- 包含 `tts`、`speech`、`audio`、`synthesize` 等关键词的请求
- POST 请求（通常用于生成语音）

**需要记录的信息：**
- ✅ **API URL**: 完整的请求 URL（例如：`https://api.speechify.com/v1/audio`）
- ✅ **HTTP Method**: 通常是 `POST`
- ✅ **Request Headers**: 特别注意 `Authorization`、`Cookie`、`X-API-Key` 等
- ✅ **Request Body**: 查看请求的 JSON 格式

### 1.4 提取 Bearer Token

1. 在找到的 TTS 请求上点击查看详情
2. 切换到 **Headers** 标签
3. 找到 **Authorization** 字段
4. 复制 `Bearer` 后面的完整 Token（通常是一个很长的字符串）

**示例格式：**
```
Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjM4MDI5...（很长的 JWT token）
```

**注意**：只需要复制 `Bearer ` 后面的 token 部分，不包括 "Bearer " 这个前缀。

### 1.5 确认请求格式

点击 TTS 请求，查看 **Payload** 标签，应该看到类似：

```json
{
  "ssml": "<speak>You're all set and ready to go.</speak>",
  "voice": "gwyneth",
  "forcedAudioFormat": "ogg"
}
```

**好消息**：这个格式已经在代码中自动处理了，你不需要手动配置！

## 📝 步骤 2: 准备配置信息

你只需要保存一项信息：

**Bearer Token**：从步骤 1.4 复制的完整 token 字符串

其他参数都有默认值：
- API URL: `https://audio.api.speechify.com/v3/synthesis/get` (固定)
- Voice ID: `gwyneth` (可选修改)
- 音频格式: `ogg` (可选修改为 mp3 或 wav)

## 🔐 安全提示

⚠️ **重要**:
- Bearer Token 包含你的登录凭证，请妥善保管
- 不要分享你的 Token 给他人
- Token 会过期（通常 1 小时），需要定期更新
- 建议使用专门的配置文件存储，不要提交到公共仓库
- Token 过期后重新提取即可

## 📊 Speechify 实际 API 格式

**已确认的 Speechify API 规范**：

### 请求格式
```javascript
POST https://audio.api.speechify.com/v3/synthesis/get

Headers:
  Authorization: Bearer <your-token>
  Content-Type: application/json

Body:
{
  "ssml": "<speak>你的文本</speak>",
  "voice": "gwyneth",
  "forcedAudioFormat": "ogg"
}
```

### 响应格式
**直接返回二进制音频数据（OGG 格式）**
- Content-Type: audio/ogg
- 数据会自动转换为 base64 data URL 供播放器使用

## 🛠️ 下一步

完成信息提取后，你可以：
1. 在 Tataru Assistant 设置中配置 Speechify
2. 选择 Speechify 作为 TTS 引擎
3. 享受高质量的语音播放！

## ❓ 故障排除

### Token 过期
- **症状**: 返回 401 或 403 错误，控制台显示 "Authentication failed"
- **解决**:
  1. 重新登录 Speechify 网站
  2. 触发一次语音播放
  3. 在 DevTools Network 中重新提取 Bearer Token
  4. 更新配置中的 Token

### 找不到正确的 API 请求
- **提示**:
  1. 确保点击了 Speechify 扩展的播放按钮
  2. 在 Network 中筛选 POST 请求
  3. 查找 URL 包含 `synthesis/get` 的请求
  4. 方法必须是 POST，不是 GET

### 音频无法播放
- **检查**: 浏览器控制台是否有错误
- **确认**: Bearer Token 是否正确（长度应该很长，500+ 字符）
- **测试**: 在配置界面点击"测试配置"按钮

## 📞 需要帮助？

如果你在提取过程中遇到问题，请：
1. 截图 Network 标签中的请求
2. 记录错误信息
3. 在 GitHub 项目中提 Issue
