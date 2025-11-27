# CLAUDE.md

> AI 开发助手指南 - FFTrans (Tataru Assistant)

## 项目概述

**FFTrans** 是基于 Electron 的 FFXIV 实时翻译工具，通过 Sharlayan 读取游戏内存，自动翻译对话和字幕。

```
技术栈: Electron 37 + Node.js + Vanilla JS
平台: Windows (主要), macOS/Linux (开发)
版本: 0.0.7
```

## 快速命令

```bash
npm install    # 安装依赖
npm start      # 启动开发
npm run dist   # 构建安装包 → build/Tataru_Assistant_Setup.exe
```

## 核心目录

```
src/
├── main.js                    # Electron 主进程入口
├── html/                      # UI 页面
│   ├── index.html/js          # 主窗口 (翻译悬浮窗)
│   ├── config.html/js         # 设置窗口
│   └── capture.html/js        # 截图 OCR 窗口
├── module/
│   ├── system/                # 核心模块
│   │   ├── app-module.js      # 应用生命周期
│   │   ├── window-module.js   # 窗口管理
│   │   ├── config-module.js   # 配置读写
│   │   ├── translate-module.js# 翻译调度
│   │   └── ipc-module.js      # IPC 处理 (100+ handlers)
│   ├── translator/            # 翻译引擎实现
│   │   ├── openrouter.js      # OpenRouter (推荐)
│   │   ├── gpt.js             # ChatGPT
│   │   ├── gemini.js          # Google Gemini
│   │   └── ...                # 其他引擎
│   ├── ipc/                   # IPC 分类处理
│   └── fix/                   # 文本修正
└── data/text/                 # 翻译词库 (3.8MB)
```

## 翻译流程

```
FFXIV 内存 → Sharlayan → server-module (修正) → translate-module → translator/* → UI
```

## 代码规范

```javascript
// 模块导出
module.exports.functionName = async function() { };

// 错误处理
try {
  await operation();
} catch (error) {
  console.warn('[ModuleName] context:', error.message);
}

// IPC 命名: <category>-<action>
ipcMain.handle('config-get', ...);
ipcMain.handle('window-create', ...);
```

## Git 提交

```bash
# 格式: <type>: <description>
git commit -m "feat: 添加新翻译引擎"
git commit -m "fix: 修复窗口创建问题"
git commit -m "docs: 更新文档"
git commit -m "chore: 版本更新"
```

## 常见任务

### 添加翻译引擎

1. 创建 `src/module/translator/new-engine.js`
2. 实现 `exec({ text, fromLanguage, toLanguage })` 函数
3. 在 `engine-module.js` 注册
4. 在 `config.html` 添加 UI

### 添加 IPC Handler

```javascript
// src/module/ipc/*.js
ipcMain.handle('my-handler', async (event, arg) => {
  return result;
});

// 渲染进程调用
const result = await ipcRenderer.invoke('my-handler', arg);
```

### 添加窗口

1. 创建 `src/html/new-window.html` + `new-window.js`
2. 在 `window-module.js` 添加创建逻辑
3. 注册相关 IPC

## 注意事项

- **透明窗口**: index/capture 窗口是透明的，需特殊处理点击穿透
- **按钮 class**: 使用 `btn-icon`，mouseenter 时禁用点击穿透
- **窗口创建**: `closeWindow()` 不抛异常，不要在 catch 中调用 `createWindow()`
- **错误处理**: 不要静默吞噬错误 `catch (e) { e; }`，要输出日志
- **macOS 开发**: Sharlayan 和 VibeProxy 仅 Windows 可用

## 配置文件位置

```
Windows: %APPDATA%/tataru-assistant/config.json
macOS:   ~/Library/Application Support/tataru-assistant/config.json
```

## 参考链接

- [Electron 文档](https://www.electronjs.org/docs)
- [OpenRouter API](https://openrouter.ai/docs)
- [Sharlayan](https://github.com/FFXIVAPP/sharlayan)
