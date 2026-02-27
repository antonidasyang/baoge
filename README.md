# 豹哥 Baoge

[GitHub](https://github.com/antonidasyang/baoge)

AI 助手「豹哥」，支持 Web 与 TUI 两种界面，可执行 shell、读写文件、管理技能。

## 安装

### 一键安装（推荐）

需提前安装 Node.js 和 pnpm。

```bash
curl -fsSL https://github.com/antonidasyang/baoge/raw/main/install.sh | bash
```

默认安装到 `~/.local/baoge`，可使用 `baoge` 命令。

### 从源码安装

```bash
git clone https://github.com/antonidasyang/baoge.git
cd baoge
pnpm install
pnpm add -g .
```

## 配置

在 `~/.baoge/config.json` 中配置 LLM：

```json
{
  "llmApiKey": "your-api-key",
  "llmModel": "gpt-4o-mini",
  "llmBaseUrl": "https://api.openai.com/v1"
}
```

可选：`llmEmbeddingModel`、`llmEmbeddingBaseUrl` 用于向量检索。

## 使用

| 命令 | 说明 |
|------|------|
| `baoge start` | 启动 Web 服务（端口 3000） |
| `baoge start --daemon` | 后台运行 |
| `baoge tui` | 启动终端界面 |
| `baoge skill list` | 列出已安装技能 |
| `baoge skill add <git-url|路径>` | 安装技能 |
| `baoge skill remove <技能名>` | 移除技能 |

## 技能

技能扩展豹哥的能力，支持从 Git 或本地路径安装：

```bash
baoge skill add https://github.com/xxx/baoge-skill-weather
baoge skill add ./my-local-skill
```

技能需包含 `index.ts`，并导出符合 pi-agent 规范的 tool 对象。

## 开发

```bash
pnpm dev          # 启动开发服务器
pnpm tui          # 开发模式下运行 TUI
pnpm build        # 构建
pnpm dist         # 打包发布产物到 dist/
```

## 发布

1. `pnpm build && pnpm dist`
2. 将 `dist/baoge.tar.gz` 上传到 GitHub Release
3. 用户可通过 `install.sh` 一键安装
