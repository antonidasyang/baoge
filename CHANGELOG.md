# Changelog

All notable changes to 豹哥 (Baoge) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/lang/zh-CN/).

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
