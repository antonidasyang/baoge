# Changelog

All notable changes to 豹哥 (Baoge) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/lang/zh-CN/).

## [1.4.0] - 2026-04-07

### Added

- **配置向导**：首次启动或未配置时自动弹出表单，可填写 baseUrl / apiKey / 各任务模型，写入后免重启即时生效
- **配置状态检测**：新增 `/api/config/status`、`/api/config/save`，顶部横幅提示未配置状态
- **子智能体事件**：`subagent_start` / `subagent_end` 事件透传到 UI，便于追踪委派任务
- **委派模型选择**：`delegate_task` 支持 `task_type` 参数，子智能体可指定 chat/coding/vision 模型
- **委派中止透传**：父 AbortSignal 自动转发给子智能体
- **调试页返回入口**：与 skills、changelog 一致的 "返回" 链接

### Fixed

- **内置工具加载路径**：改用 `import.meta.url` 解析，不再依赖 `process.cwd()`，从任意目录启动 baoge 都能加载内置工具
- **末条助手消息提取**：向后扫描寻找最后一条 assistant 文本，修复以工具调用结尾时返回 "未返回有效内容" 的问题
- **配置向导输入框失焦**：将 `Field` 子组件提到模块级，避免每次渲染重建组件类型导致 input 重挂载
- **委派提示词**：列出每个子智能体的 description 而非仅名称，并禁止嵌套委派
- **配置热重载**：新增 `reloadConfig()`，写入新 config.json 后无需重启
- **删除 installSkill 死代码**：移除从未赋值的 `tempPath` 清理分支

### Changed

- **UI 圆角与内边距收紧**：消息气泡、按钮、输入框、模态框统一缩小圆角与 padding

---

## [1.3.0] - 2026-03-15

### Added

- **运行日志系统**：自动写入 `~/.baoge/logs/` 或 `~/.baoge-dev/logs/`，按日期分文件，记录 HTTP 请求/响应、工具调用、模型回复等完整运行过程
- **控制台调试模式**：设置 `BAOGE_DEBUG=1` 可在终端实时查看彩色日志输出
- **HTTP 拦截器**：全局 fetch 拦截，记录请求 URL、状态码、耗时、错误响应体
- **视觉模型工具** (`use_vision`)：支持图片分析，base64 编码发送，120 秒超时，504 网关超时友好提示
- **编程模型工具** (`use_coding_model`)：独立调用编程专用模型，支持 `task` 和 `prompt` 双参数名兼容
- **文本嵌入工具** (`use_embedding`)：计算文本嵌入向量，支持余弦相似度比较

### Changed

- **Agent 内核重构**：独立 `src/agent/index.ts`，从 route 中解耦，删除 `src/tools/core.ts`
- **多 Provider 配置**：支持为 chat/vision/coding/embedding 分别配置不同的 provider 和模型
- **模型参数从配置读取**：`maxTokens`、`contextWindow` 等参数从 `config.json` 的 model 定义中读取，不再硬编码
- **UI 优化**：等待模型回复时隐藏空气泡，仅显示加载动画
- **工具加载器重构**：统一工具注册机制

---

## [1.2.0] - 2025-02-26

### Added

- **全局 `baoge` 命令**：`baoge start`、`baoge start --daemon`、`baoge tui`、`baoge skill`
- **一键安装**：`install.sh` 从 GitHub Release 下载并安装
- **发布打包**：`pnpm dist` 生成 `dist/baoge.tar.gz` 供 Release 发布
- **技能管理**：`baoge skill list/add/remove` 与 Web `/skills` 页面

### Changed

- `package.json` 新增 `bin` 字段，支持 `pnpm add -g .` 全局安装

---

## [1.1.0] - 2025-02-26

### Added

- **运行监控**：`/debug` 页面实时展示 Agent 事件与 LLM 交互
- **停止按钮**：任务执行中可随时点击停止，减少资源浪费
- **防复读**：系统提示词与 `run_command` 工具联合避免重复执行相似命令
- **统一会话**：Web UI 与 TUI 共用会话存储，相互可见
- **TUI `/sessions` 命令**：切换会话，支持序号选择
- **流式 Chat API**：统一 `/api/chat` 支持流式响应与 skipReply 静默注入
- **资产上传**：拖拽或选择文件挂载，支持 `list_assets` 工具查询
- **Markdown 渲染**：对话内容支持代码高亮与表格
- **更新日志页**：`/changelog` 展示 CHANGELOG，主页面可跳转

### Changed

- 移除 Config、Agent 调试日志
- 移除 pi-mon 相关模块与脚本
- 目录调整：`tui.ts` → `src/cli/tui.ts`，`memory.ts` → `manage-memory.ts`
- 删除未使用的 `src/pi/` 死代码
- 合并 Chat 路由，skipReply 并入流式接口

### Removed

- `scripts/mon.mjs` 与 `pnpm run mon`
- `@mariozechner/pi-coding-agent` 依赖
- `src/app/api/chat/stream` 独立路由

---

## [1.0.0] - 初始版本

### Added

- 豹哥 Web UI 与 TUI 双端
- 基于 pi-agent-core 的 Agent 内核
- 记忆系统：会话历史、向量存储 (LanceDB)
- 内置工具：`run_command`、`read_file`、`write_file`、`list_assets`、`manage_memory`
- 技能动态加载 (skills 目录)
- 配置：`~/.baoge-dev/config.json` 或 `~/.baoge/config.json`
