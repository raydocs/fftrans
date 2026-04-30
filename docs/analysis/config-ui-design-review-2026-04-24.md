# FFTrans 设置界面 UI/UX 设计评审

**日期**: 2026-04-24  
**评审范围**: `config.html` · `config.js` · `config.css` · `CLAUDE.md`  
**评审重点**: 信息架构、可发现性、层级、表单密度、术语一致性、交互反馈、可扩展性

---

## 1. 当前界面的优点

### 1.1 信息架构已经过一次重构，基底质量不错

当前设置界面采用了 **水平 Tab 导航 + 卡片式分组 (`.settings-section`)** 的两层结构，七个 Tab（外观 / 翻译 / 语音 / API / AI / 系统 / 关于）的划分逻辑基本合理。相比早期单页面长列表，已经有了质的飞跃。

### 1.2 设置项模式统一、结构清晰

每个设置项都遵循 `.setting-item > .setting-info + .setting-control` 的标准布局（`config.css` L263–L305），label + description + control 的三段式呈现信息密度适中，新用户可以快速理解每个选项的含义。

### 1.3 视觉层级与微交互细节到位

- 暗色主题 + 亮色主题双支持（`theme.css`），CSS 变量体系完善
- 卡片 hover 边框变化（`config.css` L275）、按钮 translateY 微动效（L232–L233）等细节增强了精致感
- Toggle switch 选中态使用渐变色 + 外发光（L202–L208），视觉反馈清晰
- 加载时 `body.loading` 隐藏内容防止闪烁（L8–L15），体验细腻

### 1.4 API 测试功能完善

每个 AI 翻译引擎都有独立的"测试链接"按钮，测试过程中有 loading 状态文字反馈（`config.js` `runAiTest()` 函数），测试成功/失败都有明确的 alert 提示。这对需要配置 API Key 的用户非常友好。

### 1.5 ElevenLabs 引导流程设计用心

ElevenLabs TTS 的配置采用了步骤式引导 + 状态面板 + 高级折叠的三层渐进式披露（`config.html` L499–L591），状态 pill 标签（`config.css` `.elevenlabs-status-pill`）用颜色区分连接状态，是整个设置界面中信息设计最成熟的模块。

---

## 2. 主要问题（按优先级排序）

### P0: 语言混杂 — 界面信任感的根基问题

**现状**: 中英文混杂无规律，损害专业感和一致性。

| 区域 | 示例 |
|------|------|
| Tab 标签 | 全中文 ✅ |
| 外观/翻译/AI/系统 Tab 内 | 标签、描述均为中文 ✅ |
| 语音 Tab - ElevenLabs 区域 | 标签全英文："Recommended setup"、"Browser connection"、"Connection status" |
| 语音 Tab - ElevenLabs 按钮 | 英文："Connect ElevenReader"、"Check again"、"Save and finish" |
| 语音 Tab - ElevenLabs 调参 | 英文标签 + 中文描述混搭："Stability" / "控制声音稳定度" |
| 语音 Tab - Speechify/MiMo | 中文标签 ✅，但 token 类字段保持英文占位符 |
| API Tab | 中文标签 + 英文产品名混排（可接受）|

**问题本质**: ElevenLabs 模块是后期独立开发的英文模块，未经过 i18n 流程（`language.js` 中未覆盖这些 element ID），形成语言孤岛。

**影响**: 
- 用户在同一页面（语音 Tab）内频繁切换中英文阅读，认知负荷高
- 中文用户遇到纯英文引导流程会感到困惑
- 如果设置界面语言切换到繁体中文/English，ElevenLabs 区域不会跟随变化

### P1: 语音 Tab 信息过载 — 单页承载了三个完整产品的配置

**现状**: `div-speech` 页面包含：
1. TTS 引擎选择 + 语音速度（通用）
2. ElevenLabs 完整配置（引导流程 + 状态面板 + 高级折叠 + 语音选择 + 6 个调参项）
3. Speechify 完整配置（Token + 语音选择 + 格式 + 分段）
4. MiMo 完整配置（API Key + 模型 + 语音选择 + 格式 + 速度 + 风格 + 情感 + 语言）

