# 前端设计协议（Material Design 3 适配版）

## 1. 目标与原则

- 以 **Google Material Design 3 (M3)** 为视觉基础，同时保留当前“侧边栏 + 主内容区”的整体结构。
- 主色调继续使用 **emerald（翠绿）**，作为 Primary Color，与现有品牌保持一致。
- 通过统一的 Color Role、Shape、Elevation、Typography，解决此前“页头高度不齐、风格不统一、视觉噪音大”的问题。
- 图床组件（`ImageUploader`）保留文件，但不在导航中对外展示。

## 2. 色彩体系（Color Roles）

所有颜色以 CSS 自定义属性定义，Tailwind 主题通过 `rgb(var(--xxx) / <alpha-value>)` 引用。

| Role | 变量名 | 默认值 | 用途 |
|---|---|---|---|
| Primary | `--md-primary` | `5 150 105` (emerald-600) | 主按钮、激活态、关键图标 |
| On Primary | `--md-on-primary` | `255 255 255` | 主色上的文字/图标 |
| Primary Container | `--md-primary-container` | `209 250 229` (emerald-100) | 选中背景、轻量高亮 |
| On Primary Container | `--md-on-primary-container` | `6 95 70` (emerald-800) | 轻量高亮上的文字 |
| Secondary | `--md-secondary` | `71 85 105` (slate-600) | 次要操作、次级强调 |
| On Secondary | `--md-on-secondary` | `255 255 255` | 次要色上的文字 |
| Secondary Container | `--md-secondary-container` | `241 245 249` (slate-100) | 次要容器背景 |
| On Secondary Container | `--md-on-secondary-container` | `51 65 85` (slate-700) | 次要容器上的文字 |
| Tertiary | `--md-tertiary` | `14 165 233` (sky-500) | 链接、信息提示 |
| Surface | `--md-surface` | `255 255 255` | 页面/卡片表面 |
| Surface Variant | `--md-surface-variant` | `248 250 252` (slate-50) | 次级表面、hover 背景 |
| On Surface | `--md-on-surface` | `15 23 42` (slate-900) | 主要文字 |
| On Surface Variant | `--md-on-surface-variant` | `100 116 139` (slate-500) | 次要文字、占位符 |
| Outline | `--md-outline` | `226 232 240` (slate-200) | 边框、分割线 |
| Outline Variant | `--md-outline-variant` | `241 245 249` (slate-100) | 弱分割线 |
| Error | `--md-error` | `220 38 38` (red-600) | 错误、删除 |
| On Error | `--md-on-error` | `255 255 255` | 错误色上的文字 |
| Error Container | `--md-error-container` | `254 226 226` (red-100) | 错误提示背景 |

使用示例：

```html
<div class="bg-primary text-on-primary">主按钮</div>
<div class="bg-primary-container text-on-primary-container">选中项</div>
<div class="bg-surface-variant text-on-surface-variant">次要文字</div>
<div class="border border-outline">带边框卡片</div>
```

## 3. 形状（Shape）

M3 强调圆角层级：

| 元素 | 圆角 | Tailwind |
|---|---|---|
| 按钮（Button） | 全圆角 / Pill | `rounded-full` |
| 卡片（Card / Surface） | 16px | `rounded-2xl` |
| 输入框（Input / Textarea / Select） | 8px | `rounded-lg` |
| 小标签 / Chip | 8px | `rounded-lg` |
| 模态框（Modal） | 24px | `rounded-3xl` |
| 图标按钮 | 12px | `rounded-xl` |

## 4. 海拔与阴影（Elevation）

M3 使用“表层颜色 + 微弱阴影”表达层级，不使用强边框。

| 层级 | 样式 |
|---|---|
| Level 0（基础表面） | `bg-surface` |
| Level 1（卡片、侧边栏） | `bg-surface/80 backdrop-blur-md shadow-sm` |
| Level 2（下拉、浮层） | `bg-surface/95 backdrop-blur-lg shadow-lg` |
| Level 3（模态框） | `bg-surface/95 backdrop-blur-xl shadow-2xl` |

## 5. 字体（Typography）

