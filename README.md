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

在配置目录下创建 `config.json`：
- 开发模式（`pnpm dev`）：`~/.baoge-dev/config.json`
- 生产模式（`pnpm start` / `baoge start`）：`~/.baoge/config.json`

```json
{
  "providers": {
    "provider_1": {
      "type": "openai",
      "apiKey": "your-api-key",
      "baseUrl": "https://api.openai.com/v1",
      "models": [
        { "name": "gpt-4o-mini" },
        { "name": "text-embedding-3-small" },
        { "name": "gpt-4o" },
        { "name": "qwen3-coder" }
      ]
    }
  },
  "models": {
    "chat": "provider_1/gpt-4o-mini",
    "embedding": "provider_1/text-embedding-3-small",
    "vision": "provider_1/gpt-4o",
    "coding": "provider_1/qwen3-coder"
  }
}
```

- **providers**：可配置多个 provider，每个含 apiKey、baseUrl、可选 type、可选 models 数组
- **provider.models**：该 provider 下的 model 列表。支持 name、contextWindow、maxTokens、temperature、topP、topK、presencePenalty、frequencyPenalty；请求时仅传入已配置的项
- **models**：各任务选用的 model，格式为 `provider_name/model_name`

简化写法：`models.chat: "gpt-4o-mini"` 表示用 default provider 的 gpt-4o-mini。

providers 也支持数组格式：`"providers": [{ "name": "provider_1", "type": "openai", ... }]`

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

技能扩展豹哥的能力，支持从 Git 或本地路径安装。兼容 [SKILL.md 标准](https://agentskills.io/)（agentskills.io）：

```bash
baoge skill add https://github.com/xxx/baoge-skill-weather
baoge skill add ~/skills/docx
```

- **SKILL.md**：指令型技能，目录包含 `SKILL.md`（YAML frontmatter + Markdown 说明）即可
- **index.ts**：工具型技能，导出 pi-agent 规范的 tool 对象

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