**问题本质**: 用户通常只使用一个 TTS 引擎，但必须滚动经过所有三个引擎的完整配置才能找到自己需要的。ElevenLabs 仅自身就占据约 250 行 HTML（L489–L736），加上 Speechify 和 MiMo，语音页面总计约 460 行。

**影响**:
- 视觉噪音：大量与用户无关的配置项始终可见
- 滚动疲劳：找到 MiMo 配置需要滚过 ElevenLabs 的 ~15 个设置项
- 新用户困惑：不清楚选完引擎后还需要在下方哪里配置

### P2: 保存机制不透明 — 全局单一保存按钮

**现状**: 整个设置窗口只有右上角一个"保存设置"按钮（`config.html` L44–L51），但存在多个保存入口：
- 顶部 `button-save-config`（主保存）
- ElevenLabs 的 `btn-elevenlabs-save-finish`（也触发 `saveConfig()`）
- 紧凑模式的 `button-apply-compact-size`（独立保存逻辑）

**问题**:
1. **未保存状态无提示**: 修改任何设置后，保存按钮没有视觉变化（如变色/闪烁/显示 dot），用户不知道自己是否有未保存的更改
2. **保存后反馈不可见**: `saveConfig()` 调用 `ADD_NOTIFICATION` 发送通知，但通知显示在主窗口（index window），不在当前设置窗口，用户可能看不到
3. **保存范围不清**: 切换 Tab 不会自动保存，但用户可能以为切了 Tab 就丢失了当前修改
4. **ElevenLabs 有独立的 "Save and finish" 按钮**: 与顶部保存按钮功能重叠，用户不确定该点哪个

### P3: Tab 之间有功能归属歧义

| 设置项 | 当前位置 | 更直觉的位置 |
|--------|----------|-------------|
| 主题选择 (Dark/Light) | 系统 Tab | 外观 Tab（用户找"改外观"会先看外观 Tab）|
| 界面语言 | 系统 Tab | 外观 Tab 或独立的顶层控件 |
| 快捷键开关 | 系统 Tab | 可以保留，但与"外观设置"分组名下不匹配 |
| 代理设置 | 系统 Tab（底部）| 可独立成"网络"Tab 或折叠在系统 Tab 中更明显标识 |
| Google Vision OCR | API Tab（折叠区内） | 与翻译引擎放在一起不太对——它是 OCR 不是翻译 |

### P4: 交互反馈缺失或使用 alert() 

**现状**: 所有测试/验证/错误均使用原生 `alert()` 弹窗（`config.js` 中有约 20+ 处 `alert()`）。

**问题**:
- `alert()` 阻塞 UI 线程，用户必须点确认才能继续操作
- 视觉风格与精心设计的暗色主题不协调（原生弹窗是系统样式）
- 多行错误信息在 alert 中难以阅读（如 `formatTtsErrorAlert()` 拼接的多段文字）
- 成功提示不需要阻塞，用 toast 更合适

### P5: 内联样式泛滥，可维护性差

`config.html` 中大量使用内联 `style` 属性：

```html
style="width: 180px"   <!-- select-engine, 出现 8+ 次 -->
style="width: 80px"    <!-- number inputs, 出现 5+ 次 -->
style="width: 120px"   <!-- range inputs -->
style="width: 200px"   <!-- text inputs -->
style="width: 220px"   <!-- model inputs -->
style="width: 400px"   <!-- nvidia model select -->
style="width: 280px"   <!-- llm api url -->
style="padding: 0.5rem 1.25rem; margin: 0; font-size: 0.85rem;"  <!-- warning text -->
```

这些宽度本应收敛到 CSS class（如 `.control-sm { width: 80px }`、`.control-md { width: 160px }`），目前每次修改都需要逐个搜索替换。

### P6: 部分隐藏元素造成死代码

- `config.html` L67–L76: 隐藏的 `<select id="select-option">` 仅为兼容旧代码，与 Tab 导航完全冗余
- `config.html` L1415/L1442: 两个 `hidden` 的 setting-item（清除临时文件、检查更新）长期隐藏未删除
- `config.js` 中仍保留 `select-option.onchange` 事件处理（L226–L229），但这个 select 已被 Tab 替代

