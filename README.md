# MindMesh

> AI 研究助手 — 追踪你的阅读，帮你做研究

MindMesh 是一个 Chrome 浏览器扩展，静默追踪你的阅读行为（停留时间、滚动深度、页面回访），并提供 AI 研究助手（课题 → 搜索 → 综述 → 引用报告）。所有数据存储在本地。

## ✨ 功能

- **📖 阅读追踪** — 自动记录页面停留时间、滚动深度、回访次数
- **🤖 AI 摘要** — 一键生成网页内容摘要，提取核心观点
- **🔬 研究助手** — 输入课题，AI 自动分解问题、综合知识、生成引用报告
- **📰 每日文摘** — 每天 6 点自动生成阅读文摘，发现跨领域联系
- **🕸️ 知识图谱** — 从阅读内容中提取概念，构建知识关系网络
- **⭐ 书签管理** — 一键收藏页面，AI 自动提取标签
- **🎲 偶然发现** — 基于阅读历史的智能推荐，发现意想不到的关联
- **☁️ Google Drive 同步** — 可选的云端备份，多设备同步
- **📊 浮动工具栏** — 右侧边缘快捷按钮，收藏/侧边栏/图谱一键触达

## 🛠️ 技术栈

- Chrome Extension Manifest V3
- Vanilla JavaScript（无框架依赖）
- IndexedDB 本地存储
- Chrome Side Panel API
- OpenAI 兼容 API（支持自定义 endpoint）

## 📦 安装

1. 克隆本仓库
   ```bash
   git clone https://github.com/nmfmn/mindmesh.git
   ```

2. 打开 Chrome，访问 `chrome://extensions/`

3. 开启「开发者模式」

4. 点击「加载已解压的扩展程序」，选择 `mindmesh` 目录

5. 在扩展设置中配置你的 OpenAI API Key

## ⚙️ 配置

点击扩展图标打开侧边栏，在设置中配置：

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| API Key | OpenAI 或兼容 API 的密钥 | — |
| API URL | API 端点地址 | `https://api.openai.com/v1` |
| Model | 使用的模型 | `gpt-4o-mini` |

支持任何 OpenAI 兼容的 API（如 DeepSeek、Ollama、vLLM 等）。

## 📁 项目结构

```
mindmesh/
├── manifest.json          # 扩展配置
├── background.js          # Service Worker（消息处理、AI 调用）
├── content.js             # 内容脚本（浮动工具栏注入）
├── sidepanel.html/js      # 侧边栏界面
├── styles.css             # 样式
├── lib/
│   ├── storage.js         # IndexedDB 存储层
│   ├── ai.js              # AI API 客户端
│   ├── gdrive.js          # Google Drive 同步
│   └── autosave.js        # 智能自动保存
└── icons/                 # 扩展图标
```

## 🔒 隐私

- 所有阅读数据存储在浏览器本地 IndexedDB
- 仅在用户主动触发时调用 AI API
- Google Drive 同步为可选功能，需用户授权
- 不收集任何个人信息

## 📄 License

MIT
