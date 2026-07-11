# FFTrans Dalamud

FFTrans Dalamud 是 FFTrans 的游戏内伴侣插件。它读取《最终幻想 XIV》的原生 `Talk`
对话框，将原文通过仅限本机的命名管道交给 FFTrans 翻译，然后把“原文 + 译文”写回同一个
游戏对话框。插件不读取、保存或传输任何翻译 API Key。

## 工作方式

1. FFTrans 启动命名管道 `fftrans-dalamud-v1`，并在当前用户的文档目录创建一次性鉴权描述文件。
2. 插件读取当前可见 `Talk` 的说话人和原文，发送原文、请求 ID 与 SHA-256。
3. FFTrans 使用用户现有的翻译引擎、词典修正和缓存返回译文。
4. 插件只有在请求 ID、原文 SHA-256、当前原文和说话人全部仍匹配时才写入 UI。
5. 对话切换、插件禁用、隐藏或卸载时会恢复原始文字、字号、宽高和文本标志。

## 需求

- Windows 10/11 x64
- XIVLauncher 与 Dalamud API 15
- FFTrans 正在运行
- 构建需要 .NET 10 SDK 与 Dalamud `Hooks/dev` 开发程序集

## 构建与测试

在 FFTrans 仓库根目录运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-dalamud.ps1
node scripts/verify-dalamud-cross-language.js
```

构建脚本会运行 C# 单元/命名管道测试，并将可安装包复制到
`build/dalamud/FFTransDalamud-latest.zip`。如果没有本地 Dalamud 开发程序集，脚本会从
Dalamud 官方分发地址下载 `latest.zip` 到当前用户目录。

## 安装

1. 先启动 FFTrans，确认 `Documents/Tataru Assistant/config/dalamud-bridge.json` 已生成。
2. 构建时加 `-Install`，或手动把插件包解压到
   `%AppData%/XIVLauncher/devPlugins/FFTransDalamud`。
3. 在游戏中打开 `/xlsettings`，把解压后的 `FFTransDalamud.dll` 添加为开发插件位置。
4. 在 `/xlplugins` 的开发插件区域启用 `FFTrans`。
5. 输入 `/fftrans` 查看连接状态和显示设置。

默认显示模式为：英文原文在上、中文译文在下。插件也支持仅显示译文或译文在上。

## 安全与限制

- 通信只使用 Windows 本地命名管道，并要求每次 FFTrans 启动后生成的新随机令牌。
- 描述文件只含管道名和桥接令牌，不含 API Key、模型密钥或账户凭据。
- 当前版本只修改普通 NPC `Talk` 对话框；战斗喊话和剧情字幕会在后续独立适配。
- 游戏更新可能改变 UI 节点，需要重新验证。
- XIVLauncher、Dalamud 和所有第三方工具都不符合 FFXIV 官方服务条款，使用者需自行承担风险。

