import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import { TUI, ProcessTerminal, Container, Text, Input, Spacer, matchesKey, Key, Component } from '@mariozechner/pi-tui';
import { config } from './config/index';
import { loadTools } from './tools/loader';
import chalk from 'chalk';

/**
 * 弹性日志容器：确保中间区域撑满，实现底栏锁定，支持鼠标/键盘滚动
 */
class FlexibleChatLog extends Container {
  private terminal: ProcessTerminal;
  private fixedRowsBefore: number;
  private fixedRowsAfter: number;
  scrollOffset = 0; // 0 = 最底部，越大越往上翻
  private lastRenderedLines = 0;

  constructor(terminal: ProcessTerminal, before: number, after: number) {
    super();
    this.terminal = terminal;
    this.fixedRowsBefore = before;
    this.fixedRowsAfter = after;
  }

  adjustScroll(delta: number) {
    const available = this.terminal.rows - this.fixedRowsBefore - this.fixedRowsAfter;
    const maxScroll = Math.max(0, this.lastRenderedLines - available);
    this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollOffset + delta));
  }

  render(width: number): string[] {
    const messageLines = super.render(width);
    const availableHeight = this.terminal.rows - this.fixedRowsBefore - this.fixedRowsAfter;
    this.lastRenderedLines = messageLines.length;

    if (messageLines.length <= availableHeight) {
      this.scrollOffset = 0;
      const padding = Array(Math.max(0, availableHeight - messageLines.length)).fill("");
      return [...padding, ...messageLines];
    }
    const maxScroll = messageLines.length - availableHeight;
    this.scrollOffset = Math.min(this.scrollOffset, maxScroll);
    const start = messageLines.length - availableHeight - this.scrollOffset;
    return messageLines.slice(start, start + availableHeight);
  }
}

async function startTui() {
  try {
    const model = getModel('openai', 'gpt-4o-mini' as any);
    if (!model) return;
    model.api = 'openai-completions' as any;
    model.id = config.llmModel;
    model.baseUrl = config.llmBaseUrl;

    const agent = new Agent({ getApiKey: () => config.llmApiKey });
    agent.setModel(model);
    agent.setSystemPrompt('你是一个助手，叫“豹哥”。');

    const tools = await loadTools();
    agent.setTools(tools);

    const terminal = new ProcessTerminal();
    const tui = new TUI(terminal);

    // 1. 调整后的布局常量
    const HEADER_HEIGHT = 2; // 标题 + 细线
    const FOOTER_HEIGHT = 3; // 上线 + 输入行 + 下线

    // 2. 初始化
    const chatLog = new FlexibleChatLog(terminal, HEADER_HEIGHT, FOOTER_HEIGHT);
    const editor = new Input();
    const root = new Container();

    // 3. 构建极简 UI
    root.addChild(new Text(chalk.cyan.bold(' ✦ BAOGE TERMINAL '), 2, 0));
    root.addChild(new Text(chalk.dim(' ──────────────────────────────────────────────────'), 2, 0));
    
    root.addChild(chatLog);

    const line = () => chalk.hex('#f97316').dim('─'.repeat(terminal.columns));
    const topDivider = new Text(line(), 0, 0);
    const bottomDivider = new Text(line(), 0, 0);
    root.addChild(topDivider);
    root.addChild(editor);
    root.addChild(bottomDivider);

    tui.addChild(root);
    tui.setFocus(editor);

    const refresh = () => tui.requestRender();

    const MOUSE_UP = /\x1b\[<64;[^m]*[mM]/;   // SGR 1006 scroll up
    const MOUSE_DOWN = /\x1b\[<65;[^m]*[mM]/; // SGR 1006 scroll down
    const scrollStep = 3;

    tui.addInputListener((data) => {
      if (matchesKey(data, Key.ctrl("c"))) {
        process.stdout.write('\x1b[?1006l\x1b[?1000l');
        tui.stop();
        process.exit(0);
      }
      if (MOUSE_UP.test(data)) {
        chatLog.adjustScroll(scrollStep);
        refresh();
        return { consume: true };
      }
      if (MOUSE_DOWN.test(data)) {
        chatLog.adjustScroll(-scrollStep);
        refresh();
        return { consume: true };
      }
      if (matchesKey(data, Key.pageUp)) {
        chatLog.adjustScroll(scrollStep);
        refresh();
        return { consume: true };
      }
      if (matchesKey(data, Key.pageDown)) {
        chatLog.adjustScroll(-scrollStep);
        refresh();
        return { consume: true };
      }
      return { data };
    });

    let currentAssistantCmp: Text | null = null;
    const assistantPrefix = chalk.hex('#06b6d4').bold(' 🐆 ');
    const PLACEHOLDER_THINK = '正在思考';
    const PLACEHOLDER_ACTIVATE = '正在激活';

    const isShowingPlaceholder = () => {
      if (!currentAssistantCmp) return false;
      const t = (currentAssistantCmp as any).text || '';
      return t.includes(PLACEHOLDER_THINK) || t.includes(PLACEHOLDER_ACTIVATE);
    };

    agent.subscribe((event) => {
      if (event.type === 'tool_execution_start') {
        if (currentAssistantCmp) {
          (currentAssistantCmp as any).setText(assistantPrefix + chalk.gray(`⚡ 正在激活: ${event.toolName}...`));
          refresh();
        }
      }
      if (event.type === 'message_start' && event.message.role === 'assistant') {
        refresh();
      }
      if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
        const delta = event.assistantMessageEvent.delta.replace(/^\n+/, '');
        if (!delta) return;
        if (currentAssistantCmp) {
          if (isShowingPlaceholder()) {
            (currentAssistantCmp as any).setText(assistantPrefix + delta);
          } else {
            const txt = currentAssistantCmp as any;
            txt.setText(txt.text + delta);
          }
          refresh();
        }
      }
    });

    editor.onSubmit = async (val) => {
      const inputVal = val.trim();
      if (!inputVal) return;
      if (inputVal === '/exit') {
        process.stdout.write('\x1b[?1006l\x1b[?1000l');
        tui.stop();
        process.exit(0);
      }

      currentAssistantCmp = null;
      currentAssistantCmp = new Text(assistantPrefix + chalk.gray('🔍 正在思考...'), 2, 0);

      chatLog.addChild(new Spacer(1));
      chatLog.addChild(new Text(chalk.hex('#f97316').bold(' ◆  ') + inputVal, 2, 0));
      chatLog.addChild(currentAssistantCmp);
      editor.setValue('');
      refresh();

      try { await agent.prompt(inputVal); } catch (err: any) {
        if (currentAssistantCmp) {
          (currentAssistantCmp as any).setText(chalk.red(`  ❌ ${err.message}`));
          refresh();
        } else {
          chatLog.addChild(new Text(chalk.red(`  ❌ ${err.message}`), 4, 0));
          refresh();
        }
      }
    };

    console.clear();
    tui.start();
    process.stdout.write('\x1b[?1000h\x1b[?1006h'); // enable mouse tracking (basic + SGR)

    process.stdout.on('resize', () => {
      topDivider.setText(line());
      bottomDivider.setText(line());
      refresh();
    });

  } catch (error: any) {
    console.error(error);
    process.exit(1);
  }
}

startTui();
