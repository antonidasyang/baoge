#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -d ".next/standalone" ]; then
  echo "请先执行 pnpm build"
  exit 1
fi

VERSION=$(node -p "require('./package.json').version")
NAME="baoge-${VERSION}"
STAGE="$ROOT/.dist-stage"
ARCHIVE="$ROOT/dist/${NAME}.tar.gz"

rm -rf "$STAGE"
mkdir -p "$STAGE/$NAME" "$ROOT/dist"

cp -a bin package.json pnpm-lock.yaml src .next public next.config.ts tsconfig.json postcss.config.mjs "$STAGE/$NAME/"
[ -f tailwind.config.ts ] && cp -a tailwind.config.ts "$STAGE/$NAME/" || true

cd "$STAGE"
tar czf "$ARCHIVE" "$NAME"
cd "$ROOT"
rm -rf "$STAGE"

# 同时生成 baoge.tar.gz，供 latest 下载用
cp "$ARCHIVE" "$ROOT/dist/baoge.tar.gz"

echo "已生成 $ARCHIVE 和 dist/baoge.tar.gz"