- 基础字体栈保持系统无衬线字体：`system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`。
- 正文默认 `text-sm leading-relaxed`。
- 标题层级：
  - 页面标题：`text-lg font-semibold text-on-surface`
  - 卡片标题：`text-base font-semibold text-on-surface`
  - 辅助说明：`text-xs text-on-surface-variant`

## 6. 布局规范

### 6.1 页头（Page Header）

- 统一高度 `min-h-[3.5rem]`（56px）。
- 左侧预留移动端汉堡按钮安全区：`pl-12 lg:pl-6`。
- 背景：`bg-surface/70 backdrop-blur-md`。
- 底部分割线：`border-b border-outline`。
- 标题左对齐，操作按钮右对齐。

### 6.2 侧边栏（Sidebar）

- 宽度保持 `w-64`（桌面端）。
- 头部与主内容区页头同高 `min-h-[3.5rem]`，标题 `text-lg font-semibold`。
- 背景：`bg-surface/90 backdrop-blur-md`。
- 导航项：`rounded-full`，hover 使用 `bg-surface-variant`。
- 选中项：使用 `bg-primary-container text-on-primary-container`。
- 底部分割线：`border-t border-outline`。

### 6.3 主内容区

- 背景使用 body 层渐变 + `bg-surface/30` 半透明表层。
- 内容区使用统一的 `p-4 lg:p-6` 或 `p-5`。
- 卡片间距统一为 `gap-4` 或 `gap-5`。

## 7. 组件规范

### 7.1 Button

提供五种变体：

| 变体 | 用途 | 样式 |
|---|---|---|
| `filled` | 主要操作 | `bg-primary text-on-primary` |
| `tonal` | 次要强调 | `bg-secondary-container text-on-secondary-container` |
| `outlined` | 次要操作 | `border border-outline bg-transparent text-on-surface` |
| `text` | 低频操作/链接 | `bg-transparent text-primary hover:bg-primary/10` |
| `elevated` | 需要轻微浮起的操作 | `bg-surface shadow-sm text-primary` |

- 尺寸：默认 `h-9 px-4 text-sm rounded-full`。
- 禁用态：`opacity-50 cursor-not-allowed`。

### 7.2 Input / Textarea / Select

- 容器：`rounded-lg border border-outline bg-surface px-3 py-2 text-sm text-on-surface`。
- 占位符：`placeholder:text-on-surface-variant`。
- Focus：`focus:border-primary focus:ring-2 focus:ring-primary/20`。
- 错误态：`border-error focus:border-error focus:ring-error/20`。

### 7.3 Surface / Card

- 默认卡片：`rounded-2xl bg-surface/80 backdrop-blur-md shadow-sm border border-outline/50 p-5`。
- 选中/高亮卡片：追加 `ring-1 ring-primary/30`。

### 7.4 Modal

- 遮罩：`fixed inset-0 bg-black/40 backdrop-blur-sm z-50`。
- 面板：`bg-surface/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-md w-full p-6`。
- 底部操作区：主按钮在右，取消按钮在左（或使用 `text` 变体）。

### 7.5 Chip / Badge

- 容器：`rounded-lg px-2.5 py-1 text-xs font-medium`。
- 默认：`bg-surface-variant text-on-surface-variant`。
- 激活：`bg-primary-container text-on-primary-container`。
- 错误：`bg-error-container text-error`。

## 8. 图标

- 优先使用内联 SVG，保持风格和尺寸一致。
- 图标按钮尺寸统一为 `w-9 h-9`。
- 避免混用 emoji 与 SVG；如需保留 emoji，仅用于装饰性空状态插图。

## 9. 动效

- 交互反馈统一使用 `transition-all duration-200 ease-out`。
- hover 状态以背景色/阴影变化为主，不使用突兀的颜色跳变。
- 侧边栏展开/收起保持 `duration-300 ease-in-out`。

## 10. 图床组件策略

- `ImageUploader` 文件保留，用于未来功能扩展。
- 当前不在 `Sidebar` 导航中展示，不对外暴露入口。
- 其内部样式本次一并迁移到 M3 设计协议，确保后续启用时不突兀。
