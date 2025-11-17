# Speechify TTS 快速开始 ⚡

## 🎯 只需 3 步！

### 步骤 1: 获取 Bearer Token (2 分钟)

1. **打开 Chrome** 并登录 Speechify 扩展
2. 按 **F12** 打开开发者工具
3. 切换到 **Network** 标签
4. 在任意网页选中文字，点击 Speechify 播放
5. 在 Network 中找到 `synthesis/get` 请求（POST 方法）
6. 点击该请求 → **Headers** 标签
7. 找到 **Authorization** 字段
8. **复制** `Bearer` 后面的长字符串（不包括 "Bearer " 前缀）

**示例**：
```
Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  只复制这部分
```

### 步骤 2: 配置 Tataru Assistant (1 分钟)

1. 打开 **Tataru Assistant**
2. 打开**设置窗口**
3. 切换到 **API** 选项卡
4. 滚动到底部找到 **Speechify TTS 设置**
5. 将复制的 token 粘贴到 **Bearer Token** 框中
6. 点击 **测试配置** 验证
7. 如果成功，点击 **保存**

### 步骤 3: 启用 Speechify (30 秒)

1. 切换到 **窗口** 选项卡
2. **语音引擎** 选择 **Speechify**
3. 勾选 **启用语音播放**
4. 点击 **保存**

## ✅ 完成！

现在游戏中的 NPC 对话会使用 Speechify 的高质量语音播放了！

---

## ⚠️ 常见问题

### Token 在哪里？
- 在 Network 标签中
- 找 POST 方法的请求
- URL 包含 `synthesis/get`
- Headers → Authorization → Bearer 后面

### Token 过期怎么办？
Token 通常 1 小时过期。解决方法：
1. 重新在 Speechify 扩展中播放一次
2. 在 Network 中重新复制新的 token
3. 粘贴到设置中并保存

### 测试配置失败？
检查：
- Token 是否完整（应该很长，500+ 字符）
- 是否包含 "Bearer " 前缀（不应该包含）
- 网络连接是否正常

---

## 📚 需要更多帮助？

- **详细指南**: 查看 [SPEECHIFY_INTEGRATION_GUIDE.md](./SPEECHIFY_INTEGRATION_GUIDE.md)
- **完整文档**: 查看 [SPEECHIFY_USAGE.md](./SPEECHIFY_USAGE.md)
- **问题报告**: [GitHub Issues](https://github.com/raydocs/tataru/issues)

## 🎉 享受使用！