### P7: 可访问性（Accessibility）薄弱

- `form-check-input` 开关没有 `aria-label`，屏幕阅读器只能读到 "switch"
- 颜色选择器 (`input[type="color"]`) 没有文字标签关联
- Tab 导航没有 `role="tablist"` / `role="tab"` / `aria-selected` 属性
- 折叠区域（更多翻译引擎）使用 `onclick` + `hidden` 而非 `<details>/<summary>` 或 ARIA expanded
- 密码可见性切换按钮（`.btn-visibility`）是 `<img>`，没有 `role="button"` 和 `aria-label`

---

## 3. 可执行的优化建议

### 🟢 低成本快改（1-2 天内，改动集中在 HTML/CSS，不涉及架构）

#### 3.1 把"主题"和"界面语言"移到外观 Tab 顶部
**文件**: `config.html`  
**改动**: 将系统 Tab 中 `section-system-appearance` 的两个 setting-item（`select-app-language`、`select-theme`）移动到外观 Tab `div-appearance` 的第一个 settings-section 之前。系统 Tab 的"外观设置"分组可以整个移走或保留引用。  
**收益**: 用户找"改主题"时的首选路径是外观 Tab，发现率显著提升。

#### 3.2 收敛内联宽度为 CSS utility class
**文件**: `config.css` + `config.html`  
**改动**: 
```css
/* config.css 新增 */
.control-xs  { width: 80px; }
.control-sm  { width: 100px; }
.control-md  { width: 160px; }
.control-lg  { width: 200px; }
.control-xl  { width: 280px; }
.control-full { width: 100%; }
```
全局替换 `style="width: Npx"` 为对应 class。  
**收益**: 可维护性大幅提升，未来调整控件宽度只需改一处。

#### 3.3 保存按钮增加"未保存"视觉提示
**文件**: `config.js` + `config.css`  
**改动**: 
1. 在 `config.js` 中监听所有表单 `input/change` 事件，设置 `isDirty = true`
2. 给 `.btn-save` 添加 `.btn-save--dirty` class（如加一个小红点或边框变色）
3. 保存成功后重置 `isDirty = false`  
**收益**: 用户始终清楚自己是否有未保存的修改。

#### 3.4 清理隐藏的死代码
**文件**: `config.html` + `config.js`  
**改动**: 
- 删除 `<select id="select-option">` 及其隐藏选项（L67–L76）
- 删除 `config.js` 中 `select-option.onchange` 处理逻辑
- 删除两个 `hidden` 的 setting-item（清除临时文件、检查更新），或恢复显示  
**收益**: 减少 ~30 行无意义代码，降低维护困惑。

#### 3.5 ElevenLabs 区域标签补入 i18n
**文件**: `language.js`  
**改动**: 为 ElevenLabs 相关的 `setting-label`/`setting-description` 元素添加 id，并在 `language.js` 的 `getElementTextList()` 中补入中/英/繁体对应文本。  
**收益**: 消除语音 Tab 中最大的语言混杂问题。

### 🟡 中等规模重构（3-7 天，涉及 JS 逻辑或结构调整）

#### 3.6 语音 Tab 按引擎条件显示，减少信息过载
**思路**: 用户在顶部选择 TTS 引擎后，只展开该引擎的配置卡片，其余引擎的卡片折叠或隐藏。  
**实现方案**:
```javascript
// config.js
document.getElementById('select-tts-engine').onchange = () => {
  const engine = document.getElementById('select-tts-engine').value;
  document.querySelectorAll('.tts-engine-config').forEach(el => {
    el.hidden = el.dataset.engine !== engine;
  });
};
```
给每个 TTS 引擎的 `.settings-section` 加上 `.tts-engine-config` class 和 `data-engine="elevenlabs"` 等属性。  
**收益**: 语音页面从滚动 460 行内容缩减到只显示通用设置 + 所选引擎配置。

