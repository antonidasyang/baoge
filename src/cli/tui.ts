import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import { TUI, ProcessTerminal, Container, Text, Input, Spacer, matchesKey, Key } from '@mariozechner/pi-tui';
import { config } from '../config/index';
import { loadTools } from '../tools/loader';
import { getSessions, getChatHistory, saveMessage, upsertSession, saveToMemory } from '../memory/index';
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
    agent.setSystemPrompt('你是一个助手，叫"豹哥"。');

    const tools = await loadTools();
    agent.setTools(tools);

    let sessionId: string;
    let sessionTitle: string;
    const sessions = await getSessions();
    if (sessions.length > 0) {
      sessionId = sessions[0].id;
      sessionTitle = sessions[0].title;
    } else {
      sessionId = `session_${Date.now()}`;
      sessionTitle = '新任务';
      await upsertSession(sessionId, sessionTitle);
    }

    const terminal = new ProcessTerminal();
    const tui = new TUI(terminal);

    // 1. 调整后的布局常量
    const HEADER_HEIGHT = 3; // 标题 + 会话 + 细线
    const FOOTER_HEIGHT = 3; // 上线 + 输入行 + 下线

    // 2. 初始化
    const chatLog = new FlexibleChatLog(terminal, HEADER_HEIGHT, FOOTER_HEIGHT);
    const editor = new Input();
    const root = new Container();

    // 3. 构建极简 UI
    const headerLine = () => chalk.dim('─'.repeat(terminal.columns));
    root.addChild(new Text(chalk.cyan.bold(' ✦ BAOGE TERMINAL '), 2, 0));
    const sessionHeader = new Text(chalk.dim(` 会话: ${sessionTitle}`), 0, 0);
    root.addChild(sessionHeader);
    const headerDivider = new Text(headerLine(), 0, 0);
    root.addChild(headerDivider);
    
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

    const userPrefix = chalk.hex('#f97316').bold(' ◆  ');
    const assistantPrefix = chalk.hex('#06b6d4').bold(' 🐆 ');

    async function renderHistory(sid: string) {
      chatLog.clear();
      const history = await getChatHistory(sid);
      for (const msg of history) {
        chatLog.addChild(new Spacer(1));
        if (msg.role === 'user') {
          chatLog.addChild(new Text(userPrefix + msg.content, 2, 0));
        } else {
          chatLog.addChild(new Text(assistantPrefix + msg.content, 2, 0));
        }
      }
      refresh();
    }

    await renderHistory(sessionId);

    let awaitingSessionSelect = false;

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

      if (awaitingSessionSelect) {
        awaitingSessionSelect = false;
        const idx = parseInt(inputVal, 10);
        const list = await getSessions();
        if (idx >= 1 && idx <= list.length) {
          sessionId = list[idx - 1].id;
          sessionTitle = list[idx - 1].title;
          (sessionHeader as any).setText(chalk.dim(` 会话: ${sessionTitle}`));
          await renderHistory(sessionId);
          chatLog.addChild(new Spacer(1));
          chatLog.addChild(new Text(chalk.dim(`已切换到: ${sessionTitle} (${sessionId})`), 2, 0));
          editor.setValue('');
          refresh();
          return;
        }
        // 非数字或无效序号：当作普通消息继续处理
      }

      if (inputVal === '/exit') {
        process.stdout.write('\x1b[?1006l\x1b[?1000l');
        tui.stop();
        process.exit(0);
      }

      if (inputVal === '/sessions') {
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(userPrefix + inputVal, 2, 0));
        const list = await getSessions();
        chatLog.addChild(new Spacer(1));
        chatLog.addChild(new Text(chalk.cyan.bold(' 会话列表 (输入序号切换):'), 2, 0));
        list.forEach((s: any, i: number) => {
          const mark = s.id === sessionId ? chalk.green('●') : ' ';
          chatLog.addChild(new Text(`  ${mark} ${i + 1}. ${s.title}`, 2, 0));
        });
        chatLog.addChild(new Text(chalk.dim(' 输入序号后回车切换，或直接输入新消息取消'), 2, 0));
        awaitingSessionSelect = true;
        editor.setValue('');
        refresh();
        return;
      }

      currentAssistantCmp = null;
      currentAssistantCmp = new Text(assistantPrefix + chalk.gray('🔍 正在思考...'), 2, 0);

      chatLog.addChild(new Spacer(1));
      chatLog.addChild(new Text(userPrefix + inputVal, 2, 0));
      chatLog.addChild(currentAssistantCmp);
      editor.setValue('');
      refresh();

      const history = await getChatHistory(sessionId);
      if (history.length > 0) {
        const formatted = history.map((h: any) => ({
          role: h.role,
          content: [{ type: 'text', text: h.content }]
        }));
        agent.replaceMessages(formatted as any);
      } else {
        agent.replaceMessages([]);
      }

      await saveMessage(sessionId, 'user', inputVal);
      await saveToMemory(inputVal, { source: 'tui', role: 'user', sessionId });
      if (history.length === 0) {
        sessionTitle = inputVal.slice(0, 20);
        (sessionHeader as any).setText(chalk.dim(` 会话: ${sessionTitle}`));
        await upsertSession(sessionId, sessionTitle);
      }

      try {
        await agent.prompt(inputVal);
        const lastMsg = agent.state.messages[agent.state.messages.length - 1];
        if (lastMsg?.role === 'assistant') {
          const text = (lastMsg.content as any[]).find((c: any) => c.type === 'text')?.text;
          if (text) {
            await saveMessage(sessionId, 'assistant', text);
            await saveToMemory(text, { source: 'tui', role: 'assistant', sessionId });
          }
        }
      } catch (err: any) {
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
      headerDivider.setText(headerLine());
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
