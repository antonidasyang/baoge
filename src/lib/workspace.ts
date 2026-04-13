import fs from 'fs';
import path from 'path';
import os from 'os';

const isDev = process.env.NODE_ENV === 'development';
const baogeDir = isDev ? '.baoge-dev' : '.baoge';
const WORKSPACES_ROOT = path.join(os.homedir(), baogeDir, 'workspaces');
const UPLOAD_ROOT = path.join(os.homedir(), baogeDir, 'uploads');

/** 获取会话工作空间目录，不存在则自动创建 */
export function getWorkspaceDir(sessionId: string): string {
  const dir = path.join(WORKSPACES_ROOT, sessionId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 将文件路径解析为工作空间内的绝对路径，路径逃逸时抛异常 */
export function resolveWorkspacePath(sessionId: string, filePath: string): string {
  const wsDir = getWorkspaceDir(sessionId);
  const resolved = path.resolve(wsDir, filePath);
  if (!resolved.startsWith(wsDir + path.sep) && resolved !== wsDir) {
    throw new Error(`路径不允许: 不能访问工作空间之外的文件`);
  }
  return resolved;
}

/** 检查绝对路径是否在工作空间内 */
export function isInWorkspace(sessionId: string, absPath: string): boolean {
  const wsDir = getWorkspaceDir(sessionId);
  const resolved = path.resolve(absPath);
  return resolved === wsDir || resolved.startsWith(wsDir + path.sep);
}

/** 检查绝对路径是否在上传目录内 */
export function isInUploads(absPath: string): boolean {
  const resolved = path.resolve(absPath);
  return resolved === UPLOAD_ROOT || resolved.startsWith(UPLOAD_ROOT + path.sep);
}

/** 上传目录路径 */
export function getUploadsDir(): string {
  return UPLOAD_ROOT;
}