#### 3.7 用自定义 Toast 替代 alert()
**思路**: 实现一个轻量 toast 组件（或复用 Bootstrap 5 的 Toast），替换所有 `alert()` 调用。  
**实现方案**:
1. 在 `config.html` 底部加一个 toast 容器
2. 编写 `showToast(message, type)` 函数（success/error/warning）
3. 成功提示自动消失（3s），错误提示需手动关闭
4. 逐步替换 `config.js` 中约 20+ 处 `alert()`  
**收益**: 非阻塞反馈、视觉风格统一、多行错误信息可读性更好。

#### 3.8 Tab 导航增加 ARIA 属性和键盘支持
**实现方案**:
```html
<nav class="settings-tabs" role="tablist">
  <button class="tab-item active" role="tab" aria-selected="true" 
          data-target="div-appearance" id="tab-appearance">外观</button>
  <!-- ... -->
</nav>
```
加上左右方向键切换 Tab 的键盘事件。  
**收益**: 满足 WCAG 2.1 Tab 组件规范，提升可访问性。

#### 3.9 API Tab 的"更多引擎"折叠改为渐进式搜索
**思路**: 当前"更多翻译引擎"折叠区包含 GPT / Kimi / LLM API / NVIDIA / Google Vision 五个引擎，折叠后完全不可见。改为：
1. 将推荐引擎（Gemini + OpenRouter）始终显示
2. 其余引擎改为搜索框 + 懒加载卡片：输入"GPT"自动展开 GPT 卡片
3. 或至少在折叠头部显示已配置的引擎计数："更多引擎 (已配置 2 个)"  
**收益**: 用户能快速发现自己已配置的引擎，不必盲目展开折叠。

---

## 4. 如果只做 3 个改动，最推荐哪 3 个？

| 优先级 | 改动 | 收益/成本比 | 文件 |
|--------|------|-------------|------|
| **🥇 第一** | **语音 Tab 按引擎条件显示**（§3.6） | 一次改动解决信息过载 + 发现性问题，JS 改动 ~20 行，HTML 加 data 属性 | `config.html` + `config.js` |
| **🥈 第二** | **保存按钮增加"未保存"提示**（§3.3） | 最核心的交互反馈缺失，改动 ~30 行 JS + ~10 行 CSS，效果立竿见影 | `config.js` + `config.css` |
| **🥉 第三** | **ElevenLabs 区域补入 i18n**（§3.5） | 消除最大的语言混杂问题，让语音 Tab 回归一致性；改动集中在 `language.js`，无结构风险 | `language.js` |

**选择逻辑**: 第一和第二解决的是用户每次打开设置都会感受到的痛点（信息过载和保存焦虑），性价比最高。第三解决的是信任感问题——中英混杂会让用户怀疑"这个软件是不是半成品"。

---

## 5. 附录：文件定位速查

| 模式/区域 | 文件 | 行号（约） |
|-----------|------|-----------|
| Tab 导航栏 | `config.html` | L57–L65 |
| 外观 Tab (窗口行为 → 对话框样式) | `config.html` | L80–L310 |
| 翻译 Tab (自动化 → 频道列表) | `config.html` | L312–L449 |
| 语音 Tab (TTS 引擎 → MiMo) | `config.html` | L451–L946 |
| API Tab (Gemini → Google Vision) | `config.html` | L948–L1222 |
| AI Tab (对话设置 → 提示词) | `config.html` | L1224–L1320 |
| 系统 Tab (外观/功能/维护/代理) | `config.html` | L1322–L1521 |
| 关于 Tab | `config.html` | L1523–L1595 |
| Tab 切换逻辑 | `config.js` | `switchTab()` 函数 |
| 保存/读取配置 | `config.js` | `saveConfig()` / `readConfig()` / `getOptionList()` |
| ElevenLabs 状态渲染 | `config.js` | `renderElevenLabsAuthStatus()` |
| 设置项行样式 | `config.css` | `.setting-item` (L263–L305) |
| 卡片分组样式 | `config.css` | `.settings-section` (L247–L275) |
| ElevenLabs 状态面板样式 | `config.css` | `.elevenlabs-status-panel` (L442–L453) |
| 暗色/亮色主题变量 | `theme.css` | 全文 |

---

*本报告仅做评审分析，不包含代码修改。*
