#!/usr/bin/env node

import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const cmd = args[0];

function run(cmd, cmdArgs, opts = {}) {
  const p = spawn(cmd, cmdArgs, {
    stdio: opts.daemon ? 'ignore' : 'inherit',
    cwd: opts.cwd ?? root,
    detached: !!opts.daemon,
    ...opts,
  });
  if (opts.daemon) {
    p.unref();
    console.log('baoge 已在后台运行');
  }
  return p;
}

function runSync(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    stdio: 'inherit',
    cwd: opts.cwd ?? root,
    ...opts,
  });
  process.exit(r.status ?? 0);
}

const help = `
baoge <command> [options]

命令:
  start [--daemon]    启动 Web 服务 (默认端口 3000)
  tui                 启动 TUI 终端界面
  skill <子命令>      技能管理 (list|add|remove)

示例:
  baoge start
  baoge start --daemon
  baoge tui
  baoge skill list
  baoge skill add https://github.com/xxx/skill-repo
  baoge skill remove <技能名>
`;

if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
  console.log(help.trim());
  process.exit(0);
}

if (cmd === 'start') {
  const daemon = args.includes('--daemon');
  const standalonePath = path.join(root, '.next', 'standalone', 'server.js');
  const p = fs.existsSync(standalonePath)
    ? run('node', [standalonePath], { daemon })
    : run('pnpm', ['start'], { daemon });
  if (!daemon) p.on('exit', (code) => process.exit(code ?? 0));
} else if (cmd === 'tui') {
  try {
    const tsxPath = require.resolve('tsx/dist/cli.mjs', { paths: [root] });
    runSync('node', [tsxPath, path.join(root, 'src', 'cli', 'tui.ts')]);
  } catch {
    runSync('pnpm', ['run', 'tui']);
  }
} else if (cmd === 'skill') {
  try {
    const tsxPath = require.resolve('tsx/dist/cli.mjs', { paths: [root] });
    runSync('node', [tsxPath, path.join(root, 'src', 'cli', 'skill.ts'), ...args.slice(1)]);
  } catch {
    runSync('pnpm', ['run', 'skill', ...args.slice(1)]);
  }
} else {
  console.error(`未知命令: ${cmd}`);
  console.log(help.trim());
  process.exit(1);
}
