#!/bin/bash
# 豹哥启动脚本 — 加载 nvm + conda env baoge，然后启动 next

# 加载 nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# 激活 conda env baoge（python + openpyxl 等依赖）
if [ -f "$HOME/miniconda3/bin/activate" ]; then
  source "$HOME/miniconda3/bin/activate" baoge
elif [ -f "$HOME/anaconda3/bin/activate" ]; then
  source "$HOME/anaconda3/bin/activate" baoge
fi

cd "$(dirname "$0")"
exec npx next start -p 3000
