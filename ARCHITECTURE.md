
# Returns Insight Pro - 架构文档

本文档详细说明了 Returns Insight Pro 的前端架构、文件组织结构以及各个模块的核心职责。该项目经过重构，采用了关注点分离（Separation of Concerns）的设计原则，将业务逻辑、UI 展示和工具函数进行了拆分。

## 1. 目录结构概览

```text
src/
├── components/
│   ├── views/               # [业务视图] 承载核心业务逻辑的大型组件
│   │   ├── StatusView.tsx   # 现状分析视图 (Status Analysis)
│   │   └── CycleView.tsx    # 周期对比视图 (Cycle/A-B Test)
│   │
│   ├── AsinContrastCard.tsx # [UI组件] 可复用的 ASIN 对比卡片
│   ├── Dashboard.tsx        # [容器组件] 负责布局、导航和导出功能的容器
│   └── FileUpload.tsx       # [交互组件] 负责文件上传、解析与校验
│
├── hooks/
│   └── useReportExport.ts   # [逻辑复用] 封装 PDF/图片导出的复杂逻辑
│
├── utils/
│   └── formatters.ts        # [工具函数] 纯函数，用于数据格式化和安全访问
│
├── types.ts                 # [类型定义] 全局 TypeScript 接口定义
├── App.tsx                  # [入口组件] 全局状态管理与路由分发
└── index.tsx                # [挂载点] React 应用入口
```

---

## 2. 核心模块详解

### A. 全局管理 (Root)

*   **`App.tsx`**
    *   **职责**：作为应用的顶级控制器。
    *   **状态**：管理全局的 `data` (解析后的 JSON 数据) 和 `reportMode` (当前是 status 还是 cycle 模式)。
    *   **逻辑**：根据是否有数据，决定渲染 `FileUpload` 界面还是 `Dashboard` 界面。

*   **`types.ts`**
    *   **职责**：定义所有数据结构的标准接口（如 `AppData`, `AsinNode`, `ReasonTag`）。确保全应用的数据类型安全，特别是从 JSON 解析后的数据结构校验。

### B. 数据接入 (Ingestion)

*   **`components/FileUpload.tsx`**
    *   **职责**：处理用户的文件上传交互。
    *   **核心逻辑**：
        *   支持拖拽上传。
        *   **自动识别**：根据文件名或 JSON 内容的 Key 自动判断文件类型（Summary/Structure/Reasons 等）。
        *   **校验**：在进入分析前，强制检查所需文件是否齐全（Status 模式需 5 个，Cycle 模式需 10 个）。
    *   **输出**：将清洗后的标准数据传递给 `App.tsx`。

### C. 核心容器 (Container)

*   **`components/Dashboard.tsx`**
    *   **职责**：应用的“外壳”。
    *   **功能**：
        *   渲染顶部导航栏（Navbar）。
        *   包含“重置”按钮和“导出”按钮。
        *   **视图路由**：根据 `mode` 属性，条件渲染 `StatusView` 或 `CycleView`。
        *   **DOM 引用**：维护 `reportRef`，用于传递给导出 Hook 以便截取屏幕。

### D. 业务视图 (Views) - *重构重点*

这两个文件承载了应用 90% 的业务价值。

*   **`components/views/StatusView.tsx`**
    *   **场景**：单周期的退货现状诊断。
    *   **核心逻辑**：
        *   计算父体退货率并判定健康等级。
        *   将子体 ASIN 分类为“主战场（Class A）”、“问题款（Class B）”和“观察对象”。
        *   **AI 集成**：集成 `Gemini 3.0 Pro`，针对特定 ASIN 生成“Listing 描述 vs 用户反馈”的归因诊断报告。
    *   **渲染**：展示仪表盘、分类表格、条形图和 AI 对话框。

*   **`components/views/CycleView.tsx`**
    *   **场景**：Before/After 两个周期的 A/B Test 对比。
    *   **核心逻辑**：
        *   **数据清洗**：匹配两个周期的 ASIN，计算退货率、销量的 Delta 变化。
        *   **迁移分析**：追踪 ASIN 是否从“问题款”变成了“健康款”。
        *   **AI 集成**：集成 `Gemini 3.0 Pro`，生成整份报告的 Executive Summary（核心摘要）。
    *   **渲染**：展示时间轴对比、关键指标计分卡、ASIN 迁移列表。

### E. 独立组件 (Standalone Components)

*   **`components/AsinContrastCard.tsx`**
    *   **职责**：专门用于展示单个 ASIN 在两个周期之间的对比详情。
    *   **特点**：纯展示组件（Presentational Component），接收数据 props，渲染复杂的对比 UI（如 Before/After 进度条、原因漂移 Badge）。

### F. 工具与 Hooks (Utilities)

*   **`hooks/useReportExport.ts`**
    *   **职责**：将复杂的导出逻辑从 UI 中剥离。
    *   **功能**：
        *   使用 `html2canvas` 将 DOM 转换为 Canvas。
        *   **Hack 处理**：解决滚动条偏移、文字截断、动画干扰等截图常见 Bug。
        *   使用 `jspdf` 生成分页 PDF。
    *   **输出**：提供 `handleDownload` (PDF) 和 `handleScreenshot` (长图) 方法。

*   **`utils/formatters.ts`**
    *   **职责**：提供纯函数，便于测试和复用。
    *   **功能**：数字格式化（`formatPercent`）、空值安全访问（`getSafeArray`）、文本清洗（`cleanReviewText`）。

## 3. 数据流向 (Data Flow)

1.  **Input**: 用户拖拽 JSON 文件 -> `FileUpload.tsx` 解析并校验。
2.  **State**: 清洗后的数据存储在 `App.tsx` 的 State 中。
3.  **Prop Drilling**: 数据通过 props 传递给 `Dashboard` -> `StatusView` / `CycleView`。
4.  **Processing**:
    *   `StatusView` 内部计算分类逻辑。
    *   `CycleView` 内部计算对比 Delta。
5.  **AI Request**: 用户点击“诊断” -> View 组件直接调用 Google GenAI SDK -> 更新本地 State 展示结果。
6.  **Export**: 用户点击“导出” -> `Dashboard` 调用 `useReportExport` -> 读取 DOM -> 生成文件。

## 4. 技术栈

*   **Framework**: React 19
*   **Styling**: Tailwind CSS (利用 Utility-first 快速构建响应式布局)
*   **Icons**: Lucide React
*   **AI**: Google GenAI SDK (Gemini 3.0 Pro)
*   **Export**: html2canvas + jspdf
