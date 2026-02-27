#!/usr/bin/env tsx
import { listSkills, installSkill, removeSkill, getSkillsDir } from '../lib/skills';
import chalk from 'chalk';

const cmd = process.argv[2];
const arg = process.argv[3];

async function main() {
  if (cmd === 'list' || cmd === 'ls') {
    const skills = listSkills();
    console.log(chalk.cyan(`\n技能目录: ${getSkillsDir()}\n`));
    if (skills.length === 0) {
      console.log(chalk.dim('(无已安装技能)'));
      console.log(chalk.dim('\n使用 baoge skill add <git-url|本地路径> 安装技能'));
      return;
    }
    skills.forEach((s, i) => console.log(`  ${i + 1}. ${chalk.orange(s.name)}`));
    console.log(chalk.dim(`\n共 ${skills.length} 个技能`));
    return;
  }

  if (cmd === 'add' || cmd === 'install') {
    if (!arg) {
      console.error(chalk.red('请提供来源，例如:'));
      console.error('  baoge skill add https://github.com/xxx/skill-repo');
      console.error('  baoge skill add ./my-local-skill');
      process.exit(1);
    }
    try {
      const { name } = await installSkill(arg);
      console.log(chalk.green(`\n✓ 技能已安装: ${name}\n`));
    } catch (e: any) {
      console.error(chalk.red(`\n✗ 安装失败: ${e.message}\n`));
      process.exit(1);
    }
    return;
  }

  if (cmd === 'remove' || cmd === 'rm') {
    if (!arg) {
      console.error(chalk.red('请指定技能名'));
      process.exit(1);
    }
    const ok = removeSkill(arg);
    if (ok) {
      console.log(chalk.green(`\n✓ 已移除: ${arg}\n`));
    } else {
      console.error(chalk.red(`\n✗ 未找到技能: ${arg}\n`));
      process.exit(1);
    }
    return;
  }

  console.log(`
豹哥技能管理 (baoge skill <命令> [参数])

   list, ls        列出已安装技能
   add, install    安装技能 (git URL 或本地路径)
   remove, rm      移除技能

示例:
   baoge skill add https://github.com/xxx/baoge-skill-weather
   baoge skill add ./skills/weather-expert
   baoge skill remove weather-expert
`);
}

main();
