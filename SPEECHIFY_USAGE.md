# Speechify TTS 使用说明

## ✅ 已完成的功能

Speechify TTS 已成功集成到 Tataru Assistant 中！你现在可以使用你的 Speechify 会员账号来播放高质量的语音。

## 🎯 快速开始

### 步骤 1: 提取 Speechify 信息

详细步骤请参考 [SPEECHIFY_INTEGRATION_GUIDE.md](./SPEECHIFY_INTEGRATION_GUIDE.md)

**简要步骤**：
1. 打开 Chrome 浏览器并登录 Speechify 扩展
2. 按 F12 打开开发者工具，切换到 Network 标签
3. 在网页上选中文字并用 Speechify 播放
4. 查找 TTS 相关的 API 请求
5. 复制以下信息：
   - API URL
   - Cookie 字符串
   - 请求/响应格式

### 步骤 2: 在 Tataru Assistant 中配置

1. 启动 Tataru Assistant
2. 打开**设置窗口**
3. 切换到 **API** 选项卡
4. 滚动到底部找到 **Speechify TTS 设置** 部分
5. 填写以下信息：

   | 字段 | 说明 | 示例 |
   |------|------|------|
   | API URL | Speechify TTS API 端点 | `https://api.speechify.com/v1/audio` |
   | Cookie | 从浏览器提取的完整 Cookie 字符串 | `session_id=xxx; auth_token=yyy; ...` |
   | Voice ID | 语音 ID（可选） | `en-US-Neural2-J` 或留空使用默认 |
   | 语速 | 播放速度（0.5-2.0） | `1.0` |
   | 请求格式 | API 请求格式 | 选择 `自动检测` |
   | 响应格式 | API 响应格式 | 选择 `自动检测` |
   | 自定义 Headers | 额外的 HTTP Headers（JSON 格式） | 可选 |

6. 点击 **测试配置** 按钮验证设置
7. 如果测试成功，点击 **保存** 按钮

### 步骤 3: 选择 TTS 引擎

1. 在设置窗口中，切换到 **窗口** 选项卡
2. 找到 **语音引擎** 下拉菜单
3. 选择 **Speechify**
4. 点击 **保存**

### 步骤 4: 启用语音播放

1. 确保在**窗口**选项卡中勾选了**启用语音播放**
2. 调整**语音速度**（如需要）
3. 保存设置

## 🎮 使用

配置完成后，当游戏中出现 NPC 对话时：
- Tataru Assistant 会自动调用 Speechify API
- 生成的音频会加入播放队列
- 自动播放翻译后的对话

## 🔧 高级配置

### 自定义请求格式

如果自动检测失败，你可以在 **请求格式** 中选择 **自定义 JSON**，然后在代码中修改 `speechify-tts.js` 的 `buildRequestPayload` 函数。

支持的占位符：
- `{{text}}` - 要合成的文本
- `{{voice_id}}` - 语音 ID
- `{{language}}` - 语言代码
- `{{speed}}` - 播放速度

### 自定义响应格式

如果响应格式不是标准的 URL 或 Base64，你可以使用 `json:` 前缀指定提取路径：

例如：`json:data.audio.url` 会提取 `response.data.audio.url` 的值

### 自定义 Headers

某些 Speechify API 可能需要额外的 Headers（如 `X-API-Key` 或 `Authorization`）。你可以在**自定义 Headers** 字段中填写 JSON 格式的 Headers：

```json
{
  "X-API-Key": "your-api-key",
  "Authorization": "Bearer your-token"
}
```

## ⚠️ 常见问题

### 1. Cookie 过期

**症状**: API 返回 401 或 403 错误

**解决方案**:
- 重新登录 Speechify Chrome 扩展
- 按照步骤 1 重新提取 Cookie
- 更新配置中的 Cookie 字段

### 2. API 格式变更

**症状**: 测试配置失败或音频无法播放

**解决方案**:
- 重新检查 Network 标签中的最新请求格式
- 更新 API URL 和请求/响应格式配置
- 尝试不同的格式选项（URL / Base64 / 二进制）

### 3. 音频播放失败

**症状**: 没有声音输出

**检查清单**:
- [ ] 确认已选择 Speechify 引擎
- [ ] 确认已启用语音播放
- [ ] 打开浏览器开发者工具（F12）查看错误信息
- [ ] 检查音频 URL 是否有效（可以直接在浏览器中访问测试）

### 4. 自动检测失败

**症状**: 测试配置返回 "Unknown response format"

**解决方案**:
- 在 Network 标签中查看实际的响应格式
- 手动选择对应的响应格式（URL / Base64 / 二进制）
- 如果格式特殊，使用 `json:path.to.audio` 格式指定提取路径

## 📊 性能优化

### Cookie 有效期

- Speechify Cookie 通常有效期为几天到几周
- 建议定期检查配置测试结果
- 可以设置提醒定期更新 Cookie

### 网络延迟

- 首次合成可能需要 1-3 秒
- 后续播放会从队列中按顺序播放
- 如果网络较慢，可以调整对话显示时间以匹配音频

### 降级策略

如果 Speechify API 出现问题，系统会自动降级到 Google TTS：
- 不会中断翻译服务
- 会在控制台输出错误信息
- 修复配置后会自动恢复

## 🔒 安全提示

1. **不要分享 Cookie**
   - Cookie 包含你的登录凭证
   - 他人使用你的 Cookie 可以访问你的账号

2. **定期更新 Cookie**
   - 定期更改密码会使旧 Cookie 失效
   - 登出/重新登录后需要重新提取

3. **本地存储**
   - 配置文件保存在本地用户数据目录
   - 不会上传到任何服务器
   - 建议不要将配置文件提交到公共仓库

## 💡 提示与技巧

### 多语言支持

Speechify 支持多种语言的 TTS。语言会根据翻译设置自动选择：
- 日语 → 英语：使用英语语音
- 日语 → 中文：使用中文语音

### 语音质量

不同的 Voice ID 提供不同质量的语音：
- Neural 语音通常质量最高
- 标准语音更快但质量稍低
- 可以在 Speechify 扩展中试听不同语音后选择

### 批量处理

- 系统会自动分割长文本（200 字符/段）
- 每段独立合成并加入播放队列
- 支持无缝连续播放

## 📞 获取帮助

如果你在配置过程中遇到问题：

1. **查看日志**: 打开开发者工具（F12）查看控制台错误
2. **测试配置**: 使用配置界面中的"测试配置"按钮
3. **查看指南**: 阅读 [SPEECHIFY_INTEGRATION_GUIDE.md](./SPEECHIFY_INTEGRATION_GUIDE.md)
4. **提交 Issue**: 在 [GitHub Issues](https://github.com/raydocs/tataru/issues) 提交问题

提交问题时请包含：
- 错误截图
- Network 标签中的请求/响应信息
- 控制台错误日志
- 你的配置（**隐藏 Cookie 信息**）

## 🎉 享受使用！

现在你可以使用 Speechify 的高质量语音来增强你的 FFXIV 游戏体验了！
