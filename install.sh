#!/usr/bin/env bash
set -e

# 修改为你的 GitHub repo，如 owner/baoge
GITHUB_REPO="${BAOGE_GITHUB_REPO:-antonidasyang/baoge}"
RELEASE_URL="https://github.com/${GITHUB_REPO}/releases/latest/download/baoge.tar.gz"

INSTALL_URL="${BAOGE_INSTALL_URL:-$1}"
if [ -z "$INSTALL_URL" ]; then
  INSTALL_URL="$RELEASE_URL"
fi
INSTALL_DIR="${BAOGE_INSTALL_DIR:-$HOME/.local/baoge}"

if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "用法: curl -fsSL https://github.com/${GITHUB_REPO}/raw/main/install.sh | bash"
  echo "  或: curl -fsSL ... | bash -s -- <自定义 tar.gz 地址>"
  echo ""
  echo "默认从 GitHub Release 下载: $RELEASE_URL"
  exit 0
fi

if ! command -v pnpm &>/dev/null; then
  echo "请先安装 pnpm: npm install -g pnpm"
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "请先安装 Node.js"
  exit 1
fi

echo "正在下载..."
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

if [ -n "${BAOGE_INSTALL_INSECURE:-}" ]; then
  CURL_OPTS="-k"
fi
curl -fsSL $CURL_OPTS "$INSTALL_URL" -o "$TMP/baoge.tar.gz"

echo "正在解压..."
tar -xzf "$TMP/baoge.tar.gz" -C "$TMP"
DIR=$(ls "$TMP" | grep '^baoge-' | head -1)
if [ -z "$DIR" ]; then
  echo "压缩包格式异常，预期包含 baoge-* 目录"
  exit 1
fi

mkdir -p "$INSTALL_DIR"
echo "正在安装到 $INSTALL_DIR ..."
cp -a "$TMP/$DIR"/* "$INSTALL_DIR/"
cd "$INSTALL_DIR"

echo "正在安装依赖..."
pnpm install

echo "正在注册全局命令..."
pnpm add -g .

echo ""
echo "安装完成。可使用: baoge start | baoge tui | baoge skill"
