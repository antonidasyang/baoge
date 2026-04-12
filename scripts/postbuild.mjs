#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const standalone = path.join(root, '.next', 'standalone');
const nextDir = path.join(standalone, '.next');

function cpDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) cpDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (fs.existsSync(standalone)) {
  const staticSrc = path.join(root, '.next', 'static');
  const staticDest = path.join(nextDir, 'static');
  if (fs.existsSync(staticSrc)) cpDir(staticSrc, staticDest);
  const publicSrc = path.join(root, 'public');
  const publicDest = path.join(standalone, 'public');
  if (fs.existsSync(publicSrc)) cpDir(publicSrc, publicDest);
}
